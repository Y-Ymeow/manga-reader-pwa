import { useState, useEffect } from "preact/hooks";
import { navigate } from "@routes/index";
import { Button } from "@components/ui/Button";
import {
  getPlugin,
  getComicDetail,
  getChapterImages,
  type ComicDetail as PluginComicDetail,
} from "@plugins/index";
import { Manga, Category, ChapterList, Cache } from "@db/index";
import { getCacheManager } from "../fs/cache-manager";
import { getCacheQueue } from "../fs/cache-queue";
import { getCacheIndex } from "../fs/cache-index";
import { requestManager } from "../plugins/runtimes/NetworkClass";
import type { MangaRecord, CategoryRecord, ChapterListRecord } from "@db/index";
import { waitForDatabase } from "@db/global";
import {
  loadMangaCache,
  saveMangaCache,
  deleteMangaCache,
  deleteMangaCacheWithSuffix,
  clearPluginMangaCache,
  clearPluginData,
} from "@plugins/storage";

interface MangaDetailProps {
  mangaId?: string;
  onBack?: () => void;
}

// 内存中的章节类型
interface MemoryChapter {
  id: string;
  title: string;
  number: number;
  isRead?: boolean;
}

// 从插件详情提取章节
function extractChapters(
  chaptersData: Map<string, string> | Record<string, string> | any[],
  mangaExternalId?: string,
): MemoryChapter[] {
  const chapters: MemoryChapter[] = [];

  if (chaptersData instanceof Map) {
    let idx = 0;
    chaptersData.forEach((title, id) => {
      const externalId = mangaExternalId ? `${id}/${mangaExternalId}` : id;
      chapters.push({ id: externalId, title, number: idx + 1 });
      idx++;
    });
  } else if (Array.isArray(chaptersData)) {
    chaptersData.forEach((ch, idx) => {
      const externalId = mangaExternalId
        ? `${ch.id}/${mangaExternalId}`
        : ch.id;
      chapters.push({
        id: externalId,
        title: ch.title,
        number: ch.number || idx + 1,
      });
    });
  } else if (typeof chaptersData === "object" && chaptersData !== null) {
    let idx = 0;
    for (const [id, title] of Object.entries(chaptersData)) {
      const externalId = mangaExternalId ? `${id}/${mangaExternalId}` : id;
      chapters.push({
        id: externalId,
        title: title as string,
        number: idx + 1,
      });
      idx++;
    }
  }

  return chapters;
}

