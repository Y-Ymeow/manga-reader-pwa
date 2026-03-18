/**
 * SQLite Storage
 * 使用 SQLite EAV 模型的存储实现
 *
 * 注意：pwaId 由 Tauri 侧 App.tsx 通过 postMessage 自动注入，PWA 侧不需要自己获取
 */

import type {
  SQLiteBridge,
  SQLiteResult,
  EAVRecord,
  SQLiteQueryOptions,
  SQLiteStorageConfig,
  ISQLiteStorage,
} from "./types";

/**
 * 获取应用 ID（占位值，实际由 Tauri 侧注入）
 */
function getAppId(): string {
  return "pwa-app";
}

/**
 * SQLite EAV 存储实现
 */
export class SQLiteStorage implements ISQLiteStorage {
  readonly appId: string;
  readonly dbName: string;

  private bridge: SQLiteBridge;
  private debug: boolean;
  private initialized = false;

  /**
   * 创建 SQLite 存储实例
   * @param bridge Tauri 桥接对象
   * @param appId 应用 ID（可选，默认从 URL 提取）
   * @param dbName 数据库名称
   */
  constructor(
    bridge: SQLiteBridge,
    appId?: string,
    dbName: string = "default",
  ) {
    this.bridge = bridge;
    this.appId = appId || getAppId();
    this.dbName = dbName;
    this.debug = false;
  }

