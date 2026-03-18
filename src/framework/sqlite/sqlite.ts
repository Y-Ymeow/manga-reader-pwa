/**
 * SQLite Table Mode
 * 原生 SQLite 表结构操作 - 直接使用 SQL 语句操作数据
 *
 * @example
 * ```typescript
 * import { createSQLiteTable } from './sqlite';
 *
 * const table = createSQLiteTable(bridge, 'users');
 *
 * // 创建表
 * await table.create(`
 *   id INTEGER PRIMARY KEY AUTOINCREMENT,
 *   name TEXT NOT NULL,
 *   email TEXT UNIQUE,
 *   age INTEGER
 * `);
 *
 * // 插入数据
 * await table.insert({ name: '张三', email: 'zhangsan@example.com', age: 25 });
 *
 * // 查询
 * const users = await table.select('WHERE age >= ?', [18]);
 *
 * // 更新
 * await table.update({ age: 26 }, 'WHERE email = ?', ['zhangsan@example.com']);
 *
 * // 删除
 * await table.delete('WHERE id = ?', [1]);
 * ```
 */

import type { SQLiteBridge, SQLiteResult } from './types';

/**
 * 获取 Tauri 桥接对象
 */
function getTauriBridge() {
  if (typeof window !== 'undefined') {
    if (window.tauri && typeof window.tauri.invoke === 'function') {
      return window.tauri as any;
    }
    if (window.__TAURI__ && typeof window.__TAURI__.invoke === 'function') {
      return window.__TAURI__ as any;
    }
  }
  return null;
}

/**
 * 等待 Tauri 就绪
 */
async function waitForTauri(timeout = 5000): Promise<any> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    const bridge = getTauriBridge();
    if (bridge) {
      return bridge;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  throw new Error('Tauri bridge not available within timeout');
}

/**
 * 表结构定义
 */
export interface TableSchema {
  columns: string;
  indexes?: string[];
}

/**
 * 查询选项
 */
export interface TableQueryOptions {
  where?: string;
  params?: unknown[];
  orderBy?: string;
  limit?: number;
  offset?: number;
}

/**
 * SQLite 表操作类
 */
export class SQLiteTable {
  readonly tableName: string;
  private pwaId: string;
  private debug: boolean;
  private bridge: any = null;
  private dbName: string;

  /**
   * 创建表操作实例
   * @param bridge Tauri 桥接对象
   * @param tableName 表名
   * @param pwaId PWA ID
   */
  constructor(bridge: SQLiteBridge, tableName: string, pwaId: string, debug = false, dbName = 'default') {
    this.tableName = tableName;
    this.pwaId = pwaId;
    this.dbName = dbName;
    this.debug = debug;
    this.bridge = getTauriBridge();
  }

  /**
   * 日志输出
   */
  private log(...args: unknown[]): void {
    if (this.debug) {
      console.log(`[SQLiteTable:${this.tableName}]`, ...args);
    }
  }

  /**
   * 执行 SQL 请求（使用 Tauri invoke）
   */
  private async sendSQL<T = unknown>(sql: string, params: unknown[] = []): Promise<T> {
    // 等待 Tauri 就绪
    if (!this.bridge) {
      this.bridge = await waitForTauri();
    }

    try {
      // 使用 Tauri SQL 插件
      const result = await this.bridge.invoke('sqlite:execute', {
        db: this.getDatabasePath(),
        query: sql,
        values: params,
      });
      return result as T;
    } catch (error) {
      // 如果 sqlite:execute 不可用，尝试备用方案（postMessage）
      if (error instanceof Error && error.message.includes('not allowed')) {
        return this.sendSQLFallback<T>(sql, params);
      }
      throw error;
    }
  }

