import { useState, useEffect } from 'preact/hooks';
import { navigate } from '@routes/index';
import type { ReadHistory } from '../types/history';

export function History() {
  const [history, setHistory] = useState<ReadHistory[]>([]);

  useEffect(() => {
    // TODO: Load history from IndexedDB
    setHistory([]);
  }, []);

  const handleContinue = (item: ReadHistory) => {
    navigate('reader', { mangaId: item.mangaId, chapterId: item.chapterId });
  };

  return (
    <div class="min-h-full">
      <header class="px-4 py-4 border-b border-[#2a2a4a]">
        <h1 class="text-2xl font-bold text-white">阅读历史</h1>
      </header>

      {history.length > 0 ? (
        <div class="divide-y divide-[#2a2a4a]">
          {history.map((item) => (
            <div
              key={item.id}
              onClick={() => handleContinue(item)}
              class="flex items-center gap-4 p-4 cursor-pointer hover:bg-[#16213e] transition-colors"
            >
              <img
                src={item.mangaCover}
                alt={item.mangaTitle}
                class="w-16 h-20 object-cover rounded bg-[#16213e]"
              />
              <div class="flex-1 min-w-0">
                <h3 class="font-medium text-white truncate">{item.mangaTitle}</h3>
                <p class="text-sm text-gray-400 mt-1">
                  阅读至 {item.chapterTitle}
                </p>
                <p class="text-xs text-gray-500 mt-1">
                  {new Date(item.timestamp).toLocaleDateString()}
                </p>
              </div>
              <Button variant="secondary" size="sm" onClick={() => handleContinue(item)}>
                继续
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <div class="flex flex-col items-center justify-center py-16 text-gray-400">
          <span class="text-4xl mb-4">📖</span>
          <p class="text-lg">暂无阅读记录</p>
          <p class="text-sm mt-1">开始阅读漫画吧</p>
        </div>
      )}
    </div>
  );
}

// Fix missing import
import { Button } from '@components/ui/Button';
