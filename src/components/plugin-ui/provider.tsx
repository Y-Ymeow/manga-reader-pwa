/**
 * Plugin UI Provider
 * 插件 UI 提供者 - 在应用根组件中使用
 *
 * @example
 * ```tsx
 * import { PluginUIProvider, PluginUIComponents } from './plugin-ui/provider';
 *
 * // 在 App 组件中
 * export function App() {
 *   return (
 *     <PluginUIProvider>
 *       <MainContent />
 *       <PluginUIComponents />
 *     </PluginUIProvider>
 *   );
 * }
 * ```
 */

import { useEffect } from 'preact/hooks';
import {
  ToastMessage,
  Dialog,
  LoadingOverlay,
  InputDialog,
  SelectDialog,
  registerGlobalUI,
} from './index';
import { setupPluginUIBridge } from './runtime';

/**
 * 注册全局 UI 和桥接
 */
export function usePluginUI() {
  useEffect(() => {
    // 注册全局 UI 对象
    registerGlobalUI();
    
    // 设置桥接
    setupPluginUIBridge();
  }, []);
}

/**
 * 插件 UI 组件集合
 * 在应用根组件中渲染一次
 */
export function PluginUIComponents() {
  usePluginUI();

  return (
    <>
      <ToastMessage />
      <Dialog />
      <LoadingOverlay />
      <InputDialog />
      <SelectDialog />
    </>
  );
}

/**
 * 插件 UI Provider 组件
 */
export function PluginUIProvider({ children }: { children: any }) {
  usePluginUI();
  return children;
}
