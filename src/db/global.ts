/**
 * 全局数据库管理
 * 确保数据库在应用启动时初始化
 */

import { initDatabase as initDB, closeDatabase } from './index';

let initPromise: Promise<void> | null = null;
let isInitialized = false;

/**
 * 初始化数据库（全局单例）
 * 多次调用只会执行一次
 */
export async function initGlobalDatabase(): Promise<void> {
  if (isInitialized) return;
  if (initPromise) return initPromise;

  initPromise = initDB()
    .then(() => {
      isInitialized = true;
      console.log('Database initialized');
    })
    .catch((e) => {
      console.error('Failed to initialize database:', e);
      throw e;
    });

  return initPromise;
}

/**
 * 检查数据库是否已初始化
 */
export function isDatabaseInitialized(): boolean {
  return isInitialized;
}

/**
 * 等待数据库初始化完成
 */
export async function waitForDatabase(): Promise<void> {
  if (isInitialized) return;
  if (initPromise) return initPromise;
  return initGlobalDatabase();
}

/**
 * 关闭数据库
 */
export async function closeGlobalDatabase(): Promise<void> {
  await closeDatabase();
  isInitialized = false;
  initPromise = null;
}

/**
 * 自动初始化数据库
 * 在应用启动时调用
 */
export function autoInitDatabase(): void {
  // 页面加载完成后初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initGlobalDatabase();
    });
  } else {
    initGlobalDatabase();
  }
}
