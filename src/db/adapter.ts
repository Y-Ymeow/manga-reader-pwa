/**
 * 数据库存储适配层
 * 在 Tauri 环境下使用 SQLite，在浏览器环境下使用 IndexedDB
 */

import { isTauri } from '../fs/storage-adapter';

/**
 * 检测是否在 Tauri 环境中
 */
export { isTauri } from '../fs/storage-adapter';

/**
 * 获取数据库名称
 * 在 Tauri 环境下返回 SQLite 数据库名，在浏览器环境下返回 IndexedDB 数据库名
 */
export function getDatabaseName(): string {
  return 'manga-reader';
}

/**
 * 获取存储名称映射
 * - Tauri 环境：映射到 SQLite 表名
 * - 浏览器环境：使用 IndexedDB store 名
 */
export const STORE_MAPPING = {
  plugin_codes: 'plugin_codes',
  manga_cache: 'manga_cache',
  plugin_settings: 'plugin_settings',
  cache_index: 'cache_index',
  file_cache: 'file_cache',
} as const;

export type StoreName = keyof typeof STORE_MAPPING;

/**
 * 获取实际的存储/表名
 */
export function getStoreName(store: StoreName): string {
  return STORE_MAPPING[store];
}

/**
 * 检查指定存储是否应该使用 SQLite
 */
export function shouldUseSQLite(store: StoreName): boolean {
  return isTauri();
}