  /**
   * 执行 SQL 请求（备用方案 - postMessage）
   */
  private async sendSQLFallback<T = unknown>(sql: string, params: unknown[] = []): Promise<T> {
    return new Promise((resolve, reject) => {
      const requestId = this.generateRequestId();
      const timeout = setTimeout(() => {
        window.removeEventListener('message', handler);
        reject(new Error('SQL request timeout'));
      }, 30000);

      const handler = (event: MessageEvent) => {
        if (
          event.data?.type === 'ADAPT_SQL_RESPONSE' &&
          event.data?.requestId === requestId
        ) {
          clearTimeout(timeout);
          window.removeEventListener('message', handler);

          if (event.data.success) {
            resolve(event.data.data as T);
          } else {
            reject(new Error(event.data.error || 'SQL request failed'));
          }
        }
      };

      window.addEventListener('message', handler);

      window.parent.postMessage(
        {
          type: 'ADAPT_SQL_REQUEST',
          requestId,
          pwaId: this.pwaId,
          sql,
          params,
        },
        '*'
      );
    });
  }

  /**
   * 获取数据库文件路径
   */
  private getDatabasePath(): string {
    return `pwa-${this.pwaId}-${this.dbName}.db`;
  }

  /**
   * 生成请求 ID
   */
  private generateRequestId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  }

  /**
   * 创建表
   * @param columns 列定义
   */
  async create(columns: string): Promise<void> {
    const sql = `CREATE TABLE IF NOT EXISTS ${this.tableName} (${columns})`;
    await this.sendSQL(sql);
    this.log('Table created:', this.tableName);
  }

  /**
   * 删除表
   */
  async drop(): Promise<void> {
    const sql = `DROP TABLE IF EXISTS ${this.tableName}`;
    await this.sendSQL(sql);
    this.log('Table dropped:', this.tableName);
  }

  /**
   * 创建索引
   * @param indexName 索引名
   * @param columns 列名
   * @param unique 是否唯一索引
   */
  async createIndex(indexName: string, columns: string, unique = false): Promise<void> {
    const sql = `CREATE ${unique ? 'UNIQUE ' : ''}INDEX IF NOT EXISTS ${indexName} ON ${this.tableName} (${columns})`;
    await this.sendSQL(sql);
    this.log('Index created:', indexName);
  }

  /**
   * 删除索引
   * @param indexName 索引名
   */
  async dropIndex(indexName: string): Promise<void> {
    const sql = `DROP INDEX IF EXISTS ${indexName}`;
    await this.sendSQL(sql);
    this.log('Index dropped:', indexName);
  }

  /**
   * 插入数据
   * @param data 数据对象
   * @returns 插入的 ID
   */
  async insert(data: Record<string, unknown>): Promise<number> {
    const columns = Object.keys(data);
    const placeholders = columns.map(() => '?').join(', ');
    const values = columns.map((col) => data[col]);

    const sql = `INSERT INTO ${this.tableName} (${columns.join(', ')}) VALUES (${placeholders})`;
    await this.sendSQL(sql, values);

    // 获取最后插入的 ID
    const result = await this.sendSQL<{ lastInsertRowid: number }>(
      'SELECT last_insert_rowid() as lastInsertRowid'
    );
    return result.lastInsertRowid;
  }

  /**
   * 批量插入
   * @param dataList 数据对象数组
   */
  async insertMany(dataList: Record<string, unknown>[]): Promise<void> {
    if (dataList.length === 0) return;

    const columns = Object.keys(dataList[0]);
    const placeholders = `(${columns.map(() => '?').join(', ')})`;
    const allValues: unknown[] = [];

    const valuesSql = dataList.map((data) => {
      columns.forEach((col) => allValues.push(data[col]));
      return placeholders;
    }).join(', ');

    const sql = `INSERT INTO ${this.tableName} (${columns.join(', ')}) VALUES ${valuesSql}`;
    await this.sendSQL(sql, allValues);
    this.log(`Inserted ${dataList.length} rows`);
  }

  /**
   * 查询数据
   * @param options 查询选项
   * @returns 结果数组
   */
  async select<T = Record<string, unknown>[]>(options: TableQueryOptions = {}): Promise<T> {
    let sql = `SELECT * FROM ${this.tableName}`;
    const params: unknown[] = options.params || [];

    if (options.where) {
      sql += ` WHERE ${options.where}`;
    }

    if (options.orderBy) {
      sql += ` ORDER BY ${options.orderBy}`;
    }

    if (options.limit) {
      sql += ` LIMIT ?`;
      params.push(options.limit);
    }

    if (options.offset) {
      sql += ` OFFSET ?`;
      params.push(options.offset);
    }

    return this.sendSQL<T>(sql, params);
  }

  /**
   * 查询单条数据
   * @param options 查询选项
   * @returns 结果或 null
   */
  async selectOne<T = Record<string, unknown>>(options: TableQueryOptions = {}): Promise<T | null> {
    const results = await this.select<T[]>({ ...options, limit: 1 });
    return results[0] || null;
  }

  /**
   * 根据 ID 查询
   * @param id 主键 ID
   * @returns 结果或 null
   */
  async findById<T = Record<string, unknown>>(id: number | string): Promise<T | null> {
    return this.selectOne<T>({
      where: 'id = ?',
      params: [id],
    });
  }

  /**
   * 更新数据
   * @param data 更新数据
   * @param where WHERE 子句（不含 WHERE 关键字）
   * @param params 参数
   * @returns 影响的行数
   */
  async update(data: Record<string, unknown>, where: string, params: unknown[] = []): Promise<number> {
    const columns = Object.keys(data);
    const setClause = columns.map((col) => `${col} = ?`).join(', ');
    const values = columns.map((col) => data[col]);

    const sql = `UPDATE ${this.tableName} SET ${setClause} WHERE ${where}`;
    await this.sendSQL(sql, [...values, ...params]);

    // 获取影响的行数
    const result = await this.sendSQL<{ changes: number }>('SELECT changes() as changes');
    return result.changes;
  }

  /**
   * 删除数据
   * @param where WHERE 子句（不含 WHERE 关键字）
   * @param params 参数
   * @returns 影响的行数
   */
  async delete(where: string, params: unknown[] = []): Promise<number> {
    const sql = `DELETE FROM ${this.tableName} WHERE ${where}`;
    await this.sendSQL(sql, params);

    // 获取影响的行数
    const result = await this.sendSQL<{ changes: number }>('SELECT changes() as changes');
    return result.changes;
  }

  /**
   * 统计行数
   * @param where WHERE 子句（可选）
   * @param params 参数（可选）
   * @returns 行数
   */
  async count(where?: string, params: unknown[] = []): Promise<number> {
    let sql = `SELECT COUNT(*) as count FROM ${this.tableName}`;
    if (where) {
      sql += ` WHERE ${where}`;
    }

    const result = await this.sendSQL<{ count: number }>(sql, params);
    return result.count;
  }

  /**
   * 清空表
   */
  async clear(): Promise<void> {
    const sql = `DELETE FROM ${this.tableName}`;
    await this.sendSQL(sql);
    this.log('Table cleared:', this.tableName);
  }

  /**
   * 执行原生 SQL
   * @param sql SQL 语句
   * @param params 参数
   */
  async execute<T = unknown>(sql: string, params: unknown[] = []): Promise<T> {
    return this.sendSQL<T>(sql, params);
  }

  /**
   * 执行事务
   * @param statements SQL 语句数组
   */
  async transaction(statements: Array<{ sql: string; params?: unknown[] }>): Promise<void> {
    await this.sendSQL('BEGIN TRANSACTION');
    try {
      for (const stmt of statements) {
        await this.sendSQL(stmt.sql, stmt.params || []);
      }
      await this.sendSQL('COMMIT');
    } catch (error) {
      await this.sendSQL('ROLLBACK');
      throw error;
    }
  }
}