export function MangaDetail({ mangaId, onBack }: MangaDetailProps) {
  const [manga, setManga] = useState<MangaRecord | null>(null);
  const [chapters, setChapters] = useState<MemoryChapter[]>([]);
  const [pluginManga, setPluginManga] = useState<PluginComicDetail | null>(
    null,
  );
  const [isFavorite, setIsFavorite] = useState(false);
  const [showAllChapters, setShowAllChapters] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [showCategorySelect, setShowCategorySelect] = useState(false);
  const [chapterReverseOrder, setChapterReverseOrder] = useState(() => {
    // 从 localStorage 读取上次的排序设置
    try {
      const stored = localStorage.getItem("manga_chapter_order");
      return stored === "reverse";
    } catch {
      return false;
    }
  });
  const [isUpdating, setIsUpdating] = useState(false);
  const [isCaching, setIsCaching] = useState(false);
  const [cacheProgress, setCacheProgress] = useState(0);
  const [cacheStatus, setCacheStatus] = useState("");
  const [cachingChapterId, setCachingChapterId] = useState<string | null>(null);
  const [singleCacheProgress, setSingleCacheProgress] = useState({
    current: 0,
    total: 0,
  });
  const [cachedChapters, setCachedChapters] = useState<Set<string>>(new Set());

  // 解析 mangaId
  const isPluginManga = mangaId?.includes(":");
  const [pluginKey, comicId] = isPluginManga
    ? [mangaId!.split(":")[0], mangaId!.split(":")[1]]
    : [null, null];

  // 从数据库记录中获取插件信息（用于书架漫画）
  const getPluginInfo = async () => {
    if (isPluginManga && pluginKey && comicId) {
      return { pluginKey, comicId };
    }
    // 书架漫画，从数据库记录获取
    if (manga?.pluginId && manga.externalId) {
      return { pluginKey: manga.pluginId, comicId: manga.externalId };
    }
    return null;
  };

  useEffect(() => {
    if (!mangaId) {
      setLoading(false);
      return;
    }

    const loadData = async () => {
      setLoading(true);
      setError("");

      try {
        await waitForDatabase();

        if (isPluginManga && pluginKey && comicId) {
          // 先尝试从缓存加载
          const cached = await loadMangaCache(pluginKey, comicId);

          let detail: PluginComicDetail;

          if (cached) {
            // 使用缓存数据
            detail = cached as PluginComicDetail;
          } else {
            // 从插件加载
            detail = await getComicDetail(pluginKey, comicId);
            // 保存到缓存（1小时）
            await saveMangaCache(pluginKey, comicId, detail, 60 * 60 * 1000);
          }

          setPluginManga(detail);

          // 提取章节
          if (detail.chapters) {
            const memoryChapters = extractChapters(detail.chapters, comicId);
            setChapters(memoryChapters);
          }

          // 检查是否已收藏
          const existing = await Manga.findOne({
            where: { pluginId: pluginKey, externalId: comicId },
          });

          if (existing) {
            setManga(existing as MangaRecord);
            setIsFavorite(true);

            // 加载已保存的章节列表
            const chapterList = await ChapterList.findOne({
              where: { mangaId: (existing as MangaRecord).id },
            });

            if (
              chapterList &&
              (chapterList as ChapterListRecord).chapters.length > 0
            ) {
              // 合并阅读状态
              const savedChapters = (chapterList as ChapterListRecord).chapters;
              const mergedChapters = savedChapters.map((ch) => ({
                ...ch,
                isRead: ch.isRead || false,
              }));
              setChapters(mergedChapters);
            }
            // 如果数据库中没有章节，保持使用插件加载的章节
          }
        } else {
          // 从本地加载
          const localManga = await Manga.findById(mangaId);
          if (localManga) {
            setManga(localManga as MangaRecord);
            setIsFavorite((localManga as MangaRecord).isFavorite);

            // 加载章节列表
            const chapterList = await ChapterList.findOne({
              where: { mangaId },
            });

            if (chapterList) {
              setChapters((chapterList as ChapterListRecord).chapters);
            }
          }
        }
      } catch (e: any) {
        setError(e.message || "加载失败");
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [mangaId, isPluginManga, pluginKey, comicId]);

  // 加载分类
  useEffect(() => {
    const loadCategories = async () => {
      try {
        const cats = await Category.findMany({ sort: 'sort' });
        setCategories(cats as CategoryRecord[]);
      } catch (e) {
        console.error("Failed to load categories:", e);
      }
    };
    loadCategories();
  }, []);

  // 检查章节缓存状态
  useEffect(() => {
    const checkCacheStatus = async () => {
      if (!manga?.externalId || chapters.length === 0) return;

      const cacheIndex = getCacheIndex();

      // 从缓存索引中读取已缓存的章节
      const cachedChapterIds = await cacheIndex.getCachedChapterIds(
        manga.externalId,
      );
      setCachedChapters(new Set(cachedChapterIds));
    };

    checkCacheStatus();
  }, [manga?.externalId, chapters]);

  const handleAddToShelf = async (categoryId?: string) => {
    if (!pluginManga || !pluginKey || !comicId) return;

    try {
      // 转换标签
      let genres: string[] = [];
      if (pluginManga.tags) {
        if (Array.isArray(pluginManga.tags)) {
          genres = pluginManga.tags;
        } else if (typeof pluginManga.tags === "object") {
          genres = Object.values(pluginManga.tags)
            .flat()
            .filter((v): v is string => typeof v === "string");
        }
      }

      // 提取作者
      let author = "";
      if (
        pluginManga.tags &&
        typeof pluginManga.tags === "object" &&
        "作者" in pluginManga.tags
      ) {
        const authors = pluginManga.tags["作者"];
        if (Array.isArray(authors)) {
          author = authors.join(", ");
        } else if (typeof authors === "string") {
          author = authors;
        }
      }

      const now = Date.now();
      const newMangaId = generateUUID();

      // 保存漫画
      const newManga = await Manga.create({
        id: newMangaId,
        title: pluginManga.title,
        cover: pluginManga.cover,
        description: pluginManga.description || "",
        author: author || pluginManga.author || "",
        status: pluginManga.status || "",
        genres: genres,
        pluginId: pluginKey,
        externalId: comicId,
        sourceUrl: "",
        isFavorite: true,
        favoriteAt: now,
        categoryId: categoryId,
        createdAt: now,
        updatedAt: now,
      });

      // 保存章节列表（JSON 格式）
      await ChapterList.create({
        id: generateUUID(),
        mangaId: newMangaId,
        chapters: chapters.map((ch) => ({
          id: ch.id,
          title: ch.title,
          number: ch.number,
          isRead: false,
          fetchedAt: now, // 记录获取时间
        })),
        updatedAt: now,
      });

      setManga(newManga);
      setIsFavorite(true);
      setShowCategorySelect(false);
    } catch (e) {
      console.error("Failed to add to shelf:", e);
      alert("添加失败");
    }
  };

  const handleRemoveFromShelf = async () => {
    if (!manga) return;

    try {
      // 删除章节列表
      const chapterList = await ChapterList.findOne({
        where: { mangaId: manga.id },
      });
      if (chapterList) {
        await ChapterList.delete((chapterList as ChapterListRecord).id);
      }
      // 删除漫画
      await Manga.delete(manga.id);

      setManga(null);
      setIsFavorite(false);
    } catch (e) {
      console.error("Failed to remove from shelf:", e);
    }
  };

  const handleRead = (chapterId?: string) => {
    const targetChapterId = chapterId || chapters[0]?.id;
    if (!targetChapterId) return;

    // 导航到阅读器
    // 对于插件漫画，使用 mangaId:comicId 格式
    // 对于本地漫画，使用本地 ID
    const readerMangaId = manga?.id || mangaId!;

    navigate("reader", {
      mangaId: readerMangaId,
      chapterId: targetChapterId,
      pluginKey: pluginKey ?? "",
    });
  };

  const handleBack = () => {
    // 使用传入的 onBack 回调（由路由控制）
    if (onBack) {
      onBack();
    } else {
      // 降级处理：直接返回书架
      navigate("home");
    }
  };

  // 更新漫画信息
  const handleUpdate = async () => {
    if (!manga) return;

    // 获取插件信息
    const pluginInfo = await getPluginInfo();
    if (!pluginInfo) {
      alert("无法更新：缺少插件信息");
      return;
    }

    const { pluginKey, comicId } = pluginInfo;

    setIsUpdating(true);
    try {
      // 清除插件的缓存数据
      await clearPluginData(pluginKey);
      await clearPluginMangaCache(pluginKey);

      // 清除漫画详情缓存
      await deleteMangaCache(pluginKey, comicId);

      // 重新获取漫画详情
      const detail = await getComicDetail(pluginKey, comicId);

      // 更新漫画信息
      await Manga.update(manga.id, {
        title: detail.title,
        cover: detail.cover,
        description: detail.description || "",
        updatedAt: Date.now(),
      });

      // 更新章节列表
      if (detail.chapters) {
        const newChapters = extractChapters(detail.chapters, comicId);
        const chapterList = await ChapterList.findOne({
          where: { mangaId: manga.id },
        });
        if (chapterList) {
          // 合并阅读状态
          const existingChapters = (chapterList as ChapterListRecord).chapters;
          const now = Date.now();
          const mergedChapters = newChapters.map((newCh) => {
            const existing = existingChapters.find((ec) => ec.id === newCh.id);
            return {
              ...newCh,
              isRead: existing?.isRead || false,
              readAt: existing?.readAt,
              fetchedAt: existing?.fetchedAt || now, // 保留原有的获取时间，新章节使用当前时间
            };
          });
          await ChapterList.update((chapterList as ChapterListRecord).id, {
            chapters: mergedChapters,
            updatedAt: now,
          });
          setChapters(mergedChapters);
        }
      }

      // 更新显示数据
      setManga({ ...manga, updatedAt: Date.now() });
      setPluginManga(detail); // 更新插件漫画数据，使 UI 显示最新内容

      // 更新缓存（1 小时）
      await saveMangaCache(pluginKey, comicId, detail, 60 * 60 * 1000);

      alert("更新成功");
    } catch (e: any) {
      console.error("Update failed:", e);
      alert("更新失败: " + e.message);
    } finally {
      setIsUpdating(false);
    }
  };

  // 缓存所有章节图片 - 使用队列系统
  const handleCacheChapters = async () => {
    const actualPluginId = manga?.pluginId;
    const actualExternalId = manga?.externalId;
    const mangaTitle = manga?.title || "未知漫画";

    if (!actualPluginId || !actualExternalId) {
      alert("无法缓存：缺少插件信息");
      return;
    }

    // 添加到队列
    const cacheQueue = getCacheQueue();
    const { taskId, isNew } = cacheQueue.addTask(
      actualPluginId,
      actualExternalId,
      mangaTitle,
      chapters.map((ch) => ({ id: ch.id, title: ch.title })),
      "normal",
    );

    if (!isNew) {
      alert(`该漫画已在缓存队列中\n任务ID: ${taskId.slice(0, 16)}...`);
      return;
    }

    alert(
      `已添加到缓存队列\n任务ID: ${taskId.slice(0, 16)}...\n同一漫画源会按顺序缓存，避免触发反爬`,
    );

    // 订阅队列状态更新
    const unsubscribe = cacheQueue.subscribe((tasks) => {
      const task = tasks.find((t) => t.id === taskId);
      if (task) {
        if (task.status === "running") {
          setIsCaching(true);
          const progress =
            task.progress.totalImages > 0
              ? Math.round(
                  ((task.progress.cachedImages + task.progress.skippedImages) /
                    task.progress.totalImages) *
                    100,
                )
              : 0;
          setCacheProgress(progress);
          setCacheStatus(
            `队列中: ${task.progress.currentChapter}/${task.progress.totalChapters} 章 (${task.progress.cachedImages} 张)`,
          );
        } else if (task.status === "completed") {
          setIsCaching(false);
          setCacheProgress(100);
          setCacheStatus("已完成");
          // 更新已缓存章节列表
          setCachedChapters(new Set(chapters.map((ch) => ch.id)));
          unsubscribe();
          alert(
            `缓存完成\n${mangaTitle}\n共 ${task.progress.cachedImages} 张图片`,
          );
        } else if (task.status === "failed") {
          setIsCaching(false);
          setCacheStatus("失败");
          unsubscribe();
          alert(`缓存失败: ${task.error}`);
        }
      }
    });
  };

  // 缓存单个章节 - 使用队列系统（高优先级）
  const handleCacheSingleChapter = async (chapter: MemoryChapter) => {
    const actualPluginId = manga?.pluginId;
    const actualExternalId = manga?.externalId;
    const mangaTitle = manga?.title || "未知漫画";

    if (!actualPluginId || !actualExternalId) {
      alert("无法缓存：缺少插件信息");
      return;
    }

    // 添加到队列（高优先级）
    const cacheQueue = getCacheQueue();
    const { taskId, isNew } = cacheQueue.addTask(
      actualPluginId,
      actualExternalId,
      `${mangaTitle} - ${chapter.title}`,
      [{ id: chapter.id, title: chapter.title }],
      "high",
    );

    if (!isNew) {
      alert(`该章节已在缓存队列中`);
      return;
    }

    setCachingChapterId(chapter.id);

    // 订阅状态更新
    const unsubscribe = cacheQueue.subscribe((tasks) => {
      const task = tasks.find((t) => t.id === taskId);
      if (task) {
        if (task.status === "running") {
          setSingleCacheProgress({
            current: task.progress.cachedImages + task.progress.skippedImages,
            total: task.progress.totalImages,
          });
        } else if (task.status === "completed") {
          setCachingChapterId(null);
          setCachedChapters((prev) => new Set([...prev, chapter.id]));
          unsubscribe();
          alert(`章节缓存完成\n共 ${task.progress.cachedImages} 张图片`);
        } else if (task.status === "failed") {
          setCachingChapterId(null);
          unsubscribe();
          alert(`缓存失败: ${task.error}`);
        }
      }
    });
  };

  // 删除章节缓存
  const handleDeleteChapterCache = async (chapter: MemoryChapter) => {
    if (!manga?.externalId) return;

    if (!confirm(`确定要删除「${chapter.title}」的缓存吗？`)) {
      return;
    }

    // 删除文件缓存
    const cacheQueue = getCacheQueue();
    const success = await cacheQueue.deleteChapterCache(
      manga.externalId,
      chapter.id,
    );

    if (success) {
      // 删除缓存索引
      const cacheIndex = getCacheIndex();
      await cacheIndex.removeChapterCache(manga.externalId, chapter.id);

      setCachedChapters((prev) => {
        const next = new Set(prev);
        next.delete(chapter.id);
        return next;
      });
      alert("缓存已删除");
    } else {
      alert("删除缓存失败");
    }
  };

  // 标记章节已读/未读
  const handleToggleRead = async (chapter: MemoryChapter) => {
    if (!manga) return;

    try {
      // 找到章节列表记录
      const chapterList = await ChapterList.findOne({
        where: { mangaId: manga.id },
      });

      if (chapterList) {
        const chapters = (chapterList as ChapterListRecord).chapters;
        const updatedChapters = chapters.map((ch) =>
          ch.id === chapter.id
            ? {
                ...ch,
                isRead: !ch.isRead,
                readAt: !ch.isRead ? Date.now() : undefined,
              }
            : ch,
        );

        await ChapterList.update((chapterList as ChapterListRecord).id, {
          chapters: updatedChapters,
          updatedAt: Date.now(),
        });

        // 更新本地状态
        setChapters((prev) =>
          prev.map((ch) =>
            ch.id === chapter.id ? { ...ch, isRead: !ch.isRead } : ch,
          ),
        );
      }
    } catch (e) {
      console.error("Failed to toggle read status:", e);
      alert("操作失败");
    }
  };

  // 获取排序后的章节
  const getSortedChapters = () => {
    if (chapterReverseOrder) {
      return [...chapters].reverse();
    }
    return chapters;
  };

  if (loading) {
    return (
      <div class="flex items-center justify-center h-full">
        <p class="text-gray-400">加载中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div class="flex flex-col items-center justify-center h-full p-4">
        <p class="text-gray-400">{error}</p>
        <Button variant="secondary" className="mt-4" onClick={handleBack}>
          返回
        </Button>
      </div>
    );
  }

  const displayManga = manga || pluginManga;
  if (!displayManga && !isPluginManga) {
    // 只有本地漫画不存在时才显示错误
    return (
      <div class="flex flex-col items-center justify-center h-full p-4">
        <p class="text-gray-400">漫画不存在</p>
        <Button variant="secondary" className="mt-4" onClick={handleBack}>
          返回
        </Button>
      </div>
    );
  }

  // 插件漫画还在加载中
  if (isPluginManga && !pluginManga) {
    return (
      <div class="flex items-center justify-center h-full">
        <p class="text-gray-400">加载中...</p>
      </div>
    );
  }

  // 获取标签：优先从 manga.genres，否则从 pluginManga.tags
  const genres =
    manga?.genres ||
    (pluginManga?.tags && Array.isArray(pluginManga.tags)
      ? pluginManga.tags
      : []) ||
    [];
  const uniqueGenres = [...new Set(genres)];

  return (
    <div class="min-h-full pb-4">
      {/* Back button */}
      <button
        onClick={handleBack}
        class="fixed top-4 left-4 z-20 p-2 bg-black/50 rounded-full text-white"
      >
        ←
      </button>

      {/* Header */}
      <div class="relative">
        <div class="h-48 bg-linear-to-b from-[#0f3460] to-[#1a1a2e]" />
        <div class="absolute -bottom-16 left-4 flex gap-4">
          <img
            src={displayManga?.cover}
            alt={displayManga?.title}
            class="w-32 h-48 object-cover rounded-lg shadow-lg bg-[#16213e]"
          />
        </div>
      </div>

      {/* Info */}
      <div class="mt-20 px-4">
        <h1 class="text-2xl font-bold text-white">{displayManga?.title}</h1>
        <p class="text-sm text-gray-400 mt-1">{displayManga?.author}</p>
        <div class="flex flex-wrap gap-2 mt-2">
          {uniqueGenres.map((genre, index) => (
            <span
              key={`${genre}-${index}`}
              class="px-2 py-0.5 text-xs bg-[#0f3460] text-gray-300 rounded"
            >
              {genre}
            </span>
          ))}
        </div>

        {/* Actions */}
        <div class="flex gap-3 mt-4">
          <Button onClick={() => handleRead()} className="flex-1">
            开始阅读
          </Button>
          {isFavorite ? (
            <>
              <Button
                variant="secondary"
                onClick={handleUpdate}
                disabled={isUpdating}
              >
                {isUpdating ? "更新中..." : "更新"}
              </Button>
              <Button variant="secondary" onClick={handleRemoveFromShelf}>
                已收藏
              </Button>
            </>
          ) : (
            <Button
              variant="secondary"
              onClick={() => setShowCategorySelect(true)}
            >
              添加到书架
            </Button>
          )}
        </div>

        {/* Description */}
        {displayManga?.description && (
          <div class="mt-6">
            <h2 class="text-lg font-semibold text-white">简介</h2>
            <p class="text-sm text-gray-400 mt-2 leading-relaxed">
              {displayManga?.description}
            </p>
          </div>
        )}

        {/* Chapters */}
        <div class="mt-6">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <h2 class="text-lg font-semibold text-white">章节列表</h2>
              <span class="text-sm text-gray-400">共 {chapters.length} 话</span>
            </div>
            <div class="flex items-center gap-2">
              {/* 缓存按钮 */}
              {isFavorite && (
                <button
                  onClick={handleCacheChapters}
                  disabled={isCaching}
                  class="px-3 py-1.5 text-sm bg-[#0f3460] text-white rounded-lg hover:bg-[#1a4a7a] disabled:opacity-50 flex flex-col items-center min-w-[80px]"
                  title="缓存所有章节图片以便离线阅读"
                >
                  {isCaching ? (
                    <>
                      <span class="flex items-center gap-1">
                        <span class="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        {cacheProgress}%
                      </span>
                      <span class="text-[10px] opacity-75 truncate max-w-[100px]">
                        {cacheStatus}
                      </span>
                    </>
                  ) : (
                    <>
                      <span class="flex items-center gap-1">
                        <span>💾</span>
                        <span>缓存全部</span>
                      </span>
                    </>
                  )}
                </button>
              )}
              {/* 排序按钮 */}
              <button
                onClick={() => {
                  const newOrder = !chapterReverseOrder;
                  setChapterReverseOrder(newOrder);
                  // 保存到 localStorage
                  localStorage.setItem(
                    "manga_chapter_order",
                    newOrder ? "reverse" : "normal",
                  );
                }}
                class="px-3 py-1.5 text-sm bg-[#16213e] text-gray-300 rounded-lg hover:text-white"
              >
                {chapterReverseOrder ? "正序" : "倒序"}
              </button>
            </div>
          </div>

          <div class="mt-3 space-y-1">
            {getSortedChapters()
              .slice(0, showAllChapters ? undefined : 10)
              .map((chapter) => (
                <div
                  key={chapter.id}
                  class={`flex items-center justify-between px-4 py-3 rounded-lg ${
                    chapter.isRead
                      ? "bg-[#16213e]/50 text-gray-500"
                      : "bg-[#16213e] text-white"
                  }`}
                >
                  <button
                    onClick={() => handleRead(chapter.id)}
                    class="flex-1 text-left text-sm hover:text-[#e94560] transition-colors"
                  >
                    {chapter.title}
                  </button>
                  <div class="flex items-center gap-2">
                    {/* 缓存/删除缓存按钮 */}
                    {isFavorite && (
                      <>
                        {cachedChapters.has(chapter.id) ? (
                          <button
                            onClick={() => handleDeleteChapterCache(chapter)}
                            class="px-2 py-1 text-xs bg-red-900/50 text-red-200 rounded hover:bg-red-800/50 min-w-[40px]"
                            title="删除缓存"
                          >
                            🗑️
                          </button>
                        ) : (
                          <button
                            onClick={() => handleCacheSingleChapter(chapter)}
                            disabled={cachingChapterId === chapter.id}
                            class="px-2 py-1 text-xs bg-[#0f3460] text-white rounded hover:bg-[#1a4a7a] disabled:opacity-50 flex flex-col items-center min-w-[40px]"
                            title="缓存本章节"
                          >
                            {cachingChapterId === chapter.id ? (
                              <>
                                <span class="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                <span class="text-[8px]">
                                  {singleCacheProgress.current}/
                                  {singleCacheProgress.total}
                                </span>
                              </>
                            ) : (
                              "💾"
                            )}
                          </button>
                        )}
                      </>
                    )}
                    {/* 标记已读/未读按钮 */}
                    {isFavorite && (
                      <button
                        onClick={() => handleToggleRead(chapter)}
                        class={`px-2 py-1 text-xs rounded min-w-[40px] ${
                          chapter.isRead
                            ? "bg-gray-700 text-gray-400 hover:bg-gray-600"
                            : "bg-green-900/50 text-green-200 hover:bg-green-800/50"
                        }`}
                        title={chapter.isRead ? "标记为未读" : "标记为已读"}
                      >
                        {chapter.isRead ? "✓" : "○"}
                      </button>
                    )}
                    {chapter.isRead && (
                      <span class="text-xs text-gray-500">已读</span>
                    )}
                  </div>
                </div>
              ))}
          </div>

          {!showAllChapters && chapters.length > 10 && (
            <button
              onClick={() => setShowAllChapters(true)}
              class="w-full mt-3 py-2 text-sm text-[#e94560] hover:text-[#d63d56]"
            >
              显示全部 {chapters.length} 话
            </button>
          )}
        </div>
      </div>

      {/* Category Select Modal */}
      {showCategorySelect && (
        <div
          class="fixed inset-0 z-30 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setShowCategorySelect(false)}
        >
          <div
            class="bg-[#1a1a2e] rounded-xl w-full max-w-sm p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 class="text-xl font-bold text-white mb-4">选择分类</h2>
            <div class="space-y-2">
              <button
                onClick={() => handleAddToShelf()}
                class="w-full py-3 px-4 bg-[#0f3460] text-white rounded-lg text-left hover:bg-[#1a4a7a]"
              >
                默认分类
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => handleAddToShelf(cat.id)}
                  class="w-full py-3 px-4 bg-[#0f3460] text-white rounded-lg text-left hover:bg-[#1a4a7a]"
                >
                  {cat.name}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowCategorySelect(false)}
              class="w-full mt-4 py-2 bg-gray-700 text-white rounded-lg"
            >
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
