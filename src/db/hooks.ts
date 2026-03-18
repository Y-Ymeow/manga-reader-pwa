/**
 * Database React Hooks
 */

import { useState, useEffect, useCallback } from 'preact/hooks';
import type { MangaRecord, ChapterListRecord, ReadHistoryRecord } from './index';
import { Manga, ChapterList, ReadHistory } from './index';
import { waitForDatabase } from './global';

/**
 * 获取漫画列表
 */
export function useMangaList(options?: {
  isFavorite?: boolean;
  categoryId?: string;
  limit?: number;
}) {
  const [mangas, setMangas] = useState<MangaRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        // 确保数据库已初始化
        await waitForDatabase();
        
        const where: any = {};
        if (options?.isFavorite !== undefined) {
          where.isFavorite = options.isFavorite;
        }
        if (options?.categoryId) {
          where.categoryId = options.categoryId;
        }

        const result = await Manga.findMany({
          where,
          sort: { field: 'updatedAt', order: 'desc' },
          limit: options?.limit,
        });
        setMangas(result);
      } catch (e) {
        console.error('Failed to load mangas:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [options?.isFavorite, options?.categoryId, options?.limit]);

  return { mangas, loading, refetch: () => {} };
}

/**
 * 获取单个漫画
 */
export function useManga(id: string | undefined) {
  const [manga, setManga] = useState<MangaRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }

    const load = async () => {
      setLoading(true);
      try {
        const result = await Manga.findById(id);
        setManga(result);
      } catch (e) {
        console.error('Failed to load manga:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  return { manga, loading };
}

/**
 * 获取章节列表
 */
export function useChapterList(mangaId: string | undefined) {
  const [chapters, setChapters] = useState<ChapterListRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!mangaId) {
      setLoading(false);
      return;
    }

    const load = async () => {
      setLoading(true);
      try {
        const result = await ChapterList.findOne({
          where: { mangaId },
        });
        setChapters(result as ChapterListRecord);
      } catch (e) {
        console.error('Failed to load chapters:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [mangaId]);

  return { chapters, loading };
}

/**
 * 获取阅读历史
 */
export function useReadHistory(limit?: number) {
  const [history, setHistory] = useState<ReadHistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // 确保数据库已初始化
      await waitForDatabase();
      
      const result = await ReadHistory.findMany({
        sort: { field: 'updatedAt', order: 'desc' },
        limit,
      });
      setHistory(result as ReadHistoryRecord[]);
    } catch (e) {
      console.error('Failed to load history:', e);
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    load();
  }, [load]);

  return { history, loading, refetch: load };
}

/**
 * 添加阅读历史
 */
export function useAddReadHistory() {
  return useCallback(async (data: { mangaId: string; chapterId: string; page: number }) => {
    try {
      // 创建阅读历史记录
      await ReadHistory.create({
        id: generateUUID(),
        mangaId: data.mangaId,
        chapterId: data.chapterId,
        page: data.page,
        maxPage: data.page,
        isRead: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      // 更新漫画的最后阅读时间
      await Manga.update(data.mangaId, {
        updatedAt: Date.now(),
      } as Partial<MangaRecord>);
    } catch (e) {
      console.error('Failed to add read history:', e);
    }
  }, []);
}

function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * 切换收藏状态
 */
export function useToggleFavorite() {
  return useCallback(async (mangaId: string, isFavorite: boolean) => {
    try {
      await Manga.update(mangaId, {
        isFavorite,
        favoriteAt: isFavorite ? Date.now() : undefined,
        updatedAt: Date.now(),
      });
      return true;
    } catch (e) {
      console.error('Failed to toggle favorite:', e);
      return false;
    }
  }, []);
}
