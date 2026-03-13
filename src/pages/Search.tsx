import { useState } from 'preact/hooks';
import { Input } from '@components/ui/Input';
import { Button } from '@components/ui/Button';
import { MangaCard } from '@components/manga/MangaCard';
import { MangaGrid } from '@components/manga/MangaGrid';
import type { Manga } from '../types/manga';

export function Search() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Manga[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;

    setIsSearching(true);
    // TODO: Search via plugin system
    await new Promise(resolve => setTimeout(resolve, 500));
    setResults([]);
    setIsSearching(false);
  };

  return (
    <div class="min-h-full p-4">
      <h1 class="text-2xl font-bold text-white mb-4">搜索漫画</h1>

      <div class="flex gap-2 mb-6">
        <div class="flex-1">
          <Input
            value={query}
            onChange={setQuery}
            placeholder="输入漫画名称..."
            autoFocus
          />
        </div>
        <Button onClick={handleSearch} disabled={isSearching}>
          {isSearching ? '搜索中...' : '搜索'}
        </Button>
      </div>

      {results.length > 0 ? (
        <MangaGrid>
          {results.map((manga) => (
            <MangaCard
              key={manga.id}
              id={manga.id}
              title={manga.title}
              cover={manga.cover}
              latestChapter={manga.latestChapter}
            />
          ))}
        </MangaGrid>
      ) : (
        <div class="text-center text-gray-400 py-12">
          {isSearching ? (
            <p>搜索中...</p>
          ) : (
            <>
              <p class="text-lg">输入关键词开始搜索</p>
              <p class="text-sm mt-2">支持从多个漫画源搜索</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
