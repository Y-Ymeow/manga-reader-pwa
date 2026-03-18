import { useState, useEffect } from "preact/hooks";
import { Input } from "@components/ui/Input";
import { Button } from "@components/ui/Button";
import { MangaCard } from "@components/manga/MangaCard";
import { MangaGrid } from "@components/manga/MangaGrid";
import { navigate, useRoute } from "@routes/index";
import {
  initPluginSystem,
  getPlugins,
  searchManga,
  restorePluginsFromStorage,
  type PluginInstance,
  type Comic,
} from "@plugins/index";
import { initDatabase } from "@db/index";
import { pageStateActions } from "@state/page-state";

interface SearchResult {
  pluginKey: string;
  pluginName: string;
  comics: Comic[];
  maxPage?: number;
}

interface SearchOption {
  type?: "select" | "multi-select" | "dropdown";
  label?: string;
  options: string[];
  default?: string | null;
}

export function Search() {
  const { params } = useRoute();
  const [query, setQuery] = useState("");
  const [plugins, setPlugins] = useState<PluginInstance[]>([]);
  const [selectedPlugin, setSelectedPlugin] = useState<string>("all");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  // 搜索选项
  const [searchOptions, setSearchOptions] = useState<SearchOption[]>([]);
  const [selectedOptions, setSelectedOptions] = useState<
    Record<number, string>
  >({});
  const [restore, setRestore] = useState(false);

  // 每次状态变化时，保存到 pageState
  useEffect(() => {
    if (!query) return;

    pageStateActions.setPageState("search", {
      selectedPlugin,
      query,
      searchResults,
      currentPage,
      searchOptions,
      selectedOptions,
      isSearching,
    });
  }, [
    isSearching,
    selectedPlugin,
    query,
    searchResults,
    currentPage,
    searchOptions,
    selectedOptions,
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
        if (params?.restore === "true") {
          setRestore(true);
          const savedState = pageStateActions.getPageState("search");
          if (
            savedState &&
            savedState.searchResults &&
            savedState.searchResults.length > 0
          ) {
            setIsSearching(savedState.isSearching || false);
            setSelectedPlugin(savedState.selectedPlugin);
            setQuery(savedState.query || "");
            setSearchResults(savedState.searchResults);
            setCurrentPage(savedState.currentPage || 1);
            setSearchOptions(savedState.searchOptions || []);
            setSelectedOptions(savedState.selectedOptions || {});
          }
        }
      } catch (e) {
        console.error("Failed to initialize:", e);
      }
    };
    init();
  }, [params?.restore]);

  // 加载搜索选项
  useEffect(() => {
    if (restore) {
      setRestore(false);
      return;
    }
    if (selectedPlugin === "all") {
      // 聚合搜索不显示选项
      setSearchOptions([]);
      return;
    }

    const plugin = plugins.find((p) => p.key === selectedPlugin);
    if (plugin?.search?.optionList) {
      setSearchOptions(plugin.search.optionList);
      // 设置默认值
      const defaults: Record<number, string> = {};
      plugin.search.optionList.forEach((opt: SearchOption, idx: number) => {
        if ((opt as any).default) {
          defaults[idx] = (opt as any).default;
        } else if (opt.options.length > 0) {
          defaults[idx] = opt.options[0].split("-")[0];
        }
      });
      if (!restore) {
        setSelectedOptions(defaults);
      }
    } else {
      setSearchOptions([]);
    }
  }, [selectedPlugin]);

  const handleSearch = async () => {
    if (!query.trim()) return;

    setIsSearching(true);
    setSearchResults([]);

    try {
      // 构建选项数组
      const options = searchOptions.map((opt, idx) => {
        if (opt.type === "multi-select") {
          // 多选返回 JSON 数组
          return selectedOptions[idx] || "[]";
        }
        return selectedOptions[idx] || "";
      });

      if (selectedPlugin === "all") {
        // 聚合搜索：搜索所有插件
        const results: SearchResult[] = [];
        for (const plugin of plugins) {
          if (!plugin.search?.load) continue;

          try {
            const result = await searchManga(plugin.key, query, 1);
            if (result.comics.length > 0) {
              results.push({
                pluginKey: plugin.key,
                pluginName: plugin.name,
                comics: result.comics,
                maxPage: result.maxPage,
              });
            }
          } catch (e) {
            console.error(`Search failed for plugin ${plugin.key}:`, e);
          }
        }
        setSearchResults(results);
      } else {
        // 单源搜索
        const result = await searchManga(selectedPlugin, query, 1, options);
        if (result.comics.length > 0) {
          const plugin = plugins.find((p) => p.key === selectedPlugin);
          setSearchResults([
            {
              pluginKey: selectedPlugin,
              pluginName: plugin?.name || selectedPlugin,
              comics: result.comics,
              maxPage: result.maxPage,
            },
          ]);
        }
      }
    } catch (e) {
      console.error("Search failed:", e);
    } finally {
      setIsSearching(false);
    }
  };

  const handleMangaClick = (pluginKey: string, comic: Comic) => {
    // 添加历史记录
    pageStateActions.pushHistory("search", {
      isSearching,
      selectedPlugin,
      query,
      searchResults,
      currentPage,
      searchOptions,
      selectedOptions,
    });

    navigate("manga", { id: `${pluginKey}:${comic.id}` });
  };

  const loadMore = async (pluginKey: string) => {
    const result = searchResults.find((r) => r.pluginKey === pluginKey);
    if (!result) return;

    const nextPage = currentPage + 1;
    try {
      const options = searchOptions.map(
        (opt, idx) => selectedOptions[idx] || "",
      );
      const moreResult = await searchManga(pluginKey, query, nextPage, options);
      if (moreResult.comics.length > 0) {
        setSearchResults((prev) =>
          prev.map((r) =>
            r.pluginKey === pluginKey
              ? {
                  ...r,
                  comics: [...r.comics, ...moreResult.comics],
                  maxPage: moreResult.maxPage,
                }
              : r,
          ),
        );
        setCurrentPage(nextPage);
      }
    } catch (e) {
      console.error("Load more failed:", e);
    }
  };

  const handleOptionChange = (optionIndex: number, value: string) => {
    setSelectedOptions((prev) => ({
      ...prev,
      [optionIndex]: value,
    }));
  };

  const getOptionLabel = (option: string) => {
    const parts = option.split("-");
    return parts[1] || parts[0];
  };

  const getOptionValue = (option: string) => {
    return option.split("-")[0];
  };

  // 过滤出有搜索功能的插件
  const pluginsWithSearch = plugins.filter((p) => p.search?.load);

  return (
    <div class="min-h-full pb-4">
      {/* Header */}
      <header class="sticky top-0 z-10 bg-[#1a1a2e]/95 backdrop-blur-sm border-b border-[#2a2a4a]">
        <div class="px-4 py-3">
          <h1 class="text-xl font-bold text-[#e94560]">搜索漫画</h1>

          {/* 搜索框 */}
          <div class="flex gap-2 mt-3">
            <div class="flex-1">
              <Input
                value={query}
                onChange={setQuery}
                placeholder="输入漫画名称..."
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSearch();
                }}
              />
            </div>
            <Button onClick={handleSearch} disabled={isSearching}>
              {isSearching ? "搜索中..." : "搜索"}
            </Button>
          </div>

          {/* 搜索源选择 */}
          <div class="flex gap-2 mt-3 overflow-x-auto scrollbar-hide">
            <button
              onClick={() => setSelectedPlugin("all")}
              class={`flex-shrink-0 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                selectedPlugin === "all"
                  ? "bg-[#e94560] text-white"
                  : "bg-[#16213e] text-gray-300 hover:bg-[#1e2a4a]"
              }`}
            >
              聚合搜索
            </button>
            {pluginsWithSearch.map((plugin) => (
              <button
                key={plugin.key}
                onClick={() => setSelectedPlugin(plugin.key)}
                class={`flex-shrink-0 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  selectedPlugin === plugin.key
                    ? "bg-[#e94560] text-white"
                    : "bg-[#16213e] text-gray-300 hover:bg-[#1e2a4a]"
                }`}
              >
                {plugin.name}
              </button>
            ))}
          </div>

          {/* 搜索选项 */}
          {searchOptions.length > 0 && selectedPlugin !== "all" && (
            <div class="space-y-3 mt-3">
              {searchOptions.map((opt, idx) => (
                <div key={idx} class="flex flex-wrap gap-2 items-center">
                  {opt.label && (
                    <span class="text-sm text-gray-400 min-w-[60px]">
                      {opt.label}:
                    </span>
                  )}
                  <div class="flex flex-wrap gap-2">
                    {opt.type === "multi-select" ? (
                      // 多选 - Checkbox 风格
                      opt.options.map((option) => {
                        const value = getOptionValue(option);
                        const label = getOptionLabel(option);
                        const selectedValues = selectedOptions[idx]
                          ? JSON.parse(selectedOptions[idx])
                          : [];
                        const isChecked = selectedValues.includes(value);
                        return (
                          <button
                            key={value}
                            onClick={() => {
                              const newValues = isChecked
                                ? selectedValues.filter(
                                    (v: string) => v !== value,
                                  )
                                : [...selectedValues, value];
                              handleOptionChange(
                                idx,
                                JSON.stringify(newValues),
                              );
                            }}
                            class={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                              isChecked
                                ? "bg-[#e94560] text-white"
                                : "bg-[#16213e] text-gray-300 hover:bg-[#1e2a4a]"
                            }`}
                          >
                            {label}
                          </button>
                        );
                      })
                    ) : opt.type === "dropdown" ? (
                      // Dropdown - 下拉框
                      <select
                        key={idx}
                        value={selectedOptions[idx] || ""}
                        onChange={(e) =>
                          handleOptionChange(
                            idx,
                            (e.target as HTMLSelectElement).value,
                          )
                        }
                        class="bg-[#16213e] text-white text-sm rounded px-3 py-2 border border-[#2a2a4a] focus:outline-none focus:border-[#e94560]"
                      >
                        <option value="">Any</option>
                        {opt.options.map((option) => (
                          <option
                            key={getOptionValue(option)}
                            value={getOptionValue(option)}
                          >
                            {getOptionLabel(option)}
                          </option>
                        ))}
                      </select>
                    ) : (
                      // Select - Radio 风格（单选）
                      opt.options.map((option) => {
                        const value = getOptionValue(option);
                        const label = getOptionLabel(option);
                        const isSelected = selectedOptions[idx] === value;
                        return (
                          <button
                            key={value}
                            onClick={() => handleOptionChange(idx, value)}
                            class={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                              isSelected
                                ? "bg-[#e94560] text-white"
                                : "bg-[#16213e] text-gray-300 hover:bg-[#1e2a4a]"
                            }`}
                          >
                            {label}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </header>

      {/* 搜索结果 */}
      <div class="p-4">
        {isSearching ? (
          <div class="flex items-center justify-center py-12">
            <div class="w-8 h-8 border-2 border-[#e94560] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : searchResults.length === 0 ? (
          <div class="text-center text-gray-400 py-12">
            <p class="text-lg">输入关键词开始搜索</p>
            <p class="text-sm mt-2">
              {pluginsWithSearch.length > 0
                ? `支持从 ${pluginsWithSearch.length} 个漫画源搜索`
                : "请先安装漫画源插件"}
            </p>
          </div>
        ) : (
          <div class="space-y-6">
            {searchResults.map((result) => (
              <div key={result.pluginKey}>
                <div class="flex items-center justify-between mb-3">
                  <h2 class="text-lg font-medium text-white">
                    {result.pluginName}
                  </h2>
                  <span class="text-sm text-gray-400">
                    {result.comics.length} 个结果
                  </span>
                </div>
                <MangaGrid>
                  {result.comics.map((comic) => (
                    <div
                      key={comic.id}
                      onClick={() => handleMangaClick(result.pluginKey, comic)}
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
                {result.maxPage && result.maxPage > currentPage && (
                  <div class="py-4 text-center">
                    <Button
                      onClick={() => loadMore(result.pluginKey)}
                      variant="secondary"
                    >
                      加载更多
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
