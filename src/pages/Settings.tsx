import { useState } from 'preact/hooks';
import { Button } from '@components/ui/Button';
import { navigate } from '@routes/index';

export function Settings() {
  const [settings, setSettings] = useState({
    autoUpdate: true,
    darkMode: true,
    cacheSize: '0 MB',
  });

  const handleClearCache = async () => {
    // TODO: Clear cache
    alert('缓存已清除');
  };

  return (
    <div class="min-h-full">
      <header class="px-4 py-4 border-b border-[#2a2a4a]">
        <h1 class="text-2xl font-bold text-white">设置</h1>
      </header>

      <div class="p-4 space-y-6">
        {/* General Settings */}
        <section>
          <h2 class="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3">
            常规
          </h2>
          <div class="bg-[#16213e] rounded-lg overflow-hidden">
            <SettingItem
              label="自动检查更新"
              description="每天自动检查收藏的漫画更新"
            >
              <Toggle
                checked={settings.autoUpdate}
                onChange={(v) => setSettings(s => ({ ...s, autoUpdate: v }))}
              />
            </SettingItem>
          </div>
        </section>

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
              class="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[#1a4a7a] transition-colors border-b border-[#2a2a4a]"
            >
              <div>
                <p class="text-white">缓存管理</p>
                <p class="text-sm text-gray-400">查看和管理漫画缓存</p>
              </div>
              <span class="text-gray-400">→</span>
            </button>
            <div class="flex items-center justify-between px-4 py-3">
              <div>
                <p class="text-white">缓存大小</p>
                <p class="text-sm text-gray-400">{settings.cacheSize}</p>
              </div>
              <Button variant="secondary" size="sm" onClick={handleClearCache}>
                清除缓存
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

interface SettingItemProps {
  label: string;
  description?: string;
  children: preact.ComponentChild;
}

function SettingItem({ label, description, children }: SettingItemProps) {
  return (
    <div class="flex items-center justify-between px-4 py-3 border-b border-[#2a2a4a] last:border-b-0">
      <div>
        <p class="text-white">{label}</p>
        {description && <p class="text-sm text-gray-400">{description}</p>}
      </div>
      {children}
    </div>
  );
}

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function Toggle({ checked, onChange }: ToggleProps) {
  return (
    <button
      onClick={() => onChange(!checked)}
      class={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        checked ? 'bg-[#e94560]' : 'bg-gray-600'
      }`}
    >
      <span
        class={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}
