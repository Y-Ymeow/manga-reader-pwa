/**
 * SQLite Module
 * SQLite EAV 存储模块 - 替代 IndexedDB 的灵活实现
 * 
 * @example
 * ```typescript
 * import {
 *   SQLiteStorage,
 *   SQLiteModel,
 *   SQLiteDatabaseManager,
 *   SQLiteQueryBuilder,
 *   createSQLiteStorage,
 *   createSQLiteModel,
 *   createSQLiteDB,
 *   getGlobalSQLiteStorage,
 *   getSQLiteDB
 * } from './sqlite';
 * 
 * // 方式 1: 直接使用存储
 * const storage = createSQLiteStorage(bridge);
 * await storage.upsert('users', 'user1', { name: '张三', age: 25 });
 * const user = await storage.findOne('users', 'user1');
 * 
 * // 方式 2: 使用模型
 * const db = createSQLiteDB(bridge, { name: 'my-app' });
 * await db.init();
 * const User = db.model('users', { primaryKey: 'id' });
 * const user = await User.create({ id: 'user1', name: '张三', age: 25 });
 * 
 * // 方式 3: 使用查询构建器
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
} from './types';

// 存储
export {
  SQLiteStorage,
  createSQLiteStorage,
  getGlobalSQLiteStorage,
  setGlobalSQLiteStorage,
  clearGlobalSQLiteStorage,
} from './storage';

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
  defineSQLiteModel,
  createModel,
  setGlobalBridge,
  getGlobalBridge,
  initSQLiteDB,
} from './helper';