  /**
   * 初始化存储
   */
  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    this.log("SQLiteStorage initialized");
  }

  /**
   * 检查是否已初始化
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * 日志输出
   */
  private log(...args: unknown[]): void {
    if (this.debug) {
      // console.log('[SQLiteStorage]', ...args);
    }
  }

  /**
   * 调用桥接命令
   */
  private async invoke<T = unknown>(
    cmd: string,
    payload: Record<string, unknown>,
  ): Promise<SQLiteResult<T>> {
    try {
      // 转换参数为 Rust 侧期望的格式
      const rustPayload: Record<string, unknown> = {
        pwaId: this.appId,
        dbName: this.dbName,
      };

      for (const [key, value] of Object.entries(payload)) {
        if (key === "options" && value && typeof value === "object") {
          // 转换 options 内部的字段名
          const opts = value as Record<string, unknown>;
          const convertedOpts: Record<string, unknown> = {};
          for (const [optKey, optValue] of Object.entries(opts)) {
            // order_by 已经是正确的
            convertedOpts[optKey] = optValue;
          }
          rustPayload[key] = convertedOpts;
        } else if (key === "filter" && value && typeof value === "object") {
          // 转换过滤条件：sourceType.$eq -> sourceType
          const filter = value as Record<string, unknown>;
          const convertedFilter: Record<string, unknown> = {};
          for (const [filterKey, filterValue] of Object.entries(filter)) {
            // 处理操作符格式：{ 'sourceType.$eq': 'local' } -> { 'sourceType': 'local' }
            const cleanKey = filterKey.replace(/\.\$.*/, "");
            convertedFilter[cleanKey] = filterValue;
          }
          rustPayload[key] = convertedFilter;
        } else {
          rustPayload[key] = value;
        }
      }

      const result = await this.bridge.invoke<T>(cmd, rustPayload);
      this.log(`Invoke ${cmd}:`, result);
      return result;
    } catch (error) {
      console.error("[SQLiteStorage] Invoke error:", cmd, error);
      this.log(`Invoke ${cmd} error:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 插入或更新记录
   * @param table 逻辑表名
   * @param dataId 记录 ID
   * @param data 数据对象
   * @returns 是否成功
   */
  async upsert<T extends Record<string, unknown> = Record<string, unknown>>(
    table: string,
    dataId: string,
    data: T,
  ): Promise<boolean> {
    // 过滤掉不可序列化的字段（fileHandle, Blob 等）
    const serializableData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value === undefined) {
        continue; // 跳过 undefined
      }
      if (value === null) {
        serializableData[key] = null;
      } else if (
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
      ) {
        serializableData[key] = value;
      } else if (typeof value === "object") {
        // 检查是否可序列化
        try {
          JSON.stringify(value);
          serializableData[key] = value;
        } catch {
          // 不可序列化的对象（如 FileHandle, Blob），跳过并警告
          console.warn(
            `[SQLiteStorage] Skipping non-serializable field: ${key}`,
            value?.constructor?.name,
          );
        }
      }
    }

    const result = await this.invoke<boolean>("sqlite_upsert", {
      tableName: table,
      dataId: String(dataId),
      data: serializableData,
    });
    return result.success ? (result.data ?? false) : false;
  }

  /**
   * 查询记录（支持过滤）
   * @param table 逻辑表名
   * @param options 查询选项
   * @returns 记录数组
   */
  async find<T extends Record<string, unknown> = Record<string, unknown>>(
    table: string,
    options: SQLiteQueryOptions = {},
  ): Promise<EAVRecord<T>[]> {
    // 转换排序字段名：createdAt -> created_at
    let orderBy = options.orderBy;
    const originalOrderBy = options.orderBy; // 保存原始字段名用于前端排序
    if (orderBy) {
      orderBy = orderBy.replace(/([A-Z])/g, "_$1").toLowerCase();
    }

    const result = await this.invoke<any[]>("sqlite_find", {
      tableName: table,
      filter: options.filter || null,
      options: {
        order_by: null, // 不在 SQL 中排序，在前端处理
        desc: options.desc || false,
        limit: options.limit || null,
        offset: options.offset || null,
      },
    });

    // Rust 侧返回的数据可能是嵌套结构，需要解包
    let rawData: any[] = [];
    if (result.success && result.data) {
      const data = result.data as any;
      // 如果 data 本身是 {success, data, error} 结构，解包它
      if (typeof data === 'object' && data !== null && 'success' in data) {
        const innerData = data as { success: boolean; data?: any[] };
        rawData = innerData.success ? (innerData.data ?? []) : [];
      } else {
        rawData = Array.isArray(data) ? data : [];
      }
    }

    // 转换字段名：snake_case -> camelCase
    let records = rawData.map((item: any) => ({
      dataId: item.data_id,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
      data: item.data,
    }));

    // 在前端进行排序（因为 EAV 模型的字段在 data 中）
    if (originalOrderBy) {
      records.sort((a, b) => {
        const aVal = (a.data as any)[originalOrderBy];
        const bVal = (b.data as any)[originalOrderBy];
        if (aVal === undefined && bVal === undefined) return 0;
        if (aVal === undefined) return 1;
        if (bVal === undefined) return -1;
        if (aVal < bVal) return options.desc ? 1 : -1;
        if (aVal > bVal) return options.desc ? -1 : 1;
        return 0;
      });
    }

    // 应用 limit 和 offset
    if (options.offset) {
      records = records.slice(options.offset);
    }
    if (options.limit) {
      records = records.slice(0, options.limit);
    }

    return records;
  }

  /**
   * 查询单条记录
   * @param table 逻辑表名
   * @param dataId 记录 ID
   * @returns 记录或 null
   */
  async findOne<T extends Record<string, unknown> = Record<string, unknown>>(
    table: string,
    dataId: string,
  ): Promise<EAVRecord<T> | null> {
    const result = await this.invoke<any>("sqlite_find_one", {
      tableName: table,
      dataId: String(dataId),
    });
    
    // Rust 侧返回的数据可能是嵌套结构，需要解包
    let rawData: any = null;
    if (result.success && result.data) {
      const data = result.data as any;
      // 如果 data 本身是 {success, data, error} 结构，解包它
      if (typeof data === 'object' && data !== null && 'success' in data) {
        const innerData = data as { success: boolean; data?: any };
        rawData = innerData.success ? (innerData.data ?? null) : null;
      } else {
        rawData = data;
      }
    }
    
    if (!rawData) return null;
    
    // 转换字段名：snake_case -> camelCase
    return {
      dataId: rawData.data_id,
      createdAt: rawData.created_at,
      updatedAt: rawData.updated_at,
      data: rawData.data,
    };
  }

  /**
   * 删除记录
   * @param table 逻辑表名
   * @param dataId 记录 ID
   * @returns 是否成功
   */
  async delete(table: string, dataId: string): Promise<boolean> {
    const result = await this.invoke<boolean>("sqlite_delete", {
      tableName: table,
      dataId: String(dataId),
    });
    return result.success ? (result.data ?? false) : false;
  }

  /**
   * 统计记录数
   * @param table 逻辑表名
   * @param filter 过滤条件
   * @returns 记录数
   */
  async count(
    table: string,
    filter?: Record<string, unknown>,
  ): Promise<number> {
    const result = await this.invoke<number>("sqlite_count", {
      tableName: table,
      filter: filter || null,
    });
    return result.success ? (result.data ?? 0) : 0;
  }

  /**
   * 清空表
   * @param table 逻辑表名
   * @returns 是否成功
   */
  async clear(table: string): Promise<boolean> {
    const result = await this.invoke<boolean>("sqlite_clear_table", {
      tableName: table,
    });
    return result.success ? (result.data ?? false) : false;
  }

  /**
   * 列出所有表
   * @returns 表名数组
   */
  async listTables(): Promise<string[]> {
    const result = await this.invoke<string[]>("sqlite_list_tables", {});
    return result.success ? (result.data ?? []) : [];
  }

  // ============== 便捷方法（兼容 localStorage 风格） ==============

  /**
   * 简单的键值存储 - 设置
   * @param key 键名
   * @param value 值
   * @returns 是否成功
   */
  async setItem(key: string, value: unknown): Promise<boolean> {
    return this.upsert("kv", key, { value });
  }

  /**
   * 简单的键值存储 - 获取
   * @param key 键名
   * @returns 值
   */
  async getItem<T = unknown>(key: string): Promise<T | null> {
    const record = await this.findOne("kv", key);
    return (record?.data?.value as T) ?? null;
  }

  /**
   * 简单的键值存储 - 删除
   * @param key 键名
   * @returns 是否成功
   */
  async removeItem(key: string): Promise<boolean> {
    return this.delete("kv", key);
  }

  /**
   * 简单的键值存储 - 清空
   * @returns 是否成功
   */
  async clearAll(): Promise<boolean> {
    return this.clear("kv");
  }

  /**
   * 简单的键值存储 - 获取所有键
   * @returns 键名数组
   */
  async keys(): Promise<string[]> {
    const records = await this.find("kv");
    return records.map((r) => r.dataId);
  }

  /**
   * 设置调试模式
   */
  setDebug(enabled: boolean): void {
    this.debug = enabled;
  }
}

/**
 * 创建 SQLite 存储实例的工厂函数
 * @param bridge Tauri 桥接对象
 * @param config 配置选项
 */
export function createSQLiteStorage(
  bridge: SQLiteBridge,
  config?: SQLiteStorageConfig,
): SQLiteStorage {
  const storage = new SQLiteStorage(bridge, config?.appId, config?.dbName);
  if (config?.debug) {
    storage.setDebug(true);
  }
  return storage;
}

/**
 * 全局 SQLite 存储实例
 */
let globalSQLiteStorage: SQLiteStorage | null = null;

/**
 * 获取或创建全局 SQLite 存储实例
 * @param bridge Tauri 桥接对象
 * @param config 配置选项
 */
export function getGlobalSQLiteStorage(
  bridge: SQLiteBridge,
  config?: SQLiteStorageConfig,
): SQLiteStorage {
  if (!globalSQLiteStorage) {
    globalSQLiteStorage = createSQLiteStorage(bridge, config);
  }
  return globalSQLiteStorage;
}

/**
 * 设置全局 SQLite 存储实例
 */
export function setGlobalSQLiteStorage(storage: SQLiteStorage): void {
  globalSQLiteStorage = storage;
}

/**
 * 清除全局 SQLite 存储实例
 */
export function clearGlobalSQLiteStorage(): void {
  globalSQLiteStorage = null;
}
