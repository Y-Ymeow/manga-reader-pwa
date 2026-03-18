import { useState, useEffect } from "preact/hooks";
import { Button } from "@components/ui/Button";
import { MangaCard } from "@components/manga/MangaCard";
import { MangaGrid } from "@components/manga/MangaGrid";
import { navigate, useRoute } from "@routes/index";
import {
  initPluginSystem,
  getPlugins,
  getCategoryData,
  getCategoryComics,
  restorePluginsFromStorage,
  type PluginInstance,
  type Comic,
} from "@plugins/index";
import { initDatabase } from "@db/index";
import { pageStateActions } from "@state/page-state";

export function Categories() {
  const { params } = useRoute();
  const [plugins, setPlugins] = useState<PluginInstance[]>([]);
  const [selectedPlugin, setSelectedPlugin] = useState<PluginInstance | null>(
    null,
  );
  const [categoryData, setCategoryData] = useState<any>(null);
  const [selectedCategory, setSelectedCategory] = useState<{
    name: string;
    param?: string;
  } | null>(null);
  const [comics, setComics] = useState<Comic[]>([]);
  const [maxPage, setMaxPage] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
  const [optionList, setOptionList] = useState<any[]>([]);
  const [restore, setRestore] = useState(false);

  // 在状态变化时自动保存到全局状态
  useEffect(() => {
    if (!selectedPlugin) return;

    const timer = setTimeout(() => {
      pageStateActions.setPageState("categories", {
        selectedPluginKey: selectedPlugin.key,
        pluginName: selectedPlugin.name,
        categoryData,
        selectedCategory,
        comics,
        maxPage,
        currentPage,
        categoryOptions,
        optionList,
      });
    }, 500);

    return () => clearTimeout(timer);
  }, [
    categoryData,
    selectedCategory,
    comics,
    maxPage,
    currentPage,
    categoryOptions,
    optionList,
    selectedPlugin,
  ]);

  // 初始化插件系统
  useEffect(() => {
    const init = async () => {
      setRestore(true);
      try {
        await initDatabase();
        await initPluginSystem();
        await restorePluginsFromStorage();
        const loadedPlugins = getPlugins();
        setPlugins(loadedPlugins);

        // 如果是从历史记录返回，恢复状态
        if (params?.restore === "true" && params?.pluginKey) {
          setRestore(true);
          const savedState = pageStateActions.getPageState("categories");
          if (
            savedState.selectedPluginKey === params.pluginKey &&
            savedState.categoryData !== null
          ) {
            const plugin = loadedPlugins.find(
              (p) => p.key === params.pluginKey,
            );
            if (plugin) {
              setSelectedPlugin(plugin);
              setCategoryData(savedState.categoryData);
              setSelectedCategory(savedState.selectedCategory);
              setComics(savedState.comics);
              setMaxPage(savedState.maxPage);
              setCurrentPage(savedState.currentPage);
              setCategoryOptions(savedState.categoryOptions);
              setOptionList(savedState.optionList);
            }
          }
        }
      } catch (e) {
        console.error("Failed to initialize:", e);
      }
    };
    init();
  }, [params?.restore, params?.pluginKey]);

  // 加载分类数据（只在有分类的插件中显示）
  useEffect(() => {
    if (!selectedPlugin) {
      setCategoryData(null);
      setSelectedCategory(null);
      return;
    }

    const loadCategory = async () => {
      try {
        const catData = await getCategoryData(selectedPlugin.key);
        // 检查是否有有效的分类数据
        if (catData && catData.parts && catData.parts.length > 0) {
          setCategoryData(catData);
          if (!restore) {
            setSelectedCategory(null);
            setComics([]);
          }
          setRestore(false);
        } else {
          // 没有分类，显示提示
          setCategoryData(null);
        }
      } catch (e) {
        console.error("Failed to load category:", e);
        setCategoryData(null);
      }
    };
    loadCategory();
  }, [selectedPlugin]);

  const handleSelectCategory = async (
    categoryName: string,
    categoryParam?: string,
    categoryTarget?: any,
  ) => {
    if (!selectedPlugin?.categoryComics) return;

    // 如果是 target 格式，从 target 中获取信息
    if (categoryTarget) {
      const target = categoryTarget.target;
      if (target?.page === "category") {
        categoryName = target.attributes?.category || categoryName;
        categoryParam = target.attributes?.param || categoryParam;
      }
      // 如果 target 直接包含 load 方法，直接调用
      if (typeof target?.load === "function") {
        setLoading(true);
        setError("");
        setCurrentPage(1);
        try {
          const result = await target.load(1);
          setComics(result.comics || []);
          setMaxPage(result.maxPage || 1);
          setHasMore(
            result.maxPage
              ? 1 < result.maxPage
              : (result.comics?.length || 0) > 0,
          );
          setSelectedCategory({ name: categoryName, param: categoryParam });
          return;
        } catch (e: any) {
          console.error("Failed to load category via target:", e);
          setError(e.message || "加载失败");
          setLoading(false);
          return;
        }
      }
    }

    setSelectedCategory({ name: categoryName, param: categoryParam });
    setLoading(true);
    setError("");
    setCurrentPage(1);
    setCategoryOptions([]);
    setOptionList([]);

    // 加载选项列表
    if (selectedPlugin.categoryComics.optionList) {
      setOptionList(selectedPlugin.categoryComics.optionList);
      // 设置默认值（每层第一个选项）
      const defaults = selectedPlugin.categoryComics.optionList.map(
        (opt) => opt.options[0]?.split("-")[0] || "any",
      );
      setCategoryOptions(defaults);
    }

    try {
      const result = await getCategoryComics(
        selectedPlugin.key,
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

  const loadMore = async () => {
    if (!selectedPlugin || !selectedCategory || loading || !hasMore) return;

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
    } finally {
      setLoading(false);
    }
  };

  const handleMangaClick = (comic: Comic) => {
    // 添加历史记录
    pageStateActions.pushHistory("categories", {
      selectedPluginKey: selectedPlugin?.key || "",
      pluginName: selectedPlugin?.name,
      comics,
      maxPage,
      currentPage,
      categoryData,
      selectedCategory,
      categoryOptions,
      optionList,
    });

    navigate("manga", { id: `${selectedPlugin?.key}:${comic.id}` });
  };

  // 过滤出有分类的插件
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
      <header class="sticky top-0 z-10 bg-[#1a1a2e]/95 backdrop-blur-sm border-b border-[#2a2a4a]">
        <div class="px-4 py-3">
          <h1 class="text-xl font-bold text-[#e94560]">分类浏览</h1>

          {/* 插件选择 */}
          <div class="flex gap-2 mt-3 overflow-x-auto scrollbar-hide">
            {pluginsWithCategory.length > 0 ? (
              pluginsWithCategory.map((plugin) => {
                const pluginKey = plugin.key;
                const savedState = pageStateActions.getPageState("categories");
                const hasState =
                  savedState.selectedPluginKey === pluginKey &&
                  savedState.categoryData !== null;

                return (
                  <button
                    key={plugin.key}
                    onClick={() => {
                      if (hasState) {
                        // 从全局状态恢复
                        setCategoryData(savedState.categoryData);
                        setSelectedCategory(savedState.selectedCategory);
                        setComics(savedState.comics);
                        setMaxPage(savedState.maxPage);
                        setCurrentPage(savedState.currentPage);
                        setCategoryOptions(savedState.categoryOptions);
                        setOptionList(savedState.optionList);
                      } else {
                        // 没有保存的状态，清空
                        setCategoryData(null);
                        setSelectedCategory(null);
                        setComics([]);
                      }
                      setSelectedPlugin(plugin);
                    }}
                    class={`flex-shrink-0 px-4 py-2 rounded-lg text-sm transition-colors ${
                      selectedPlugin?.key === plugin.key
                        ? "bg-[#e94560] text-white"
                        : "bg-[#16213e] text-gray-300 hover:bg-[#1e2a4a]"
                    }`}
                  >
                    {plugin.name}
                  </button>
                );
              })
            ) : (
              <p class="text-gray-400 text-sm py-2">暂无支持分类的插件</p>
            )}
          </div>
        </div>
      </header>

      <div class="p-4">
        {!selectedPlugin ? (
          <div class="text-center text-gray-400 py-12">
            <p>请选择一个漫画源</p>
          </div>
        ) : !categoryData ? (
          <div class="text-center text-gray-400 py-12">
            <p class="text-lg">该漫画源暂无分类</p>
            <p class="text-sm mt-2">请尝试其他漫画源或使用搜索功能</p>
          </div>
        ) : !selectedCategory ? (
          // 分类列表
          categoryData.parts.map((part: any, partIndex: number) => (
            <div key={partIndex} class="mb-6">
              <h2 class="text-lg font-medium text-white mb-3">{part.name}</h2>
              <div class="flex flex-wrap gap-2">
                {part.categories?.map((category: any, catIndex: number) => {
                  // 支持两种格式：字符串 或 {label, target} 对象
                  const label =
                    typeof category === "string" ? category : category.label;
                  const target =
                    typeof category === "object" ? category : undefined;
                  const param = part.categoryParams?.[catIndex];
                  const isSelected =
                    selectedCategory &&
                    (selectedCategory as any).name === label &&
                    (selectedCategory as any).param === param;

                  return (
                    <button
                      key={catIndex}
                      onClick={() =>
                        !loading && handleSelectCategory(label, param, target)
                      }
                      disabled={loading}
                      class={`px-3 py-2 text-sm rounded-lg transition-all ${
                        isSelected
                          ? "bg-[#e94560] text-white"
                          : loading
                            ? "bg-[#16213e] text-gray-500 cursor-not-allowed"
                            : "bg-[#16213e] hover:bg-[#1a4a7a] text-white"
                      }`}
                    >
                      {loading && isSelected ? (
                        <span class="flex items-center gap-1">
                          <span class="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                          加载中...
                        </span>
                      ) : (
                        label
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))
        ) : (
          // 漫画列表
          <>
            <div class="flex items-center justify-between mb-4">
              <h2 class="text-lg font-medium text-white">
                {selectedCategory.name}
              </h2>
              <button
                onClick={() => setSelectedCategory(null)}
                class="text-sm text-[#e94560] hover:underline"
              >
                ← 返回分类
              </button>
            </div>

            {/* 多层选项 */}
            {optionList.length > 0 && (
              <div class="mb-4">
                <div class="space-y-3 mb-3">
                  {optionList.map((opt, idx) => (
                    <div key={idx} class="flex flex-wrap gap-2 items-center">
                      {opt.label && (
                        <span class="text-sm text-gray-400 min-w-[60px]">
                          {opt.label}:
                        </span>
                      )}
                      <div class="flex flex-wrap gap-2">
                        {opt.options.map((option: string) => {
                          const [value, label] = option.split("-");
                          const isChecked = categoryOptions[idx] === value;
                          return (
                            <button
                              key={value}
                              onClick={() => handleOptionChange(idx, value)}
                              disabled={loading}
                              class={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                                isChecked
                                  ? "bg-[#e94560] text-white"
                                  : "bg-[#16213e] text-gray-300 hover:bg-[#1e2a4a]"
                              } ${loading ? "opacity-50 cursor-not-allowed" : ""}`}
                            >
                              {label || value}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                <div class="flex items-center gap-2">
                  <Button
                    onClick={handleApplyOptions}
                    size="sm"
                    disabled={loading}
                  >
                    {loading ? (
                      <span class="flex items-center gap-1">
                        <span class="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        加载中...
                      </span>
                    ) : (
                      "应用筛选"
                    )}
                  </Button>
                  {loading && (
                    <span class="text-sm text-gray-400">
                      正在加载漫画，请稍候...
                    </span>
                  )}
                </div>
              </div>
            )}

            {loading && comics.length === 0 ? (
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
                    <div key={comic.id} onClick={() => handleMangaClick(comic)}>
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
            )}
          </>
        )}
      </div>
    </div>
  );
}
