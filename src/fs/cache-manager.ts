/**
 * Manga Cache Manager
 * 支持 OPFS、LocalStorage(Tauri) 和 IndexedDB 的多层缓存系统
 * 用于存储大文件（漫画图片），避免 IndexedDB 大小限制
 *
 * 存储优先级：
 * 1. OPFS（浏览器/移动端推荐）
 * 2. LocalStorage（Tauri 环境，指向数据库）
 * 3. IndexedDB（浏览器回退）
 */

import { isTauri } from './storage-adapter';
import type { LocalStorage } from '../framework/storages/local';

export interface CacheEntry {
  key: string;
  path: string;
  size: number;
  createdAt: number;
  contentType?: string;
}

export interface CacheStats {
  totalSize: number;
  fileCount: number;
  storageType: 'opfs' | 'indexeddb' | 'local';
}

/**
 * 漫画缓存管理器
 * 优先使用 OPFS，然后 LocalStorage(Tauri)，最后 IndexedDB
 */
export class MangaCacheManager {
  private opfsRoot: FileSystemDirectoryHandle | null = null;
  private db: IDBDatabase | null = null;
  private localStorage: LocalStorage | null = null;
  private storageType: 'opfs' | 'indexeddb' | 'local' | null = null;
  private isInitialized = false;
  private baseDir = 'manga-cache';

  /**
   * 初始化缓存管理器
   */
  async init(): Promise<boolean> {
    if (this.isInitialized) return true;

    // 1. 尝试使用 OPFS（推荐，包括移动端）
    try {
      if ('storage' in navigator && 'getDirectory' in navigator.storage) {
        this.opfsRoot = await navigator.storage.getDirectory();
        // 创建漫画缓存目录
        await this.opfsRoot.getDirectoryHandle(this.baseDir, { create: true });
        this.storageType = 'opfs';
        this.isInitialized = true;
        return true;
      }
    } catch (e) {
      console.warn('[MangaCache] OPFS not available:', e);
    }

    // 2. Tauri 环境下使用 LocalStorage（指向数据库）
    if (isTauri()) {
      try {
        const { LocalStorage } = await import('../framework/storages/local');
        this.localStorage = new LocalStorage('manga-cache');
        await this.localStorage.init();
        this.storageType = 'local';
        this.isInitialized = true;
        return true;
      } catch (e) {
        console.warn('[MangaCache] LocalStorage (Tauri) not available:', e);
      }
    }

    // 3. 回退到 IndexedDB
    try {
      this.db = await this.initIndexedDB();
      this.storageType = 'indexeddb';
      this.isInitialized = true;
      return true;
    } catch (e) {
      console.error('[MangaCache] All storage methods failed:', e);
      return false;
    }
  }

