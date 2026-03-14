import { useState, useEffect } from 'preact/hooks';
import { navigate } from '@routes/index';
import { Button } from '@components/ui/Button';
import { ReadHistory, Manga, initDatabase } from '@db/index';
import { waitForDatabase } from '@db/global';

interface HistoryItem {
  id: string;
  mangaId: string;
  mangaTitle: string;
  mangaCover: string;
  chapterId: string;
  chapterTitle: string;
  page: number;
  readAt: number;
}

export function History() {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    setLoading(true);
    try {
      await waitForDatabase();
      
      // 加载阅读历史
      const historyRecords = await ReadHistory.findMany({
        orderBy: { readAt: 'desc' },
        limit: 100,
      });

      // 按 mangaId 分组，每组只保留最新的记录
      const mangaHistoryMap = new Map<string, HistoryItem>();
      
      for (const record of historyRecords) {
        // 如果已经有这本漫画的记录，跳过（因为已经按时间倒序，第一个是最新的）
        if (mangaHistoryMap.has(record.mangaId)) {
          continue;
        }
        
        const manga = await Manga.findById(record.mangaId);
        if (manga) {
          // 获取章节标题（从章节列表）
          const { ChapterList } = await import('@db/index');
          const chapterList = await ChapterList.findOne({ where: { mangaId: record.mangaId } });
          let chapterTitle = record.chapterId;
          if (chapterList) {
            const chapter = (chapterList as any).chapters?.find((ch: any) => ch.id === record.chapterId);
            if (chapter) {
              chapterTitle = chapter.title;
            }
          }

          mangaHistoryMap.set(record.mangaId, {
            id: record.id,
            mangaId: record.mangaId,
            mangaTitle: manga.title,
            mangaCover: manga.cover,
            chapterId: record.chapterId,
            chapterTitle,
            page: record.page,
            readAt: record.readAt,
          });
        }
      }

      // 转换为数组并按阅读时间排序
      const historyWithManga = Array.from(mangaHistoryMap.values())
        .sort((a, b) => b.readAt - a.readAt);
      
      setHistory(historyWithManga);
    } catch (e) {
      console.error('Failed to load history:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleContinue = (item: HistoryItem) => {
    navigate('reader', { 
      mangaId: item.mangaId, 
      chapterId: item.chapterId,
      page: String(item.page),
    });
  };

  const handleDelete = async (e: Event, itemId: string) => {
    e.stopPropagation();
    if (!confirm('删除这条阅读记录？')) return;
    
    try {
      await ReadHistory.delete(itemId);
      setHistory(prev => prev.filter(h => h.id !== itemId));
    } catch (err) {
      console.error('Failed to delete history:', err);
    }
  };

  const handleClearAll = async () => {
    if (!confirm('确定要清除所有阅读记录吗？')) return;
    
    try {
      await ReadHistory.clear();
      setHistory([]);
    } catch (err) {
      console.error('Failed to clear history:', err);
    }
  };

  return (
    <div class="min-h-full">
      <header class="px-4 py-4 border-b border-[#2a2a4a]">
        <div class="flex items-center justify-between">
          <h1 class="text-2xl font-bold text-white">阅读历史</h1>
          {history.length > 0 && (
            <button
              onClick={handleClearAll}
              class="text-sm text-red-400 hover:text-red-300"
            >
              清除全部
            </button>
          )}
        </div>
      </header>

      {loading ? (
        <div class="flex items-center justify-center py-16">
          <div class="w-8 h-8 border-2 border-[#e94560] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : history.length > 0 ? (
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
                  阅读至 {item.chapterTitle} 第 {item.page + 1} 页
                </p>
                <p class="text-xs text-gray-500 mt-1">
                  {new Date(item.readAt).toLocaleDateString()}
                </p>
              </div>
              <div class="flex items-center gap-2">
                <Button variant="secondary" size="sm">
                  继续
                </Button>
                <button
                  onClick={(e) => handleDelete(e, item.id)}
                  class="p-2 text-gray-500 hover:text-red-400"
                >
                  🗑️
                </button>
              </div>
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
