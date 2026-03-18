import { useState, useEffect, useCallback, useRef } from "preact/hooks";
import { navigate } from "@routes/index";
import {
  getChapterImages,
  getComicDetail,
  getPlugin,
  initPluginSystem,
  loadMangaCache,
  processImageLoad,
  restorePluginsFromStorage,
  revokeImageBlobUrl,
} from "@plugins/index";
import {
  Manga,
  ChapterList,
  ReadHistory,
  Cache,
  initDatabase,
} from "@db/index";
import { getCacheManager } from "../fs/cache-manager";
import { getCacheIndex } from "../fs/cache-index";
import type { MangaRecord, ChapterListRecord } from "@db/index";
import { waitForDatabase } from "@db/global";

interface ReaderProps {
  mangaId?: string;
  chapterId?: string;
  pluginKey?: string;
  page?: string; // 从历史记录传入的初始页码
}

interface ReaderSettings {
  webtoonMode: boolean;
  readingDirection: "ltr" | "rtl";
}

const SETTINGS_KEY = "reader_settings";

function getSettings(): ReaderSettings {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {}
  return {
    webtoonMode: false,
    readingDirection: "ltr",
  };
}

function saveSettings(settings: ReaderSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

// 缓存章节图片
async function cacheChapterImages(chapterId: string, images: string[]) {
  try {
    const existing = await Cache.findOne({
      where: { type: "chapter_list", key: `chapter_images_${chapterId}` },
    });
    const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7天
    if (existing) {
      await Cache.update((existing as any).id, {
        data: images,
        expiresAt,
        createdAt: Date.now(),
      });
    } else {
      const id = generateUUID();
      await Cache.create({
        id,
        type: "chapter_list",
        key: `chapter_images_${chapterId}`,
        data: images,
        expiresAt,
        createdAt: Date.now(),
      });
    }
  } catch (e) {
    console.error("Failed to cache chapter images:", e);
  }
}

// 获取缓存的章节图片
async function getCachedChapterImages(
  chapterId: string,
): Promise<string[] | null> {
  try {
    const cached = await Cache.findOne({
      where: { type: "chapter_list", key: `chapter_images_${chapterId}` },
    });
    if (cached && (cached as any).expiresAt > Date.now()) {
      return (cached as any).data;
    }
    return null;
  } catch {
    return null;
  }
}

function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// 内存中的章节类型
interface MemoryChapter {
  id: string;
  title: string;
  number: number;
  isRead?: boolean;
}

// 处理后的图片信息
interface ProcessedImage {
  url: string; // 最终使用的 URL (可能是 blobUrl 或原 URL)
  originalUrl: string; // 原始 URL
  blobUrl?: string; // 如果有修改，这是 blob URL
  headers?: Record<string, string>;
  isOffline?: boolean; // 是否来自离线缓存
}

export function Reader({ mangaId, chapterId, pluginKey, page }: ReaderProps) {
  const [manga, setManga] = useState<MangaRecord | null>(null);
  const [chapter, setChapter] = useState<MemoryChapter | null>(null);
  const [chapters, setChapters] = useState<MemoryChapter[]>([]);
  const [images, setImages] = useState<string[]>([]);
  const [processedImages, setProcessedImages] = useState<ProcessedImage[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [settings, setSettings] = useState<ReaderSettings>(getSettings());
  const [showSettings, setShowSettings] = useState(false);
  const [chapterReverseOrder, setChapterReverseOrder] = useState(false);
  const [showChapterList, setShowChapterList] = useState(false);
  const [loadedImages, setLoadedImages] = useState<Set<number>>(new Set());
  const [nextChapterImages, setNextChapterImages] = useState<string[]>([]);
  const [isLoadingNextChapter, setIsLoadingNextChapter] = useState(false);
  const [hasMoreChapters, setHasMoreChapters] = useState(true);
  const [hasUserScrolled, setHasUserScrolled] = useState(false); // 用户是否已经手动滚动过

  const containerRef = useRef<HTMLDivElement>(null);
  const webtoonRef = useRef<HTMLDivElement>(null);
  const loadedChapterIds = useRef<Set<string>>(new Set());
  const processedImagesRef = useRef<ProcessedImage[]>([]);

  // 同步 ref 和 state
  useEffect(() => {
    processedImagesRef.current = processedImages;
  }, [processedImages]);
  // 加载漫画和章节数据
  useEffect(() => {
    if (!mangaId || !chapterId) {
      setLoading(false);
      return;
    }

    // 重置连读状态
    setNextChapterImages([]);
    setHasMoreChapters(true);
    setIsLoadingNextChapter(false);
    setHasUserScrolled(false); // 重置用户滚动标志
    loadedChapterIds.current.clear();
    loadedChapterIds.current.add(chapterId);

    const loadData = async () => {
      setLoading(true);
      setError("");

      await initDatabase();
      await initPluginSystem();
      await restorePluginsFromStorage();

      try {
        // 确保数据库已初始化
        await waitForDatabase();

        // 加载漫画信息
        let mangaData = mangaId ? await Manga.findById(mangaId) : null;
        let actualPluginKey = pluginKey || "";
        let actualExternalId = "";

        if (mangaData) {
          // 漫画在书架中，使用数据库中的信息
          actualPluginKey = mangaData.pluginId || pluginKey || "";
          actualExternalId = mangaData.externalId || "";
        } else if (mangaId) {
          // 漫画不在书架中，尝试从 mangaId 解析
          // mangaId 可能是 pluginKey:comicId 格式
          if (mangaId.includes(":")) {
            const parts = mangaId.split(":");
            actualPluginKey = parts[0] || pluginKey || "";
            actualExternalId = parts[1] || "";
          } else {
            // 无法解析，mangaId 就是 externalId
            actualExternalId = mangaId;
          }

          // 从缓存加载漫画详情（包含标题等信息）
          if (actualPluginKey && actualExternalId) {
            const cached = await loadMangaCache(
              actualPluginKey,
              actualExternalId,
            );
            if (cached) {
              mangaData = cached as MangaRecord;
              mangaData.pluginId = actualPluginKey;
              mangaData.externalId = actualExternalId;
            }
          }

          if (!actualExternalId) {
            setError("漫画不存在");
            setLoading(false);
            return;
          }

          // 如果缓存中没有数据，创建一个临时对象
          if (!mangaData && actualExternalId) {
            mangaData = {
              id: mangaId,
              pluginId: actualPluginKey || "",
              externalId: actualExternalId,
              title: actualExternalId, // 使用 externalId 作为临时标题
            } as MangaRecord;
          }
        }

        setManga(mangaData as MangaRecord);

        // 加载章节列表（JSON 格式）
        const chapterList = await ChapterList.findOne({ where: { mangaId } });
        let memoryChapters: MemoryChapter[] = [];

        if (chapterList) {
          memoryChapters = (chapterList as ChapterListRecord).chapters;
        }

        // 找到当前章节
        let currentCh = memoryChapters.find((ch) => ch.id === chapterId);
        if (!currentCh && mangaData) {
          // 从章节 ID 提取信息
          // chapterId 可能是 "chapter-6/manga-id" 或只是 "chapter-6"
          const chapterIdParts = chapterId?.split("/") || [];
          const simpleChapterId = chapterIdParts[0] || chapterId;

          // 尝试从章节 ID 解析标题（格式：chapter-33/the-female-delinquent-set-her-eyes-on-me-raw）
          // 章节标题通常是第一部分
          const chapterNumber =
            simpleChapterId.replace("chapter-", "") || simpleChapterId;

          currentCh = {
            id: chapterId,
            number: parseInt(chapterNumber, 10) || 0,
            title: `章节 ${chapterNumber}`,
            isRead: false,
          } as MemoryChapter;
        }

        if (!currentCh) {
          setError("章节不存在");
          setLoading(false);
          return;
        }

        setChapters(memoryChapters);
        setChapter(currentCh);

        // 加载章节图片
        await loadChapterImages(mangaData as MangaRecord, currentCh);

        // 恢复阅读进度
        // 优先使用传入的 page 参数（来自历史记录），其次从数据库恢复
        if (page !== undefined && page !== "") {
          const pageNum = parseInt(page, 10);
          if (!isNaN(pageNum) && pageNum >= 0) {
            setCurrentPage(pageNum);
            saveProgress(pageNum);
          }
        } else if (mangaId && chapterId) {
          const history = await ReadHistory.findOne({
            where: { mangaId, chapterId },
          });
          if (history) {
            setCurrentPage((history as any).page || 0);
          }
        }
      } catch (e: any) {
        console.error("[Reader] Failed to load data:", e);
        setError(e.message || "加载失败");
      } finally {
        setLoading(false);
      }
    };

    loadData();

    // 清理函数：组件卸载或章节切换时清理 blob URL
    return () => {
      cleanupBlobUrls(processedImagesRef.current);
    };
  }, [mangaId, chapterId, page]);

  // 当章节加载完成时，滚动到指定位置（Webtoon 模式）- 只触发一次
  useEffect(() => {
    if (
      settings.webtoonMode &&
      webtoonRef.current &&
      processedImages.length > 0 &&
      currentPage > 0
    ) {
      const images = webtoonRef.current.querySelectorAll(".webtoon-image");
      if (images[currentPage]) {
        // 等待一下让图片渲染完成
        setTimeout(() => {
          images[currentPage].scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        }, 100);
      }
    }
  }, [processedImages.length]); // 只在图片加载完成时触发一次，而不是每次 currentPage 变化都触发

  // 清理 blob URL
  const cleanupBlobUrls = useCallback((images: ProcessedImage[]) => {
    images.forEach((img) => {
      if (img.blobUrl) {
        // 如果是离线缓存的 Blob URL，直接 revoke
        if (img.isOffline) {
          URL.revokeObjectURL(img.blobUrl);
        } else {
          revokeImageBlobUrl(img.blobUrl);
        }
      }
    });
  }, []);

  // 加载章节图片
  const loadChapterImages = async (
    mangaData: MangaRecord,
    chapterData: MemoryChapter,
  ) => {
    // 先清理之前的 blob URL
    cleanupBlobUrls(processedImagesRef.current);
    setProcessedImages([]);

    // 先检查缓存索引（包含图片 URL 结构，不需要再请求远程）
    if (mangaData.externalId) {
      const cacheIndex = getCacheIndex();
      const cachedImageUrls = await cacheIndex.getChapterImageUrls(
        mangaData.externalId,
        chapterData.id,
      );

      if (cachedImageUrls && cachedImageUrls.length > 0) {
        // 更新最后访问时间
        await cacheIndex.updateLastAccessed(
          mangaData.externalId,
          chapterData.id,
        );
        // 使用缓存的图片 URL 处理
        await processImageUrls(
          mangaData.pluginId || pluginKey || "",
          mangaData.externalId,
          chapterData.id,
          cachedImageUrls,
        );
        return;
      }
    }

    // 尝试从旧的内存缓存加载（兼容旧数据）
    const cached = await getCachedChapterImages(chapterData.id);
    if (cached && cached.length > 0) {
      await processImageUrls(
        mangaData.pluginId || pluginKey || "",
        mangaData.externalId || "",
        chapterData.id,
        cached,
      );
      return;
    }

    // 从插件加载
    // chapterData.id 已经是 chapterId/mangaId 格式（如：chapter-6/i-cant-stand-it-sister-in-law-raw）
    if (mangaData.pluginId && mangaData.externalId) {
      try {
        const imageUrls = await getChapterImages(
          mangaData.pluginId,
          mangaData.externalId,
          chapterData.id,
        );
        setImages(imageUrls);
        // 缓存原始图片 URL
        await cacheChapterImages(chapterData.id, imageUrls);
        // 处理图片 URL（应用 onImageLoad）
        await processImageUrls(
          mangaData.pluginId,
          mangaData.externalId,
          chapterData.id,
          imageUrls,
        );
      } catch (e: any) {
        setError("加载图片失败: " + e.message);
      }
    } else {
      console.error("无法加载图片：缺少插件信息", mangaData);
      setError("无法加载图片：缺少插件信息");
    }
  };

  // 处理图片 URL（应用插件的 onImageLoad）
  // 分批处理：先处理前几张，剩余图片按需处理
  const BATCH_SIZE = 3; // 初始处理数量
  const PRELOAD_BATCH_SIZE = 5; // 懒加载时每次预加载的数量
  const pendingUrlsRef = useRef<Map<number, string>>(new Map()); // 待处理的URL
  const processedChapterIds = useRef<Set<string>>(new Set()); // 已处理的章节 ID，避免重复加载

  // 获取离线缓存的图片
  const getOfflineImageUrl = async (
    mangaExternalId: string,
    chapterId: string,
    index: number,
  ): Promise<string | null> => {
    try {
      const cacheManager = getCacheManager();
      await cacheManager.init();

      const cached = await cacheManager.read(mangaExternalId, chapterId, index);
      if (cached) {
        // 将 Uint8Array 转换为 Blob URL
        const blob = new Blob([cached.data.buffer as ArrayBuffer], {
          type: cached.contentType,
        });
        return URL.createObjectURL(blob);
      }
      return null;
    } catch (e) {
      return null;
    }
  };

  const processImageUrls = async (
    pluginId: string,
    comicId: string,
    chapterId: string,
    urls: string[],
  ) => {
    try {
      // 提取真正的 epId（只取 / 前面的部分）
      const epId = chapterId.includes("/")
        ? chapterId.split("/")[0]
        : chapterId;

      // 检查是否已处理过这个章节，避免重复加载
      const chapterCacheKey = `${comicId}_${chapterId}`;
      if (processedChapterIds.current.has(chapterCacheKey)) {
        return;
      }
      processedChapterIds.current.add(chapterCacheKey);

      // 先检查离线缓存
      const processedWithCache: ProcessedImage[] = [];
      const blobUrlsToRevoke: string[] = [];

      for (let i = 0; i < urls.length; i++) {
        const offlineUrl = await getOfflineImageUrl(comicId, chapterId, i);
        if (offlineUrl) {
          processedWithCache.push({
            url: offlineUrl,
            originalUrl: urls[i],
            blobUrl: offlineUrl, // Blob URL 可以直接使用
            isOffline: true,
          });
          blobUrlsToRevoke.push(offlineUrl);
        } else {
          processedWithCache.push({
            url: urls[i],
            originalUrl: urls[i],
          });
        }
      }
      setProcessedImages(processedWithCache);

      // 记录待处理的URL（从第 BATCH_SIZE 张开始，排除已有离线缓存的）
      pendingUrlsRef.current.clear();
      for (let i = BATCH_SIZE; i < urls.length; i++) {
        if (!processedWithCache[i].isOffline) {
          pendingUrlsRef.current.set(i, urls[i]);
        }
      }

      // 先处理前 BATCH_SIZE 张（跳过已有离线缓存的）
      for (let i = 0; i < Math.min(BATCH_SIZE, urls.length); i++) {
        // 如果已有离线缓存，跳过处理
        if (processedWithCache[i].isOffline) {
          continue;
        }

        const url = urls[i];
        try {
          const result = await processImageLoad(pluginId, url, comicId, epId);

          setProcessedImages((prev) => {
            const updated = [...prev];
            updated[i] = {
              url: result.blobUrl || result.url,
              originalUrl: url,
              blobUrl: result.blobUrl,
              headers: result.headers,
            };
            return updated;
          });
        } catch (e: any) {
          // CF 挑战会触发全局回调，这里只需要停止处理
          if (e.message?.startsWith("CF_CHALLENGE:")) {
            break; // 停止处理后续图片
          }
          console.error(`[processImageUrls] Failed to load image ${i}:`, e);
        }
      }
    } catch (e) {
      console.error("Failed to process image URLs:", e);
      // 如果处理失败，使用原始 URL
      setProcessedImages(urls.map((url) => ({ url, originalUrl: url })));
    }
  };

  // 处理指定索引附近的图片（懒加载）
  // 提前预加载：当用户浏览到 倒数第 2 张已处理图片 时，开始加载下一批
  // 这样保证用户看到最后 1 张时，下一批已经加载完成，不会卡顿
  const processNearbyImages = useCallback(async (centerIndex: number) => {
    if (!manga?.pluginId || !manga?.externalId || !chapter) return;

    const epId = chapter.id.includes("/")
      ? chapter.id.split("/")[0]
      : chapter.id;

    // 提前触发：当 当前页 >= 已处理数量 - 2 时，开始加载下一批
    // 例如：已处理 5 张，浏览到第 3 张 (index=2) 时就开始加载
    const preloadThreshold = Math.max(0, processedImages.length - 2);
    if (centerIndex < preloadThreshold) return;

    // 从待处理列表中按顺序加载下一批图片（每次加载 PRELOAD_BATCH_SIZE 张）
    const indicesToProcess: number[] = [];
    const startIndex = processedImages.length; // 从已处理的最后一张之后开始

    for (let i = startIndex; i < startIndex + PRELOAD_BATCH_SIZE && i < images.length; i++) {
      if (pendingUrlsRef.current.has(i)) {
        indicesToProcess.push(i);
      }
    }

    if (indicesToProcess.length === 0) return;

    // 处理这些图片
    for (const idx of indicesToProcess) {
      const url = pendingUrlsRef.current.get(idx);
      if (!url) continue;

      // 从待处理列表中移除
      pendingUrlsRef.current.delete(idx);

      try {
        const result = await processImageLoad(
          manga.pluginId,
          url,
          manga.externalId,
          epId,
        );
        setProcessedImages((prev) => {
          if (idx >= prev.length) return prev;
          const updated = [...prev];
          updated[idx] = {
            url: result.blobUrl || result.url,
            originalUrl: url,
            blobUrl: result.blobUrl,
            headers: result.headers,
          };
          return updated;
        });
      } catch (e) {
        console.error(
          `[processNearbyImages] Failed to process image ${idx}:`,
          e,
        );
      }
    }
  }, [manga, chapter, processedImages.length, images.length]);

  // 保存阅读进度
  const saveProgress = useCallback(
    async (page: number) => {
      if (!mangaId || !chapterId) return;

      try {
        const existing = await ReadHistory.findOne({
          where: { mangaId, chapterId },
        });
        if (existing) {
          await ReadHistory.update((existing as any).id, {
            page,
            readAt: Date.now(),
          });
        } else {
          await ReadHistory.create({
            id: generateUUID(),
            mangaId,
            chapterId,
            page,
            readAt: Date.now(),
          });
        }

        // 更新章节列表中的阅读状态
        const chapterList = await ChapterList.findOne({ where: { mangaId } });
        if (chapterList) {
          const list = chapterList as ChapterListRecord;
          const chapterIndex = list.chapters.findIndex(
            (ch) => ch.id === chapterId,
          );
          if (chapterIndex >= 0 && !list.chapters[chapterIndex].isRead) {
            list.chapters[chapterIndex].isRead = true;
            list.chapters[chapterIndex].readAt = Date.now();
            await ChapterList.update(list.id, {
              chapters: list.chapters,
              updatedAt: Date.now(),
            });
          }
        }

        // 更新漫画阅读状态
        await Manga.update(mangaId, {
          lastReadAt: Date.now(),
          lastReadChapterId: chapterId,
          updatedAt: Date.now(),
        });
      } catch (e) {
        console.error("Failed to save progress:", e);
      }
    },
    [mangaId, chapterId],
  );

  // 翻页处理
  const handlePrevPage = useCallback(() => {
    setCurrentPage((p) => {
      const newPage = Math.max(0, p - 1);
      saveProgress(newPage);
      return newPage;
    });
  }, [saveProgress]);

  const handleNextPage = useCallback(() => {
    setCurrentPage((p) => {
      const newPage = Math.min(processedImagesRef.current.length - 1, p + 1);
      saveProgress(newPage);
      return newPage;
    });
  }, [saveProgress]);

  // 切换到下一章
  const goToNextChapter = useCallback(async () => {
    if (!chapter || chapters.length === 0) return;

    const sortedChapters = chapterReverseOrder
      ? [...chapters].sort((a, b) => b.number - a.number)
      : chapters;

    const currentIndex = sortedChapters.findIndex((ch) => ch.id === chapter.id);
    if (currentIndex < sortedChapters.length - 1) {
      const nextChapter = sortedChapters[currentIndex + 1];
      navigate("reader", {
        mangaId: mangaId!,
        chapterId: nextChapter.id,
        pluginKey: pluginKey as string,
      });
    } else {
      // 已经是最后一章
      alert("已经是最后一章了");
    }
  }, [chapter, chapters, chapterReverseOrder, mangaId]);

  // 切换到上一章
  const goToPrevChapter = useCallback(async () => {
    if (!chapter || chapters.length === 0) return;

    const sortedChapters = chapterReverseOrder
      ? [...chapters].sort((a, b) => b.number - a.number)
      : chapters;

    const currentIndex = sortedChapters.findIndex((ch) => ch.id === chapter.id);
    if (currentIndex > 0) {
      const prevChapter = sortedChapters[currentIndex - 1];
      navigate("reader", {
        mangaId: mangaId!,
        chapterId: prevChapter.id,
        pluginKey: pluginKey as string,
      });
    }
  }, [chapter, chapters, chapterReverseOrder, mangaId]);

  // 点击翻页（普通模式）
  const handleTap = useCallback(
    (e: MouseEvent) => {
      if (settings.webtoonMode) return;

      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const x = e.clientX - rect.left;
      const width = rect.width;

      if (x < width * 0.3) {
        if (settings.readingDirection === "rtl") {
          handleNextPage();
        } else {
          handlePrevPage();
        }
      } else if (x > width * 0.7) {
        if (settings.readingDirection === "rtl") {
          handlePrevPage();
        } else {
          handleNextPage();
        }
      } else {
        setShowControls((v) => !v);
      }
    },
    [
      settings.webtoonMode,
      settings.readingDirection,
      handlePrevPage,
      handleNextPage,
    ],
  );

  // Webtoon 模式滚动处理
  const handleWebtoonScroll = useCallback(() => {
    if (!settings.webtoonMode || !webtoonRef.current) return;

    const container = webtoonRef.current;
    const scrollTop = container.scrollTop;
    const containerHeight = container.clientHeight;

    // 如果用户滚动超过 100px，标记为已手动滚动
    // 之后不再自动调整滚动位置
    if (scrollTop > 100) {
      setHasUserScrolled(true);
    }

    // 计算当前页
    const images = container.querySelectorAll(".webtoon-image");
    let currentImgIndex = 0;

    for (let i = 0; i < images.length; i++) {
      const img = images[i] as HTMLElement;
      const imgTop = img.offsetTop;
      const imgHeight = img.offsetHeight;

      // 只有当图片高度大于 0 时才认为是已加载的
      // 这样可以避免在图片加载过程中触发错误的页码计算
      if (imgHeight <= 0) continue;

      if (
        scrollTop + containerHeight / 2 >= imgTop &&
        scrollTop + containerHeight / 2 < imgTop + imgHeight
      ) {
        currentImgIndex = i;
        break;
      }
    }

    // 只在页码真正变化时才保存进度
    // 避免在图片加载过程中频繁触发保存
    setCurrentPage((prev) => {
      if (prev !== currentImgIndex) {
        saveProgress(currentImgIndex);
        return currentImgIndex;
      }
      return prev;
    });

    // 检查是否滚动到底部，自动加载下一章
    const scrollBottom = scrollTop + containerHeight;
    const scrollHeight = container.scrollHeight;
    if (
      scrollBottom >= scrollHeight - 200 &&
      !isLoadingNextChapter &&
      hasMoreChapters
    ) {
      // 接近底部，加载下一章
      loadNextChapterForWebtoon();
    }
  }, [
    settings.webtoonMode,
    saveProgress,
    isLoadingNextChapter,
    hasMoreChapters,
  ]);

  // Webtoon 模式加载下一章
  const loadNextChapterForWebtoon = useCallback(async () => {
    if (!chapter || chapters.length === 0 || !manga) return;

    const sortedChapters = chapterReverseOrder
      ? [...chapters].sort((a, b) => b.number - a.number)
      : chapters;

    const currentIndex = sortedChapters.findIndex((ch) => ch.id === chapter.id);
    // 检查是否是最后一章
    if (currentIndex < 0 || currentIndex >= sortedChapters.length - 1) {
      setHasMoreChapters(false);
      return;
    }

    const nextChapter = sortedChapters[currentIndex + 1];

    // 检查是否已经加载过这一章
    if (loadedChapterIds.current.has(nextChapter.id)) {
      return;
    }

    setIsLoadingNextChapter(true);

    try {
      // 加载下一章图片
      const imageUrls = await getChapterImages(
        manga.pluginId,
        manga.externalId || "",
        nextChapter.id,
      );

      loadedChapterIds.current.add(nextChapter.id);
      setNextChapterImages((prev) => [...prev, ...imageUrls]);

      // 保存阅读进度到下一章
      await ReadHistory.create({
        id: generateUUID(),
        mangaId: mangaId!,
        chapterId: nextChapter.id,
        page: 0,
        readAt: Date.now(),
      });
    } catch (e) {
      console.error("Failed to load next chapter:", e);
    } finally {
      setIsLoadingNextChapter(false);
    }
  }, [chapter, chapters, chapterReverseOrder, manga, mangaId]);

  // 键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (settings.webtoonMode) return;

      switch (e.key) {
        case "ArrowLeft":
          settings.readingDirection === "rtl"
            ? handleNextPage()
            : handlePrevPage();
          break;
        case "ArrowRight":
          settings.readingDirection === "rtl"
            ? handlePrevPage()
            : handleNextPage();
          break;
        case " ":
        case "ArrowDown":
          handleNextPage();
          break;
        case "ArrowUp":
          handlePrevPage();
          break;
        case "Escape":
          setShowControls(true);
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    settings.webtoonMode,
    settings.readingDirection,
    handlePrevPage,
    handleNextPage,
  ]);

  // 监听页码变化，触发懒加载处理附近图片
  useEffect(() => {
    if (processedImages.length > BATCH_SIZE) {
      processNearbyImages(currentPage);
    }
  }, [currentPage, processedImages.length]);

  const handleBack = () => {
    // 返回到漫画详情页
    if (mangaId) {
      navigate("manga", { id: mangaId });
    } else {
      navigate("explore");
    }
  };

  const toggleWebtoonMode = () => {
    const newSettings = { ...settings, webtoonMode: !settings.webtoonMode };
    setSettings(newSettings);
    saveSettings(newSettings);
  };

  const toggleReadingDirection = () => {
    const newSettings = {
      ...settings,
      readingDirection: settings.readingDirection === "ltr" ? "rtl" : "ltr",
    };
    setSettings(newSettings as ReaderSettings);
    saveSettings(newSettings as ReaderSettings);
  };

  const handleChapterSelect = (selectedChapterId: string) => {
    setShowChapterList(false);
    if (selectedChapterId !== chapterId) {
      navigate("reader", { mangaId: mangaId!, chapterId: selectedChapterId });
    }
  };

  const handleImageLoad = (index: number) => {
    // 图片加载完成时，检查是否需要调整滚动位置
    // 这是因为图片加载后高度变化可能导致页面跳动
    // 只在用户没有手动滚动过，且是前几张图片加载时才调整
    if (!hasUserScrolled && webtoonRef.current && index < 3) {
      const container = webtoonRef.current;
      const currentScroll = container.scrollTop;

      // 使用 requestAnimationFrame 确保在下一帧恢复滚动位置
      requestAnimationFrame(() => {
        container.scrollTop = currentScroll;
      });
    }

    setLoadedImages((prev) => new Set([...prev, index]));
  };

  if (loading) {
    return (
      <div class="flex items-center justify-center h-full bg-black">
        <div class="text-center">
          <div class="w-8 h-8 border-2 border-[#e94560] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p class="text-gray-400">加载中...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div class="flex flex-col items-center justify-center h-full bg-black p-4">
        <p class="text-gray-400 text-center">{error}</p>
        <button
          onClick={handleBack}
          class="mt-4 px-4 py-2 bg-[#e94560] text-white rounded-lg"
        >
          返回
        </button>
      </div>
    );
  }

  const totalPages = processedImages.length;
  const sortedChapters = chapterReverseOrder
    ? [...chapters].sort((a, b) => b.number - a.number)
    : chapters;

  return (
    <div class="relative h-full bg-black overflow-hidden" ref={containerRef}>
      {/* Top Bar */}
      <div
        class={`absolute top-0 left-0 right-0 z-20 bg-gradient-to-b from-black/80 to-transparent transition-transform duration-300 ${
          showControls ? "translate-y-0" : "-translate-y-full"
        }`}
      >
        <div class="flex items-center gap-4 px-4 py-3">
          <button onClick={handleBack} class="text-white text-xl">
            ←
          </button>
          <div class="flex-1 min-w-0">
            <h1 class="text-white font-medium truncate">{manga?.title}</h1>
            <p class="text-sm text-gray-400">{chapter?.title}</p>
          </div>
          <button
            onClick={() => setShowChapterList(true)}
            class="text-white px-3 py-1 bg-white/10 rounded-lg text-sm"
          >
            章节
          </button>
          <button
            onClick={() => setShowSettings(true)}
            class="text-white px-3 py-1 bg-white/10 rounded-lg text-sm"
          >
            设置
          </button>
        </div>
      </div>

      {/* Image Viewer - Normal Mode */}
      {!settings.webtoonMode && (
        <div
          class="h-full flex items-center justify-center"
          onClick={handleTap}
        >
          {processedImages.length > 0 && (
            <img
              src={processedImages[currentPage]?.url}
              alt={`Page ${currentPage + 1}`}
              class="max-h-full max-w-full object-contain"
              style={{
                transform:
                  settings.readingDirection === "rtl" ? "scaleX(-1)" : "none",
              }}
            />
          )}
        </div>
      )}

      {/* Webtoon Mode */}
      {settings.webtoonMode && (
        <div
          ref={webtoonRef}
          class="h-full overflow-y-auto scrollbar-hide"
          onScroll={handleWebtoonScroll}
          onClick={() => setShowControls((v) => !v)}
        >
          <div class="w-full max-w-3xl mx-auto">
            {/* 当前章节图片 */}
            {processedImages.map((img, index) => (
              <div
                key={`current-${index}`}
                class="webtoon-image w-full relative bg-[#1a1a2e]"
              >
                {/* 加载指示器 - 使用绝对定位，不占据空间 */}
                {!loadedImages.has(index) && (
                  <div class="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                    <div class="w-6 h-6 border-2 border-[#e94560] border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
                {/* 实际图片 - 使用 min-height 避免高度为 0 */}
                <img
                  src={img.url}
                  alt={`Page ${index + 1}`}
                  class="w-full h-auto block"
                  style={{
                    minHeight: index < 3 ? "200px" : "100px",
                    opacity: loadedImages.has(index) ? 1 : 0.5,
                    transition: "opacity 0.2s ease-in-out",
                  }}
                  loading={index < 3 ? "eager" : "lazy"}
                  onLoad={() => handleImageLoad(index)}
                />
              </div>
            ))}

            {/* 下一章图片（自动加载） */}
            {nextChapterImages.length > 0 && (
              <>
                <div class="py-4 text-center border-t border-gray-700">
                  <span class="text-gray-400 text-sm">下一章</span>
                </div>
                {nextChapterImages.map((url, index) => (
                  <div key={`next-${index}`} class="webtoon-image w-full">
                    <img
                      src={url}
                      alt={`Next Chapter Page ${index + 1}`}
                      class="w-full h-auto block"
                      loading="lazy"
                    />
                  </div>
                ))}
              </>
            )}

            {/* 加载中指示器 */}
            {isLoadingNextChapter && (
              <div class="py-8 flex items-center justify-center">
                <div class="w-8 h-8 border-2 border-[#e94560] border-t-transparent rounded-full animate-spin" />
                <span class="ml-3 text-gray-400">加载下一章...</span>
              </div>
            )}

            {/* 下一章按钮（如果没有更多章节则显示完成） */}
            {!hasMoreChapters ? (
              <div class="py-8 px-4 text-center">
                <span class="text-gray-400">已读完所有章节</span>
              </div>
            ) : (
              <div class="py-8 px-4 text-center">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    goToNextChapter();
                  }}
                  class="px-6 py-3 bg-[#e94560] text-white rounded-lg"
                >
                  下一章 →
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bottom Bar */}
      <div
        class={`absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black/80 to-transparent transition-transform duration-300 ${
          showControls ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div class="px-4 py-4">
          {/* Progress */}
          <div class="flex items-center gap-3 mb-3">
            <span class="text-sm text-white">{currentPage + 1}</span>
            <div
              class="flex-1 h-1 bg-gray-600 rounded-full overflow-hidden cursor-pointer"
              onClick={(e) => {
                const rect = (
                  e.currentTarget as HTMLElement
                ).getBoundingClientRect();
                const x = e.clientX - rect.left;
                const percentage = x / rect.width;
                const newPage = Math.floor(percentage * totalPages);
                const targetPage = Math.max(
                  0,
                  Math.min(totalPages - 1, newPage),
                );
                setCurrentPage(targetPage);
                saveProgress(targetPage);

                // 滚动到指定图片
                if (settings.webtoonMode && webtoonRef.current) {
                  const images =
                    webtoonRef.current.querySelectorAll(".webtoon-image");
                  if (images[targetPage]) {
                    images[targetPage].scrollIntoView({
                      behavior: "smooth",
                      block: "start",
                    });
                  }
                } else if (containerRef.current) {
                  // 普通模式：滚动容器到顶部（因为图片是居中显示的）
                  containerRef.current.scrollTo({ top: 0, behavior: "smooth" });
                }
              }}
            >
              <div
                class="h-full bg-[#e94560] transition-all duration-300"
                style={{
                  width: `${totalPages > 0 ? ((currentPage + 1) / totalPages) * 100 : 0}%`,
                }}
              />
            </div>
            <span class="text-sm text-gray-400">{totalPages}</span>
          </div>

          {/* Controls */}
          {!settings.webtoonMode && (
            <div class="flex items-center justify-between">
              <button
                onClick={goToPrevChapter}
                disabled={
                  !chapter ||
                  sortedChapters.findIndex((ch) => ch.id === chapter?.id) === 0
                }
                class="px-4 py-2 text-white disabled:opacity-30 text-sm"
              >
                ← 上一章
              </button>
              <div class="flex gap-2">
                <button
                  onClick={handlePrevPage}
                  disabled={currentPage === 0}
                  class="px-4 py-2 text-white disabled:opacity-30"
                >
                  上一页
                </button>
                <span class="text-sm text-gray-400 py-2">
                  {totalPages > 0
                    ? Math.round(((currentPage + 1) / totalPages) * 100)
                    : 0}
                  %
                </span>
                <button
                  onClick={handleNextPage}
                  disabled={currentPage >= totalPages - 1}
                  class="px-4 py-2 text-white disabled:opacity-30"
                >
                  下一页
                </button>
              </div>
              <button
                onClick={goToNextChapter}
                disabled={
                  !chapter ||
                  sortedChapters.findIndex((ch) => ch.id === chapter?.id) ===
                    sortedChapters.length - 1
                }
                class="px-4 py-2 text-white disabled:opacity-30 text-sm"
              >
                下一章 →
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Page indicator */}
      {!showControls && !settings.webtoonMode && (
        <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
          <span class="text-white/50 text-sm bg-black/50 px-3 py-1 rounded-full">
            {currentPage + 1} / {totalPages}
          </span>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div
          class="fixed inset-0 z-30 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setShowSettings(false)}
        >
          <div
            class="bg-[#1a1a2e] rounded-xl p-6 w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 class="text-xl font-bold text-white mb-4">阅读设置</h2>

            <div class="space-y-4">
              <div class="flex items-center justify-between">
                <span class="text-white">Webtoon 模式</span>
                <button
                  onClick={toggleWebtoonMode}
                  class={`w-12 h-6 rounded-full transition-colors ${
                    settings.webtoonMode ? "bg-[#e94560]" : "bg-gray-600"
                  }`}
                >
                  <div
                    class={`w-5 h-5 bg-white rounded-full transition-transform ${
                      settings.webtoonMode ? "translate-x-6" : "translate-x-0.5"
                    }`}
                  />
                </button>
              </div>

              {!settings.webtoonMode && (
                <div class="flex items-center justify-between">
                  <span class="text-white">阅读方向</span>
                  <button
                    onClick={toggleReadingDirection}
                    class="px-3 py-1 bg-[#0f3460] text-white rounded-lg text-sm"
                  >
                    {settings.readingDirection === "ltr" ? "左→右" : "右→左"}
                  </button>
                </div>
              )}
            </div>

            <button
              onClick={() => setShowSettings(false)}
              class="w-full mt-6 py-2 bg-[#e94560] text-white rounded-lg"
            >
              关闭
            </button>
          </div>
        </div>
      )}

      {/* Chapter List Modal */}
      {showChapterList && (
        <div
          class="fixed inset-0 z-30 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setShowChapterList(false)}
        >
          <div
            class="bg-[#1a1a2e] rounded-xl w-full max-w-md max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div class="p-4 border-b border-gray-700">
              <div class="flex items-center justify-between">
                <h2 class="text-xl font-bold text-white">章节列表</h2>
                <button
                  onClick={() => setChapterReverseOrder(!chapterReverseOrder)}
                  class="text-sm text-[#e94560]"
                >
                  {chapterReverseOrder ? "正序" : "倒序"}
                </button>
              </div>
            </div>

            <div class="flex-1 overflow-y-auto p-4">
              <div class="grid grid-cols-4 gap-2">
                {sortedChapters.map((ch) => (
                  <button
                    key={ch.id}
                    onClick={() => handleChapterSelect(ch.id)}
                    class={`px-3 py-2 rounded-lg text-sm truncate ${
                      ch.id === chapterId
                        ? "bg-[#e94560] text-white"
                        : ch.isRead
                          ? "bg-[#16213e] text-gray-500"
                          : "bg-[#16213e] text-white hover:bg-[#1a4a7a]"
                    }`}
                  >
                    {ch.number}
                  </button>
                ))}
              </div>
            </div>

            <div class="p-4 border-t border-gray-700">
              <button
                onClick={() => setShowChapterList(false)}
                class="w-full py-2 bg-gray-700 text-white rounded-lg"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
