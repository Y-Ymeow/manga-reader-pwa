import { useState, useEffect, useRef } from "preact/hooks";
import { MangaCard } from "@components/manga/MangaCard";
import { MangaGrid } from "@components/manga/MangaGrid";
import { Button } from "@components/ui/Button";
import { navigate, useRoute } from "@routes/index";
import {
  initPluginSystem,
  getPlugins,
  getPlugin,
  getExploreData,
  getCategoryData,
  getCategoryComics,
  restorePluginsFromStorage,
  type PluginInstance,
  type Comic,
} from "@plugins/index";
import { initDatabase } from "@db/index";
import { pageStateActions } from "@state/page-state";

export function Explore() {
  const { params } = useRoute();
  const [plugins, setPlugins] = useState<PluginInstance[]>([]);
  const [selectedPlugin, setSelectedPlugin] = useState<PluginInstance | null>(
    null,
  );
  const [comics, setComics] = useState<Comic[]>([]);
  const [maxPage, setMaxPage] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [viewMode, setViewMode] = useState<"explore" | "category">("explore");
  const [categoryData, setCategoryData] = useState<any>(null);
  const [selectedCategory, setSelectedCategory] = useState<{
    name: string;
    param?: string;
  } | null>(null);
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
  const [optionList, setOptionList] = useState<any[]>([]);
  const tabContainerRef = useRef<HTMLDivElement>(null);
  const [restore, setRestore] = useState(false);
  // 每次状态变化时，保存到 pageState
  useEffect(() => {
    if (!selectedPlugin) return;

    pageStateActions.setPageState("explore", {
      selectedPluginKey: selectedPlugin.key,
      pluginName: selectedPlugin.name,
      comics,
      maxPage,
      currentPage,
      hasMore,
      viewMode,
      selectedCategory,
      categoryOptions,
      categoryData,
      optionList,
    });
  }, [
    selectedPlugin,
    comics,
    maxPage,
    currentPage,
    hasMore,
    viewMode,
    selectedCategory,
    categoryOptions,
    categoryData,
    optionList,
  ]);

  useEffect(() => {
    const init = async () => {
      try {
        await initDatabase();
        await initPluginSystem();
        await restorePluginsFromStorage();
        const loadedPlugins = getPlugins();
        setPlugins(loadedPlugins);

        // 如果是从历史记录返回，恢复状态
        if (params?.restore === "true" && params?.pluginKey) {
          setRestore(true);
          const savedState = pageStateActions.getPageState("explore");
          if (
            savedState?.selectedPluginKey === params.pluginKey &&
            savedState?.comics?.length > 0
          ) {
            const plugin = loadedPlugins.find(
              (p) => p.key === params.pluginKey,
            );
            if (plugin) {
              setSelectedPlugin(plugin);
              setComics(savedState.comics);
              setMaxPage(savedState.maxPage);
              setCurrentPage(savedState.currentPage);
              setHasMore(savedState.hasMore);
              setViewMode(savedState.viewMode);
              setSelectedCategory(savedState.selectedCategory);
              setCategoryOptions(savedState.categoryOptions);
              setCategoryData(savedState.categoryData);
              setOptionList(savedState.optionList);
            }
          }
        }
      } catch (e) {
        console.error("Failed to initialize:", e);
      } finally {
      }
    };
    init();
  }, [params?.restore, params?.pluginKey]);

  useEffect(() => {
    if (!selectedPlugin) return;

    const loadCategory = async () => {
      try {
        const catData = await getCategoryData(selectedPlugin.key);
        setCategoryData(catData);
      } catch (e) {
        console.error("Failed to load category:", e);
        setCategoryData(null);
      }
    };

    if (viewMode === "category") {
      loadCategory();
    }

    if (viewMode !== "explore") return;

    const loadExplore = async () => {
      if (restore) {
        setRestore(false);
        return;
      }
      setComics([]);
      setLoading(true);
      setError("");
      setCurrentPage(1);
      try {
        const explorePages = selectedPlugin.explore || [];
        if (explorePages.length === 0) {
          setComics([]);
          setLoading(false);
          return;
        }
        await getPlugin(selectedPlugin.key);
        const data = await getExploreData(
          selectedPlugin.key,
          explorePages[0].title,
          1,
        );
        let comicsArray: Comic[] = [];
        let maxPageNum = 1;

        if (Array.isArray(data)) {
          comicsArray = data.flatMap((part: any) => part?.comics || []);
        } else if (data?.comics && Array.isArray(data.comics)) {
          comicsArray = data.comics;
          maxPageNum = data.maxPage || 1;
        } else if (data?.data && Array.isArray(data.data)) {
          comicsArray = data.data.flatMap((item: any) => {
            if (!item) return [];
            if (Array.isArray(item)) return item;
            if (item.comics && Array.isArray(item.comics)) return item.comics;
            return [];
          });
          maxPageNum = data.maxPage || 1;
        } else if (typeof data === "object" && data !== null) {
          comicsArray = Object.values(data).flatMap((value: any) =>
            Array.isArray(value) ? value : [],
          );
          maxPageNum = 1;
        }

        setComics(comicsArray);
        setMaxPage(maxPageNum);
        setHasMore(maxPageNum > 1 || comicsArray.length > 0);
      } catch (e: any) {
        setError(e.message || "加载失败");
        setComics([]);
        setHasMore(false);
      } finally {
        setLoading(false);
      }
    };

    loadExplore();
  }, [selectedPlugin, viewMode]);

  const loadMore = async () => {
    if (!selectedPlugin || loading || !hasMore) return;

    if (viewMode === "category" && selectedCategory) {
      await loadMoreCategoryComics();
      return;
    }

    const explorePages = selectedPlugin.explore || [];
    if (explorePages.length === 0) return;

    setLoading(true);
    try {
      const nextPage = currentPage + 1;
      const data = await getExploreData(
        selectedPlugin.key,
        explorePages[0].title,
        nextPage,
      );
      let comicsArray: Comic[] = [];
      let maxPageNum = nextPage;

      if (Array.isArray(data)) {
        comicsArray = data.flatMap((part: any) => part?.comics || []);
      } else if (data?.comics && Array.isArray(data.comics)) {
        comicsArray = data.comics;
        maxPageNum = data.maxPage || nextPage;
      } else if (data?.data && Array.isArray(data.data)) {
        comicsArray = data.data.flatMap((item: any) => {
          if (!item) return [];
          if (Array.isArray(item)) return item;
          if (item.comics && Array.isArray(item.comics)) return item.comics;
          return [];
        });
        maxPageNum = data.maxPage || nextPage;
      } else if (typeof data === "object" && data !== null) {
        comicsArray = Object.values(data).flatMap((value: any) =>
          Array.isArray(value) ? value : [],
        );
      }

      if (comicsArray.length === 0) {
        setHasMore(false);
      } else {
        setCurrentPage(nextPage);
        setComics((prev) => [...prev, ...comicsArray]);
        setMaxPage(maxPageNum);
        setHasMore(nextPage < maxPageNum);
      }
    } catch (e: any) {
      setError(e.message || "加载失败");
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  };

  const loadMoreCategoryComics = async () => {
    if (!selectedPlugin || !selectedCategory || loading) return;

    setLoading(true);
    try {
      const nextPage = currentPage + 1;
      const result = await getCategoryComics(
        selectedPlugin.key,
        selectedCategory.name,
        selectedCategory.param || "",
        categoryOptions,
        nextPage,
      );
      if (result.comics.length === 0) {
        setHasMore(false);
      } else {
        setCurrentPage(nextPage);
        setComics((prev) => [...prev, ...result.comics]);
        setMaxPage(result.maxPage || nextPage);
        setHasMore(nextPage < (result.maxPage || nextPage));
      }
    } catch (e: any) {
      setError(e.message || "加载失败");
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  };

  const handleMangaClick = (comic: Comic) => {
    // 添加历史记录
    pageStateActions.pushHistory("explore", {
      selectedPluginKey: selectedPlugin?.key || "",
    });

    navigate("manga", { id: `${selectedPlugin?.key}:${comic.id}` });
  };

  const handleSelectCategory = async (
    categoryName: string,
    categoryParam?: string,
  ) => {
    setSelectedCategory({ name: categoryName, param: categoryParam });
    setLoading(true);
    setComics([]);
    setError("");
    setCurrentPage(1);
    setCategoryOptions([]);
    setOptionList([]);

    if (selectedPlugin?.categoryComics?.optionList) {
      setOptionList(selectedPlugin.categoryComics.optionList);
      const defaults = selectedPlugin.categoryComics.optionList.map(
        (opt) => opt.options[0]?.split("-")[0] || "any",
      );
      setCategoryOptions(defaults);
    }

    try {
      const result = await getCategoryComics(
        selectedPlugin?.key || "",
        categoryName,
        categoryParam || "",
        [],
        1,
      );
      setComics(result.comics);
      setMaxPage(result.maxPage || 1);
      setHasMore(
        result.maxPage ? 1 < result.maxPage : result.comics.length > 0,
      );
    } catch (e: any) {
      console.error("Failed to load category comics:", e);
      setError(e.message || "加载分类漫画失败");
      setComics([]);
    } finally {
      setLoading(false);
    }
  };

  const handleOptionChange = (index: number, value: string) => {
    const newOptions = [...categoryOptions];
    newOptions[index] = value;
    setCategoryOptions(newOptions);
  };

  const handleApplyOptions = async () => {
    if (!selectedCategory || !selectedPlugin) return;

    setLoading(true);
    setError("");
    setCurrentPage(1);

    try {
      const result = await getCategoryComics(
        selectedPlugin.key,
        selectedCategory.name,
        selectedCategory.param || "",
        categoryOptions,
        1,
      );
      setComics(result.comics);
      setMaxPage(result.maxPage || 1);
      setHasMore(
        result.maxPage ? 1 < result.maxPage : result.comics.length > 0,
      );
    } catch (e: any) {
      setError(e.message || "加载失败");
      setComics([]);
    } finally {
      setLoading(false);
    }
  };

  const handleExplore = () => {
    setViewMode("explore");
    setComics([]);
    setError("");
  };

  const handleCategories = () => {
    setViewMode("category");
    setComics([]);
    setError("");
  };

  const handleWheel = (e: WheelEvent) => {
    if (tabContainerRef.current) {
      tabContainerRef.current.scrollLeft += e.deltaY;
    }
  };

  useEffect(() => {
    const container = tabContainerRef.current;
    if (container) {
      container.addEventListener("wheel", handleWheel);
      return () => container.removeEventListener("wheel", handleWheel);
    }
  }, []);

  const pluginsWithCategory = plugins.filter(
    (p) => p.category?.parts && p.category.parts.length > 0,
  );

  if (plugins.length === 0) {
    return (
      <div class="min-h-full flex flex-col items-center justify-center p-4">
        <span class="text-4xl mb-4">🔌</span>
        <p class="text-lg text-white">暂无已安装插件</p>
        <p class="text-sm text-gray-400 mt-2">请先安装漫画源插件</p>
        <Button
          variant="primary"
          className="mt-4"
          onClick={() => navigate("plugins")}
        >
          去安装插件
        </Button>
      </div>
    );
  }

  return (
    <div class="min-h-full pb-4">
      {/* Header */}
      <header class="sticky top-0 z-10 bg-[#1a1a2e]/95 backdrop-blur-sm border-b border-[#2a2a4a] px-4 py-3">
        <div class="flex items-center justify-between mb-3">
          <h1 class="text-xl font-bold text-[#e94560]">发现</h1>
        </div>

        <div
          ref={tabContainerRef}
          class="flex gap-3 overflow-x-auto scrollbar-hide pb-2"
        >
          {plugins.map((plugin) => (
            <div
              key={plugin.key}
              onClick={() => {
                setSelectedPlugin(plugin);
                getPlugin(plugin.key).then(() => {
                  getCategoryData(plugin.key)
                    .then(setCategoryData)
                    .catch(() => setCategoryData(null));
                });
              }}
              class={`flex-shrink-0 px-4 py-3 rounded-xl cursor-pointer transition-all ${
                selectedPlugin?.key === plugin.key
                  ? "bg-[#e94560] text-white shadow-lg shadow-[#e94560]/30"
                  : "bg-[#16213e] text-gray-300 hover:bg-[#1e2a4a]"
              }`}
            >
              <div class="font-medium text-sm">{plugin.name}</div>
            </div>
          ))}
        </div>
      </header>

      <div class="p-4">
        <div class="flex gap-2">
          <button
            onClick={handleExplore}
            class={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
              viewMode === "explore"
                ? "bg-[#e94560] text-white"
                : "bg-[#16213e] text-gray-300 hover:bg-[#1e2a4a]"
            }`}
          >
            发现
          </button>
          <button
            onClick={handleCategories}
            class={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
              viewMode === "category"
                ? "bg-[#e94560] text-white"
                : "bg-[#16213e] text-gray-300 hover:bg-[#1e2a4a]"
            }`}
          >
            分类
          </button>
        </div>

        {selectedPlugin && (
          <div class="mt-4 mb-4 p-3 bg-[#16213e]/50 rounded-lg">
            <div class="flex items-center justify-between mb-3">
              <h2 class="text-lg font-medium text-white">
                {viewMode === "explore"
                  ? selectedPlugin.explore?.[0]?.title || "发现"
                  : "分类浏览"}
              </h2>
            </div>

            {viewMode === "explore" ? (
              loading && comics.length === 0 ? (
                <div class="flex items-center justify-center py-12">
                  <div class="w-8 h-8 border-2 border-[#e94560] border-t-transparent rounded-full animate-spin" />
                </div>
              ) : error ? (
                <div class="flex flex-col items-center justify-center py-12 text-gray-400">
                  <p>加载失败</p>
                  <p class="text-sm mt-1">{error}</p>
                </div>
              ) : comics.length === 0 ? (
                <div class="flex flex-col items-center justify-center py-12 text-gray-400">
                  <p>暂无数据</p>
                </div>
              ) : (
                <>
                  <MangaGrid>
                    {comics.map((comic) => (
                      <div
                        key={comic.id}
                        onClick={() => handleMangaClick(comic)}
                      >
                        <MangaCard
                          id={comic.id}
                          title={comic.title}
                          cover={comic.cover}
                          latestChapter={comic.subTitle}
                        />
                      </div>
                    ))}
                  </MangaGrid>
                  {hasMore && (
                    <div class="py-6 text-center">
                      <Button
                        onClick={loadMore}
                        disabled={loading}
                        variant="secondary"
                      >
                        {loading ? "加载中..." : "加载更多"}
                      </Button>
                    </div>
                  )}
                </>
              )
            ) : !categoryData ? (
              <div class="text-center text-gray-400 py-12">
                <p>该漫画源暂无分类</p>
              </div>
            ) : (
              categoryData.parts.map((part: any, partIndex: number) => (
                <div key={partIndex} class="mb-6">
                  <h2 class="text-lg font-medium text-white mb-3">
                    {part.name}
                  </h2>
                  <div class="flex flex-wrap gap-2">
                    {part.categories?.map((category: any, catIndex: number) => {
                      const label =
                        typeof category === "string"
                          ? category
                          : category.label;
                      const param = part.categoryParams?.[catIndex];
                      return (
                        <button
                          key={catIndex}
                          onClick={() => handleSelectCategory(label, param)}
                          class="px-3 py-2 bg-[#16213e] hover:bg-[#1a4a7a] text-white text-sm rounded-lg transition-colors"
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
