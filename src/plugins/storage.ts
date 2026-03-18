/**
 * 插件存储管理
 * Tauri 环境：使用 window.tauri.eav
 * 浏览器环境：使用 IndexedDB
 */

import { isTauri } from '../db/adapter';
import { waitForDatabase } from '../db/global';

// ==================== Tauri EAV 存储 ====================

// Tauri 环境下使用 window.tauri.eav
function getTauriEAV() {
  if (!isTauri()) return null;
  const win = window as unknown as { 
    __TAURI__?: { eav?: any }; 
    tauri?: { eav?: any } 
  };
  return win.__TAURI__?.eav || win.tauri?.eav || null;
}

// ==================== IndexedDB 实现 ====================

async function getDB(): Promise<IDBDatabase> {
  await waitForDatabase();
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('manga-reader');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

// ===== 插件代码存储 =====

export async function savePluginCode(key: string, code: string): Promise<void> {
  if (isTauri()) {
    const eav = getTauriEAV();
    if (eav) {
      await eav.upsert('plugin_codes', key, { code });
      return;
    }
  }

  const db = await getDB();
  const now = Date.now();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction('plugin_codes', 'readwrite');
    const store = tx.objectStore('plugin_codes');
    const getRequest = store.get(key);
    getRequest.onsuccess = () => {
      const existing = getRequest.result;
      const putRequest = store.put({ key, code, installedAt: existing?.installedAt || now, updatedAt: now });
      putRequest.onsuccess = () => resolve();
      putRequest.onerror = () => reject(putRequest.error);
    };
    getRequest.onerror = () => reject(getRequest.error);
  });
}

export async function loadPluginCode(key: string): Promise<string | null> {
  if (isTauri()) {
    const eav = getTauriEAV();
    if (eav) {
      try {
        const record = await eav.findOne('plugin_codes', key);
        return record?.data?.code ?? null;
      } catch (e) {
        console.error('[loadPluginCode] Tauri error:', e);
        return null;
      }
    }
  }

  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('plugin_codes', 'readonly');
    const store = tx.objectStore('plugin_codes');
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result?.code || null);
    request.onerror = () => reject(request.error);
  });
}

