import { useState, useEffect } from "preact/hooks";
import { Button } from "@components/ui/Button";
import { Input } from "@components/ui/Input";
import { navigate } from "@routes/index";
import {
  initPluginSystem,
  loadPluginFromUrl,
  loadSourceList,
  getPlugins,
  restorePluginsFromStorage,
  getSavedSourceListUrl,
  deletePlugin,
  type SourceListItem,
  type PluginInstance,
} from "@plugins/index";
import { listStoredPlugins, loadPluginCode, savePluginCode } from "@plugins/storage";

// 存储已安装插件的 key 集合
let installedPluginKeys: Set<string> = new Set();

export function Plugins() {
  const [plugins, setPlugins] = useState<PluginInstance[]>([]);
  const [sourceList, setSourceList] = useState<SourceListItem[]>([]);
  const [sourceListUrl, setSourceListUrl] = useState("");
  const [pluginUrl, setPluginUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  // 编辑相关状态
  const [editingPlugin, setEditingPlugin] = useState<PluginInstance | null>(null);
  const [editCode, setEditCode] = useState("");
  const [showEditModal, setShowEditModal] = useState(false);

  // Tabs 状态
  const [activeTab, setActiveTab] = useState<'available' | 'installed'>('installed');

  useEffect(() => {
    // 初始化插件系统
    const init = async () => {
      await initPluginSystem();
      // 从存储恢复插件
      await restorePluginsFromStorage();
      setPlugins(getPlugins());

      // 加载已安装插件列表
      const storedKeys = await listStoredPlugins();
      installedPluginKeys = new Set(storedKeys);

      // 加载保存的源列表地址
      const savedUrl = await getSavedSourceListUrl();
      if (savedUrl) {
        setSourceListUrl(savedUrl);
        // 自动加载源列表
        try {
          const list = await loadSourceList(savedUrl, false);
          setSourceList(list);
        } catch (e) {
          console.error("Failed to load saved source list:", e);
        }
      }
    };
    init();
  }, []);

  const handleLoadSourceList = async () => {
    if (!sourceListUrl.trim()) return;
    setLoading(true);
    try {
      const list = await loadSourceList(sourceListUrl);
      setSourceList(list);
      setMessage(`加载了 ${list.length} 个源`);
    } catch (e: any) {
      setMessage(`加载失败: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleInstallFromUrl = async () => {
    if (!pluginUrl.trim()) return;
    setLoading(true);
    try {
      const plugin = await loadPluginFromUrl(pluginUrl);
      installedPluginKeys.add(plugin.key);
      setPlugins(getPlugins());
      setMessage(`已安装: ${plugin.name}`);
      setPluginUrl("");
    } catch (e: any) {
      setMessage(`安装失败: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleInstallFromList = async (item: SourceListItem) => {
    setLoading(true);
    try {
      // 假设源列表的 base URL 与 JSON 文件相同
      const baseUrl = sourceListUrl.substring(
        0,
        sourceListUrl.lastIndexOf("/") + 1,
      );
      const pluginUrl = baseUrl + item.fileName;
      const plugin = await loadPluginFromUrl(pluginUrl);
      installedPluginKeys.add(plugin.key);
      setPlugins(getPlugins());
      setMessage(`已安装: ${plugin.name}`);
    } catch (e: any) {
      setMessage(`安装失败: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePlugin = async (plugin: PluginInstance) => {
    if (!confirm(`确定要删除插件 "${plugin.name}" 吗？`)) {
      return;
    }
    setLoading(true);
    try {
      await deletePlugin(plugin.key);
      installedPluginKeys.delete(plugin.key);
      setPlugins(getPlugins());
      setMessage(`已删除: ${plugin.name}`);
    } catch (e: any) {
      setMessage(`删除失败: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleEditPlugin = async (plugin: PluginInstance) => {
    setLoading(true);
    try {
      const code = await loadPluginCode(plugin.key);
      if (code) {
        setEditingPlugin(plugin);
        setEditCode(code);
        setShowEditModal(true);
      } else {
        setMessage("无法加载插件代码");
      }
    } catch (e: any) {
      setMessage(`加载失败: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editingPlugin) return;
    setLoading(true);
    try {
      // 保存新代码
      await savePluginCode(editingPlugin.key, editCode);
      // 重新加载插件
      const { loadPlugin } = await import("@plugins/index");
      await loadPlugin(editCode, false);
      setPlugins(getPlugins());
      setMessage(`已更新: ${editingPlugin.name}`);
      setShowEditModal(false);
      setEditingPlugin(null);
      setEditCode("");
    } catch (e: any) {
      setMessage(`保存失败: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  // 检查插件是否已安装
  const isPluginInstalled = (key: string) => {
    return installedPluginKeys.has(key) || plugins.some(p => p.key === key);
  };

  // 检查源列表中的插件是否有更新
  const hasUpdate = (item: SourceListItem) => {
    const installed = plugins.find(p => p.key === item.key);
    if (!installed) return false;
    // 比较版本号（简单字符串比较）
    return installed.version !== item.version;
  };

  // 获取已安装插件的版本
  const getInstalledVersion = (key: string) => {
    const installed = plugins.find(p => p.key === key);
    return installed?.version || null;
  };

  return (
    <div class="min-h-full">
      {/* Header */}
      <header class="sticky top-0 z-10 bg-[#1a1a2e]/95 backdrop-blur-sm border-b border-[#2a2a4a] px-4 py-3">
        <div class="flex items-center gap-3">
          <button
            onClick={() => navigate("settings")}
            class="text-white text-xl"
          >
            ←
          </button>
          <h1 class="text-xl font-bold text-white">插件管理</h1>
        </div>
      </header>

      <div class="p-4 space-y-6">
        {/* Message */}
        {message && (
          <div class="p-3 bg-[#0f3460] rounded-lg text-sm text-white">
            {message}
          </div>
        )}

        {/* Tabs */}
        <div class="flex gap-2 border-b border-gray-700 pb-2">
          <button
            onClick={() => setActiveTab('installed')}
            class={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'installed'
                ? 'text-[#e94560] border-b-2 border-[#e94560]'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            已安装 ({plugins.length})
          </button>
          <button
            onClick={() => setActiveTab('available')}
            class={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'available'
                ? 'text-[#e94560] border-b-2 border-[#e94560]'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            可用源 ({sourceList.length})
          </button>
        </div>

        {/* Installed Plugins Tab */}
        {activeTab === 'installed' && (
          <section>
            {plugins.length > 0 ? (
              <div class="space-y-2">
                {plugins.map((plugin) => (
                  <div
                    key={plugin.key}
                    class="flex items-center justify-between p-3 bg-[#16213e] rounded-lg"
                  >
                    <div>
                      <p class="text-white font-medium">{plugin.name}</p>
                      <p class="text-xs text-gray-400">v{plugin.version}</p>
                    </div>
                  <div class="flex gap-2">
                    {plugin.settings && Object.keys(plugin.settings).length > 0 && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => navigate('plugin-settings', { key: plugin.key })}
                      >
                        设置
                      </Button>
                    )}
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleEditPlugin(plugin)}
                    >
                      编辑
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeletePlugin(plugin)}
                    >
                      删除
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p class="text-gray-400 text-center py-8">暂无已安装插件</p>
          )}
        </section>
        )}

        {/* Available Sources Tab */}
        {activeTab === 'available' && (
          <section class="space-y-4">
            {/* Load Source List */}
            <div class="flex gap-2">
              <div class="flex-1">
                <Input
                  value={sourceListUrl}
                  onChange={setSourceListUrl}
                  placeholder="输入源列表 JSON 地址..."
                />
              </div>
              <Button onClick={handleLoadSourceList} disabled={loading}>
                加载
              </Button>
            </div>

            {/* Source List */}
            {sourceList.length > 0 ? (
              <div class="space-y-2">
                {sourceList.map((item) => {
                  const installed = isPluginInstalled(item.key);
                  const updateAvailable = hasUpdate(item);
                  const installedVersion = getInstalledVersion(item.key);

                  return (
                    <div
                      key={item.key}
                      class="flex items-center justify-between p-3 bg-[#16213e] rounded-lg"
                    >
                      <div>
                        <p class="text-white font-medium">{item.name}</p>
                        <p class="text-xs text-gray-400">
                          最新版本：v{item.version}
                          {installedVersion && (
                            <span class="ml-2">
                              (当前：v{installedVersion})
                              {updateAvailable && (
                                <span class="ml-2 text-[#e94560] font-medium">
                                  → 可更新
                                </span>
                              )}
                            </span>
                          )}
                        </p>
                      </div>
                      <Button
                        variant={installed ? (updateAvailable ? "primary" : "secondary") : "secondary"}
                        size="sm"
                        onClick={() => handleInstallFromList(item)}
                        disabled={loading}
                      >
                        {installed ? (updateAvailable ? "更新" : "重新安装") : "安装"}
                      </Button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p class="text-gray-400 text-center py-8">
                {sourceListUrl ? '加载中...' : '请输入源列表地址'}
              </p>
            )}

            {/* Install from URL */}
            <div class="pt-4 border-t border-gray-700">
              <h3 class="text-sm font-medium text-white mb-2">从 URL 安装</h3>
              <div class="flex gap-2">
                <div class="flex-1">
                  <Input
                    value={pluginUrl}
                    onChange={setPluginUrl}
                    placeholder="输入插件 JS 文件地址..."
                  />
                </div>
                <Button onClick={handleInstallFromUrl} disabled={loading}>
                  安装
                </Button>
              </div>
            </div>
          </section>
        )}
      </div>

      {/* Edit Modal */}
      {showEditModal && editingPlugin && (
        <div
          class="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setShowEditModal(false)}
        >
          <div
            class="bg-[#1a1a2e] rounded-xl w-full max-w-4xl h-[80vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div class="p-4 border-b border-gray-700 flex items-center justify-between">
              <h2 class="text-xl font-bold text-white">
                编辑: {editingPlugin.name}
              </h2>
              <button
                onClick={() => setShowEditModal(false)}
                class="text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div class="flex-1 p-4">
              <textarea
                value={editCode}
                onChange={(e) => setEditCode((e.target as HTMLTextAreaElement).value)}
                class="w-full h-full bg-[#0f3460] text-white font-mono text-sm p-4 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-[#e94560]"
                spellcheck={false}
              />
            </div>

            <div class="p-4 border-t border-gray-700 flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setShowEditModal(false)}>
                取消
              </Button>
              <Button onClick={handleSaveEdit} disabled={loading}>
                {loading ? "保存中..." : "保存"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
