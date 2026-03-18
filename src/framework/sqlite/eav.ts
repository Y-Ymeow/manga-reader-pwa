/**
 * SQLite EAV Mode
 * EAV（Entity-Attribute-Value）模型存储 - 基于 SQLite 的灵活存储方案
 *
 * EAV 模型适合存储结构不固定的数据，每个记录的属性可以动态添加
 *
 * @example
 * ```typescript
 * import { createEAVStorage } from './eav';
 *
 * const eav = createEAVStorage(bridge, 'my-app', 'default');
 * await eav.init();
 *
 * // 插入/更新数据
 * await eav.upsert('users', 'user1', { name: '张三', age: 25, tags: ['admin', 'editor'] });
 *
 * // 查询
 * const user = await eav.findOne('users', 'user1');
 * const users = await eav.find('users', { limit: 10, orderBy: 'createdAt', desc: true });
 *
 * // 删除
 * await eav.delete('users', 'user1');
 *
 * // KV 存储
 * await eav.setItem('config.theme', 'dark');
 * const theme = await eav.getItem('config.theme');
 * ```
 */

import type { SQLiteBridge, EAVRecord, QueryOptions } from './types';

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
 * EAV 存储类
 */
export class EAVStorage {
  readonly pwaId: string;
  readonly dbName: string;
  private debug: boolean;
  private initialized = false;
  private sql: any = null;

  /**
   * 创建 EAV 存储实例
   * @param bridge Tauri 桥接对象
   * @param pwaId PWA ID
   * @param dbName 数据库名称
   */
  constructor(bridge: SQLiteBridge, pwaId: string, dbName: string = 'default', debug = false) {
    this.pwaId = pwaId;
    this.dbName = dbName;
    this.debug = debug;
    this.sql = getTauriSQL();
  }

  /**
   * 日志输出
   */
  private log(...args: unknown[]): void {
    if (this.debug) {
      console.log(`[EAVStorage:${this.dbName}]`, ...args);
    }
  }

  /**
   * 发送 SQL 请求（使用 window.tauri.sql）
   */
  private async sendSQL<T = unknown>(sql: string, params: unknown[] = []): Promise<T> {
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
   * 生成请求 ID
   */
  private generateRequestId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  }

  /**
   * 获取数据库文件路径
   */
  private getDatabasePath(): string {
    return this.pwaId;
  }

