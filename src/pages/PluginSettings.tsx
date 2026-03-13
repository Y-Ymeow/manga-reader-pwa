import { useState, useEffect } from "preact/hooks";
import { Button } from "@components/ui/Button";
import { navigate } from "@routes/index";
import {
  getPlugin,
  restorePluginsFromStorage,
  type PluginInstance,
  type SettingOption,
} from "@plugins/index";

interface PluginSettingsProps {
  pluginKey?: string;
}

export function PluginSettings({ pluginKey }: PluginSettingsProps) {
  const [plugin, setPlugin] = useState<PluginInstance | null>(null);
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!pluginKey) {
      setLoading(false);
      return;
    }

    const loadPlugin = async () => {
      setLoading(true);

      // 先尝试获取已加载的插件
      let p = await getPlugin(pluginKey);

      // 如果没有找到，尝试从存储恢复
      if (!p) {
        await restorePluginsFromStorage();
        p = await getPlugin(pluginKey);
      }

      if (p) {
        setPlugin(p);
        // 加载当前设置值
        const currentSettings: Record<string, any> = {};
        if (p.settings) {
          Object.entries(p.settings).forEach(([key, option]) => {
            currentSettings[key] = p.loadSetting(key) ?? option.default;
          });
        }
        setSettings(currentSettings);
      }

      setLoading(false);
    };

    loadPlugin();
  }, [pluginKey]);

  if (loading) {
    return (
      <div class="min-h-full flex items-center justify-center">
        <p class="text-gray-400">加载中...</p>
      </div>
    );
  }

  const handleSave = () => {
    if (!plugin) return;

    Object.entries(settings).forEach(([key, value]) => {
      plugin.saveSetting(key, value);
    });

    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleChange = (key: string, value: any) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  if (!plugin) {
    return (
      <div class="min-h-full flex flex-col items-center justify-center">
        <p class="text-gray-400">插件不存在</p>
        <Button
          variant="secondary"
          className="mt-4"
          onClick={() => navigate("plugins")}
        >
          返回插件列表
        </Button>
      </div>
    );
  }

  if (!plugin.settings || Object.keys(plugin.settings).length === 0) {
    return (
      <div class="min-h-full">
        <header class="sticky top-0 z-10 bg-[#1a1a2e]/95 backdrop-blur-sm border-b border-[#2a2a4a] px-4 py-3">
          <div class="flex items-center gap-3">
            <button
              onClick={() => navigate("plugins")}
              class="text-white text-xl"
            >
              ←
            </button>
            <h1 class="text-xl font-bold text-white">{plugin.name} - 设置</h1>
          </div>
        </header>
        <div class="flex flex-col items-center justify-center py-16 text-gray-400">
          <p>该插件没有可配置的设置</p>
          <Button
            variant="secondary"
            className="mt-4"
            onClick={() => navigate("plugins")}
          >
            返回
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div class="min-h-full">
      {/* Header */}
      <header class="sticky top-0 z-10 bg-[#1a1a2e]/95 backdrop-blur-sm border-b border-[#2a2a4a] px-4 py-3">
        <div class="flex items-center gap-3">
          <button
            onClick={() => navigate("plugins")}
            class="text-white text-xl"
          >
            ←
          </button>
          <h1 class="text-xl font-bold text-white">{plugin.name} - 设置</h1>
        </div>
      </header>

      <div class="p-4 space-y-6">
        {/* Saved message */}
        {saved && (
          <div class="p-3 bg-green-900/50 border border-green-700 rounded-lg text-sm text-green-400">
            设置已保存
          </div>
        )}

        {/* Settings */}
        <div class="space-y-4">
          {Object.entries(plugin.settings).map(([key, option]) => (
            <SettingItem
              key={key}
              settingKey={key}
              option={option}
              value={settings[key]}
              onChange={(value) => handleChange(key, value)}
            />
          ))}
        </div>

        {/* Save button */}
        <Button onClick={handleSave} className="w-full">
          保存设置
        </Button>
      </div>
    </div>
  );
}

interface SettingItemProps {
  settingKey: string;
  option: SettingOption;
  value: any;
  onChange: (value: any) => void;
}

function SettingItem({
  settingKey,
  option,
  value,
  onChange,
}: SettingItemProps) {
  return (
    <div class="bg-[#16213e] rounded-lg p-4">
      <label class="block text-white font-medium mb-2">{option.title}</label>

      {option.type === "select" && (
        <select
          value={value || ""}
          onChange={(e) => onChange((e.target as HTMLSelectElement).value)}
          class="w-full px-3 py-2 bg-[#1a1a2e] border border-[#2a2a4a] rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-[#e94560]"
        >
          {option.options?.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.text || opt.value}
            </option>
          ))}
        </select>
      )}

      {option.type === "input" && (
        <input
          type="text"
          value={value || ""}
          onInput={(e) => onChange((e.target as HTMLInputElement).value)}
          class="w-full px-3 py-2 bg-[#1a1a2e] border border-[#2a2a4a] rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-[#e94560]"
        />
      )}

      {option.type === "switch" && (
        <button
          onClick={() => onChange(!value)}
          class={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            value ? "bg-[#e94560]" : "bg-gray-600"
          }`}
        >
          <span
            class={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              value ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      )}

      {option.type === "callback" && (
        <button
          onClick={() => option.callback?.()}
          class="px-4 py-2 bg-[#0f3460] text-white rounded-lg hover:bg-[#1a4a7a] transition-colors"
        >
          {option.buttonText || "点击"}
        </button>
      )}
    </div>
  );
}
