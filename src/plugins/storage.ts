/**
 * 插件存储管理
 * 统一使用 manga-reader 数据库的 store
 */

import { waitForDatabase } from '../db/global';

// 使用统一的数据库
async function getDB(): Promise<IDBDatabase> {
  await waitForDatabase();
  return new Promise((resolve, reject) => {
    // 不指定版本，让浏览器使用最新版本
    const request = indexedDB.open('manga-reader');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

// ===== 插件代码存储 =====

/**
 * 保存插件代码
 */
export async function savePluginCode(key: string, code: string): Promise<void> {
  const db = await getDB();
  const now = Date.now();
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction('plugin_codes', 'readwrite');
    const store = tx.objectStore('plugin_codes');
    
    // 先获取现有记录
    const getRequest = store.get(key);
    getRequest.onsuccess = () => {
      const existing = getRequest.result;
      const putRequest = store.put({
        key,
        code,
        installedAt: existing?.installedAt || now,
        updatedAt: now,
      });
      putRequest.onsuccess = () => resolve();
      putRequest.onerror = () => reject(putRequest.error);
    };
    getRequest.onerror = () => reject(getRequest.error);
  });
}

/**
 * 加载插件代码
 */
export async function loadPluginCode(key: string): Promise<string | null> {
  const db = await getDB();
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction('plugin_codes', 'readonly');
    const store = tx.objectStore('plugin_codes');
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result?.code || null);
    request.onerror = () => reject(request.error);
  });
}

/**
 * 删除插件代码
 */
export async function deletePluginCode(key: string): Promise<void> {
  const db = await getDB();
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction('plugin_codes', 'readwrite');
    const store = tx.objectStore('plugin_codes');
    const request = store.delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * 获取所有已存储的插件 key
 */
export async function listStoredPlugins(): Promise<string[]> {
  const db = await getDB();
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction('plugin_codes', 'readonly');
    const store = tx.objectStore('plugin_codes');
    const request = store.getAllKeys();
    request.onsuccess = () => resolve(request.result as string[]);
    request.onerror = () => reject(request.error);
  });
}

// ===== 漫画缓存存储 =====

const DEFAULT_CACHE_TTL = 60 * 60 * 1000; // 1 小时

/**
 * 保存漫画缓存
 */
