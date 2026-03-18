/**
 * Plugin UI Runtime
 * 插件 UI 运行时 - 将插件的 sendMessage 调用映射到实际组件
 */

import { PluginUI } from './index';

/**
 * 设置插件 UI 桥接
 * 监听来自插件的 sendMessage 调用
 */
export function setupPluginUIBridge() {
  if (typeof window === 'undefined') return;

  // 暴露 sendMessage 给插件
  (window as any).__PLUGIN_UI_SEND_MESSAGE__ = (message: any) => {
    if (message?.method !== 'UI') return;

    const { function: funcName, ...params } = message;

    switch (funcName) {
      case 'showMessage': {
        PluginUI.showMessage(params.message, params.duration);
        break;
      }

      case 'showDialog': {
        PluginUI.showDialog(params.title, params.content, params.actions || []);
        break;
      }

      case 'showLoading': {
        const id = PluginUI.showLoading(params.onCancel);
        return id;
      }

      case 'cancelLoading': {
        PluginUI.cancelLoading(params.id);
        break;
      }

      case 'showInputDialog': {
        return PluginUI.showInputDialog(params.title, params.validator, params.image);
      }

      case 'showSelectDialog': {
        return PluginUI.showSelectDialog(params.title, params.options, params.initialIndex);
      }

      case 'launchUrl': {
        window.open(params.url, '_blank');
        break;
      }
    }
  };
}

/**
 * 插件 UI 适配器
 * 为插件提供兼容的 UI 对象
 */
export const PluginUIAdapter = {
  showMessage: (message: string) => {
    (window as any).__PLUGIN_UI_SEND_MESSAGE__({
      method: 'UI',
      function: 'showMessage',
      message,
    });
  },

  showDialog: (title: string, content: string, actions: any[]) => {
    (window as any).__PLUGIN_UI_SEND_MESSAGE__({
      method: 'UI',
      function: 'showDialog',
      title,
      content,
      actions,
    });
  },

  launchUrl: (url: string) => {
    (window as any).__PLUGIN_UI_SEND_MESSAGE__({
      method: 'UI',
      function: 'launchUrl',
      url,
    });
  },

  showLoading: (onCancel?: () => void | null) => {
    return (window as any).__PLUGIN_UI_SEND_MESSAGE__({
      method: 'UI',
      function: 'showLoading',
      onCancel,
    });
  },

  cancelLoading: (id: number) => {
    (window as any).__PLUGIN_UI_SEND_MESSAGE__({
      method: 'UI',
      function: 'cancelLoading',
      id,
    });
  },

  showInputDialog: (title: string, validator?: (value: string) => string | null | undefined, image?: string | ArrayBuffer | null) => {
    return (window as any).__PLUGIN_UI_SEND_MESSAGE__({
      method: 'UI',
      function: 'showInputDialog',
      title,
      validator,
      image,
    });
  },

  showSelectDialog: (title: string, options: string[], initialIndex?: number) => {
    return (window as any).__PLUGIN_UI_SEND_MESSAGE__({
      method: 'UI',
      function: 'showSelectDialog',
      title,
      options,
      initialIndex,
    });
  },
};