/**
 * 创建 SQLite 表操作实例
 * @param bridge Tauri 桥接对象
 * @param tableName 表名
 * @param pwaId PWA ID
 * @param debug 调试模式
 * @param dbName 数据库名称
 */
export function createSQLiteTable(
  bridge: SQLiteBridge,
  tableName: string,
  pwaId: string,
  debug = false,
  dbName = 'default'
): SQLiteTable {
  return new SQLiteTable(bridge, tableName, pwaId, debug, dbName);
}

/**
 * 创建 SQLite 数据库实例
 * @param bridge Tauri 桥接对象
 * @param pwaId PWA ID
 * @param debug 调试模式
 * @param dbName 数据库名称
 */
export function createSQLiteDatabase(
  bridge: SQLiteBridge,
  pwaId: string,
  debug = false,
  dbName = 'default'
): SQLiteDatabase {
  return new SQLiteDatabase(bridge, pwaId, debug, dbName);
}

/**
 * SQLite 数据库管理类（原生表模式）
 */
export class SQLiteDatabase {
  private pwaId: string;
  private debug: boolean;
  private tables: Map<string, SQLiteTable> = new Map();
  private bridge: any = null;
  private dbName: string;

  constructor(bridge: SQLiteBridge, pwaId: string, debug = false, dbName = 'default') {
    this.pwaId = pwaId;
    this.dbName = dbName;
    this.debug = debug;
    this.bridge = getTauriBridge();
  }

