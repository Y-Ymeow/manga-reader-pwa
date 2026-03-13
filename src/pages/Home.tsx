import { useState, useEffect } from 'preact/hooks';
import { navigate } from '@routes/index';
import { Manga, Category, ChapterList } from '@db/index';
import type { MangaRecord, CategoryRecord, ChapterListRecord } from '@db/index';

interface HomeProps {}

export function Home({}: HomeProps) {
  const [mangas, setMangas] = useState<MangaRecord[]>([]);
  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  // 加载分类和漫画
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        // 加载分类
        const cats = await Category.findMany({ orderBy: { sort: 'asc' } });
        setCategories(cats as CategoryRecord[]);

        // 加载漫画
        await loadMangas(activeCategory);
      } catch (e) {
        console.error('Failed to load home data:', e);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [activeCategory]);

  const loadMangas = async (categoryId: string) => {
    try {
      let mangasData: MangaRecord[];

      if (categoryId === 'all') {
        // 全部漫画
        mangasData = await Manga.findMany({
          where: { isFavorite: true },
          orderBy: { favoriteAt: 'desc' },
        }) as MangaRecord[];
      } else {
        // 特定分类
        mangasData = await Manga.findMany({
          where: { isFavorite: true, categoryId },
          orderBy: { favoriteAt: 'desc' },
        }) as MangaRecord[];
      }

      setMangas(mangasData);
    } catch (e) {
      console.error('Failed to load mangas:', e);
    }
  };

  const handleMangaClick = (manga: MangaRecord) => {
    navigate('manga', { id: manga.id });
  };

  const handleExplore = () => {
    navigate('explore');
  };

  if (loading) {
    return (
      <div class="flex items-center justify-center h-full">
        <p class="text-gray-400">加载中...</p>
      </div>
    );
  }

  return (
    <div class="h-full flex flex-col">
      {/* Header */}
      <div class="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <h1 class="text-xl font-bold text-white">书架</h1>
        <button
          onClick={handleExplore}
          class="px-4 py-1.5 bg-[#e94560] text-white rounded-lg text-sm"
        >
          发现
        </button>
      </div>

      {/* Category Tabs */}
      <div class="flex gap-2 px-4 py-3 overflow-x-auto scrollbar-hide border-b border-gray-800">
        <button
          onClick={() => setActiveCategory('all')}
          class={`px-4 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors ${
            activeCategory === 'all'
              ? 'bg-[#e94560] text-white'
              : 'bg-[#16213e] text-gray-400 hover:bg-[#1a4a7a]'
          }`}
        >
          全部
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            class={`px-4 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors ${
              activeCategory === cat.id
                ? 'bg-[#e94560] text-white'
                : 'bg-[#16213e] text-gray-400 hover:bg-[#1a4a7a]'
            }`}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* Manga Grid */}
      <div class="flex-1 overflow-y-auto p-4">
        {mangas.length === 0 ? (
          <div class="flex flex-col items-center justify-center h-full text-gray-400">
            <p>书架是空的</p>
            <button
              onClick={handleExplore}
              class="mt-4 px-6 py-2 bg-[#e94560] text-white rounded-lg"
            >
              去发现漫画
            </button>
          </div>
        ) : (
          <div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
            {mangas.map((manga) => (
              <div
                key={manga.id}
                onClick={() => handleMangaClick(manga)}
                class="cursor-pointer group"
              >
                <div class="aspect-[2/3] rounded-lg overflow-hidden bg-[#16213e] relative">
                  <img
                    src={manga.cover}
                    alt={manga.title}
                    class="w-full h-full object-cover transition-transform group-hover:scale-105"
                  />
                  {manga.lastReadChapterId && (
                    <div class="absolute top-1 right-1 w-2 h-2 bg-[#e94560] rounded-full" />
                  )}
                </div>
                <p class="mt-1.5 text-sm text-white truncate">{manga.title}</p>
                <p class="text-xs text-gray-500 truncate">
                  {manga.author || '未知作者'}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
