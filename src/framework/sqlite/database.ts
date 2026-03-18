/**
 * SQLite Database Manager
 * SQLite 数据库管理器
 * 
 * @example
 * ```typescript
 * import { SQLiteDatabaseManager, createSQLiteDB } from './sqlite';
 * 
 * // 创建数据库管理器
 * const db = createSQLiteDB(bridge, {
 *   name: 'my-app',
 *   debug: true
 * });
 * 
 * // 初始化
 * await db.init();
 * 
 * // 创建模型
 * const User = db.model('users', {
 *   primaryKey: 'id'
 * });
 * 
 * // 获取存储
 * const storage = db.storage;
 * 
 * // 列出所有表
 * const tables = await db.listTables();
 * 
 * // 清空所有数据
 * await db.clearAll();
 * ```
 */

import type {
  SQLiteBridge,
  SQLiteDatabaseConfig,
  SQLiteModelConfig,
  SQLiteModelData,
} from './types';
import { SQLiteStorage, createSQLiteStorage } from './storage';
import { SQLiteModel, createSQLiteModel } from './model';

/**
 * SQLite 数据库管理器
 */
export class SQLiteDatabaseManager {
  private config: Required<SQLiteDatabaseConfig>;
  private storage: SQLiteStorage;
  private models: Map<string, SQLiteModel> = new Map();
  private initialized = false;

  /**
   * 创建数据库管理器
   * @param bridge Tauri 桥接对象
   * @param config 数据库配置
   */
  constructor(
    bridge: SQLiteBridge,
    config: SQLiteDatabaseConfig = {}
  ) {
    this.config = {
      name: config.name ?? 'default',
      debug: config.debug ?? false,
    };

    // 创建存储实例
    this.storage = createSQLiteStorage(bridge, {
      dbName: this.config.name,
      debug: this.config.debug,
    });
  }

  /**
   * 日志输出
   */
  private log(...args: unknown[]): void {
    if (this.config.debug) {
      console.log('[SQLiteDatabase]', ...args);
    }
  }

  /**
   * 初始化数据库
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    await this.storage.init();
    this.initialized = true;
    this.log('Database initialized:', this.config.name);
  }

  /**
   * 检查是否已初始化
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * 获取存储实例
   */
  getStorage(): SQLiteStorage {
    return this.storage;
  }

  /**
   * 创建或获取模型
   * @param tableName 表名
   * @param config 模型配置
   */
  model<T extends SQLiteModelData = SQLiteModelData>(
    tableName: string,
    config?: SQLiteModelConfig
  ): SQLiteModel<T> {
    const cacheKey = `${this.config.name}:${tableName}`;

    if (this.models.has(cacheKey)) {
      return this.models.get(cacheKey) as SQLiteModel<T>;
    }

    const model = createSQLiteModel<T>(this.storage, tableName, config);
    this.models.set(cacheKey, model);
    return model;
  }

  /**
   * 列出所有表
   */
  async listTables(): Promise<string[]> {
    return this.storage.listTables();
  }

  /**
   * 检查表是否存在
   * @param tableName 表名
   */
  async hasTable(tableName: string): Promise<boolean> {
    const tables = await this.listTables();
    return tables.includes(tableName);
  }

  /**
   * 清空所有表
   */
  async clearAll(): Promise<void> {
    const tables = await this.listTables();
    for (const table of tables) {
      if (table !== '_changelog') {
        await this.storage.clear(table);
      }
    }
    this.log('All tables cleared');
  }

  /**
   * 删除指定表
   * @param tableName 表名
   */
  async dropTable(tableName: string): Promise<void> {
    await this.storage.clear(tableName);
    this.log('Table dropped:', tableName);
  }

  /**
   * 获取数据库统计信息
   */
  async getStats(): Promise<{
    name: string;
    tables: string[];
    counts: Record<string, number>;
  }> {
    const tables = await this.listTables();
    const counts: Record<string, number> = {};

    for (const table of tables) {
      counts[table] = await this.storage.count(table);
    }

    return {
      name: this.config.name,
      tables,
      counts,
    };
  }

  /**
   * 导出所有数据
   */
  async export(): Promise<Record<string, unknown[]>> {
    const tables = await this.listTables();
    const data: Record<string, unknown[]> = {};

    for (const table of tables) {
      if (table !== '_changelog') {
        const records = await this.storage.find(table);
        data[table] = records.map((r) => r.data);
      }
    }

    return data;
  }

  /**
   * 导入数据
   * @param data 数据对象
   */
  async import(data: Record<string, unknown[]>): Promise<void> {
    for (const [table, records] of Object.entries(data)) {
      for (const record of records) {
        const dataId = (record as { dataId?: string }).dataId;
        if (dataId) {
          await this.storage.upsert(table, dataId, record as Record<string, unknown>);
        }
      }
      this.log(`Imported ${records.length} records to ${table}`);
    }
  }

  /**
   * 关闭数据库（清理资源）
   */
  close(): void {
    this.models.clear();
    this.initialized = false;
    this.log('Database closed');
  }
}

/**
 * 创建 SQLite 数据库管理器工厂
 * @param bridge Tauri 桥接对象
 * @param config 数据库配置
 */
export function createSQLiteDB(
  bridge: SQLiteBridge,
  config?: SQLiteDatabaseConfig
): SQLiteDatabaseManager {
  return new SQLiteDatabaseManager(bridge, config);
}

/**
 * 全局数据库实例存储
 */
const databaseInstances: Map<string, SQLiteDatabaseManager> = new Map();

/**
 * 获取或创建数据库实例
 * @param bridge Tauri 桥接对象
 * @param name 数据库名称
 * @param config 数据库配置
 */
export function getSQLiteDB(
  bridge: SQLiteBridge,
  name: string,
  config?: Omit<SQLiteDatabaseConfig, 'name'>
): SQLiteDatabaseManager {
  const key = name;
  if (!databaseInstances.has(key)) {
    databaseInstances.set(key, new SQLiteDatabaseManager(bridge, { name, ...config }));
  }
  return databaseInstances.get(key)!;
}

/**
 * 移除数据库实例
 * @param name 数据库名称
 */
export function removeSQLiteDB(name: string): void {
  const db = databaseInstances.get(name);
  if (db) {
    db.close();
    databaseInstances.delete(name);
  }
}

/**
 * 清除所有数据库实例
 */
export function clearAllSQLiteDB(): void {
  for (const db of databaseInstances.values()) {
    db.close();
  }
  databaseInstances.clear();
}
