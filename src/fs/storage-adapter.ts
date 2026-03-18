/**
 * 存储适配器
 * 统一 Tauri 和浏览器环境的存储实现
 * - Tauri 模式：使用 LocalStorage（指向数据库）
 * - 浏览器模式：使用 IndexedDB
 */

import { LocalStorage } from '../framework/storages/local';
import type { StorageValue } from '../framework/storages/types';

/**
 * 检测是否在 Tauri 环境中
 */
export function isTauri(): boolean {
  const win = window as unknown as { __TAURI__?: { _ready: boolean }; tauri?: { _ready: boolean } };
  const tauri = win.__TAURI__ || win.tauri;
  return tauri?._ready === true;
}

/**
 * 存储适配器接口
 */
export interface IStorageAdapter {
  /**
   * 初始化
   */
  init(): Promise<void>;

  /**
   * 获取值
   */
  get<T extends StorageValue = StorageValue>(key: string): Promise<T | null>;

  /**
   * 设置值
   */
  set<T extends StorageValue = StorageValue>(key: string, value: T): Promise<void>;

  /**
   * 删除值
   */
  delete(key: string): Promise<void>;

  /**
   * 获取所有键
   */
  keys(): Promise<string[]>;

  /**
   * 获取所有值（支持前缀匹配）
   */
  getAll<T extends StorageValue = StorageValue>(prefix?: string): Promise<T[]>;

  /**
   * 清空所有数据
   */
  clear(): Promise<void>;
}

/**
 * LocalStorage 适配器（用于 Tauri 环境）
 */
export class LocalStorageAdapter implements IStorageAdapter {
  private storage: LocalStorage;
  private initialized = false;

  constructor(storageName: string = 'app-storage') {
    this.storage = new LocalStorage(storageName);
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    await this.storage.init();
    this.initialized = true;
  }

  async get<T extends StorageValue = StorageValue>(key: string): Promise<T | null> {
    const entry = await this.storage.get<T>(key);
    return entry?.value ?? null;
  }

  async set<T extends StorageValue = StorageValue>(key: string, value: T): Promise<void> {
    await this.storage.set(key, value);
  }

  async delete(key: string): Promise<void> {
    await this.storage.delete(key);
  }

  async keys(): Promise<string[]> {
    return await this.storage.keys();
  }

  async getAll<T extends StorageValue = StorageValue>(prefix?: string): Promise<T[]> {
    const entries = await this.storage.getAll<T>(prefix ? { prefix } : undefined);
    return entries.map(entry => entry.value);
  }

  async clear(): Promise<void> {
    await this.storage.clear();
  }
}

/**
 * IndexedDB 适配器（用于浏览器环境）
 */
export class IndexedDBAdapter implements IStorageAdapter {
  private dbName: string;
  private storeName: string;
  private db: IDBDatabase | null = null;
  private initialized = false;

  constructor(dbName: string, storeName: string) {
    this.dbName = dbName;
    this.storeName = storeName;
  }

  async init(): Promise<void> {
    if (this.initialized) return;

    this.db = await this.openDB();
    this.initialized = true;
  }

  private openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'key' });
          store.createIndex('key', 'key', { unique: true });
        }
      };
    });
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.db) await this.init();
    if (!this.db) return null;

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([this.storeName], 'readonly');
      const store = tx.objectStore(this.storeName);
      const request = store.get(key);

      request.onsuccess = () => resolve(request.result?.value ?? null);
      request.onerror = () => reject(request.error);
    });
  }

  async set<T>(key: string, value: T): Promise<void> {
    if (!this.db) await this.init();
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([this.storeName], 'readwrite');
      const store = tx.objectStore(this.storeName);
      const request = store.put({ key, value });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async delete(key: string): Promise<void> {
    if (!this.db) await this.init();
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([this.storeName], 'readwrite');
      const store = tx.objectStore(this.storeName);
      const request = store.delete(key);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async keys(): Promise<string[]> {
    if (!this.db) await this.init();
    if (!this.db) return [];

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([this.storeName], 'readonly');
      const store = tx.objectStore(this.storeName);
      const request = store.getAllKeys();

      request.onsuccess = () => resolve(request.result as string[]);
      request.onerror = () => reject(request.error);
    });
  }

  async getAll<T>(prefix?: string): Promise<T[]> {
    if (!this.db) await this.init();
    if (!this.db) return [];

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([this.storeName], 'readonly');
      const store = tx.objectStore(this.storeName);
      const request = store.getAll();

      request.onsuccess = () => {
        const results = request.result as Array<{ key: string; value: T }>;
        if (prefix) {
          resolve(
            results
              .filter(item => item.key.startsWith(prefix))
              .map(item => item.value)
          );
        } else {
          resolve(results.map(item => item.value));
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  async clear(): Promise<void> {
    if (!this.db) await this.init();
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([this.storeName], 'readwrite');
      const store = tx.objectStore(this.storeName);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

/**
 * 创建存储适配器
 * 根据环境自动选择合适的实现
 */
export function createStorageAdapter(
  storageName: string,
  indexedDBParams?: { dbName: string; storeName: string }
): IStorageAdapter {
  if (isTauri()) {
    return new LocalStorageAdapter(storageName);
  } else {
    if (!indexedDBParams) {
      throw new Error('IndexedDB parameters are required for browser environment');
    }
    return new IndexedDBAdapter(indexedDBParams.dbName, indexedDBParams.storeName);
  }
}