  /**
   * 初始化表结构
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    // 创建主数据表
    await this.sendSQL(`
      CREATE TABLE IF NOT EXISTS pwa_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        db_name TEXT NOT NULL,
        table_name TEXT NOT NULL,
        data_id TEXT NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER DEFAULT (strftime('%s', 'now')),
        UNIQUE(db_name, table_name, data_id)
      )
    `);

    // 创建属性数据表
    await this.sendSQL(`
      CREATE TABLE IF NOT EXISTS pwa_schema_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        data_id INTEGER NOT NULL,
        attr_name TEXT NOT NULL,
        attr_value TEXT,
        FOREIGN KEY (data_id) REFERENCES pwa_data(id) ON DELETE CASCADE
      )
    `);

    // 创建索引
    await this.sendSQL(`
      CREATE INDEX IF NOT EXISTS idx_pwa_data_lookup 
      ON pwa_data(db_name, table_name, data_id)
    `);

    await this.sendSQL(`
      CREATE INDEX IF NOT EXISTS idx_pwa_schema_data_data_id 
      ON pwa_schema_data(data_id)
    `);

    await this.sendSQL(`
      CREATE INDEX IF NOT EXISTS idx_pwa_schema_data_attr 
      ON pwa_schema_data(attr_name, attr_value)
    `);

    this.initialized = true;
    this.log('EAV storage initialized');
  }

  /**
   * 检查是否已初始化
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * 插入或更新记录
   */
  async upsert<T extends Record<string, unknown> = Record<string, unknown>>(
    table: string,
    dataId: string,
    data: T
  ): Promise<boolean> {
    await this.ensureInit();

    // 过滤不可序列化的值
    const serializableData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value === undefined) continue;
      try {
        if (value !== null && typeof value === 'object') {
          JSON.stringify(value);
        }
        serializableData[key] = value;
      } catch {
        console.warn(`[EAVStorage] Skipping non-serializable field: ${key}`);
      }
    }

    // 检查记录是否存在
    const existing = await this.sendSQL<{ id: number }[]>(
      `SELECT id FROM pwa_data WHERE db_name = ? AND table_name = ? AND data_id = ?`,
      [this.dbName, table, String(dataId)]
    );

    let rowId: number;
    if (existing.length === 0) {
      // 插入新记录
      await this.sendSQL(
        `INSERT INTO pwa_data (db_name, table_name, data_id, created_at, updated_at) 
         VALUES (?, ?, ?, strftime('%s', 'now'), strftime('%s', 'now'))`,
        [this.dbName, table, String(dataId)]
      );
      const newRow = await this.sendSQL<{ id: number }[]>(
        `SELECT id FROM pwa_data WHERE db_name = ? AND table_name = ? AND data_id = ?`,
        [this.dbName, table, String(dataId)]
      );
      rowId = newRow[0]?.id;
    } else {
      rowId = existing[0].id;
      // 更新时间戳
      await this.sendSQL(
        `UPDATE pwa_data SET updated_at = strftime('%s', 'now') WHERE id = ?`,
        [rowId]
      );
      // 删除旧属性
      await this.sendSQL(`DELETE FROM pwa_schema_data WHERE data_id = ?`, [rowId]);
    }

    // 插入新属性
    for (const [key, value] of Object.entries(serializableData)) {
      await this.sendSQL(
        `INSERT INTO pwa_schema_data (data_id, attr_name, attr_value) VALUES (?, ?, ?)`,
        [rowId, key, JSON.stringify(value)]
      );
    }

    return true;
  }

  /**
   * 查询记录
   */
  async find<T extends Record<string, unknown> = Record<string, unknown>>(
    table: string,
    options: QueryOptions = {}
  ): Promise<EAVRecord<T>[]> {
    await this.ensureInit();

    let sqlQuery = `
      SELECT d.data_id, d.created_at, d.updated_at, s.attr_name, s.attr_value
      FROM pwa_data d
      LEFT JOIN pwa_schema_data s ON d.id = s.data_id
      WHERE d.db_name = ? AND d.table_name = ?
    `;
    const params: unknown[] = [this.dbName, table];

    // 简单过滤（只支持第一个条件）
    if (options.filter && Object.keys(options.filter).length > 0) {
      const [firstKey] = Object.entries(options.filter)[0] || [];
      if (firstKey) {
        const attrName = firstKey.split('.')[0];
        sqlQuery += ` AND d.data_id IN (
          SELECT data_id FROM pwa_schema_data WHERE attr_name = ?
        )`;
        params.push(attrName);
      }
    }

    // 排序
    const orderByColumn = options.orderBy
      ? options.orderBy.replace(/([A-Z])/g, '_$1').toLowerCase()
      : 'updated_at';
    sqlQuery += ` ORDER BY d.${orderByColumn} ${options.desc ? 'DESC' : 'ASC'}`;

    // 限制和偏移
    if (options.limit) {
      sqlQuery += ` LIMIT ?`;
      params.push(options.limit);
    }
    if (options.offset) {
      sqlQuery += ` OFFSET ?`;
      params.push(options.offset);
    }

    const rows = await this.sendSQL<{
      data_id: string;
      created_at: number;
      updated_at: number;
      attr_name: string;
      attr_value: string;
    }[]>(sqlQuery, params);

    // 重组 EAV 数据
    const records = new Map<string, EAVRecord<T>>();
    for (const row of rows) {
      if (!records.has(row.data_id)) {
        records.set(row.data_id, {
          dataId: row.data_id,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          data: {} as T,
        });
      }
      if (row.attr_name) {
        try {
          (records.get(row.data_id)!.data as Record<string, unknown>)[row.attr_name] =
            JSON.parse(row.attr_value);
        } catch {
          (records.get(row.data_id)!.data as Record<string, unknown>)[row.attr_name] = row.attr_value;
        }
      }
    }

    return Array.from(records.values());
  }

  /**
   * 查询单条记录
   */
  async findOne<T extends Record<string, unknown> = Record<string, unknown>>(
    table: string,
    dataId: string
  ): Promise<EAVRecord<T> | null> {
    await this.ensureInit();

    const rows = await this.sendSQL<{
      data_id: string;
      created_at: number;
      updated_at: number;
      attr_name: string;
      attr_value: string;
    }[]>(
      `SELECT d.data_id, d.created_at, d.updated_at, s.attr_name, s.attr_value
       FROM pwa_data d
       LEFT JOIN pwa_schema_data s ON d.id = s.data_id
       WHERE d.db_name = ? AND d.table_name = ? AND d.data_id = ?`,
      [this.dbName, table, String(dataId)]
    );

    if (rows.length === 0) return null;

    const record: EAVRecord<T> = {
      dataId: rows[0].data_id,
      createdAt: rows[0].created_at,
      updatedAt: rows[0].updated_at,
      data: {} as T,
    };

    for (const row of rows) {
      if (row.attr_name) {
        try {
          (record.data as Record<string, unknown>)[row.attr_name] = JSON.parse(row.attr_value);
        } catch {
          (record.data as Record<string, unknown>)[row.attr_name] = row.attr_value;
        }
      }
    }

    return record;
  }

  /**
   * 删除记录
   */
  async delete(table: string, dataId: string): Promise<boolean> {
    await this.ensureInit();

    await this.sendSQL(
      `DELETE FROM pwa_data WHERE db_name = ? AND table_name = ? AND data_id = ?`,
      [this.dbName, table, String(dataId)]
    );

    return true;
  }

  /**
   * 统计记录数
   */
  async count(table: string, filter?: Record<string, unknown>): Promise<number> {
    await this.ensureInit();

    let sqlQuery = `SELECT COUNT(DISTINCT data_id) as count FROM pwa_data WHERE db_name = ? AND table_name = ?`;
    const params: unknown[] = [this.dbName, table];

    if (filter && Object.keys(filter).length > 0) {
      const [firstKey] = Object.entries(filter)[0] || [];
      if (firstKey) {
        const attrName = firstKey.split('.')[0];
        sqlQuery += ` AND data_id IN (
          SELECT data_id FROM pwa_schema_data WHERE attr_name = ?
        )`;
        params.push(attrName);
      }
    }

    const result = await this.sendSQL<{ count: number }[]>(sqlQuery, params);
    return result[0]?.count || 0;
  }

  /**
   * 清空表
   */
  async clear(table: string): Promise<boolean> {
    await this.ensureInit();

    await this.sendSQL(
      `DELETE FROM pwa_data WHERE db_name = ? AND table_name = ?`,
      [this.dbName, table]
    );

    return true;
  }

  /**
   * 列出所有表
   */
  async listTables(): Promise<string[]> {
    await this.ensureInit();

    const result = await this.sendSQL<{ table_name: string }[]>(
      `SELECT DISTINCT table_name FROM pwa_data WHERE db_name = ?`,
      [this.dbName]
    );

    return result.map((r) => r.table_name);
  }

  // ============== KV 便捷方法 ==============

  /**
   * 设置键值
   */
  async setItem(key: string, value: unknown): Promise<boolean> {
    await this.ensureInit();
    return this.upsert('kv', key, { value });
  }

  /**
   * 获取键值
   */
  async getItem<T = unknown>(key: string): Promise<T | null> {
    await this.ensureInit();
    const record = await this.findOne('kv', key);
    return (record?.data?.value as T) ?? null;
  }

  /**
   * 删除键值
   */
  async removeItem(key: string): Promise<boolean> {
    await this.ensureInit();
    return this.delete('kv', key);
  }

  /**
   * 清空所有键值
   */
  async clearAll(): Promise<boolean> {
    await this.ensureInit();
    return this.clear('kv');
  }

  /**
   * 获取所有键
   */
  async keys(): Promise<string[]> {
    await this.ensureInit();
    const records = await this.find('kv');
    return records.map((r) => r.dataId);
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
   * 设置调试模式
   */
  setDebug(enabled: boolean): void {
    this.debug = enabled;
  }
}

/**
 * 创建 EAV 存储实例
 * @param bridge Tauri 桥接对象
 * @param pwaId PWA ID
 * @param dbName 数据库名称
 */
export function createEAVStorage(
  bridge: SQLiteBridge,
  pwaId: string,
  dbName: string = 'default',
  debug = false
): EAVStorage {
  const storage = new EAVStorage(bridge, pwaId, dbName, debug);
  return storage;
}

/**
 * 从 URL 获取 pwaId
 */
export function getPwaIdFromUrl(): string {
  try {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('__pwa_id') || 'default';
  } catch {
    return 'default';
  }
}
