/**
 * 插件存储管理
 * 统一使用 IndexedDB 存储
 */

import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';

const DB_NAME = 'manga-reader-plugins';
const DB_VERSION = 2; // 增加版本号以触发 upgrade

interface PluginDB extends DBSchema {
  plugins: {
    key: string;
    value: {
      key: string;
      code: string;
      installedAt: number;
      updatedAt: number;
    };
  };
  manga_cache: {
    key: string; // pluginKey:comicId
    value: {
      key: string;
      data: any;
      expiresAt: number;
      createdAt: number;
    };
    indexes: { expiresAt: number };
  };
  settings: {
    key: string;
    value: any;
  };
}

let db: IDBPDatabase<PluginDB> | null = null;

/**
 * 检查 IndexedDB 是否可用
 */
function checkIndexedDBSupport(): boolean {
  if (!window.indexedDB) {
    console.error('[PluginStorage] IndexedDB is not supported in this browser');
    return false;
  }
  return true;
}

/**
 * 初始化插件存储
 */
export async function initPluginStorage(): Promise<void> {
  if (db) return;

  if (!checkIndexedDBSupport()) {
    throw new Error('IndexedDB is not supported');
  }

  try {
    console.log('[PluginStorage] Opening database...');
    db = await openDB<PluginDB>(DB_NAME, DB_VERSION, {
      upgrade(database, oldVersion, newVersion) {
        console.log(`[PluginStorage] Upgrading DB from ${oldVersion} to ${newVersion}`);
        if (!database.objectStoreNames.contains('plugins')) {
          database.createObjectStore('plugins', { keyPath: 'key' });
          console.log('[PluginStorage] Created plugins store');
        }
        if (!database.objectStoreNames.contains('manga_cache')) {
          const cacheStore = database.createObjectStore('manga_cache', { keyPath: 'key' });
          cacheStore.createIndex('expiresAt', 'expiresAt', { unique: false });
          console.log('[PluginStorage] Created manga_cache store');
        }
        if (!database.objectStoreNames.contains('settings')) {
          database.createObjectStore('settings');
          console.log('[PluginStorage] Created settings store');
        }
      },
    });
    console.log('[PluginStorage] Initialized successfully, stores:', Array.from(db.objectStoreNames));
  } catch (e) {
    console.error('[PluginStorage] Failed to initialize:', e);
    throw e;
  }
}

/**
 * 获取数据库实例
 */
async function getDB(): Promise<IDBPDatabase<PluginDB>> {
  if (!db) {
    await initPluginStorage();
  }
  if (!db) {
    throw new Error('Failed to initialize plugin storage');
  }
  return db;
}

// ===== 插件代码存储 =====

/**
 * 保存插件代码
 */
export async function savePluginCode(key: string, code: string): Promise<void> {
  const database = await getDB();
  const now = Date.now();

  const existing = await database.get('plugins', key);
  await database.put('plugins', {
    key,
    code,
    installedAt: existing?.installedAt || now,
    updatedAt: now,
  });
}

/**
 * 加载插件代码
 */
export async function loadPluginCode(key: string): Promise<string | null> {
  const database = await getDB();
  const record = await database.get('plugins', key);
  return record?.code || null;
}

/**
 * 删除插件代码
 */
export async function deletePluginCode(key: string): Promise<void> {
  const database = await getDB();
  await database.delete('plugins', key);
}

/**
 * 获取所有已存储的插件 key
 */
export async function listStoredPlugins(): Promise<string[]> {
  const database = await getDB();
  const records = await database.getAllKeys('plugins');
  return records as string[];
}

// ===== 漫画缓存存储 =====

const DEFAULT_CACHE_TTL = 60 * 60 * 1000; // 1小时

/**
 * 保存漫画缓存
 */
export async function saveMangaCache(
  pluginKey: string,
  comicId: string,
  data: any,
  ttl: number = DEFAULT_CACHE_TTL
): Promise<void> {
  const database = await getDB();
  const key = `${pluginKey}:${comicId}`;
  const now = Date.now();

  await database.put('manga_cache', {
    key,
    data,
    expiresAt: now + ttl,
    createdAt: now,
  });
}

/**
 * 加载漫画缓存
 */
export async function loadMangaCache(pluginKey: string, comicId: string): Promise<any | null> {
  const database = await getDB();
  const key = `${pluginKey}:${comicId}`;
  const record = await database.get('manga_cache', key);

  if (!record) return null;

  // 检查是否过期
  if (record.expiresAt < Date.now()) {
    await database.delete('manga_cache', key);
    return null;
  }

  return record.data;
}

/**
 * 删除漫画缓存
 */
export async function deleteMangaCache(pluginKey: string, comicId: string): Promise<void> {
  const database = await getDB();
  const key = `${pluginKey}:${comicId}`;
  await database.delete('manga_cache', key);
}

/**
 * 清理过期缓存
 */
export async function clearExpiredCache(): Promise<void> {
  const database = await getDB();
  const now = Date.now();
  const tx = database.transaction('manga_cache', 'readwrite');
  const store = tx.objectStore('manga_cache');
  const index = store.index('expiresAt');

  const expiredKeys: string[] = [];
  let cursor = await index.openCursor();

  while (cursor) {
    if (cursor.value.expiresAt < now) {
      expiredKeys.push(cursor.value.key);
    }
    cursor = await cursor.continue();
  }

  await Promise.all(expiredKeys.map(key => store.delete(key)));
  await tx.done;
}

// ===== 插件设置存储 =====

const SETTING_KEY_PREFIX = 'plugin_setting_';

/**
 * 保存插件设置
 */
export async function savePluginSetting(
  pluginKey: string,
  settingKey: string,
  value: any
): Promise<void> {
  const database = await getDB();
  const key = `${SETTING_KEY_PREFIX}${pluginKey}_${settingKey}`;
  await database.put('settings', value, key);
}

/**
 * 加载插件设置
 */
export async function loadPluginSetting(
  pluginKey: string,
  settingKey: string
): Promise<any | null> {
  const database = await getDB();
  const key = `${SETTING_KEY_PREFIX}${pluginKey}_${settingKey}`;
  return database.get('settings', key);
}

/**
 * 删除插件设置
 */
export async function deletePluginSetting(
  pluginKey: string,
  settingKey: string
): Promise<void> {
  const database = await getDB();
  const key = `${SETTING_KEY_PREFIX}${pluginKey}_${settingKey}`;
  await database.delete('settings', key);
}

/**
 * 删除插件的所有设置
 */
export async function deleteAllPluginSettings(pluginKey: string): Promise<void> {
  const database = await getDB();
  const prefix = `${SETTING_KEY_PREFIX}${pluginKey}_`;
  const keys = await database.getAllKeys('settings');
  const pluginKeys = keys.filter((k) =>
    typeof k === 'string' && k.startsWith(prefix)
  );
  await Promise.all(pluginKeys.map((key) => database.delete('settings', key)));
}

// ===== 源列表地址存储 =====

const SOURCE_LIST_KEY = 'manga_reader_source_list_url';

/**
 * 保存源列表地址
 */
export function saveSourceListUrl(url: string): void {
  localStorage.setItem(SOURCE_LIST_KEY, url);
}

/**
 * 获取源列表地址
 */
export function getSourceListUrl(): string | null {
  return localStorage.getItem(SOURCE_LIST_KEY);
}

/**
 * 清除源列表地址
 */
export function clearSourceListUrl(): void {
  localStorage.removeItem(SOURCE_LIST_KEY);
}
