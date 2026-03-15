/**
 * Manga Cache Manager
 * 支持 OPFS、Tauri FS 和 IndexedDB 的多层缓存系统
 * 用于存储大文件（漫画图片），避免 IndexedDB 大小限制
 */

import { FS } from '../framework/fs';

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
  storageType: 'opfs' | 'fs' | 'indexeddb';
}

/**
 * 漫画缓存管理器
 * 优先使用 OPFS，其次 Tauri FS，最后 IndexedDB
 */
export class MangaCacheManager {
  private opfsRoot: FileSystemDirectoryHandle | null = null;
  private fs: FS | null = null;
  private db: IDBDatabase | null = null;
  private storageType: 'opfs' | 'fs' | 'indexeddb' | null = null;
  private isInitialized = false;
  private baseDir = 'manga-cache';

  /**
   * 初始化缓存管理器
   */
  async init(): Promise<boolean> {
    if (this.isInitialized) return true;

    // 1. 尝试使用 OPFS
    try {
      if ('storage' in navigator && 'getDirectory' in navigator.storage) {
        this.opfsRoot = await navigator.storage.getDirectory();
        // 创建漫画缓存目录
        await this.opfsRoot.getDirectoryHandle(this.baseDir, { create: true });
        this.storageType = 'opfs';
        this.isInitialized = true;
        console.log('[MangaCache] Using OPFS storage');
        return true;
      }
    } catch (e) {
      console.warn('[MangaCache] OPFS not available:', e);
    }

    // 2. 尝试使用 Tauri FS
    try {
      const fs = new FS({ baseDir: this.baseDir });
      if (fs.isReady()) {
        this.fs = fs;
        await fs.ensureDir('/');
        this.storageType = 'fs';
        this.isInitialized = true;
        console.log('[MangaCache] Using Tauri FS storage');
        return true;
      }
    } catch (e) {
      console.warn('[MangaCache] Tauri FS not available:', e);
    }

    // 3. 回退到 IndexedDB
    try {
      this.db = await this.initIndexedDB();
      this.storageType = 'indexeddb';
      this.isInitialized = true;
      console.log('[MangaCache] Using IndexedDB storage (fallback)');
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
        case 'fs':
          return await this.writeFS(path, data);
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
   * 使用 Tauri FS 写入
   */
  private async writeFS(path: string, data: Uint8Array | Blob): Promise<boolean> {
    if (!this.fs) return false;

    try {
      let uint8Data: Uint8Array;
      if (data instanceof Blob) {
        const arrayBuffer = await data.arrayBuffer();
        uint8Data = new Uint8Array(arrayBuffer);
      } else {
        uint8Data = data;
      }

      await this.fs.writeFile(`/${path}`, uint8Data, { createDirs: true });
      return true;
    } catch (e) {
      console.error('[MangaCache] FS write failed:', e);
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
        case 'fs':
          return await this.readFS(path);
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
   * 使用 Tauri FS 读取
   */
  private async readFS(path: string): Promise<{ data: Uint8Array; contentType: string } | null> {
    if (!this.fs) return null;

    try {
      const data = await this.fs.readBinaryFile(`/${path}`);
      return {
        data,
        contentType: 'image/webp',
      };
    } catch (e) {
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
        case 'fs':
          return await this.getCachedChaptersFS(mangaDir);
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
   * 使用 Tauri FS 获取已缓存章节
   */
  private async getCachedChaptersFS(mangaDir: string): Promise<string[]> {
    // Tauri FS 暂不支持目录遍历，返回空数组
    return [];
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
        case 'fs':
          return await this.deleteFS(mangaDir, chapterId);
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

  private async deleteFS(mangaDir: string, chapterId?: string): Promise<boolean> {
    if (!this.fs) return false;
    try {
      const path = chapterId ? `/${mangaDir}/${chapterId}` : `/${mangaDir}`;
      await this.fs.removeDir(path, true);
      return true;
    } catch (e) {
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
        case 'fs':
          ({ totalSize, fileCount } = await this.getFSStats());
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

  private async getFSStats(): Promise<{ totalSize: number; fileCount: number }> {
    // Tauri FS 不支持快速统计，返回 0
    return { totalSize: 0, fileCount: 0 };
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
