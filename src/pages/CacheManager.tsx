import { useState, useEffect } from 'preact/hooks';
import { Button } from '@components/ui/Button';
import { getCacheManager } from '../fs/cache-manager';
import { getCacheQueue, type CacheTask } from '../fs/cache-queue';
import { navigate } from '@routes/index';
import { getDatabaseStats, clearAllStores } from '@db/cleanup';
import { clearPluginData, clearPluginMangaCache, listPluginDataKeys } from '@plugins/storage';
import { getPlugins } from '@plugins/index';

interface CacheStats {
  totalSize: number;
  fileCount: number;
  storageType: 'opfs' | 'local' | 'indexeddb';
}

interface DbCacheStats {
  totalRecords: number;
  storeStats: Array<{ name: string; count: number }>;
}

interface PluginCacheInfo {
  key: string;
  name: string;
  dataKeys: string[];
  cacheCount: number;
}

export function CacheManager() {
  const [stats, setStats] = useState<CacheStats | null>(null);
  const [dbStats, setDbStats] = useState<DbCacheStats | null>(null);
  const [tasks, setTasks] = useState<CacheTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [pluginCaches, setPluginCaches] = useState<PluginCacheInfo[]>([]);
  const [selectedPlugins, setSelectedPlugins] = useState<Set<string>>(new Set());

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

      // 获取 OPFS/文件缓存统计
      const cacheStats = await cacheManager.getStats();
      setStats(cacheStats);

      // 获取 IndexedDB 缓存统计
      const stats = await getDatabaseStats();
      const cacheStores = stats.filter(s =>
        s.storeName === 'manga_cache' ||
        s.storeName === 'plugin_settings' ||
        s.storeName === 'cache_index' ||
        s.storeName === 'file_cache'
      );
      const totalRecords = cacheStores.reduce((sum, s) => sum + (s.recordCount || 0), 0);
      setDbStats({
        totalRecords,
        storeStats: cacheStores.map(s => ({ name: s.storeName, count: s.recordCount || 0 })),
      });

      // 获取当前队列任务
      const cacheQueue = getCacheQueue();
      setTasks(cacheQueue.getAllTasks());

      // 加载插件缓存信息
      await loadPluginCacheInfo();
    } catch (e) {
      console.error('Failed to load cache info:', e);
    } finally {
      setLoading(false);
    }
  };

  const loadPluginCacheInfo = async () => {
    try {
      const plugins = getPlugins();
      const infos: PluginCacheInfo[] = [];

      for (const plugin of plugins) {
        const dataKeys = await listPluginDataKeys(plugin.key);
        const cacheCount = dataKeys.length;
        infos.push({
          key: plugin.key,
          name: plugin.name,
          dataKeys,
          cacheCount,
        });
      }

      setPluginCaches(infos);
    } catch (e) {
      console.error('Failed to load plugin cache info:', e);
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

  const handleClearLocalStorage = async () => {
    if (!confirm('确定要清除 localStorage 中的缓存吗？这将删除：\n- 插件配置数据\n- 域名配置\n- 搜索历史等\n\n此操作不会删除漫画图片缓存。')) {
      return;
    }

    setClearing(true);
    try {
      // 清除所有插件数据
      const plugins = getPlugins();
      for (const plugin of plugins) {
        await clearPluginData(plugin.key);
      }

      // 清除其他 localStorage 数据
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (
          key.startsWith('plugin_data_') ||
          key.startsWith('plugin_setting_') ||
          key.startsWith('manga_reader_')
        )) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));

      alert(`localStorage 缓存已清除完成！\n清除了 ${keysToRemove.length} 项数据`);
      await loadPluginCacheInfo();
    } catch (e: any) {
      console.error('Failed to clear localStorage:', e);
      alert('清除缓存失败：' + e.message);
    } finally {
      setClearing(false);
    }
  };

  const handleClearSelectedPlugins = async () => {
    if (selectedPlugins.size === 0) {
      alert('请先选择要清除的插件');
      return;
    }

    if (!confirm(`确定要清除选中的 ${selectedPlugins.size} 个插件的缓存吗？\n\n这将删除：\n- 插件配置数据\n- 漫画详情缓存\n- 缓存索引`)) {
      return;
    }

    setClearing(true);
    try {
      for (const pluginKey of selectedPlugins) {
        await clearPluginData(pluginKey);
        await clearPluginMangaCache(pluginKey);
      }

      alert(`已清除 ${selectedPlugins.size} 个插件的缓存`);
      setSelectedPlugins(new Set());
      await loadPluginCacheInfo();
      await loadCacheInfo();
    } catch (e: any) {
      console.error('Failed to clear selected plugins:', e);
      alert('清除缓存失败：' + e.message);
    } finally {
      setClearing(false);
    }
  };

  const togglePluginSelection = (pluginKey: string) => {
    setSelectedPlugins(prev => {
      const next = new Set(prev);
      if (next.has(pluginKey)) {
        next.delete(pluginKey);
      } else {
        next.add(pluginKey);
      }
      return next;
    });
  };

  const selectAllPlugins = () => {
    setSelectedPlugins(new Set(pluginCaches.map(p => p.key)));
  };

  const deselectAllPlugins = () => {
    setSelectedPlugins(new Set());
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

  const handleClearDbCache = async () => {
    if (!confirm('确定要清除 IndexedDB 中的缓存数据吗？这将删除：\n- 漫画详情缓存\n- 插件缓存数据\n- 缓存索引\n\n此操作不可恢复！')) {
      return;
    }

    setClearing(true);
    try {
      // 清除所有插件的缓存数据
      const { getPlugins } = await import('@plugins/index');
      const plugins = getPlugins();
      for (const plugin of plugins) {
        await clearPluginData(plugin.key);
        await clearPluginMangaCache(plugin.key);
      }

      // 清除 manga_cache, cache_index, file_cache store
      const storesToClear = ['manga_cache', 'cache_index', 'file_cache'];
      for (const storeName of storesToClear) {
        try {
          const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open('manga-reader');
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
          });
          
          if (db.objectStoreNames.contains(storeName)) {
            await new Promise<void>((resolve, reject) => {
              const tx = db.transaction([storeName], 'readwrite');
              const store = tx.objectStore(storeName);
              const request = store.clear();
              request.onsuccess = () => resolve();
              request.onerror = () => reject(request.error);
            });
          }
          db.close();
        } catch (e) {
          console.warn(`Failed to clear store ${storeName}:`, e);
        }
      }

      alert('IndexedDB 缓存已清除完成！');
      await loadCacheInfo();
    } catch (e: any) {
      console.error('Failed to clear DB cache:', e);
      alert('清除缓存失败：' + e.message);
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
      case 'local':
        return 'LocalStorage (Tauri 数据库)';
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
              <h2 class="text-white font-medium mb-3">图片缓存 (OPFS/LocalStorage)</h2>
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

            {/* IndexedDB 缓存统计 */}
            <div class="bg-[#16213e] rounded-xl p-4">
              <h2 class="text-white font-medium mb-3">IndexedDB 缓存</h2>
              {dbStats ? (
                <div class="space-y-2 text-sm">
                  <div class="flex justify-between">
                    <span class="text-gray-400">总记录数</span>
                    <span class="text-white">{dbStats.totalRecords} 条</span>
                  </div>
                  {dbStats.storeStats.map(store => (
                    <div key={store.name} class="flex justify-between">
                      <span class="text-gray-400">{store.name}</span>
                      <span class="text-white">{store.count} 条</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p class="text-gray-400 text-sm">无法获取 IndexedDB 缓存统计</p>
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
                  onClick={handleClearLocalStorage}
                  disabled={clearing}
                  variant="secondary"
                  className="w-full"
                >
                  {clearing ? '清除中...' : '清除 localStorage 缓存'}
                </Button>
                <Button
                  onClick={handleClearDbCache}
                  disabled={clearing}
                  variant="secondary"
                  className="w-full"
                >
                  {clearing ? '清除中...' : '清除 IndexedDB 缓存'}
                </Button>
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

            {/* 按插件清除 */}
            <div class="bg-[#16213e] rounded-xl p-4">
              <div class="flex items-center justify-between mb-3">
                <h2 class="text-white font-medium">按插件清除缓存</h2>
                <div class="flex gap-2">
                  <button
                    onClick={selectAllPlugins}
                    class="text-xs text-[#e94560] hover:underline"
                  >
                    全选
                  </button>
                  <button
                    onClick={deselectAllPlugins}
                    class="text-xs text-gray-400 hover:underline"
                  >
                    取消全选
                  </button>
                </div>
              </div>

              {pluginCaches.length > 0 ? (
                <div class="space-y-2 max-h-60 overflow-y-auto">
                  {pluginCaches.map((plugin) => (
                    <label
                      key={plugin.key}
                      class="flex items-center gap-3 p-2 bg-[#0f3460]/50 rounded-lg cursor-pointer hover:bg-[#0f3460]"
                    >
                      <input
                        type="checkbox"
                        checked={selectedPlugins.has(plugin.key)}
                        onChange={() => togglePluginSelection(plugin.key)}
                        class="w-4 h-4 accent-[#e94560]"
                      />
                      <div class="flex-1">
                        <p class="text-white text-sm">{plugin.name}</p>
                        <p class="text-xs text-gray-400">
                          {plugin.cacheCount} 项数据
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              ) : (
                <p class="text-gray-400 text-sm py-4 text-center">暂无插件缓存数据</p>
              )}

              <Button
                onClick={handleClearSelectedPlugins}
                disabled={clearing || selectedPlugins.size === 0}
                variant="secondary"
                className="w-full mt-3"
              >
                {clearing ? '清除中...' : `清除选中的插件缓存 (${selectedPlugins.size})`}
              </Button>
            </div>

            {/* 说明 */}
            <div class="bg-[#16213e]/50 rounded-xl p-4">
              <h3 class="text-white font-medium mb-2">说明</h3>
              <ul class="text-sm text-gray-400 space-y-1 list-disc list-inside">
                <li>缓存用于离线阅读漫画</li>
                <li>同一漫画源的缓存按队列顺序执行，避免触发反爬</li>
                <li>优先使用 OPFS 存储，容量更大</li>
                <li>缓存文件默认保留 30 天</li>
                <li>localStorage 存储插件配置和域名设置</li>
                <li>可按插件选择清除缓存，避免影响其他插件</li>
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
