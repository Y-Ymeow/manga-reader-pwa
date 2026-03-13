import { useState, useEffect } from 'preact/hooks';
import { MangaCard } from '@components/manga/MangaCard';
import { MangaGrid } from '@components/manga/MangaGrid';
import { Button } from '@components/ui/Button';
import { Input } from '@components/ui/Input';
import { navigate } from '@routes/index';
import {
  getPlugins,
  searchManga,
  type PluginInstance,
  type Comic,
} from '@plugins/index';

export function Favorites() {
  const [plugins, setPlugins] = useState<PluginInstance[]>([]);
  const [selectedPlugin, setSelectedPlugin] = useState<PluginInstance | null>(null);
  const [keyword, setKeyword] = useState('');
  const [comics, setComics] = useState<Comic[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchOptions, setSearchOptions] = useState<string[]>([]);

  // 加载插件列表
  useEffect(() => {
    const loadedPlugins = getPlugins();
    const searchablePlugins = loadedPlugins.filter(p => p.search);
    setPlugins(searchablePlugins);
    if (searchablePlugins.length > 0 && !selectedPlugin) {
      setSelectedPlugin(searchablePlugins[0]);
      // 初始化搜索选项
      if (searchablePlugins[0].search?.optionList) {
        const defaults = searchablePlugins[0].search.optionList.map(opt => 
          opt.options[0]?.split('-')[0] || ''
        );
        setSearchOptions(defaults);
      }
    }
  }, []);

  // 切换插件时重置选项
  useEffect(() => {
    if (selectedPlugin?.search?.optionList) {
      const defaults = selectedPlugin.search.optionList.map(opt => 
        opt.options[0]?.split('-')[0] || ''
      );
      setSearchOptions(defaults);
    } else {
      setSearchOptions([]);
    }
    // 清空搜索结果
    setComics([]);
    setCurrentPage(1);
    setHasMore(false);
  }, [selectedPlugin]);

  const handleSearch = async (page = 1) => {
    if (!selectedPlugin || !keyword.trim()) return;

    setLoading(true);
    setError('');

    try {
      const result = await searchManga(
        selectedPlugin.key,
        keyword.trim(),
        page
      );

      if (page === 1) {
        setComics(result.comics);
      } else {
        setComics(prev => [...prev, ...result.comics]);
      }

      setCurrentPage(page);
      setHasMore(result.maxPage ? page < result.maxPage : result.comics.length > 0);
    } catch (e: any) {
      console.error('Search failed:', e);
      setError(e.message || '搜索失败');
      if (page === 1) {
        setComics([]);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLoadMore = () => {
    if (!loading && hasMore) {
      handleSearch(currentPage + 1);
    }
  };

  const handleMangaClick = (comic: Comic) => {
    navigate('manga', { id: `${selectedPlugin?.key}:${comic.id}` });
  };

  const handleOptionChange = (index: number, value: string) => {
    setSearchOptions(prev => {
      const updated = [...prev];
      updated[index] = value;
      return updated;
    });
  };

  return (
    <div class="min-h-full">
      {/* Header */}
      <header class="sticky top-0 z-10 bg-[#1a1a2e]/95 backdrop-blur-sm border-b border-[#2a2a4a] px-4 py-3">
        <h1 class="text-xl font-bold text-[#e94560] mb-3">搜索</h1>

        {/* Plugin Selector */}
        <div class="flex gap-2 mb-3 overflow-x-auto scrollbar-hide">
          {plugins.map((plugin) => (
            <button
              key={plugin.key}
              onClick={() => setSelectedPlugin(plugin)}
              class={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors ${
                selectedPlugin?.key === plugin.key
                  ? 'bg-[#e94560] text-white'
                  : 'bg-[#16213e] text-gray-400 hover:text-white'
              }`}
            >
              {plugin.name}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div class="flex gap-2">
          <Input
            type="text"
            placeholder="输入关键词搜索..."
            value={keyword}
            onChange={(value) => setKeyword(value)}
            className="flex-1"
          />
          <Button
            onClick={() => handleSearch(1)}
            disabled={loading || !keyword.trim()}
          >
            {loading ? '...' : '搜索'}
          </Button>
        </div>

        {/* Search Options */}
        {selectedPlugin?.search?.optionList && selectedPlugin.search.optionList.length > 0 && (
          <div class="flex gap-3 mt-3 overflow-x-auto scrollbar-hide">
            {selectedPlugin.search.optionList.map((optionGroup, index) => (
              <div key={index} class="flex-shrink-0">
                <select
                  value={searchOptions[index] || ''}
                  onChange={(e) => handleOptionChange(index, (e.target as HTMLSelectElement).value)}
                  class="bg-[#16213e] text-white text-sm rounded px-2 py-1 border border-[#2a2a4a] focus:outline-none focus:border-[#e94560]"
                >
                  {optionGroup.options.map((opt) => {
                    const [value, label] = opt.split('-');
                    return (
                      <option key={value} value={value}>
                        {label || value}
                      </option>
                    );
                  })}
                </select>
              </div>
            ))}
          </div>
        )}
      </header>

      {/* Results */}
      <div class="pb-4 px-4">
        {error ? (
          <div class="flex flex-col items-center justify-center py-12 text-gray-400">
            <p>搜索失败</p>
            <p class="text-sm mt-1">{error}</p>
          </div>
        ) : comics.length > 0 ? (
          <>
            <div class="mt-4">
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
            </div>

            {/* Load more */}
            {hasMore && (
              <div class="py-6 text-center">
                <Button
                  onClick={handleLoadMore}
                  disabled={loading}
                  variant="secondary"
                >
                  {loading ? (
                    <span class="flex items-center gap-2">
                      <span class="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      加载中...
                    </span>
                  ) : (
                    '加载更多'
                  )}
                </Button>
              </div>
            )}
          </>
        ) : !loading && keyword ? (
          <div class="flex flex-col items-center justify-center py-16 text-gray-400">
            <span class="text-4xl mb-4">🔍</span>
            <p class="text-lg">未找到结果</p>
            <p class="text-sm mt-1">换个关键词试试吧</p>
          </div>
        ) : !loading && (
          <div class="flex flex-col items-center justify-center py-16 text-gray-400">
            <span class="text-4xl mb-4">🔍</span>
            <p class="text-lg">开始搜索</p>
            <p class="text-sm mt-1">输入关键词查找漫画</p>
          </div>
        )}
      </div>
    </div>
  );
}