  /**
   * 获取或创建表操作实例
   */
  table(tableName: string): SQLiteTable {
    if (!this.tables.has(tableName)) {
      this.tables.set(tableName, new SQLiteTable(this.bridge, tableName, this.pwaId, this.debug, this.dbName));
    }
    return this.tables.get(tableName)!;
  }

  /**
   * 执行原生 SQL（使用 Tauri invoke）
   */
  async execute<T = unknown>(sql: string, params: unknown[] = []): Promise<T> {
    if (!this.bridge) {
      this.bridge = await waitForTauri();
    }

    try {
      const result = await this.bridge.invoke('sqlite:execute', {
        db: this.getDatabasePath(),
        query: sql,
        values: params,
      });
      return result as T;
    } catch (error) {
      if (error instanceof Error && error.message.includes('not allowed')) {
        return this.executeFallback<T>(sql, params);
      }
      throw error;
    }
  }

  /**
   * 执行原生 SQL（备用方案 - postMessage）
   */
  private async executeFallback<T = unknown>(sql: string, params: unknown[] = []): Promise<T> {
    return new Promise((resolve, reject) => {
      const requestId = Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
      const timeout = setTimeout(() => {
        window.removeEventListener('message', handler);
        reject(new Error('SQL request timeout'));
      }, 30000);

      const handler = (event: MessageEvent) => {
        if (event.data?.type === 'ADAPT_SQL_RESPONSE' && event.data?.requestId === requestId) {
          clearTimeout(timeout);
          window.removeEventListener('message', handler);
          if (event.data.success) {
            resolve(event.data.data as T);
          } else {
            reject(new Error(event.data.error));
          }
        }
      };

      window.addEventListener('message', handler);
      window.parent.postMessage({
        type: 'ADAPT_SQL_REQUEST',
        requestId,
        pwaId: this.pwaId,
        sql,
        params,
      }, '*');
    });
  }

  /**
   * 获取数据库文件路径
   */
  private getDatabasePath(): string {
    return `pwa-${this.pwaId}-${this.dbName}.db`;
  }

  /**
   * 列出所有表
   */
  async listTables(): Promise<string[]> {
    const result = await this.execute<{ name: string }[]>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    );
    return result.map((r) => r.name);
  }

  /**
   * 检查表是否存在
   */
  async hasTable(tableName: string): Promise<boolean> {
    const tables = await this.listTables();
    return tables.includes(tableName);
  }

  /**
   * 删除表
   */
  async dropTable(tableName: string): Promise<void> {
    await this.execute(`DROP TABLE IF EXISTS ${tableName}`);
    this.tables.delete(tableName);
  }

  /**
   * 清空所有表
   */
  async clearAll(): Promise<void> {
    const tables = await this.listTables();
    for (const table of tables) {
      await this.execute(`DELETE FROM ${table}`);
    }
  }

  /**
   * 执行事务
   */
  async transaction(statements: Array<{ sql: string; params?: unknown[] }>): Promise<void> {
    await this.execute('BEGIN TRANSACTION');
    try {
      for (const stmt of statements) {
        await this.execute(stmt.sql, stmt.params || []);
      }
      await this.execute('COMMIT');
    } catch (error) {
      await this.execute('ROLLBACK');
      throw error;
    }
  }
}
