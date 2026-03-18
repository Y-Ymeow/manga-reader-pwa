/**
 * SQLite Helper Functions
 * SQLite 模块快捷函数
 */

import type { SQLiteBridge, SQLiteDatabaseConfig, SQLiteModelConfig, SQLiteModelData, SQLiteStorageConfig } from './types';
import { SQLiteStorage, createSQLiteStorage, getGlobalSQLiteStorage, setGlobalSQLiteStorage, clearGlobalSQLiteStorage } from './storage';
import { SQLiteModel, createSQLiteModel } from './model';
import { SQLiteDatabaseManager, createSQLiteDB, getSQLiteDB, removeSQLiteDB } from './database';

/**
 * 全局 SQLite 桥接对象
 */
let globalBridge: SQLiteBridge | null = null;

/**
 * 设置全局 SQLite 桥接对象
 * @param bridge Tauri 桥接对象
 */
export function setGlobalBridge(bridge: SQLiteBridge): void {
  globalBridge = bridge;
}

/**
 * 获取全局 SQLite 桥接对象
 */
export function getGlobalBridge(): SQLiteBridge {
  if (!globalBridge) {
    throw new Error('SQLite bridge not set. Call setGlobalBridge() first.');
  }
  return globalBridge;
}

/**
 * 初始化 SQLite 存储
 * @param bridge Tauri 桥接对象
 * @param config 配置选项
 */
export function initSQLite(
  bridge: SQLiteBridge,
  config?: { dbName?: string; mode?: 'eav' | 'table'; debug?: boolean }
): SQLiteStorage {
  const storage = createSQLiteStorage(bridge, {
    dbName: config?.dbName,
    mode: config?.mode,
    debug: config?.debug,
  });
  setGlobalBridge(bridge);
  setGlobalSQLiteStorage(storage);
  return storage;
}

/**
 * 获取 SQLite 存储实例
 * @param config 配置选项
 */
export function getSQLite(config?: { dbName?: string; mode?: 'eav' | 'table'; debug?: boolean }): SQLiteStorage {
  const bridge = getGlobalBridge();
  return getGlobalSQLiteStorage(bridge, {
    dbName: config?.dbName,
    mode: config?.mode,
    debug: config?.debug,
  });
}

/**
 * 移除 SQLite 存储实例
 */
export function removeSQLite(): void {
  clearGlobalSQLiteStorage();
}

/**
 * 初始化 SQLite 数据库管理器
 * @param bridge Tauri 桥接对象
 * @param config 数据库配置
 */
export function initSQLiteDB(bridge: SQLiteBridge, config?: SQLiteDatabaseConfig): SQLiteDatabaseManager {
  const db = createSQLiteDB(bridge, config);
  setGlobalBridge(bridge);
  return db;
}

/**
 * 获取 SQLite 数据库管理器
 * @param name 数据库名称
 * @param config 数据库配置
 */
export function getSQLiteDBHelper(name: string, config?: Omit<SQLiteDatabaseConfig, 'name'>): SQLiteDatabaseManager {
  const bridge = getGlobalBridge();
  return getSQLiteDB(bridge, name, config);
}

/**
 * 移除 SQLite 数据库管理器
 * @param name 数据库名称
 */
export function removeSQLiteDBHelper(name: string): void {
  removeSQLiteDB(name);
}

/**
 * 定义 SQLite 模型
 * @param storage SQLite 存储实例
 * @param tableName 表名
 * @param config 模型配置
 */
export function defineSQLiteModel<T extends SQLiteModelData>(
  storage: SQLiteStorage,
  tableName: string,
  config?: SQLiteModelConfig
): SQLiteModel<T> {
  return createSQLiteModel<T>(storage, tableName, config);
}

/**
 * 快速创建模型（使用全局存储）
 * @param tableName 表名
 * @param config 模型配置
 */
export function createModel<T extends SQLiteModelData>(
  tableName: string,
  config?: SQLiteModelConfig
): SQLiteModel<T> {
  const storage = getSQLite();
  return createSQLiteModel<T>(storage, tableName, config);
}
