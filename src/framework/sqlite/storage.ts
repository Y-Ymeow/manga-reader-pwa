/**
 * SQLite Storage
 * SQLite 存储实现（支持 EAV 和 Table 双模式）
 *
 * 直接使用 window.tauri.sql 和 window.tauri.eav 接口
 *
 * @example
 * ```typescript
 * // EAV 模式（适合结构不固定的数据）
 * const storage = createSQLiteStorage(bridge, { dbName: 'my-app', mode: 'eav' });
 * await storage.upsert('users', 'user1', { name: '张三', age: 25 });
 * const user = await storage.findOne('users', 'user1');
 *
 * // Table 模式（适合结构固定的数据，性能更好）
 * const storage = createSQLiteStorage(bridge, { dbName: 'my-app', mode: 'table' });
 * await storage.createTable('users', `
 *   id INTEGER PRIMARY KEY AUTOINCREMENT,
 *   name TEXT NOT NULL,
 *   age INTEGER
 * `);
 * await storage.tableInsert('users', { name: '张三', age: 25 });
 * ```
 */

import type {
  SQLiteBridge,
  EAVRecord,
  SQLiteQueryOptions,
  SQLiteStorageConfig,
  ISQLiteStorage,
  StorageMode,
} from "./types";

/**
 * 从 URL 获取 pwaId
 */
function getPwaIdFromUrl(): string {
  try {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('__pwa_id') || 'default';
  } catch {
    return 'default';
  }
}

/**
 * 获取 Tauri SQL 接口
 */
function getTauriSQL() {
  if (typeof window !== 'undefined') {
    if ((window.tauri as any) && (window.tauri as any).sql) {
      return (window.tauri as any).sql;
    }
    if ((window.__TAURI__ as any) && (window.__TAURI__ as any).sql) {
      return (window.__TAURI__ as any).sql;
    }
  }
  return null;
}

/**
 * 获取 Tauri EAV 接口
 */
function getTauriEAV(dbName?: string) {
  if (typeof window !== 'undefined') {
    if ((window.tauri as any) && (window.tauri as any).eav) {
      return (window.tauri as any).eav;
    }
    if ((window.__TAURI__ as any) && (window.__TAURI__ as any).eav) {
      return (window.__TAURI__ as any).eav;
    }
  }
  return null;
}

/**
 * 等待 Tauri SQL 就绪
 */
async function waitForTauriSQL(timeout = 5000): Promise<any> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    const sql = getTauriSQL();
    if (sql) {
      return sql;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  throw new Error('Tauri SQL not available within timeout');
}

/**
 * SQLite 存储实现（支持 EAV 和 Table 双模式）
 */
export class SQLiteStorage implements ISQLiteStorage {
  readonly appId: string;
  readonly dbName: string;
  readonly mode: StorageMode;

  private pwaId: string;
  private debug: boolean;
  private initialized = false;
  private sql: any = null;
  private eav: any = null;

  /**
   * 创建 SQLite 存储实例
   * @param bridge Tauri 桥接对象（用于兼容）
   * @param appId 应用 ID（可选，默认从 URL 提取）
   * @param dbName 数据库名称
   * @param mode 存储模式（'eav' | 'table'）
   */
  constructor(
    bridge: SQLiteBridge,
    appId?: string,
    dbName: string = "default",
    mode: StorageMode = 'eav',
  ) {
    this.pwaId = appId || getPwaIdFromUrl();
    this.appId = this.pwaId;
    this.dbName = dbName;
    this.mode = mode;
    this.debug = false;
    this.sql = getTauriSQL();
    this.eav = getTauriEAV(dbName);
  }

  /**
   * 初始化存储
   */
  async init(): Promise<void> {
    if (this.initialized) return;
    
    // 等待 Tauri SQL 就绪
    if (!this.sql) {
      this.sql = await waitForTauriSQL();
    }
    
    this.initialized = true;
    this.log("SQLiteStorage initialized (mode:", this.mode + ")");
  }

  /**
   * 检查是否已初始化
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * 确保初始化
   */
  private async ensureInit(): Promise<void> {
    if (!this.initialized) {
      await this.init();
    }
  }

  /**
   * 日志输出
   */
  private log(...args: unknown[]): void {
    if (this.debug) {
      console.log('[SQLiteStorage]', ...args);
    }
  }