  /**
   * 初始化 IndexedDB
   */
  private initIndexedDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('MangaCacheDB', 1);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('files')) {
          const store = db.createObjectStore('files', { keyPath: 'key' });
          store.createIndex('createdAt', 'createdAt', { unique: false });
        }
      };
    });
  }

  /**
   * 获取存储路径
   */
  private getPath(mangaId: string, chapterId: string, index: number): string {
    // 清理路径中的非法字符
    const safeMangaId = mangaId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeChapterId = chapterId.replace(/[^a-zA-Z0-9_-]/g, '_');
    // 使用零填充格式（4 位数字），确保文件排序正确（0000, 0001, 0002...）
    // 这样可以避免移动端读取时出现 1, 10, 11, 2, 3... 的乱序问题
    const paddedIndex = index.toString().padStart(4, '0');
    return `${safeMangaId}/${safeChapterId}/${paddedIndex}.webp`;
  }

  /**
   * 写入缓存文件
   */
  async write(
    mangaId: string,
    chapterId: string,
    index: number,
    data: Uint8Array | Blob,
    contentType = 'image/webp'
  ): Promise<boolean> {
    if (!this.isInitialized) {
      await this.init();
    }

    const path = this.getPath(mangaId, chapterId, index);

    try {
      switch (this.storageType) {
        case 'opfs':
          return await this.writeOPFS(path, data, contentType);
        case 'local':
          return await this.writeLocalStorage(path, data, contentType);
        case 'indexeddb':
          return await this.writeIndexedDB(path, data, contentType);
        default:
          return false;
      }
    } catch (e) {
      console.error('[MangaCache] Write failed:', e);
      return false;
    }
  }

  /**
   * 使用 OPFS 写入
   */
  private async writeOPFS(
    path: string,
    data: Uint8Array | Blob,
    contentType: string
  ): Promise<boolean> {
    if (!this.opfsRoot) return false;

    try {
      const parts = path.split('/');
      let currentDir = await this.opfsRoot.getDirectoryHandle(this.baseDir, { create: true });

      // 创建子目录
      for (let i = 0; i < parts.length - 1; i++) {
        currentDir = await currentDir.getDirectoryHandle(parts[i], { create: true });
      }

      const fileName = parts[parts.length - 1];
      const fileHandle = await currentDir.getFileHandle(fileName, { create: true });

      const writable = await fileHandle.createWritable();
      // 确保数据是 Blob 类型
      const blob = data instanceof Blob ? data : new Blob([data.buffer as ArrayBuffer]);
      await writable.write(blob);
      await writable.close();

      return true;
    } catch (e) {
      console.error('[MangaCache] OPFS write failed:', e);
      return false;
    }
  }

  /**
   * 使用 LocalStorage 写入（Tauri 环境，指向数据库）
   * 使用压缩存储大文件
   */
  private async writeLocalStorage(
    path: string,
    data: Uint8Array | Blob,
    contentType: string
  ): Promise<boolean> {
    if (!this.localStorage) return false;

    try {
      let uint8Data: Uint8Array;
      if (data instanceof Blob) {
        const arrayBuffer = await data.arrayBuffer();
        uint8Data = new Uint8Array(arrayBuffer);
      } else {
        uint8Data = data;
      }

      // 将 Uint8Array 转换为 Base64 存储
      const base64 = this.uint8ArrayToBase64(uint8Data);
      
      const key = `file:${path}`;
      await this.localStorage.set(key, {
        data: base64,
        contentType,
        createdAt: Date.now(),
      });

      return true;
    } catch (e) {
      console.error('[MangaCache] LocalStorage write failed:', e);
      return false;
    }
  }

  /**
   * 使用 IndexedDB 写入
   */
  private async writeIndexedDB(
    path: string,
    data: Uint8Array | Blob,
    contentType: string
  ): Promise<boolean> {
    if (!this.db) return false;

    try {
      let arrayBuffer: ArrayBuffer;
      if (data instanceof Blob) {
        arrayBuffer = await data.arrayBuffer();
      } else {
        arrayBuffer = data.buffer as ArrayBuffer;
      }

      const transaction = this.db.transaction(['files'], 'readwrite');
      const store = transaction.objectStore('files');

      await new Promise<void>((resolve, reject) => {
        const request = store.put({
          key: path,
          data: arrayBuffer,
          contentType,
          createdAt: Date.now(),
        });
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });

      return true;
    } catch (e) {
      console.error('[MangaCache] IndexedDB write failed:', e);
      return false;
    }
  }

  /**
   * 读取缓存文件
   */
  async read(
    mangaId: string,
    chapterId: string,
    index: number
  ): Promise<{ data: Uint8Array; contentType: string } | null> {
    if (!this.isInitialized) {
      await this.init();
    }

    const path = this.getPath(mangaId, chapterId, index);

    try {
      switch (this.storageType) {
        case 'opfs':
          return await this.readOPFS(path);
        case 'local':
          return await this.readLocalStorage(path);
        case 'indexeddb':
          return await this.readIndexedDB(path);
        default:
          return null;
      }
    } catch (e) {
      console.error('[MangaCache] Read failed:', e);
      return null;
    }
  }

  /**
   * 使用 OPFS 读取
   */
  private async readOPFS(path: string): Promise<{ data: Uint8Array; contentType: string } | null> {
    if (!this.opfsRoot) return null;

    try {
      const parts = path.split('/');
      let currentDir = await this.opfsRoot.getDirectoryHandle(this.baseDir);

      for (let i = 0; i < parts.length - 1; i++) {
        currentDir = await currentDir.getDirectoryHandle(parts[i]);
      }

      const fileName = parts[parts.length - 1];
      const fileHandle = await currentDir.getFileHandle(fileName);
      const file = await fileHandle.getFile();
      const arrayBuffer = await file.arrayBuffer();

      return {
        data: new Uint8Array(arrayBuffer),
        contentType: file.type || 'image/webp',
      };
    } catch (e) {
      return null;
    }
  }

  /**
   * 使用 LocalStorage 读取（Tauri 环境）
   */
  private async readLocalStorage(
    path: string
  ): Promise<{ data: Uint8Array; contentType: string } | null> {
    if (!this.localStorage) return null;

    try {
      const key = `file:${path}`;
      const entry = await this.localStorage.get<{ data: string; contentType: string }>(key);
      
      if (!entry?.value?.data) return null;

      // 将 Base64 转换回 Uint8Array
      const base64 = entry.value.data;
      const uint8Data = this.base64ToUint8Array(base64);

      return {
        data: uint8Data,
        contentType: entry.value.contentType || 'image/webp',
      };
    } catch (e) {
      console.error('[MangaCache] LocalStorage read failed:', e);
      return null;
    }
  }

  /**
   * 使用 IndexedDB 读取
   */
  private async readIndexedDB(
    path: string
  ): Promise<{ data: Uint8Array; contentType: string } | null> {
    if (!this.db) return null;

    try {
      const transaction = this.db.transaction(['files'], 'readonly');
      const store = transaction.objectStore('files');

      const result = await new Promise<any>((resolve, reject) => {
        const request = store.get(path);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      if (!result) return null;

      return {
        data: new Uint8Array(result.data),
        contentType: result.contentType || 'image/webp',
      };
    } catch (e) {
      return null;
    }
  }

  /**
   * 检查缓存是否存在
   */
  async exists(mangaId: string, chapterId: string, index: number): Promise<boolean> {
    const result = await this.read(mangaId, chapterId, index);
    return result !== null;
  }

  /**
   * 获取漫画的所有已缓存章节
   */
  async getCachedChapters(mangaId: string): Promise<string[]> {
    if (!this.isInitialized) {
      await this.init();
    }

    const mangaDir = mangaId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const cachedChapters = new Set<string>();

    try {
      switch (this.storageType) {
        case 'opfs':
          return await this.getCachedChaptersOPFS(mangaDir);
        case 'local':
          return await this.getCachedChaptersLocalStorage(mangaDir);
        case 'indexeddb':
          return await this.getCachedChaptersIndexedDB(mangaDir);
        default:
          return [];
      }
    } catch (e) {
      console.error('[MangaCache] Get cached chapters failed:', e);
      return [];
    }
  }

  /**
   * 使用 OPFS 获取已缓存章节
   */
  private async getCachedChaptersOPFS(mangaDir: string): Promise<string[]> {
    if (!this.opfsRoot) return [];

    const cachedChapters = new Set<string>();
    try {
      const baseDir = await this.opfsRoot.getDirectoryHandle(this.baseDir);
      const mangaHandle = await baseDir.getDirectoryHandle(mangaDir);

      for await (const entry of (mangaHandle as any).values()) {
        if (entry.kind === 'directory') {
          // 检查这个章节目录下是否有文件
          const chapterHandle = entry as FileSystemDirectoryHandle;
          let hasFiles = false;
          for await (const fileEntry of (chapterHandle as any).values()) {
            if (fileEntry.kind === 'file') {
              hasFiles = true;
              break;
            }
          }
          if (hasFiles) {
            cachedChapters.add(entry.name);
          }
        }
      }
    } catch (e) {
      // 目录可能不存在
    }

    return Array.from(cachedChapters);
  }

  /**
   * 使用 LocalStorage 获取已缓存章节
   */
  private async getCachedChaptersLocalStorage(mangaDir: string): Promise<string[]> {
    if (!this.localStorage) return [];

    const cachedChapters = new Set<string>();
    try {
      const keys = await this.localStorage.keys();
      const prefix = `file:${mangaDir}/`;
      
      for (const key of keys) {
        if (key.startsWith(prefix)) {
          const path = key.replace('file:', '');
          const parts = path.split('/');
          if (parts.length >= 2) {
            cachedChapters.add(parts[1]); // 章节 ID 是第二部分
          }
        }
      }
    } catch (e) {
      console.error('[MangaCache] LocalStorage get cached chapters failed:', e);
    }

    return Array.from(cachedChapters);
  }

  /**
   * 使用 IndexedDB 获取已缓存章节
   */
  private async getCachedChaptersIndexedDB(mangaDir: string): Promise<string[]> {
    if (!this.db) return [];

    const cachedChapters = new Set<string>();
    try {
      const transaction = this.db.transaction(['files'], 'readonly');
      const store = transaction.objectStore('files');

      const allKeys = await new Promise<IDBValidKey[]>((resolve, reject) => {
        const request = store.getAllKeys();
        request.onsuccess = () => resolve(request.result as IDBValidKey[]);
        request.onerror = () => reject(request.error);
      });

      for (const key of allKeys) {
        if (typeof key === 'string' && key.startsWith(mangaDir + '/')) {
          const parts = key.split('/');
          if (parts.length >= 2) {
            cachedChapters.add(parts[1]); // 章节ID是第二部分
          }
        }
      }
    } catch (e) {
      console.error('[MangaCache] IndexedDB get cached chapters failed:', e);
    }

    return Array.from(cachedChapters);
  }

  /**
   * 删除缓存
   */
  async delete(mangaId: string, chapterId?: string): Promise<boolean> {
    if (!this.isInitialized) return false;

    try {
      const mangaDir = mangaId.replace(/[^a-zA-Z0-9_-]/g, '_');

      switch (this.storageType) {
        case 'opfs':
          return await this.deleteOPFS(mangaDir, chapterId);
        case 'local':
          return await this.deleteLocalStorage(mangaDir, chapterId);
        case 'indexeddb':
          return await this.deleteIndexedDB(mangaDir, chapterId);
        default:
          return false;
      }
    } catch (e) {
      console.error('[MangaCache] Delete failed:', e);
      return false;
    }
  }

  private async deleteOPFS(mangaDir: string, chapterId?: string): Promise<boolean> {
    if (!this.opfsRoot) return false;
    try {
      const baseDir = await this.opfsRoot.getDirectoryHandle(this.baseDir);
      const mangaHandle = await baseDir.getDirectoryHandle(mangaDir);
      
      if (chapterId) {
        const chapterHandle = await mangaHandle.getDirectoryHandle(chapterId);
        // OPFS 不支持直接删除目录，需要逐个删除文件
        for await (const entry of (chapterHandle as any).values()) {
          if (entry.kind === 'file') {
            await chapterHandle.removeEntry(entry.name);
          }
        }
        await mangaHandle.removeEntry(chapterId);
      } else {
        await baseDir.removeEntry(mangaDir, { recursive: true });
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * 使用 LocalStorage 删除（Tauri 环境）
   */
  private async deleteLocalStorage(mangaDir: string, chapterId?: string): Promise<boolean> {
    if (!this.localStorage) return false;
    try {
      const keys = await this.localStorage.keys();
      const prefix = chapterId ? `file:${mangaDir}/${chapterId}` : `file:${mangaDir}`;

      for (const key of keys) {
        if (key.startsWith(prefix)) {
          await this.localStorage.delete(key);
        }
      }
      return true;
    } catch (e) {
      console.error('[MangaCache] LocalStorage delete failed:', e);
      return false;
    }
  }

  private async deleteIndexedDB(mangaDir: string, chapterId?: string): Promise<boolean> {
    if (!this.db) return false;
    try {
      const transaction = this.db.transaction(['files'], 'readwrite');
      const store = transaction.objectStore('files');
      const prefix = chapterId ? `${mangaDir}/${chapterId}` : mangaDir;

      // 获取所有键
      const allKeys = await new Promise<IDBValidKey[]>((resolve, reject) => {
        const request = store.getAllKeys();
        request.onsuccess = () => resolve(request.result as IDBValidKey[]);
        request.onerror = () => reject(request.error);
      });

      // 删除匹配的键
      for (const key of allKeys) {
        if (typeof key === 'string' && key.startsWith(prefix)) {
          await new Promise<void>((resolve, reject) => {
            const request = store.delete(key);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
          });
        }
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * 获取缓存统计信息
   */
  async getStats(): Promise<CacheStats> {
    if (!this.isInitialized) {
      await this.init();
    }

    let totalSize = 0;
    let fileCount = 0;

    try {
      switch (this.storageType) {
        case 'opfs':
          ({ totalSize, fileCount } = await this.getOPFSStats());
          break;
        case 'local':
          ({ totalSize, fileCount } = await this.getLocalStorageStats());
          break;
        case 'indexeddb':
          ({ totalSize, fileCount } = await this.getIndexedDBStats());
          break;
      }
    } catch (e) {
      console.error('[MangaCache] Get stats failed:', e);
    }

    return {
      totalSize,
      fileCount,
      storageType: this.storageType || 'indexeddb',
    };
  }

  private async getOPFSStats(): Promise<{ totalSize: number; fileCount: number }> {
    let totalSize = 0;
    let fileCount = 0;

    if (!this.opfsRoot) return { totalSize, fileCount };

    try {
      const baseDir = await this.opfsRoot.getDirectoryHandle(this.baseDir);
      
      const scanDir = async (dirHandle: FileSystemDirectoryHandle) => {
        for await (const entry of (dirHandle as any).values()) {
          if (entry.kind === 'file') {
            const file = await (entry as FileSystemFileHandle).getFile();
            totalSize += file.size;
            fileCount++;
          } else if (entry.kind === 'directory') {
            await scanDir(entry as FileSystemDirectoryHandle);
          }
        }
      };

      await scanDir(baseDir);
    } catch (e) {
      // 目录可能不存在
    }

    return { totalSize, fileCount };
  }

  /**
   * 使用 LocalStorage 统计
   */
  private async getLocalStorageStats(): Promise<{ totalSize: number; fileCount: number }> {
    let totalSize = 0;
    let fileCount = 0;

    if (!this.localStorage) return { totalSize, fileCount };

    try {
      const entries = await this.localStorage.getAll<{ data: string; contentType: string }>();
      for (const entry of entries) {
        if (entry.value?.data) {
          // Base64 字符串长度估算大小
          totalSize += entry.value.data.length;
          fileCount++;
        }
      }
    } catch (e) {
      // 忽略错误
    }

    return { totalSize, fileCount };
  }

  private async getIndexedDBStats(): Promise<{ totalSize: number; fileCount: number }> {
    let totalSize = 0;
    let fileCount = 0;

    if (!this.db) return { totalSize, fileCount };

    try {
      const transaction = this.db.transaction(['files'], 'readonly');
      const store = transaction.objectStore('files');

      const allData = await new Promise<any[]>((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      for (const item of allData) {
        if (item.data) {
          totalSize += item.data.byteLength || item.data.length || 0;
          fileCount++;
        }
      }
    } catch (e) {
      // 忽略错误
    }

    return { totalSize, fileCount };
  }

  /**
   * 清理旧缓存（保留最近 N 天的）
   */
  async cleanup(daysToKeep = 30): Promise<number> {
    if (!this.isInitialized) return 0;

    const cutoff = Date.now() - daysToKeep * 24 * 60 * 60 * 1000;
    let deletedCount = 0;

    try {
      switch (this.storageType) {
        case 'opfs':
          deletedCount = await this.cleanupOPFS(cutoff);
          break;
        case 'indexeddb':
          deletedCount = await this.cleanupIndexedDB(cutoff);
          break;
      }
    } catch (e) {
      console.error('[MangaCache] Cleanup failed:', e);
    }

    return deletedCount;
  }

  private async cleanupOPFS(cutoff: number): Promise<number> {
    let deletedCount = 0;
    if (!this.opfsRoot) return deletedCount;

    try {
      const baseDir = await this.opfsRoot.getDirectoryHandle(this.baseDir);

      const scanAndClean = async (dirHandle: FileSystemDirectoryHandle, path: string) => {
        for await (const entry of (dirHandle as any).values()) {
          if (entry.kind === 'file') {
            const file = await (entry as FileSystemFileHandle).getFile();
            if (file.lastModified < cutoff) {
              await dirHandle.removeEntry(entry.name);
              deletedCount++;
            }
          } else if (entry.kind === 'directory') {
            const subDir = await dirHandle.getDirectoryHandle(entry.name);
            await scanAndClean(subDir, `${path}/${entry.name}`);
          }
        }
      };

      await scanAndClean(baseDir, this.baseDir);
    } catch (e) {
      // 忽略错误
    }

    return deletedCount;
  }

  private async cleanupIndexedDB(cutoff: number): Promise<number> {
    let deletedCount = 0;
    if (!this.db) return deletedCount;

    try {
      const transaction = this.db.transaction(['files'], 'readwrite');
      const store = transaction.objectStore('files');
      const index = store.index('createdAt');

      const oldKeys = await new Promise<IDBValidKey[]>((resolve, reject) => {
        const range = IDBKeyRange.upperBound(cutoff);
        const request = index.getAllKeys(range);
        request.onsuccess = () => resolve(request.result as IDBValidKey[]);
        request.onerror = () => reject(request.error);
      });

      for (const key of oldKeys) {
        await new Promise<void>((resolve, reject) => {
          const request = store.delete(key);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        });
        deletedCount++;
      }
    } catch (e) {
      // 忽略错误
    }

    return deletedCount;
  }

  /**
   * Uint8Array 转 Base64
   */
  private uint8ArrayToBase64(data: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < data.byteLength; i++) {
      binary += String.fromCharCode(data[i]);
    }
    return btoa(binary);
  }

  /**
   * Base64 转 Uint8Array
   */
  private base64ToUint8Array(base64: string): Uint8Array {
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
}

// 单例实例
let cacheManager: MangaCacheManager | null = null;

/**
 * 获取缓存管理器实例
 */
export function getCacheManager(): MangaCacheManager {
  if (!cacheManager) {
    cacheManager = new MangaCacheManager();
  }
  return cacheManager;
}

/**
 * 初始化缓存系统
 */
export async function initCache(): Promise<boolean> {
  const manager = getCacheManager();
  return await manager.init();
}
