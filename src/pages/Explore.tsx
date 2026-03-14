import { useState, useEffect, useRef } from 'preact/hooks';
import { MangaCard } from '@components/manga/MangaCard';
import { MangaGrid } from '@components/manga/MangaGrid';
import { Button } from '@components/ui/Button';
import { navigate } from '@routes/index';
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
} from '@plugins/index';
import { initDatabase } from '@db/index';

export function Explore() {
  const [plugins, setPlugins] = useState<PluginInstance[]>([]);
  const [selectedPlugin, setSelectedPlugin] = useState<PluginInstance | null>(null);
  const [comics, setComics] = useState<Comic[]>([]);
  const [maxPage, setMaxPage] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [viewMode, setViewMode] = useState<'explore' | 'category'>('explore');
  const [categoryData, setCategoryData] = useState<any>(null);
  const [selectedCategory, setSelectedCategory] = useState<{name: string, param?: string} | null>(null);
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
  const tabContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const init = async () => {
      try {
        await initDatabase();
        await initPluginSystem();
        await restorePluginsFromStorage();
        const loadedPlugins = getPlugins();
        setPlugins(loadedPlugins);
        // 不自动选择第一个插件，等用户点击后再加载
      } catch (e) {
        console.error('Failed to initialize:', e);
      }
    };
    init();
  }, []);

  useEffect(() => {
    if (!selectedPlugin) return;

    const loadCategory = async () => {
      try {
        const catData = await getCategoryData(selectedPlugin.key);
        setCategoryData(catData);
      } catch (e) {
        console.error('Failed to load category:', e);
        setCategoryData(null);
      }
    };
    
    // 只在切换 viewMode 时重新加载分类，不在切换插件时加载（点击时已加载）
    if (viewMode === 'category') {
      loadCategory();
    }

    if (viewMode !== 'explore') return;

    const loadExplore = async () => {
      setComics([]);  // 清空旧数据，避免切换插件时显示旧内容
      setLoading(true);
    setComics([]);  // 清空旧数据
      setError('');
      setCurrentPage(1);
      try {
        const explorePages = selectedPlugin.explore || []; 
        if (explorePages.length === 0) {
          setComics([]);
          setLoading(false);
          return;
        }
        // 确保插件已初始化（执行 init 方法）
        await getPlugin(selectedPlugin.key);
        const data = await getExploreData(selectedPlugin.key, explorePages[0].title, 1);
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
        } else if (typeof data === 'object' && data !== null) {
          comicsArray = Object.values(data).flatMap((value: any) => Array.isArray(value) ? value : []);
          maxPageNum = 1;
        }

        setComics(comicsArray);
        setMaxPage(maxPageNum);
        setHasMore(maxPageNum > 1 || comicsArray.length > 0);
      } catch (e: any) {
        console.error(e);
        setError(e.message || '加载失败');
        setComics([]);
      } finally {
        setLoading(false);
      }
    };

    loadExplore();
  }, [selectedPlugin, viewMode]);

  const loadMore = async () => {
    if (!selectedPlugin || loading || !hasMore) return;

    if (viewMode === 'category' && selectedCategory) {
      await loadMoreCategoryComics();
      return;
    }

    const explorePages = selectedPlugin.explore || [];
    if (explorePages.length === 0) return;

    setLoading(true);
    setComics([]);  // 清空旧数据
    try {
      const nextPage = currentPage + 1;
      const data = await getExploreData(selectedPlugin.key, explorePages[0].title, nextPage);
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
      } else if (typeof data === 'object' && data !== null) {
        comicsArray = Object.values(data).flatMap((value: any) => Array.isArray(value) ? value : []);
      }

      if (comicsArray.length === 0) {
        setHasMore(false);
      } else {
        setCurrentPage(nextPage);
        setComics(prev => [...prev, ...comicsArray]);
        setMaxPage(maxPageNum);
        setHasMore(nextPage < maxPageNum);
      }
    } catch (e: any) {
      setError(e.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  const handleMangaClick = (comic: Comic) => {
    navigate('manga', { id: `${selectedPlugin?.key}:${comic.id}` });
  };

  const handleSelectCategory = async (categoryName: string, categoryParam?: string) => {
    if (!selectedPlugin?.categoryComics) return;
    setSelectedCategory({ name: categoryName, param: categoryParam });
    setViewMode('category');
    setLoading(true);
    setComics([]);  // 清空旧数据
    setError('');
    setCurrentPage(1);

    const optionList = selectedPlugin.categoryComics.optionList;
    if (optionList) {
      const defaults = optionList.map(opt => opt.options[0]?.split('-')[0] || '');
      setCategoryOptions(defaults);
    } else {
      setCategoryOptions([]);
    }

    try {
      const result = await getCategoryComics(
        selectedPlugin.key,
        categoryName,
        categoryParam || '',
        categoryOptions,
        1
      );
      setComics(result.comics);
      setMaxPage(result.maxPage || 1);
      setHasMore(result.maxPage ? 1 < result.maxPage : result.comics.length > 0);
    } catch (e: any) {
      console.error('Failed to load category comics:', e);
      setError(e.message || '加载分类漫画失败');
      setComics([]);
    } finally {
      setLoading(false);
    }
  };

  const loadMoreCategoryComics = async () => {
    if (!selectedPlugin || !selectedCategory || loading) return;
    setLoading(true);
    setComics([]);  // 清空旧数据
    try {
      const nextPage = currentPage + 1;
      const result = await getCategoryComics(
        selectedPlugin.key,
        selectedCategory.name,
        selectedCategory.param || '',
        categoryOptions,
        nextPage
      );
      if (result.comics.length === 0) {
        setHasMore(false);
      } else {
        setCurrentPage(nextPage);
        setComics(prev => [...prev, ...result.comics]);
        setMaxPage(result.maxPage || nextPage);
        setHasMore(nextPage < (result.maxPage || nextPage));
      }
    } catch (e: any) {
      setError(e.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  const handleCategoryOptionChange = async (index: number, value: string) => {
    const newOptions = [...categoryOptions];
    newOptions[index] = value;
    setCategoryOptions(newOptions);

    if (selectedCategory) {
      setLoading(true);
    setComics([]);  // 清空旧数据
      setCurrentPage(1);
      try {
        const result = await getCategoryComics(
          selectedPlugin!.key,
          selectedCategory.name,
          selectedCategory.param || '',
          newOptions,
          1
        );
        setComics(result.comics);
        setMaxPage(result.maxPage || 1);
        setHasMore(result.maxPage ? 1 < result.maxPage : result.comics.length > 0);
      } catch (e: any) {
        setError(e.message || '加载失败');
      } finally {
        setLoading(false);
      }
    }
  };

  const handleWheel = (e: WheelEvent) => {
    if (tabContainerRef.current) {
      e.preventDefault();
      tabContainerRef.current.scrollLeft += e.deltaY;
    }
  };

  if (plugins.length === 0) {
    return (
      <div class="min-h-full flex flex-col items-center justify-center p-4">
        <span class="text-4xl mb-4">🔌</span>
        <p class="text-lg text-white">暂无已安装插件</p>
        <p class="text-sm text-gray-400 mt-2">请先安装漫画源插件</p>
        <Button variant="primary" className="mt-4" onClick={() => navigate('plugins')}>
          去安装插件
        </Button>
      </div>
    );
  }

  const renderCategoryView = () => {
    if (!categoryData) return null;

    if (!selectedCategory) {
      return (
        <div class="mt-4">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-white font-medium">分类浏览</h3>
          </div>
          <div class="space-y-6">
            {categoryData.parts?.map((part: any, partIndex: number) => (
              <div key={partIndex}>
                <h4 class="text-sm text-gray-400 mb-3">{part.name}</h4>
                <div class="flex flex-wrap gap-2">
                  {part.categories?.map((category: string, catIndex: number) => (
                    <button
                      key={catIndex}
                      onClick={() => handleSelectCategory(category, part.categoryParams?.[catIndex])}
                      class="px-3 py-2 bg-[#16213e] hover:bg-[#1a4a7a] text-white text-sm rounded-lg transition-colors"
                    >
                      {category}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    return (
      <div class="mt-4">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-white font-medium">{selectedCategory.name}</h3>
          <button onClick={() => setSelectedCategory(null)} class="text-sm text-[#e94560] hover:underline">
            返回分类列表
          </button>
        </div>

        {selectedPlugin?.categoryComics?.optionList && (
          <div class="flex gap-3 mb-4 overflow-x-auto scrollbar-hide">
            {selectedPlugin.categoryComics.optionList.map((optionGroup, index) => (
              <div key={index} class="flex-shrink-0">
                <select
                  value={categoryOptions[index] || ''}
                  onChange={(e) => handleCategoryOptionChange(index, (e.target as HTMLSelectElement).value)}
                  class="bg-[#16213e] text-white text-sm rounded px-2 py-1 border border-[#2a2a4a] focus:outline-none focus:border-[#e94560]"
                >
                  {optionGroup.options.map((opt) => {
                    const [value, label] = opt.split('-');
                    return <option key={value} value={value}>{label || value}</option>;
                  })}
                </select>
              </div>
            ))}
          </div>
        )}

        {renderComicsGrid()}
      </div>
    );
  };

  const renderComicsGrid = () => {
    if (loading && comics.length === 0) {
      return (
        <div class="flex items-center justify-center py-12">
          <div class="w-8 h-8 border-2 border-[#e94560] border-t-transparent rounded-full animate-spin" />
        </div>
      );
    }

    if (error) {
      return (
        <div class="flex flex-col items-center justify-center py-12 text-gray-400">
          <p>加载失败</p>
          <p class="text-sm mt-1">{error}</p>
        </div>
      );
    }

    if (comics.length === 0) {
      return (
        <div class="flex flex-col items-center justify-center py-12 text-gray-400">
          <p>暂无数据</p>
        </div>
      );
    }

    return (
      <>
        <MangaGrid>
          {comics.map((comic) => (
            <div key={comic.id} onClick={() => handleMangaClick(comic)}>
              <MangaCard id={comic.id} title={comic.title} cover={comic.cover} latestChapter={comic.subTitle} />
            </div>
          ))}
        </MangaGrid>
        {hasMore && (
          <div class="py-6 text-center">
            <Button onClick={loadMore} disabled={loading} variant="secondary">
              {loading ? '加载中...' : '加载更多'}
            </Button>
          </div>
        )}
      </>
    );
  };

  return (
    <div class="min-h-full">
      <header class="sticky top-0 z-10 bg-[#1a1a2e]/95 backdrop-blur-sm border-b border-[#2a2a4a]">
        <div class="px-4 py-3">
          <h1 class="text-xl font-bold text-[#e94560] mb-3">发现</h1>
          <div ref={tabContainerRef} onWheel={handleWheel} class="flex gap-3 overflow-x-auto scrollbar-hide pb-2">
            {plugins.map((plugin) => (
              <div
                key={plugin.key}
                onClick={() => {
                  setSelectedPlugin(plugin);
                  // 点击时初始化插件并加载分类数据
                  getPlugin(plugin.key).then(() => {
                    getCategoryData(plugin.key).then(setCategoryData).catch(() => setCategoryData(null));
                  });
                }}
                class={`flex-shrink-0 px-4 py-3 rounded-xl cursor-pointer transition-all ${
                  selectedPlugin?.key === plugin.key
                    ? 'bg-[#e94560] text-white shadow-lg shadow-[#e94560]/30'
                    : 'bg-[#16213e] text-gray-300 hover:bg-[#1e2a4a]'
                }`}
              >
                <div class="font-medium text-sm">{plugin.name}</div>
              </div>
            ))}
          </div>
        </div>
      </header>

      <div class="pb-4 px-4">
        {selectedPlugin && (
          <div class="mt-4 mb-4 p-3 bg-[#16213e]/50 rounded-lg">
            <div class="flex items-center justify-between mb-3">
              <div>
                <h2 class="text-white font-medium">{selectedPlugin.name}</h2>
                <p class="text-sm text-gray-400">版本 {selectedPlugin.version}</p>
              </div>
            </div>
            <div class="flex gap-2">
              <button
                onClick={() => setViewMode('explore')}
                class={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  viewMode === 'explore' ? 'bg-[#e94560] text-white' : 'bg-[#0f3460] text-gray-300 hover:text-white'
                }`}
              >
                探索
              </button>
              {categoryData && (
                <button
                  onClick={() => setViewMode('category')}
                  class={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                    viewMode === 'category' ? 'bg-[#e94560] text-white' : 'bg-[#0f3460] text-gray-300 hover:text-white'
                  }`}
                >
                  分类
                </button>
              )}
            </div>
          </div>
        )}

        {viewMode === 'category' && categoryData ? renderCategoryView() : renderComicsGrid()}
      </div>
    </div>
  );
}