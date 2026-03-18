/**
 * 缓存索引系统
 * 记录缓存的元数据，包括章节、图片 URL 等信息
 * 避免每次都去扫描文件系统
 *
 * 支持双模式：
 * - Tauri 模式：使用 LocalStorage（指向数据库）
 * - 浏览器模式：使用 IndexedDB
 */

import { createStorageAdapter, type IStorageAdapter } from "./storage-adapter";

export interface ChapterCacheInfo {
  chapterId: string;
  chapterTitle: string;
  imageCount: number;
  imageUrls: string[]; // 原始图片 URL
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

const CACHE_INDEX_KEY_PREFIX = "cache_index:";
const CACHE_INDEX_STORE = "cache_index";

/**
 * 获取缓存索引存储适配器
 */
async function getCacheIndexStorage(): Promise<IStorageAdapter> {
  const storage = createStorageAdapter("manga-cache-index", {
    dbName: "MangaCacheIndexDB",
    storeName: CACHE_INDEX_STORE,
  });
  await storage.init();
  return storage;
}

/**
 * 缓存索引管理器
 */
class CacheIndexManager {
  private storage: IStorageAdapter | null = null;

  async init(): Promise<void> {
    if (!this.storage) {
      this.storage = await getCacheIndexStorage();
    }
  }

  /**
   * 获取漫画缓存信息
   */
  async getMangaCacheInfo(mangaId: string): Promise<MangaCacheInfo | null> {
    await this.init();
    if (!this.storage) return null;

    try {
      const key = `${CACHE_INDEX_KEY_PREFIX}${mangaId}`;
      const result = await this.storage.get<MangaCacheInfo>(key);
      return result || null;
    } catch (e) {
      console.error("[CacheIndex] Get manga cache info failed:", e);
      return null;
    }
  }

  /**
   * 获取漫画的所有已缓存章节 ID
   */
  async getCachedChapterIds(mangaId: string): Promise<string[]> {
    const info = await this.getMangaCacheInfo(mangaId);
    if (!info) return [];
    return info.chapters.map((ch) => ch.chapterId);
  }

  /**
   * 检查章节是否已缓存
   */
  async isChapterCached(mangaId: string, chapterId: string): Promise<boolean> {
    const info = await this.getMangaCacheInfo(mangaId);
    if (!info) return false;
    return info.chapters.some((ch) => ch.chapterId === chapterId);
  }

  /**
   * 获取章节的缓存图片 URL 列表
   */
  async getChapterImageUrls(
    mangaId: string,
    chapterId: string,
  ): Promise<string[] | null> {
    const info = await this.getMangaCacheInfo(mangaId);
    if (!info) return null;
    const chapter = info.chapters.find((ch) => ch.chapterId === chapterId);
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
    imageUrls: string[],
  ): Promise<void> {
    await this.init();
    if (!this.storage) return;

    try {
      const key = `${CACHE_INDEX_KEY_PREFIX}${mangaId}`;

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
      const existingChapterIndex = info.chapters.findIndex(
        (ch) => ch.chapterId === chapterId,
      );
      const chapterInfo: ChapterCacheInfo = {
        chapterId,
        chapterTitle,
        imageCount: imageUrls.length,
        imageUrls,
        cachedAt:
          existingChapterIndex >= 0
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
      info.totalImages = info.chapters.reduce(
        (sum, ch) => sum + ch.imageCount,
        0,
      );
      info.updatedAt = Date.now();

      // 保存
      await this.storage.set(key, info);
    } catch (e) {
      console.error("[CacheIndex] Add chapter cache failed:", e);
    }
  }

  /**
   * 删除章节缓存记录
   */
  async removeChapterCache(mangaId: string, chapterId: string): Promise<void> {
    await this.init();
    if (!this.storage) return;

    try {
      const info = await this.getMangaCacheInfo(mangaId);
      if (!info) return;

      // 移除章节
      info.chapters = info.chapters.filter((ch) => ch.chapterId !== chapterId);

      // 更新总计
      info.totalImages = info.chapters.reduce(
        (sum, ch) => sum + ch.imageCount,
        0,
      );
      info.updatedAt = Date.now();

      const key = `${CACHE_INDEX_KEY_PREFIX}${mangaId}`;

      if (info.chapters.length === 0) {
        // 如果没有章节了，删除整个记录
        await this.storage.delete(key);
      } else {
        // 更新记录
        await this.storage.set(key, info);
      }
    } catch (e) {
      console.error("[CacheIndex] Remove chapter cache failed:", e);
    }
  }

  /**
   * 删除整个漫画的缓存记录
   */
  async removeMangaCache(mangaId: string): Promise<void> {
    await this.init();
    if (!this.storage) return;

    try {
      const key = `${CACHE_INDEX_KEY_PREFIX}${mangaId}`;
      await this.storage.delete(key);
    } catch (e) {
      console.error("[CacheIndex] Remove manga cache failed:", e);
    }
  }

  /**
   * 获取所有缓存的漫画列表
   */
  async getAllCachedMangas(): Promise<MangaCacheInfo[]> {
    await this.init();
    if (!this.storage) return [];

    try {
      const results = await this.storage.getAll<MangaCacheInfo>(
        CACHE_INDEX_KEY_PREFIX,
      );
      return results;
    } catch (e) {
      console.error("[CacheIndex] Get all cached mangas failed:", e);
      return [];
    }
  }

  /**
   * 更新最后访问时间
   */
  async updateLastAccessed(mangaId: string, chapterId: string): Promise<void> {
    await this.init();
    if (!this.storage) return;

    try {
      const info = await this.getMangaCacheInfo(mangaId);
      if (!info) return;

      const chapter = info.chapters.find((ch) => ch.chapterId === chapterId);
      if (chapter) {
        chapter.lastAccessedAt = Date.now();

        const key = `${CACHE_INDEX_KEY_PREFIX}${mangaId}`;
        await this.storage.set(key, info);
      }
    } catch (e) {
      console.error("[CacheIndex] Update last accessed failed:", e);
    }
  }

  /**
   * 清理长时间未访问的缓存记录（但保留文件）
   */
  async cleanupOldRecords(days: number): Promise<number> {
    await this.init();
    if (!this.storage) return 0;

    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    let deletedCount = 0;

    try {
      const allMangas = await this.getAllCachedMangas();

      for (const manga of allMangas) {
        // 过滤掉长时间未访问的章节
        const originalLength = manga.chapters.length;
        manga.chapters = manga.chapters.filter(
          (ch) => ch.lastAccessedAt > cutoff,
        );
        deletedCount += originalLength - manga.chapters.length;

        const key = `${CACHE_INDEX_KEY_PREFIX}${manga.mangaId}`;

        if (manga.chapters.length === 0) {
          await this.storage.delete(key);
        } else {
          manga.totalImages = manga.chapters.reduce(
            (sum, ch) => sum + ch.imageCount,
            0,
          );
          manga.updatedAt = Date.now();
          await this.storage.set(key, manga);
        }
      }
    } catch (e) {
      console.error("[CacheIndex] Cleanup old records failed:", e);
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
