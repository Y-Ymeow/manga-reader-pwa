import { render } from 'preact';
import { App } from './App';
import { autoInitDatabase } from './db/global';
import { initPluginSystem, restorePluginsFromStorage } from './plugins/manager';
import './style.css';

(window as any).orginImage = window.Image;

// 自动初始化数据库（会执行版本 4 migration 创建缺失的 store）
autoInitDatabase();

// 初始化插件系统并恢复已安装的插件
initPluginSystem().then(async () => {
  try {
    // 恢复插件
    await restorePluginsFromStorage();
  } catch (e) {
    console.error('[App] Plugin restoration failed:', e);
  }
});

render(<App />, document.getElementById('app')!);
