import { useState, useEffect } from 'preact/hooks';
import { Button } from '@components/ui/Button';
import { getCacheManager } from '../fs/cache-manager';
import { getCacheQueue, type CacheTask } from '../fs/cache-queue';
import { navigate } from '@routes/index';

interface CacheStats {
  totalSize: number;
  fileCount: number;
  storageType: 'opfs' | 'fs' | 'indexeddb';
}

export function CacheManager() {
  const [stats, setStats] = useState<CacheStats | null>(null);
  const [tasks, setTasks] = useState<CacheTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadCacheInfo();

    // 订阅队列变化
    const cacheQueue = getCacheQueue();
    const unsubscribe = cacheQueue.subscribe((newTasks) => {
      setTasks(newTasks);
    });

    return () => unsubscribe();
  }, []);

  const loadCacheInfo = async () => {
    setLoading(true);
    try {
      const cacheManager = getCacheManager();
      await cacheManager.init();

      // 获取统计
      const cacheStats = await cacheManager.getStats();
      setStats(cacheStats);

      // 获取当前队列任务
      const cacheQueue = getCacheQueue();
      setTasks(cacheQueue.getAllTasks());
    } catch (e) {
      console.error('Failed to load cache info:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleClearAllCache = async () => {
    if (!confirm('确定要清除所有缓存吗？这将删除所有已下载的漫画图片。')) {
      return;
    }

    setClearing(true);
    try {
      const cacheManager = getCacheManager();
      await cacheManager.init();

      // 清除所有缓存（需要遍历所有 manga）
      // 这里简化处理，清除 30 天前的所有缓存
      const deletedCount = await cacheManager.cleanup(0);

      alert(`已清除缓存`);
      await loadCacheInfo();
    } catch (e) {
      console.error('Failed to clear cache:', e);
      alert('清除缓存失败');
    } finally {
      setClearing(false);
    }
  };

  const handleClearOldCache = async () => {
    if (!confirm('确定要清除 30 天前的缓存吗？')) {
      return;
    }

    setClearing(true);
    try {
      const cacheManager = getCacheManager();
      await cacheManager.init();
      const deletedCount = await cacheManager.cleanup(30);
      alert(`已清除 ${deletedCount} 个旧缓存文件`);
      await loadCacheInfo();
    } catch (e) {
      console.error('Failed to clear old cache:', e);
      alert('清除缓存失败');
    } finally {
      setClearing(false);
    }
  };

  const formatSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleCancelTask = (taskId: string) => {
    if (!confirm('确定要取消这个缓存任务吗？')) return;
    const cacheQueue = getCacheQueue();
    cacheQueue.cancelTask(taskId);
  };

  const toggleTaskExpand = (taskId: string) => {
    setExpandedTasks(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };

  const getStatusText = (status: CacheTask['status']) => {
    switch (status) {
      case 'pending': return '等待中';
      case 'running': return '进行中';
      case 'completed': return '已完成';
      case 'failed': return '失败';
      default: return status;
    }
  };

  const getStatusColor = (status: CacheTask['status']) => {
    switch (status) {
      case 'pending': return 'text-yellow-400';
      case 'running': return 'text-blue-400';
      case 'completed': return 'text-green-400';
      case 'failed': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  const getStorageTypeName = (type: string): string => {
    switch (type) {
      case 'opfs':
        return 'OPFS (浏览器私有文件系统)';
      case 'fs':
        return '文件系统 (Tauri)';
      case 'indexeddb':
        return 'IndexedDB';
      default:
        return type;
    }
  };

  return (
    <div class="min-h-full pb-4">
      {/* Header */}
      <header class="sticky top-0 z-10 bg-[#1a1a2e]/95 backdrop-blur-sm border-b border-[#2a2a4a] px-4 py-3">
        <div class="flex items-center justify-between">
          <h1 class="text-xl font-bold text-[#e94560]">缓存管理</h1>
          <button
            onClick={() => navigate('settings')}
            class="text-gray-400 hover:text-white"
          >
            ← 返回
          </button>
        </div>
      </header>

      <div class="px-4 py-4 space-y-4">
        {loading ? (
          <div class="flex items-center justify-center py-12">
            <div class="w-8 h-8 border-2 border-[#e94560] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* 统计卡片 */}
            <div class="bg-[#16213e] rounded-xl p-4">
              <h2 class="text-white font-medium mb-3">缓存统计</h2>
              {stats ? (
                <div class="space-y-2 text-sm">
                  <div class="flex justify-between">
                    <span class="text-gray-400">存储类型</span>
                    <span class="text-white">{getStorageTypeName(stats.storageType)}</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-gray-400">文件数量</span>
                    <span class="text-white">{stats.fileCount} 个</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-gray-400">总大小</span>
                    <span class="text-white">{formatSize(stats.totalSize)}</span>
                  </div>
                </div>
              ) : (
                <p class="text-gray-400 text-sm">无法获取缓存统计</p>
              )}
            </div>

            {/* 缓存队列 */}
            <div class="bg-[#16213e] rounded-xl p-4">
              <div class="flex items-center justify-between mb-3">
                <h2 class="text-white font-medium">缓存队列</h2>
                <span class="text-xs text-gray-400">
                  同漫画源顺序执行，避免反爬
                </span>
              </div>
              {tasks.length === 0 ? (
                <p class="text-gray-400 text-sm">暂无缓存任务</p>
              ) : (
                <div class="space-y-2 max-h-80 overflow-y-auto">
                  {tasks.map((task) => (
                    <div
                      key={task.id}
                      class="bg-[#0f3460]/50 rounded-lg p-3 text-sm"
                    >
                      <div class="flex items-center justify-between">
                        <span class="text-white truncate flex-1" title={task.mangaTitle}>
                          {task.mangaTitle.length > 25
                            ? task.mangaTitle.slice(0, 25) + '...'
                            : task.mangaTitle}
                        </span>
                        <span class={`ml-2 ${getStatusColor(task.status)}`}>
                          {getStatusText(task.status)}
                        </span>
                      </div>

                      {/* 章节信息 */}
                      <div class="mt-2 text-xs text-gray-400">
                        <div class="flex items-center justify-between">
                          <span>共 {task.chapters.length} 个章节</span>
                          <button
                            onClick={() => toggleTaskExpand(task.id)}
                            class="text-[#e94560] hover:text-[#d63d56]"
                          >
                            {expandedTasks.has(task.id) ? '收起 ▲' : '展开 ▼'}
                          </button>
                        </div>
                        {expandedTasks.has(task.id) && (
                          <div class="mt-2 max-h-32 overflow-y-auto bg-[#1a1a2e]/50 rounded p-2">
                            {task.chapters.map((ch, idx) => (
                              <div
                                key={ch.id}
                                class={`text-xs ${
                                  task.status === 'running' && idx < task.progress.currentChapter
                                    ? 'text-green-400'
                                    : task.status === 'running' && idx === task.progress.currentChapter - 1
                                    ? 'text-blue-400'
                                    : 'text-gray-500'
                                }`}
                              >
                                {ch.title}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {task.status === 'running' && (
                        <div class="mt-2">
                          <div class="flex justify-between text-xs text-gray-400">
                            <span>
                              当前: {task.chapters[task.progress.currentChapter - 1]?.title || '准备中'}
                            </span>
                            <span>
                              {task.progress.totalImages > 0
                                ? Math.round(((task.progress.cachedImages + task.progress.skippedImages) / task.progress.totalImages) * 100)
                                : 0}%
                            </span>
                          </div>
                          <div class="mt-1 h-1 bg-[#1a1a2e] rounded-full overflow-hidden">
                            <div
                              class="h-full bg-[#e94560] transition-all"
                              style={{
                                width: `${task.progress.totalImages > 0
                                  ? ((task.progress.cachedImages + task.progress.skippedImages) / task.progress.totalImages) * 100
                                  : 0}%`
                              }}
                            />
                          </div>
                          <p class="text-xs text-gray-500 mt-1">
                            章节 {task.progress.currentChapter}/{task.progress.totalChapters} ·
                            已缓存 {task.progress.cachedImages} 张
                            {task.progress.skippedImages > 0 && ` (${task.progress.skippedImages} 张已存在)`}
                          </p>
                        </div>
                      )}

                      {(task.status === 'pending' || task.status === 'running') && (
                        <button
                          onClick={() => handleCancelTask(task.id)}
                          class="mt-2 text-xs text-red-400 hover:text-red-300"
                        >
                          取消任务
                        </button>
                      )}

                      {task.error && (
                        <p class="mt-1 text-xs text-red-400">{task.error}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 操作按钮 */}
            <div class="bg-[#16213e] rounded-xl p-4">
              <h2 class="text-white font-medium mb-3">缓存操作</h2>
              <div class="space-y-3">
                <Button
                  onClick={handleClearOldCache}
                  disabled={clearing}
                  variant="secondary"
                  className="w-full"
                >
                  {clearing ? '清除中...' : '清除 30 天前的缓存'}
                </Button>
                <Button
                  onClick={handleClearAllCache}
                  disabled={clearing}
                  variant="secondary"
                  className="w-full bg-red-900/50 hover:bg-red-800/50 text-red-200"
                >
                  {clearing ? '清除中...' : '清除所有缓存'}
                </Button>
                <Button
                  onClick={loadCacheInfo}
                  disabled={loading}
                  variant="secondary"
                  className="w-full"
                >
                  刷新统计
                </Button>
              </div>
            </div>

            {/* 说明 */}
            <div class="bg-[#16213e]/50 rounded-xl p-4">
              <h3 class="text-white font-medium mb-2">说明</h3>
              <ul class="text-sm text-gray-400 space-y-1 list-disc list-inside">
                <li>缓存用于离线阅读漫画</li>
                <li>同一漫画源的缓存按队列顺序执行，避免触发反爬</li>
                <li>优先使用 OPFS 存储，容量更大</li>
                <li>缓存文件默认保留 30 天</li>
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
