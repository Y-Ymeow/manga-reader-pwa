import { useState } from 'preact/hooks';
import { Button } from '@components/ui/Button';
import { navigate } from '@routes/index';
import { clearAllStores, clearLocalStorage } from '@db/cleanup';
import { getCacheManager } from '../fs/cache-manager';
import { clearPluginData, clearPluginMangaCache } from '@plugins/storage';

export function Settings() {
  const [isClearing, setIsClearing] = useState(false);

  const handleClearCache = async () => {
    if (!confirm('确定要清除所有缓存吗？这将删除：\n- 所有漫画图片缓存\n- 插件缓存数据\n- 数据库中的所有记录\n\n此操作不可恢复！')) {
      return;
    }

    setIsClearing(true);
    try {
      // 1. 清除漫画图片缓存（OPFS）
      const cacheManager = getCacheManager();
      await cacheManager.init();
      await cacheManager.cleanup(0); // 清除所有

      // 2. 清除所有插件数据
      const { getPlugins } = await import('@plugins/index');
      const plugins = getPlugins();
      for (const plugin of plugins) {
        await clearPluginData(plugin.key);
        await clearPluginMangaCache(plugin.key);
      }

      // 3. 清除所有 store
      await clearAllStores();

      // 4. 清除 localStorage
      const clearedCount = clearLocalStorage();

      alert(`缓存已清除完成！\n- 清除了 ${clearedCount} 项 localStorage 数据\n- 清除了所有插件数据\n- 清除了所有数据库记录\n\n请刷新页面以生效。`);
      
      // 刷新页面
      window.location.reload();
    } catch (e: any) {
      console.error('Failed to clear cache:', e);
      alert('清除缓存失败：' + e.message);
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div class="min-h-full">
      <header class="px-4 py-4 border-b border-[#2a2a4a]">
        <h1 class="text-2xl font-bold text-white">设置</h1>
      </header>

      <div class="p-4 space-y-6">
        {/* Plugins */}
        <section>
          <h2 class="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3">
            插件
          </h2>
          <div class="bg-[#16213e] rounded-lg overflow-hidden">
            <button
              onClick={() => navigate('plugins')}
              class="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[#1a4a7a] transition-colors"
            >
              <div>
                <p class="text-white">插件管理</p>
                <p class="text-sm text-gray-400">安装、管理漫画源插件</p>
              </div>
              <span class="text-gray-400">→</span>
            </button>
          </div>
        </section>

        {/* Cache Settings */}
        <section>
          <h2 class="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3">
            存储
          </h2>
          <div class="bg-[#16213e] rounded-lg overflow-hidden">
            <button
              onClick={() => navigate('cache-manager')}
              class="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[#1a4a7a] transition-colors"
            >
              <div>
                <p class="text-white">缓存管理</p>
                <p class="text-sm text-gray-400">查看缓存统计和清理</p>
              </div>
              <span class="text-gray-400">→</span>
            </button>
            <div class="flex items-center justify-between px-4 py-3 border-t border-[#2a2a4a]">
              <div>
                <p class="text-white">清除所有数据</p>
                <p class="text-sm text-gray-400">删除所有缓存和记录</p>
              </div>
              <Button variant="secondary" size="sm" onClick={handleClearCache} disabled={isClearing}>
                {isClearing ? '清除中...' : '清除'}
              </Button>
            </div>
          </div>
        </section>

        {/* About */}
        <section>
          <h2 class="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3">
            关于
          </h2>
          <div class="bg-[#16213e] rounded-lg p-4">
            <p class="text-white font-medium">Manga Reader</p>
            <p class="text-sm text-gray-400 mt-1">版本 0.1.0</p>
            <p class="text-sm text-gray-500 mt-2">
              一个支持插件的 PWA 漫画阅读器
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