export async function deletePluginCode(key: string): Promise<void> {
  if (isTauri()) {
    const eav = getTauriEAV();
    if (eav) {
      await eav.delete('plugin_codes', key);
      return;
    }
  }

  const db = await getDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction('plugin_codes', 'readwrite');
    const store = tx.objectStore('plugin_codes');
    const request = store.delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function listStoredPlugins(): Promise<string[]> {
  if (isTauri()) {
    const eav = getTauriEAV();
    if (eav) {
      const records = await eav.find('plugin_codes');
      return records.map((r: any) => r.dataId).filter(Boolean);
    }
    return [];
  }

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

export async function saveMangaCache(pluginKey: string, comicId: string, data: any, ttl: number = DEFAULT_CACHE_TTL): Promise<void> {
  if (isTauri()) {
    const eav = getTauriEAV();
    if (eav) {
      const key = `${pluginKey}:${comicId}`;
      const now = Date.now();
      const existing = await eav.findOne('manga_cache', key);
      if (existing) {
        await eav.upsert('manga_cache', key, { data, expiresAt: now + ttl, createdAt: existing.data?.createdAt || now });
      } else {
        await eav.upsert('manga_cache', key, { data, expiresAt: now + ttl, createdAt: now });
      }
      return;
    }
  }
  
  const db = await getDB();
  const key = `${pluginKey}:${comicId}`;
  const now = Date.now();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction('manga_cache', 'readwrite');
    const store = tx.objectStore('manga_cache');
    const request = store.put({ key, data, expiresAt: now + ttl, createdAt: now });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function loadMangaCache(pluginKey: string, comicId: string): Promise<any | null> {
  if (isTauri()) {
    const eav = getTauriEAV();
    if (eav) {
      const key = `${pluginKey}:${comicId}`;
      const record = await eav.findOne('manga_cache', key);
      if (!record?.data) return null;
      if (record.data.expiresAt < Date.now()) {
        await eav.delete('manga_cache', key);
        return null;
      }
      return record.data.data;
    }
  }
  
  const db = await getDB();
  const key = `${pluginKey}:${comicId}`;
  return new Promise((resolve, reject) => {
    const tx = db.transaction('manga_cache', 'readwrite');
    const store = tx.objectStore('manga_cache');
    const request = store.get(key);
    request.onsuccess = () => {
      const record = request.result;
      if (!record) { resolve(null); return; }
      if (record.expiresAt < Date.now()) { store.delete(key); resolve(null); return; }
      resolve(record.data);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function deleteMangaCache(pluginKey: string, comicId: string): Promise<void> {
  if (isTauri()) {
    const eav = getTauriEAV();
    if (eav) {
      await eav.delete('manga_cache', `${pluginKey}:${comicId}`);
      return;
    }
  }
  
  const db = await getDB();
  const key = `${pluginKey}:${comicId}`;
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction('manga_cache', 'readwrite');
    const store = tx.objectStore('manga_cache');
    const request = store.delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function deleteMangaCacheWithSuffix(pluginKey: string, comicId: string, suffix: string = ''): Promise<void> {
  return deleteMangaCache(pluginKey, comicId + suffix);
}

export async function clearPluginMangaCache(pluginKey: string): Promise<void> {
  if (isTauri()) {
    const eav = getTauriEAV();
    if (eav) {
      const records = await eav.find('manga_cache');
      for (const record of records) {
        if (record.dataId.startsWith(`${pluginKey}:`)) {
          await eav.delete('manga_cache', record.dataId);
        }
      }
      return;
    }
  }
  
  const db = await getDB();
  return new Promise<void>((resolve, reject) => {
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

export async function listPluginCacheKeys(pluginKey: string): Promise<string[]> {
  if (isTauri()) {
    const eav = getTauriEAV();
    if (eav) {
      const records = await eav.find('manga_cache');
      return records.filter((r: any) => r.dataId.startsWith(`${pluginKey}:`)).map((r: any) => r.dataId);
    }
    return [];
  }
  
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

export async function savePluginSetting(pluginKey: string, settingKey: string, value: any): Promise<void> {
  if (isTauri()) {
    const eav = getTauriEAV();
    if (eav) {
      const key = `${SETTING_KEY_PREFIX}${pluginKey}_${settingKey}`;
      const existing = await eav.findOne('plugin_settings', key);
      if (existing) {
        await eav.upsert('plugin_settings', key, { value });
      } else {
        await eav.upsert('plugin_settings', key, { value });
      }
      return;
    }
  }
  
  const db = await getDB();
  const key = `${SETTING_KEY_PREFIX}${pluginKey}_${settingKey}`;
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction('plugin_settings', 'readwrite');
    const store = tx.objectStore('plugin_settings');
    const request = store.put({ key, value });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function loadPluginSetting(pluginKey: string, settingKey: string): Promise<any | null> {
  if (isTauri()) {
    const eav = getTauriEAV();
    if (eav) {
      const key = `${SETTING_KEY_PREFIX}${pluginKey}_${settingKey}`;
      const record = await eav.findOne('plugin_settings', key);
      return record?.data?.value ?? null;
    }
  }
  
  const db = await getDB();
  const key = `${SETTING_KEY_PREFIX}${pluginKey}_${settingKey}`;
  return new Promise((resolve, reject) => {
    const tx = db.transaction('plugin_settings', 'readonly');
    const store = tx.objectStore('plugin_settings');
    const request = store.get(key);
    request.onsuccess = () => {
      const result = request.result;
      resolve(result?.value ?? result ?? null);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function deletePluginSetting(pluginKey: string, settingKey: string): Promise<void> {
  if (isTauri()) {
    const eav = getTauriEAV();
    if (eav) {
      await eav.delete('plugin_settings', `${SETTING_KEY_PREFIX}${pluginKey}_${settingKey}`);
      return;
    }
  }
  
  const db = await getDB();
  const key = `${SETTING_KEY_PREFIX}${pluginKey}_${settingKey}`;
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction('plugin_settings', 'readwrite');
    const store = tx.objectStore('plugin_settings');
    const request = store.delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// ===== 插件通用数据存储 =====

const PLUGIN_DATA_KEY_PREFIX = 'plugin_data_';

export async function savePluginData(pluginKey: string, dataKey: string, value: any): Promise<void> {
  if (isTauri()) {
    const eav = getTauriEAV();
    if (eav) {
      const key = `${PLUGIN_DATA_KEY_PREFIX}${pluginKey}`;
      const existing = await eav.findOne('plugin_settings', key);
      const existingData = existing?.data?.data || {};
      const newData = { ...existingData, [dataKey]: value };
      await eav.upsert('plugin_settings', key, { data: newData });
      return;
    }
  }
  
  const db = await getDB();
  const key = `${PLUGIN_DATA_KEY_PREFIX}${pluginKey}`;
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction('plugin_settings', 'readwrite');
    const store = tx.objectStore('plugin_settings');
    const getRequest = store.get(key);
    getRequest.onsuccess = () => {
      const existingData = getRequest.result?.data || {};
      const newData = { ...existingData, [dataKey]: value };
      const putRequest = store.put({ key, data: newData });
      putRequest.onsuccess = () => resolve();
      putRequest.onerror = () => reject(putRequest.error);
    };
    getRequest.onerror = () => reject(getRequest.error);
  });
}

export async function loadPluginData(pluginKey: string, dataKey: string): Promise<any | null> {
  if (isTauri()) {
    const eav = getTauriEAV();
    if (eav) {
      const key = `${PLUGIN_DATA_KEY_PREFIX}${pluginKey}`;
      const record = await eav.findOne('plugin_settings', key);
      if (record?.data?.data) {
        return record.data.data[dataKey] ?? null;
      }
      return null;
    }
  }
  
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

export async function loadAllPluginData(pluginKey: string): Promise<Record<string, any>> {
  if (isTauri()) {
    const eav = getTauriEAV();
    if (eav) {
      const key = `${PLUGIN_DATA_KEY_PREFIX}${pluginKey}`;
      const record = await eav.findOne('plugin_settings', key);
      return record?.data?.data || {};
    }
    return {};
  }
  
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

export async function deletePluginData(pluginKey: string, dataKey: string): Promise<void> {
  if (isTauri()) {
    const eav = getTauriEAV();
    if (eav) {
      const key = `${PLUGIN_DATA_KEY_PREFIX}${pluginKey}`;
      const existing = await eav.findOne('plugin_settings', key);
      const existingData = existing?.data?.data || {};
      delete existingData[dataKey];
      await eav.upsert('plugin_settings', key, { data: existingData });
      return;
    }
  }
  
  const db = await getDB();
  const key = `${PLUGIN_DATA_KEY_PREFIX}${pluginKey}`;
  return new Promise<void>((resolve, reject) => {
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

export async function listPluginDataKeys(pluginKey: string): Promise<string[]> {
  const data = await loadAllPluginData(pluginKey);
  return Object.keys(data);
}

export async function clearPluginData(pluginKey: string): Promise<number> {
  if (isTauri()) {
    const eav = getTauriEAV();
    if (eav) {
      const key = `${PLUGIN_DATA_KEY_PREFIX}${pluginKey}`;
      const record = await eav.findOne('plugin_settings', key);
      const count = Object.keys(record?.data?.data || {}).length;
      await eav.upsert('plugin_settings', key, { data: {} });
      return count;
    }
    return 0;
  }
  
  const db = await getDB();
  const key = `${PLUGIN_DATA_KEY_PREFIX}${pluginKey}`;
  return new Promise((resolve, reject) => {
    const tx = db.transaction('plugin_settings', 'readwrite');
    const store = tx.objectStore('plugin_settings');
    const getRequest = store.get(key);
    getRequest.onsuccess = () => {
      const count = Object.keys(getRequest.result?.data || {}).length;
      const existing = getRequest.result;
      if (existing) {
        store.put({ key, data: {} });
      }
      resolve(count);
    };
    getRequest.onerror = () => reject(getRequest.error);
  });
}

// ===== 源列表存储（使用 localStorage） =====

const SOURCE_LIST_URL_KEY = 'plugin_source_list_url';

export async function saveSourceListUrl(url: string): Promise<void> {
  const result: any = localStorage.setItem(SOURCE_LIST_URL_KEY, url);
  if (result instanceof Promise) {
    await result;
  }
}

export async function getSourceListUrl(): Promise<string | null> {
  const result: any = localStorage.getItem(SOURCE_LIST_URL_KEY);
  if (result instanceof Promise) {
    return await result;
  }
  return result;
}

// ===== 初始化 =====

export async function initPluginStorage(): Promise<void> {
  // 不需要初始化
}
