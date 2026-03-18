/**
 * SQLite Module
 * SQLite 存储模块 - 支持 EAV 和 Table 双模式
 *
 * @example
 * ```typescript
 * import {
 *   SQLiteStorage,
 *   SQLiteModel,
 *   SQLiteDatabaseManager,
 *   SQLiteQueryBuilder,
 *   SQLiteTable,
 *   SQLiteDatabase,
 *   EAVStorage,
 *   createSQLiteStorage,
 *   createSQLiteModel,
 *   createSQLiteDB,
 *   createSQLiteTable,
 *   createEAVStorage,
 *   getGlobalSQLiteStorage,
 *   getSQLiteDB
 * } from './sqlite';
 *
 * // EAV 模式（适合结构不固定的数据）
 * const storage = createSQLiteStorage(bridge, { dbName: 'my-app', mode: 'eav' });
 * await storage.init();
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
 * const users = await storage.find('users');
 *
 * // 使用模型层
 * const db = createSQLiteDB(bridge, { name: 'my-app' });
 * await db.init();
 * const User = db.model('users', { primaryKey: 'id' });
 * const user = await User.create({ id: 'user1', name: '张三', age: 25 });
 *
 * // 使用查询构建器
 * const users = await User.query()
 *   .where('age', '>=', 18)
 *   .orderBy('createdAt', 'desc')
 *   .limit(10)
 *   .findMany();
 * ```
 */

// 类型导出
export type {
  SQLiteBridge,
  SQLiteResult,
  EAVRecord,
  SQLiteQueryOptions,
  QueryOptions,
  SQLiteStorageConfig,
  ISQLiteStorage,
  SQLiteModelConfig,
  SQLiteModelData,
  SQLiteFilterCondition,
  SQLiteSortDirection,
  SQLiteSortOptions,
  SQLiteModelQueryOptions,
  SQLiteBatchResult,
  SQLiteChangeLog,
  SQLiteDatabaseConfig,
  StorageMode,
  TableSchema,
  TableQueryOptions,
} from './types';

// 存储（支持 EAV 和 Table 双模式）
export {
  SQLiteStorage,
  createSQLiteStorage,
  getGlobalSQLiteStorage,
  setGlobalSQLiteStorage,
  clearGlobalSQLiteStorage,
} from './storage';

// EAV 模式
export {
  EAVStorage,
  createEAVStorage,
  getPwaIdFromUrl,
} from './eav';

// Table 模式（原生 SQLite）
export {
  SQLiteTable,
  createSQLiteTable,
  SQLiteDatabase,
  createSQLiteDatabase,
} from './sqlite';

// 模型
export {
  SQLiteModel,
  createSQLiteModel,
} from './model';

// 查询构建器
export {
  SQLiteQueryBuilder,
} from './query';

// 数据库管理
export {
  SQLiteDatabaseManager,
  createSQLiteDB,
  getSQLiteDB,
  removeSQLiteDB,
  clearAllSQLiteDB,
} from './database';

// 快捷函数
export {
  initSQLite,
  getSQLite,
  removeSQLite,
  getSQLiteDBHelper,
  removeSQLiteDBHelper,
  defineSQLiteModel,
  createModel,
  setGlobalBridge,
  getGlobalBridge,
  initSQLiteDB,
} from './helper';
