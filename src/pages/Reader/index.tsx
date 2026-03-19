import { useState, useEffect, useCallback, useRef } from "preact/hooks";
import { navigate } from "@routes/index";
import {
  getChapterImages,
  getComicDetail,
  initPluginSystem,
  loadMangaCache,
  restorePluginsFromStorage,
  processImageLoad,
} from "@plugins/index";
import { Manga, ChapterList, ReadHistory, initDatabase } from "@db/index";
import type { MangaRecord, ChapterListRecord } from "@db/index";
import { waitForDatabase } from "@db/global";
import {
  getSettings,
  saveSettings,
  generateUUID,
  getCachedChapterImages,
  cacheChapterImages,
} from "./utils";
import type { ReaderProps, ReaderSettings, MemoryChapter, ImageItem } from "./types";
import {
  TopBar,
  ImageViewer,
  BottomBar,
  ChapterListModal,
  WebtoonModeModal,
} from "./components";

const PRELOAD_COUNT = 5;
const LOAD_MORE_THRESHOLD = 2;

export function Reader({ mangaId, chapterId, pluginKey, page }: ReaderProps) {
  const [manga, setManga] = useState<MangaRecord | null>(null);
  const [chapter, setChapter] = useState<MemoryChapter | null>(null);
  const [chapters, setChapters] = useState<MemoryChapter[]>([]);
  const [images, setImages] = useState<string[]>([]);
  const [imageItems, setImageItems] = useState<ImageItem[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [settings, setSettings] = useState<ReaderSettings>(getSettings());
  const [showChapterList, setShowChapterList] = useState(false);
  const [showWebtoonModal, setShowWebtoonModal] = useState(false);
  const [chapterReverseOrder, setChapterReverseOrder] = useState(false);
  const [shouldScrollToPage, setShouldScrollToPage] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const imageItemsRef = useRef<ImageItem[]>([]);
  const loadedUrlsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    imageItemsRef.current = imageItems;
  }, [imageItems]);

  const saveProgress = useCallback(
    async (pageNum: number) => {
      if (!mangaId || !chapterId) return;
      try {
        await initDatabase();
        const existing = await ReadHistory.findOne({
          where: { mangaId, chapterId },
        });
        if (existing) {
          await ReadHistory.update((existing as any).id, {
            page: pageNum,
            readAt: Date.now(),
          });
        } else {
          await ReadHistory.create({
            id: generateUUID(),
            mangaId,
            chapterId,
            page: pageNum,
            readAt: Date.now(),
          });
        }
      } catch (e) {
        console.error("Failed to save progress:", e);
      }
    },
    [mangaId, chapterId]
  );

  const getOfflineImageUrl = useCallback(
    async (mangaExternalId: string, chapterId: string, index: number): Promise<string | null> => {
      try {
        const { getCacheManager } = await import("../../fs/cache-manager");
        const cacheManager = getCacheManager();
        await cacheManager.init();
        const cached = await cacheManager.read(mangaExternalId, chapterId, index);
        if (cached) {
          const blob = new Blob([cached.data.buffer as ArrayBuffer], {
            type: cached.contentType,
          });
          return URL.createObjectURL(blob);
        }
        return null;
      } catch {
        return null;
      }
    },
    []
  );

  const loadImage = useCallback(
    async (url: string, index: number): Promise<ImageItem> => {
      const cacheKey = `${chapterId}-${index}-${url}`;
      if (loadedUrlsRef.current.has(cacheKey)) {
        const existing = imageItemsRef.current[index];
        if (existing && existing.url) return existing;
      }

      const offlineUrl = await getOfflineImageUrl(manga?.externalId || "", chapterId || "", index);
      if (offlineUrl) {
        loadedUrlsRef.current.add(cacheKey);
        return { url: offlineUrl, originalUrl: url, loaded: true };
      }

      try {
        const epId = chapterId?.includes("/") ? chapterId.split("/")[0] : chapterId;
        const result = await processImageLoad(
          manga?.pluginId || pluginKey || "",
          url,
          manga?.externalId || "",
          epId || ""
        );
        loadedUrlsRef.current.add(cacheKey);
        return {
          url: result.url,
          originalUrl: url,
          blobUrl: result.blobUrl,
          headers: result.headers,
          loaded: true,
        };
      } catch (e) {
        console.error(`Failed to load image ${index}:`, e);
        return { url: "", originalUrl: url, loaded: false, error: true };
      }
    },
    [chapterId, manga, pluginKey, getOfflineImageUrl]
  );

  const loadImageRange = useCallback(
    async (start: number, end: number) => {
      const currentItems = imageItemsRef.current;
      if (currentItems.length === 0) return;

      const newItems: ImageItem[] = [...currentItems];
      let hasNew = false;

      for (let i = start; i < end && i < images.length; i++) {
        if (!newItems[i]?.loaded && images[i]) {
          const item = await loadImage(images[i], i);
          newItems[i] = item;
          hasNew = true;
        }
      }

      if (hasNew) {
        setImageItems(newItems);
      }
    },
    [images, loadImage]
  );

  // 当 images 变化时，确保有占位符（用于显示总分页）
  useEffect(() => {
    if (images.length === 0) return;
    
    // 如果已经有数据了，不需要重新创建占位符
    if (imageItemsRef.current.length === images.length) return;

    const placeholders: ImageItem[] = Array(images.length).fill(null).map((_, i) => ({
      url: "",
      originalUrl: images[i],
      loaded: false,
    }));
    setImageItems(placeholders);
  }, [images]);

  // 当 currentPage 变化时，加载当前页附近的图片
  useEffect(() => {
    if (images.length === 0) return;

    // 加载当前页附近的图片（前后各3张）
    const range = 3;
    const start = Math.max(0, currentPage - range);
    const end = Math.min(images.length, currentPage + range + 1);
    loadImageRange(start, end);

    // 如果快到末尾了，预加载后续图片
    const remaining = images.length - currentPage - 1;
    if (remaining <= LOAD_MORE_THRESHOLD) {
      const nextStart = currentPage + PRELOAD_COUNT;
      const nextEnd = Math.min(nextStart + PRELOAD_COUNT, images.length);
      if (nextStart < images.length) {
        loadImageRange(nextStart, nextEnd);
      }
    }
  }, [currentPage, images.length, loadImageRange]);

  // Webtoon模式：初始加载或点击进度条时滚动到对应位置
  useEffect(() => {
    if (!settings.webtoonMode || !containerRef.current || !shouldScrollToPage) return;
    
    setShouldScrollToPage(false);
    requestAnimationFrame(() => {
      if (!containerRef.current) return;
      const images = containerRef.current.querySelectorAll('.webtoon-image');
      if (images[currentPage]) {
        (images[currentPage] as HTMLElement).scrollIntoView({ behavior: 'auto', block: 'start' });
      }
    });
  }, [currentPage, settings.webtoonMode, shouldScrollToPage]);

  const handlePrevPage = useCallback(() => {
    setCurrentPage((p) => {
      const newPage = Math.max(0, p - 1);
      saveProgress(newPage);
      return newPage;
    });
  }, [saveProgress]);

  const handleNextPage = useCallback(() => {
    setCurrentPage((p) => {
      const newPage = Math.min(images.length - 1, p + 1);
      saveProgress(newPage);
      return newPage;
    });
  }, [images.length, saveProgress]);

  const handleSeek = useCallback(
    (page: number) => {
      const targetPage = Math.max(0, Math.min(images.length - 1, page));
      setCurrentPage(targetPage);
      saveProgress(targetPage);
      if (settings.webtoonMode) {
        setShouldScrollToPage(true);
      }
    },
    [images.length, saveProgress, settings.webtoonMode]
  );

  const handleTap = useCallback(
    (e: MouseEvent) => {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const x = e.clientX - rect.left;
      const width = rect.width;

      if (x < width * 0.3) {
        settings.readingDirection === "rtl" ? handleNextPage() : handlePrevPage();
      } else if (x > width * 0.7) {
        settings.readingDirection === "rtl" ? handlePrevPage() : handleNextPage();
      } else {
        setShowControls((v) => !v);
      }
    },
    [settings.readingDirection, handlePrevPage, handleNextPage]
  );

  const goToChapter = useCallback(
    async (targetChapterId: string) => {
      if (!manga || !targetChapterId) return;
      const targetCh = chapters.find((ch) => ch.id === targetChapterId);
      if (!targetCh) return;

      setChapter(targetCh);
      setImages([]);
      setImageItems([]);
      loadedUrlsRef.current.clear();
      setCurrentPage(0);
      setLoading(true);

      try {
        const imageUrls = await getChapterImages(
          manga.pluginId || "",
          manga.externalId || "",
          targetChapterId
        );
        setImages(imageUrls);
        await cacheChapterImages(targetChapterId, imageUrls);

        // 用占位符填充整个数组
        const placeholders: ImageItem[] = Array(imageUrls.length).fill(null).map((_, i) => ({
          url: "",
          originalUrl: imageUrls[i],
          loaded: false,
        }));
        setImageItems(placeholders);

        const initialLoad = Math.min(PRELOAD_COUNT, imageUrls.length);
        const newItems: ImageItem[] = [...placeholders];
        for (let i = 0; i < initialLoad; i++) {
          const item = await loadImage(imageUrls[i], i);
          newItems[i] = item;
        }
        setImageItems(newItems);

        await initDatabase();
        await ReadHistory.create({
          id: generateUUID(),
          mangaId: mangaId!,
          chapterId: targetChapterId,
          page: 0,
          readAt: Date.now(),
        });

        navigate("reader", { mangaId: mangaId || "", chapterId: targetChapterId });
      } catch (e: any) {
        setError("加载章节失败: " + e.message);
      } finally {
        setLoading(false);
      }
    },
    [manga, chapters, mangaId, loadImage]
  );

  const toggleWebtoonMode = useCallback(() => {
    const newSettings = { ...settings, webtoonMode: !settings.webtoonMode };
    setSettings(newSettings);
    saveSettings(newSettings);
  }, [settings, setSettings]);

  const handleBack = () => {
    if (mangaId) {
      navigate("manga", { id: mangaId });
    } else {
      navigate("explore");
    }
  };

  useEffect(() => {
    if (!mangaId || !chapterId) {
      setLoading(false);
      return;
    }

    const loadData = async () => {
      setLoading(true);
      setError("");

      try {
        await initDatabase();
        await initPluginSystem();
        await restorePluginsFromStorage();
        await waitForDatabase();

        let mangaData = mangaId ? await Manga.findById(mangaId) : null;
        let actualPluginKey = pluginKey || "";
        let actualExternalId = "";

        if (mangaData) {
          actualPluginKey = mangaData.pluginId || pluginKey || "";
          actualExternalId = mangaData.externalId || "";
        } else if (mangaId) {
          if (mangaId.includes(":")) {
            const parts = mangaId.split(":");
            actualPluginKey = parts[0] || pluginKey || "";
            actualExternalId = parts[1] || "";
          } else {
            actualExternalId = mangaId;
          }

          if (actualPluginKey && actualExternalId) {
            const cached = await loadMangaCache(actualPluginKey, actualExternalId);
            if (cached) {
              mangaData = cached as MangaRecord;
              mangaData.pluginId = actualPluginKey;
              mangaData.externalId = actualExternalId;
            }
          }

          if (!mangaData && actualExternalId) {
            mangaData = {
              id: mangaId,
              pluginId: actualPluginKey || "",
              externalId: actualExternalId,
              title: actualExternalId,
            } as MangaRecord;
          }
        }

        setManga(mangaData as MangaRecord);

        const chapterList = await ChapterList.findOne({ where: { mangaId } });
        let memoryChapters: MemoryChapter[] = [];

        if (chapterList) {
          memoryChapters = (chapterList as ChapterListRecord).chapters;
        }

        if (memoryChapters.length === 0 && actualExternalId) {
          const { getCacheIndex } = await import("../../fs/cache-index");
          const cacheIndex = getCacheIndex();
          const cacheInfo = await cacheIndex.getMangaCacheInfo(actualExternalId);
          if (cacheInfo && cacheInfo.chapters.length > 0) {
            memoryChapters = cacheInfo.chapters.map((ch) => ({
              id: ch.chapterId,
              title: ch.chapterTitle,
              number: parseInt(ch.chapterId.replace("chapter-", "") || "0", 10),
              isRead: false,
            }));
          }
        }

        if (memoryChapters.length === 0 && actualPluginKey && actualExternalId) {
          try {
            const detail = await getComicDetail(actualPluginKey, actualExternalId);
            if (detail?.chapters) {
              const chaptersData = detail.chapters;
              if (chaptersData instanceof Map) {
                let idx = 0;
                chaptersData.forEach((title: string, id: string) => {
                  const extId = actualExternalId ? `${id}/${actualExternalId}` : id;
                  memoryChapters.push({ id: extId, title, number: idx + 1 });
                  idx++;
                });
              } else if (Array.isArray(chaptersData)) {
                chaptersData.forEach((ch: any, idx: number) => {
                  const extId = actualExternalId ? `${ch.id}/${actualExternalId}` : ch.id;
                  memoryChapters.push({
                    id: extId,
                    title: ch.title,
                    number: ch.number || idx + 1,
                  });
                });
              } else if (typeof chaptersData === "object" && chaptersData !== null) {
                let idx = 0;
                for (const [id, title] of Object.entries(chaptersData)) {
                  const extId = actualExternalId ? `${id}/${actualExternalId}` : id;
                  memoryChapters.push({ id: extId, title: title as string, number: idx + 1 });
                  idx++;
                }
              }
            }
          } catch (e) {
            console.error("[Reader] Failed to get comic detail:", e);
          }
        }

        let currentCh = memoryChapters.find((ch) => ch.id === chapterId);
        if (!currentCh && mangaData) {
          const chapterIdParts = chapterId?.split("/") || [];
          const simpleChapterId = chapterIdParts[0] || chapterId;
          const chapterNumber = simpleChapterId.replace("chapter-", "") || simpleChapterId;
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

        let imageUrls: string[] = [];
        const cached = await getCachedChapterImages(chapterId);
        if (cached && cached.length > 0) {
          imageUrls = cached;
        } else if (mangaData?.pluginId && mangaData?.externalId) {
          imageUrls = await getChapterImages(
            mangaData.pluginId,
            mangaData.externalId,
            chapterId
          );
          await cacheChapterImages(chapterId, imageUrls);
        }

        if (imageUrls.length > 0) {
          setImages(imageUrls);
          const placeholders: ImageItem[] = Array(imageUrls.length).fill(null).map((_, i) => ({
            url: "",
            originalUrl: imageUrls[i],
            loaded: false,
          }));
          setImageItems(placeholders);
          const initialLoad = Math.min(PRELOAD_COUNT, imageUrls.length);
          for (let i = 0; i < initialLoad; i++) {
            const item = await loadImage(imageUrls[i], i);
            placeholders[i] = item;
          }
          setImageItems([...placeholders]);
        }

        if (page !== undefined && page !== "") {
          const pageNum = parseInt(page, 10);
          if (!isNaN(pageNum) && pageNum >= 0) {
            setCurrentPage(pageNum);
            saveProgress(pageNum);
            if (settings.webtoonMode) {
              setShouldScrollToPage(true);
            }
          }
        } else if (mangaId && chapterId) {
          const history = await ReadHistory.findOne({ where: { mangaId, chapterId } });
          if (history) {
            setCurrentPage((history as any).page || 0);
            if (settings.webtoonMode) {
              setShouldScrollToPage(true);
            }
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
  }, [mangaId, chapterId, page]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        settings.readingDirection === "rtl" ? handleNextPage() : handlePrevPage();
      } else if (e.key === "ArrowRight") {
        settings.readingDirection === "rtl" ? handlePrevPage() : handleNextPage();
      } else if (e.key === " " || e.key === "Enter") {
        setShowControls((v) => !v);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [settings.readingDirection]);

  if (loading) {
    return (
      <div class="h-full flex items-center justify-center bg-[#0a0a0f] text-white">
        <div class="text-center">
          <div class="w-8 h-8 border-2 border-[#e94560] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p>加载中...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div class="h-full flex items-center justify-center bg-[#0a0a0f] text-white">
        <div class="text-center">
          <p class="text-red-500 mb-4">{error}</p>
          <button onClick={handleBack} class="px-4 py-2 bg-[#e94560] rounded-lg">
            返回
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} class="h-full flex flex-col bg-[#0a0a0f] text-white relative overflow-hidden">
      <TopBar
        manga={manga}
        chapter={chapter}
        show={showControls}
        onBack={handleBack}
        onChapterList={() => setShowChapterList(true)}
        onWebtoonMode={() => setShowWebtoonModal(true)}
      />

      <ImageViewer
        ref={containerRef}
        imageItems={imageItems}
        currentPage={currentPage}
        readingDirection={settings.readingDirection}
        webtoonMode={settings.webtoonMode}
        onTap={handleTap}
        onWebtoonScroll={(page) => {
          setCurrentPage(page);
          saveProgress(page);
        }}
      />

      <BottomBar
        currentPage={currentPage}
        totalPages={images.length}
        show={showControls}
        onSeek={handleSeek}
        onPrevPage={handlePrevPage}
        onNextPage={handleNextPage}
        webtoonMode={settings.webtoonMode}
        onScrollToPage={(page) => {
          const el = containerRef.current;
          if (el) {
            const images = el.querySelectorAll('.webtoon-image');
            if (images[page]) {
              (images[page] as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          }
        }}
      />

      <ChapterListModal
        chapters={chapters}
        currentChapterId={chapter?.id || ""}
        reverseOrder={chapterReverseOrder}
        show={showChapterList}
        onSelect={(id) => { goToChapter(id); setShowChapterList(false); }}
        onClose={() => setShowChapterList(false)}
        onToggleReverse={() => setChapterReverseOrder(!chapterReverseOrder)}
      />

      <WebtoonModeModal
        show={showWebtoonModal}
        enabled={settings.webtoonMode}
        onToggle={toggleWebtoonMode}
        onClose={() => setShowWebtoonModal(false)}
      />
    </div>
  );
}
