import { render } from 'preact';
import { App } from './App';
import { autoInitDatabase } from './db/global';
import { initPluginSystem, restorePluginsFromStorage, debugPluginStorage } from './plugins/manager';
import './style.css';

(window as any).orginImage = window.Image;

// 自动初始化数据库
autoInitDatabase();

// 初始化插件系统并恢复已安装的插件
initPluginSystem().then(async () => {
  // 先调试检查存储状态
  await debugPluginStorage();
  // 然后恢复插件
  await restorePluginsFromStorage();
  console.log('[App] Plugin restoration completed');
  // 再次检查存储状态
  await debugPluginStorage();
});

render(<App />, document.getElementById('app')!);
