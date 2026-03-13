/**
 * 缓存索引系统
 * 使用 IndexedDB 记录缓存的元数据，包括章节、图片URL等信息
 * 避免每次都去扫描文件系统
 */



export interface ChapterCacheInfo {
  chapterId: string;
  chapterTitle: string;
  imageCount: number;
  imageUrls: string[];  // 原始图片URL
  cachedAt: number;
  lastAccessedAt: number;
}

export interface MangaCacheInfo {
  mangaId: string;
  mangaTitle: string;
  pluginId: string;
  chapters: ChapterCacheInfo[];
  totalImages: number;
  totalSize: number;
  updatedAt: number;
}

const CACHE_INDEX_STORE = 'cache_index';

/**
 * 获取缓存索引数据库
 */
async function getCacheIndexDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('MangaCacheIndexDB', 1);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(CACHE_INDEX_STORE)) {
        const store = db.createObjectStore(CACHE_INDEX_STORE, { keyPath: 'mangaId' });
        store.createIndex('pluginId', 'pluginId', { unique: false });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
    };
  });
}

/**
 * 缓存索引管理器
 */
class CacheIndexManager {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    if (!this.db) {
      this.db = await getCacheIndexDB();
    }
  }

  /**
   * 获取漫画缓存信息
   */
  async getMangaCacheInfo(mangaId: string): Promise<MangaCacheInfo | null> {
    await this.init();
    if (!this.db) return null;

    try {
      const transaction = this.db.transaction([CACHE_INDEX_STORE], 'readonly');
      const store = transaction.objectStore(CACHE_INDEX_STORE);

      const result = await new Promise<any>((resolve, reject) => {
        const request = store.get(mangaId);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      return result || null;
    } catch (e) {
      console.error('[CacheIndex] Get manga cache info failed:', e);
      return null;
    }
  }

  /**
   * 获取漫画的所有已缓存章节ID
   */
  async getCachedChapterIds(mangaId: string): Promise<string[]> {
    const info = await this.getMangaCacheInfo(mangaId);
    if (!info) return [];
    return info.chapters.map(ch => ch.chapterId);
  }

  /**
   * 检查章节是否已缓存
   */
  async isChapterCached(mangaId: string, chapterId: string): Promise<boolean> {
    const info = await this.getMangaCacheInfo(mangaId);
    if (!info) return false;
    return info.chapters.some(ch => ch.chapterId === chapterId);
  }

  /**
   * 获取章节的缓存图片URL列表
   */
  async getChapterImageUrls(mangaId: string, chapterId: string): Promise<string[] | null> {
    const info = await this.getMangaCacheInfo(mangaId);
    if (!info) return null;
    const chapter = info.chapters.find(ch => ch.chapterId === chapterId);
    return chapter?.imageUrls || null;
  }

  /**
   * 添加或更新章节缓存信息
   */
  async addChapterCache(
    mangaId: string,
    mangaTitle: string,
    pluginId: string,
    chapterId: string,
    chapterTitle: string,
    imageUrls: string[]
  ): Promise<void> {
    await this.init();
    if (!this.db) return;

    try {
      // 获取现有记录
      let info = await this.getMangaCacheInfo(mangaId);

      if (!info) {
        // 创建新记录
        info = {
          mangaId,
          mangaTitle,
          pluginId,
          chapters: [],
          totalImages: 0,
          totalSize: 0,
          updatedAt: Date.now(),
        };
      }

      // 查找或创建章节记录
      const existingChapterIndex = info.chapters.findIndex(ch => ch.chapterId === chapterId);
      const chapterInfo: ChapterCacheInfo = {
        chapterId,
        chapterTitle,
        imageCount: imageUrls.length,
        imageUrls,
        cachedAt: existingChapterIndex >= 0
          ? info.chapters[existingChapterIndex].cachedAt
          : Date.now(),
        lastAccessedAt: Date.now(),
      };

      if (existingChapterIndex >= 0) {
        // 更新现有章节
        info.chapters[existingChapterIndex] = chapterInfo;
      } else {
        // 添加新章节
        info.chapters.push(chapterInfo);
      }

      // 更新总计
      info.totalImages = info.chapters.reduce((sum, ch) => sum + ch.imageCount, 0);
      info.updatedAt = Date.now();

      // 保存
      const transaction = this.db.transaction([CACHE_INDEX_STORE], 'readwrite');
      const store = transaction.objectStore(CACHE_INDEX_STORE);

      await new Promise<void>((resolve, reject) => {
        const request = store.put(info);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });

      console.log('[CacheIndex] Chapter cache recorded:', mangaId, chapterId, imageUrls.length, 'images');
    } catch (e) {
      console.error('[CacheIndex] Add chapter cache failed:', e);
    }
  }

  /**
   * 删除章节缓存记录
   */
  async removeChapterCache(mangaId: string, chapterId: string): Promise<void> {
    await this.init();
    if (!this.db) return;

    try {
      const info = await this.getMangaCacheInfo(mangaId);
      if (!info) return;

      // 移除章节
      info.chapters = info.chapters.filter(ch => ch.chapterId !== chapterId);

      // 更新总计
      info.totalImages = info.chapters.reduce((sum, ch) => sum + ch.imageCount, 0);
      info.updatedAt = Date.now();

      const transaction = this.db.transaction([CACHE_INDEX_STORE], 'readwrite');
      const store = transaction.objectStore(CACHE_INDEX_STORE);

      if (info.chapters.length === 0) {
        // 如果没有章节了，删除整个记录
        await new Promise<void>((resolve, reject) => {
          const request = store.delete(mangaId);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        });
      } else {
        // 更新记录
        await new Promise<void>((resolve, reject) => {
          const request = store.put(info);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        });
      }

      console.log('[CacheIndex] Chapter cache removed:', mangaId, chapterId);
    } catch (e) {
      console.error('[CacheIndex] Remove chapter cache failed:', e);
    }
  }

  /**
   * 删除整个漫画的缓存记录
   */
  async removeMangaCache(mangaId: string): Promise<void> {
    await this.init();
    if (!this.db) return;

    try {
      const transaction = this.db.transaction([CACHE_INDEX_STORE], 'readwrite');
      const store = transaction.objectStore(CACHE_INDEX_STORE);

      await new Promise<void>((resolve, reject) => {
        const request = store.delete(mangaId);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });

      console.log('[CacheIndex] Manga cache removed:', mangaId);
    } catch (e) {
      console.error('[CacheIndex] Remove manga cache failed:', e);
    }
  }

  /**
   * 获取所有缓存的漫画列表
   */
  async getAllCachedMangas(): Promise<MangaCacheInfo[]> {
    await this.init();
    if (!this.db) return [];

    try {
      const transaction = this.db.transaction([CACHE_INDEX_STORE], 'readonly');
      const store = transaction.objectStore(CACHE_INDEX_STORE);

      const results = await new Promise<any[]>((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      return results || [];
    } catch (e) {
      console.error('[CacheIndex] Get all cached mangas failed:', e);
      return [];
    }
  }

  /**
   * 更新最后访问时间
   */
  async updateLastAccessed(mangaId: string, chapterId: string): Promise<void> {
    await this.init();
    if (!this.db) return;

    try {
      const info = await this.getMangaCacheInfo(mangaId);
      if (!info) return;

      const chapter = info.chapters.find(ch => ch.chapterId === chapterId);
      if (chapter) {
        chapter.lastAccessedAt = Date.now();

        const transaction = this.db.transaction([CACHE_INDEX_STORE], 'readwrite');
        const store = transaction.objectStore(CACHE_INDEX_STORE);

        await new Promise<void>((resolve, reject) => {
          const request = store.put(info);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        });
      }
    } catch (e) {
      console.error('[CacheIndex] Update last accessed failed:', e);
    }
  }

  /**
   * 清理长时间未访问的缓存记录（但保留文件）
   */
  async cleanupOldRecords(days: number): Promise<number> {
    await this.init();
    if (!this.db) return 0;

    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    let deletedCount = 0;

    try {
      const allMangas = await this.getAllCachedMangas();

      for (const manga of allMangas) {
        // 过滤掉长时间未访问的章节
        const originalLength = manga.chapters.length;
        manga.chapters = manga.chapters.filter(ch => ch.lastAccessedAt > cutoff);
        deletedCount += originalLength - manga.chapters.length;

        const transaction = this.db.transaction([CACHE_INDEX_STORE], 'readwrite');
        const store = transaction.objectStore(CACHE_INDEX_STORE);

        if (manga.chapters.length === 0) {
          await new Promise<void>((resolve, reject) => {
            const request = store.delete(manga.mangaId);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
          });
        } else {
          manga.totalImages = manga.chapters.reduce((sum, ch) => sum + ch.imageCount, 0);
          manga.updatedAt = Date.now();
          await new Promise<void>((resolve, reject) => {
            const request = store.put(manga);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
          });
        }
      }
    } catch (e) {
      console.error('[CacheIndex] Cleanup old records failed:', e);
    }

    return deletedCount;
  }
}

// 单例实例
let cacheIndexManager: CacheIndexManager | null = null;

export function getCacheIndex(): CacheIndexManager {
  if (!cacheIndexManager) {
    cacheIndexManager = new CacheIndexManager();
  }
  return cacheIndexManager;
}