export async function saveMangaCache(
  pluginKey: string,
  comicId: string,
  data: any,
  ttl: number = DEFAULT_CACHE_TTL
): Promise<void> {
  const db = await getDB();
  const key = `${pluginKey}:${comicId}`;
  const now = Date.now();
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction('manga_cache', 'readwrite');
    const store = tx.objectStore('manga_cache');
    const request = store.put({
      key,
      data,
      expiresAt: now + ttl,
      createdAt: now,
    });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * 加载漫画缓存
 */
export async function loadMangaCache(pluginKey: string, comicId: string): Promise<any | null> {
  const db = await getDB();
  const key = `${pluginKey}:${comicId}`;

  return new Promise((resolve, reject) => {
    const tx = db.transaction('manga_cache', 'readwrite');
    const store = tx.objectStore('manga_cache');
    const request = store.get(key);
    request.onsuccess = () => {
      const record = request.result;
      if (!record) {
        resolve(null);
        return;
      }
      // 检查是否过期
      if (record.expiresAt < Date.now()) {
        store.delete(key);
        resolve(null);
        return;
      }
      resolve(record.data);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * 删除漫画缓存
 */
export async function deleteMangaCache(pluginKey: string, comicId: string): Promise<void> {
  const db = await getDB();
  const key = `${pluginKey}:${comicId}`;
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction('manga_cache', 'readwrite');
    const store = tx.objectStore('manga_cache');
    const request = store.delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * 删除漫画缓存（支持后缀，如 comicId.info）
 */
export async function deleteMangaCacheWithSuffix(pluginKey: string, comicId: string, suffix: string = ''): Promise<void> {
  const db = await getDB();
  const key = `${pluginKey}:${comicId}${suffix}`;
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction('manga_cache', 'readwrite');
    const store = tx.objectStore('manga_cache');
    const request = store.delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * 清理指定插件的所有漫画缓存
 */
export async function clearPluginMangaCache(pluginKey: string): Promise<void> {
  const db = await getDB();
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction('manga_cache', 'readwrite');
    const store = tx.objectStore('manga_cache');
    const request = store.getAllKeys();
    request.onsuccess = async () => {
      const allKeys = request.result as string[];
      for (const key of allKeys) {
        if (typeof key === 'string' && key.startsWith(`${pluginKey}:`)) {
          store.delete(key);
        }
      }
      tx.oncomplete = () => resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * 列出指定插件的所有缓存 key（用于调试）
 */
export async function listPluginCacheKeys(pluginKey: string): Promise<string[]> {
  const db = await getDB();
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction('manga_cache', 'readonly');
    const store = tx.objectStore('manga_cache');
    const request = store.getAllKeys();
    request.onsuccess = () => {
      const allKeys = request.result as string[];
      resolve(allKeys.filter(key => typeof key === 'string' && key.startsWith(`${pluginKey}:`)));
    };
    request.onerror = () => reject(request.error);
  });
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
  const db = await getDB();
  const key = `${SETTING_KEY_PREFIX}${pluginKey}_${settingKey}`;

  return new Promise((resolve, reject) => {
    const tx = db.transaction('plugin_settings', 'readwrite');
    const store = tx.objectStore('plugin_settings');
    // 使用内联键格式存储
    const request = store.put({ key, value });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * 加载插件设置
 */
export async function loadPluginSetting(
  pluginKey: string,
  settingKey: string
): Promise<any | null> {
  const db = await getDB();
  const key = `${SETTING_KEY_PREFIX}${pluginKey}_${settingKey}`;

  return new Promise((resolve, reject) => {
    const tx = db.transaction('plugin_settings', 'readonly');
    const store = tx.objectStore('plugin_settings');
    const request = store.get(key);
    request.onsuccess = () => {
      const result = request.result;
      // 如果是对象格式，返回 value 字段
      resolve(result?.value ?? result ?? null);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * 删除插件设置
 */
export async function deletePluginSetting(
  pluginKey: string,
  settingKey: string
): Promise<void> {
  const db = await getDB();
  const key = `${SETTING_KEY_PREFIX}${pluginKey}_${settingKey}`;

  return new Promise((resolve, reject) => {
    const tx = db.transaction('plugin_settings', 'readwrite');
    const store = tx.objectStore('plugin_settings');
    const request = store.delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// ===== 插件通用数据存储（IndexedDB，每个插件一条数据） =====

const PLUGIN_DATA_KEY_PREFIX = 'plugin_data_';

/**
 * 保存插件数据（IndexedDB 存储，每个插件一条数据）
 */
export async function savePluginData(
  pluginKey: string,
  dataKey: string,
  value: any
): Promise<void> {
  const db = await getDB();
  const key = `${PLUGIN_DATA_KEY_PREFIX}${pluginKey}`;

  return new Promise((resolve, reject) => {
    const tx = db.transaction('plugin_settings', 'readwrite');
    const store = tx.objectStore('plugin_settings');
    
    // 先获取现有数据
    const getRequest = store.get(key);
    getRequest.onsuccess = () => {
      const existingData = getRequest.result?.data || {};
      // 更新数据
      const newData = { ...existingData, [dataKey]: value };
      // 保存
      const putRequest = store.put({ key, data: newData });
      putRequest.onsuccess = () => resolve();
      putRequest.onerror = () => reject(putRequest.error);
    };
    getRequest.onerror = () => reject(getRequest.error);
  });
}

/**
 * 加载插件数据（IndexedDB 存储，每个插件一条数据）
 */
export async function loadPluginData(
  pluginKey: string,
  dataKey: string
): Promise<any | null> {
  const db = await getDB();
  const key = `${PLUGIN_DATA_KEY_PREFIX}${pluginKey}`;

  return new Promise((resolve, reject) => {
    const tx = db.transaction('plugin_settings', 'readonly');
    const store = tx.objectStore('plugin_settings');
    const request = store.get(key);
    request.onsuccess = () => {
      const result = request.result;
      if (result?.data) {
        resolve(result.data[dataKey] ?? null);
      } else {
        resolve(null);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * 批量加载插件所有数据
 */
export async function loadAllPluginData(pluginKey: string): Promise<Record<string, any>> {
  const db = await getDB();
  const key = `${PLUGIN_DATA_KEY_PREFIX}${pluginKey}`;

  return new Promise((resolve, reject) => {
    const tx = db.transaction('plugin_settings', 'readonly');
    const store = tx.objectStore('plugin_settings');
    const request = store.get(key);
    request.onsuccess = () => {
      const result = request.result;
      resolve(result?.data || {});
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * 删除插件数据
 */
export async function deletePluginData(
  pluginKey: string,
  dataKey: string
): Promise<void> {
  const db = await getDB();
  const key = `${PLUGIN_DATA_KEY_PREFIX}${pluginKey}`;

  return new Promise((resolve, reject) => {
    const tx = db.transaction('plugin_settings', 'readwrite');
    const store = tx.objectStore('plugin_settings');
    
    const getRequest = store.get(key);
    getRequest.onsuccess = () => {
      const existingData = getRequest.result?.data || {};
      delete existingData[dataKey];
      const putRequest = store.put({ key, data: existingData });
      putRequest.onsuccess = () => resolve();
      putRequest.onerror = () => reject(putRequest.error);
    };
    getRequest.onerror = () => reject(getRequest.error);
  });
}

/**
 * 列出插件的所有数据 key（用于调试和清除）
 */
export async function listPluginDataKeys(pluginKey: string): Promise<string[]> {
  const data = await loadAllPluginData(pluginKey);
  return Object.keys(data);
}

/**
 * 清除插件的所有数据
 */
export async function clearPluginData(pluginKey: string): Promise<number> {
  const db = await getDB();
  const key = `${PLUGIN_DATA_KEY_PREFIX}${pluginKey}`;

  return new Promise((resolve, reject) => {
    const tx = db.transaction('plugin_settings', 'readwrite');
    const store = tx.objectStore('plugin_settings');
    
    const getRequest = store.get(key);
    getRequest.onsuccess = () => {
      const count = Object.keys(getRequest.result?.data || {}).length;
      // 清空数据对象
      const existing = getRequest.result;
      if (existing) {
        store.put({ key, data: {} });
      }
      resolve(count);
    };
    getRequest.onerror = () => reject(getRequest.error);
  });
}

// ===== 源列表存储（兼容旧版） =====

const SOURCE_LIST_URL_KEY = 'plugin_source_list_url';

/**
 * 保存源列表 URL
 */
export function saveSourceListUrl(url: string): void {
  localStorage.setItem(SOURCE_LIST_URL_KEY, url);
}

/**
 * 获取源列表 URL
 */
export function getSourceListUrl(): string | null {
  return localStorage.getItem(SOURCE_LIST_URL_KEY);
}

// ===== 初始化（兼容旧版） =====

/**
 * 初始化插件存储（空函数，保持兼容）
 */
export async function initPluginStorage(): Promise<void> {
  // 不需要初始化，使用统一的数据库
}