  /**
   * 执行 SQL（使用 window.tauri.sql）
   */
  private async executeSQL<T = unknown>(sql: string, params: unknown[] = []): Promise<T> {
    // 等待 Tauri SQL 就绪
    if (!this.sql) {
      this.sql = await waitForTauriSQL();
    }

    // 使用 Tauri SQL 接口
    if (params && params.length > 0) {
      return await this.sql.execute(sql, params);
    }
    return await this.sql.execute(sql);
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
    await this.ensureInit();

    // EAV 模式直接使用 window.tauri.eav
    if (this.mode === 'eav' && this.eav) {
      return await this.eav.upsert(table, dataId, data);
    }

    // Table 模式
    return this.tableUpsert(table, dataId, data);
  }

  /**
   * Table 模式下的 upsert
   */
  private async tableUpsert<T extends Record<string, unknown>>(
    table: string,
    dataId: string,
    data: T
  ): Promise<boolean> {
    const serializableData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value === undefined) continue;
      serializableData[key] = value;
    }

    const columns = Object.keys(serializableData);
    const placeholders = columns.map(() => '?').join(', ');
    const values = columns.map((col) => serializableData[col]);

    // 尝试更新
    const updateSql = `UPDATE ${table} SET ${columns.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`;
    const updateResult = await this.executeSQL<{ changes: number }>(updateSql, [...values, dataId]);

    if (updateResult && (updateResult as any).changes === 0) {
      // 没有更新任何行，说明记录不存在，执行插入
      const insertColumns = ['id', ...columns];
      const insertValues = [dataId, ...values];
      const insertSql = `INSERT INTO ${table} (${insertColumns.join(', ')}) VALUES (${insertColumns.map(() => '?').join(', ')})`;
      await this.executeSQL(insertSql, insertValues);
    }

    return true;
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
    await this.ensureInit();

    // EAV 模式直接使用 window.tauri.eav
    if (this.mode === 'eav' && this.eav) {
      return await this.eav.find(table, options);
    }

    // Table 模式
    return this.tableFind(table, options);
  }

  /**
   * Table 模式下的 find
   */
  private async tableFind<T extends Record<string, unknown>>(
    table: string,
    options: SQLiteQueryOptions = {}
  ): Promise<EAVRecord<T>[]> {
    let sql = `SELECT * FROM ${table}`;
    const params: unknown[] = [];

    if (options.filter && Object.keys(options.filter).length > 0) {
      const conditions: string[] = [];
      for (const [key, value] of Object.entries(options.filter)) {
        const cleanKey = key.split('.')[0];
        conditions.push(`${cleanKey} = ?`);
        params.push(value);
      }
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }

    if (options.orderBy) {
      const orderByColumn = options.orderBy.replace(/([A-Z])/g, '_$1').toLowerCase();
      sql += ` ORDER BY ${orderByColumn} ${options.desc ? 'DESC' : 'ASC'}`;
    }

    if (options.limit) {
      sql += ` LIMIT ?`;
      params.push(options.limit);
    }

    if (options.offset) {
      sql += ` OFFSET ?`;
      params.push(options.offset);
    }

    const rows = await this.executeSQL<T[]>(sql, params);

    return rows.map((row) => ({
      dataId: (row as any).id || String(Math.random()),
      createdAt: (row as any).created_at || (row as any).createdAt || Date.now(),
      updatedAt: (row as any).updated_at || (row as any).updatedAt || Date.now(),
      data: row,
    }));
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
    await this.ensureInit();

    // EAV 模式直接使用 window.tauri.eav
    if (this.mode === 'eav' && this.eav) {
      return await this.eav.findOne(table, dataId);
    }

    // Table 模式
    return this.tableFindOne(table, dataId);
  }

  /**
   * Table 模式下的 findOne
   */
  private async tableFindOne<T extends Record<string, unknown>>(
    table: string,
    dataId: string
  ): Promise<EAVRecord<T> | null> {
    const row = await this.executeSQL<T>(`SELECT * FROM ${table} WHERE id = ?`, [dataId]);
    if (!row) return null;

    return {
      dataId: (row as any).id || dataId,
      createdAt: (row as any).created_at || (row as any).createdAt || Date.now(),
      updatedAt: (row as any).updated_at || (row as any).updatedAt || Date.now(),
      data: row,
    };
  }

  /**
   * 删除记录
   * @param table 逻辑表名
   * @param dataId 记录 ID
   * @returns 是否成功
   */
  async delete(table: string, dataId: string): Promise<boolean> {
    await this.ensureInit();

    // EAV 模式直接使用 window.tauri.eav
    if (this.mode === 'eav' && this.eav) {
      return await this.eav.delete(table, dataId);
    }

    // Table 模式
    await this.executeSQL(`DELETE FROM ${table} WHERE id = ?`, [dataId]);
    return true;
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
    await this.ensureInit();

    // EAV 模式
    if (this.mode === 'eav' && this.eav) {
      return await this.eav.count(table, filter);
    }

    // Table 模式
    let sql = `SELECT COUNT(*) as count FROM ${table}`;
    const params: unknown[] = [];
    if (filter && Object.keys(filter).length > 0) {
      const conditions: string[] = [];
      for (const [key, value] of Object.entries(filter)) {
        const cleanKey = key.split('.')[0];
        conditions.push(`${cleanKey} = ?`);
        params.push(value);
      }
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }
    const result = await this.executeSQL<{ count: number }>(sql, params);
    return result?.count || 0;
  }

  /**
   * 清空表
   * @param table 逻辑表名
   * @returns 是否成功
   */
  async clear(table: string): Promise<boolean> {
    await this.ensureInit();

    // EAV 模式
    if (this.mode === 'eav' && this.eav) {
      return await this.eav.clear(table);
    }

    // Table 模式
    await this.executeSQL(`DELETE FROM ${table}`);
    return true;
  }

  /**
   * 列出所有表
   * @returns 表名数组
   */
  async listTables(): Promise<string[]> {
    await this.ensureInit();

    // EAV 模式
    if (this.mode === 'eav' && this.eav) {
      return await this.eav.listTables();
    }

    // Table 模式
    const result = await this.executeSQL<{ name: string }[]>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    );
    return result.map((r) => r.name);
  }

  // ============== Table 模式特有方法 ==============

  /**
   * 创建表（仅 Table 模式）
   * @param tableName 表名
   * @param columns 列定义
   */
  async createTable(tableName: string, columns: string): Promise<void> {
    await this.executeSQL(`CREATE TABLE IF NOT EXISTS ${tableName} (${columns})`);
    this.log('Table created:', tableName);
  }

  /**
   * 删除表（仅 Table 模式）
   * @param tableName 表名
   */
  async dropTable(tableName: string): Promise<void> {
    await this.executeSQL(`DROP TABLE IF EXISTS ${tableName}`);
    this.log('Table dropped:', tableName);
  }

  /**
   * 表插入（仅 Table 模式）
   * @param table 表名
   * @param data 数据对象
   * @returns 插入的 ID
   */
  async tableInsert(table: string, data: Record<string, unknown>): Promise<number> {
    const columns = Object.keys(data);
    const placeholders = columns.map(() => '?').join(', ');
    const values = columns.map((col) => data[col]);

    const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;
    await this.executeSQL(sql, values);

    const result = await this.executeSQL<{ lastInsertRowid: number }>(
      'SELECT last_insert_rowid() as lastInsertRowid'
    );
    return result.lastInsertRowid;
  }

  /**
   * 表更新（仅 Table 模式）
   * @param table 表名
   * @param data 更新数据
   * @param where WHERE 子句
   * @param params 参数
   * @returns 影响的行数
   */
  async tableUpdate(
    table: string,
    data: Record<string, unknown>,
    where: string,
    params: unknown[] = []
  ): Promise<number> {
    const columns = Object.keys(data);
    const setClause = columns.map((col) => `${col} = ?`).join(', ');
    const values = columns.map((col) => data[col]);

    const sql = `UPDATE ${table} SET ${setClause} WHERE ${where}`;
    await this.executeSQL(sql, [...values, ...params]);

    const result = await this.executeSQL<{ changes: number }>('SELECT changes() as changes');
    return result.changes;
  }

  /**
   * 表删除（仅 Table 模式）
   * @param table 表名
   * @param where WHERE 子句
   * @param params 参数
   * @returns 影响的行数
   */
  async tableDelete(table: string, where: string, params: unknown[] = []): Promise<number> {
    const sql = `DELETE FROM ${table} WHERE ${where}`;
    await this.executeSQL(sql, params);

    const result = await this.executeSQL<{ changes: number }>('SELECT changes() as changes');
    return result.changes;
  }

  /**
   * 执行原生 SQL
   * @param sql SQL 语句
   * @param params 参数
   */
  async execute<T = unknown>(sql: string, params: unknown[] = []): Promise<T> {
    return this.executeSQL<T>(sql, params);
  }

  /**
   * 执行事务
   * @param statements SQL 语句数组
   */
  async transaction(statements: Array<{ sql: string; params?: unknown[] }>): Promise<void> {
    await this.executeSQL('BEGIN TRANSACTION');
    try {
      for (const stmt of statements) {
        await this.executeSQL(stmt.sql, stmt.params || []);
      }
      await this.executeSQL('COMMIT');
    } catch (error) {
      await this.executeSQL('ROLLBACK');
      throw error;
    }
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
  const storage = new SQLiteStorage(
    bridge,
    config?.appId,
    config?.dbName,
    config?.mode || 'eav'
  );
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
