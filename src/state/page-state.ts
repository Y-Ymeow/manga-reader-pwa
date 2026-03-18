/**
 * 简单的页面状态和历史记录管理
 */

import { createStore, getGlobalStore } from '../framework/state/store';

// ==================== 统一的页面状态 ====================

interface PageStates {
  explore: any;
  categories: any;
  search: any;
}

// ==================== 历史记录项 ====================

export interface HistoryItem {
  pageType: keyof PageStates;
  state: any; // 该页面的完整状态
  pluginKey?: string; // 用于快速访问
}

// ==================== 初始状态 ====================

interface AppState {
  pageStates: PageStates;
  history: HistoryItem[];
}

const initialState: AppState = {
  pageStates: {
    explore: {},
    categories: {},
    search: {},
  },
  history: [],
};

// ==================== 创建 Store ====================

const appStateStore = getGlobalStore('appState', {
  initialState: initialState as any,
  persist: false,
});

// ==================== Actions ====================

export const appStateActions = {
  // 更新页面状态
  setPageState: <T extends keyof PageStates>(pageType: T, state: PageStates[T]) => {
    const current = appStateStore.getState() as any as AppState;
    appStateStore.setState({
      pageStates: {
        ...current.pageStates,
        [pageType]: state,
      },
    } as any);
  },

  // 添加历史记录（进入新页面时调用）
  pushHistory: <T extends keyof PageStates>(pageType: T, state: PageStates[T]) => {
    const current = appStateStore.getState() as any as AppState;
    
    // 提取 pluginKey
    const pluginKey = (state as any).selectedPluginKey || (state as any).pluginKey;
    
    const newHistory = [
      ...current.history,
      { pageType, state, pluginKey },
    ];
    
    appStateStore.setState({
      history: newHistory,
    } as any);
  },

  // 回退历史
  goBack: (): HistoryItem | null => {
    const current = appStateStore.getState() as any as AppState;
    
    if (current.history.length === 0) {
      return null;
    }
    
    // 取出最后一个历史记录
    const lastHistory = current.history[current.history.length - 1];
    
    // 删除最后一个历史记录
    const newHistory = current.history.slice(0, -1);
    
    appStateStore.setState({
      history: newHistory,
    } as any);
    
    return lastHistory;
  },

  // 获取页面状态
  getPageState: <T extends keyof PageStates>(pageType: T): PageStates[T] => {
    const current = appStateStore.getState() as any as AppState;
    return current.pageStates[pageType];
  },

  // 清除历史
  clearHistory: () => {
    appStateStore.setState({
      history: [],
    } as any);
  },
};

// ==================== 导出 ====================

export { appStateStore };
export type { PageStates, AppState };

// 兼容旧代码
export const pageStateActions = appStateActions;
