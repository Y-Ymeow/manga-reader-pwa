/**
 * Tauri Compatibility Layer
 * Tauri 兼容层 - 提供 window.tauri / window.__TAURI__ 访问接口
 *
 * 此模块用于访问由父容器注入的全局 Tauri 桥接对象
 *
 * @example
 * ```typescript
 * import { getTauri, getSQL, getEAV } from './tauri';
 *
 * // 获取 Tauri 桥接对象
 * const tauri = getTauri();
 *
 * // 使用 SQL 接口
 * const sql = getSQL();
 * await sql.execute('CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT)');
 * const users = await sql.select('SELECT * FROM users');
 *
 * // 使用 EAV 接口
 * const eav = getEAV();
 * await eav.upsert('users', 'user1', { name: '张三', age: 25 });
 * const user = await eav.findOne('users', 'user1');
 * ```
 */

import type { SQLiteBridge, SQLiteResult } from './sqlite/types';

/**
 * 获取全局 Tauri 桥接对象
 * @returns Tauri 桥接对象
 */
export function getTauri(): typeof window.tauri | typeof window.__TAURI__ {
  if (window.tauri) {
    return window.tauri;
  }
  if (window.__TAURI__) {
    return window.__TAURI__;
  }
  throw new Error('Tauri bridge not found. Make sure the adapt script is loaded.');
}

/**
 * 获取 SQL 接口
 * @param pwaId PWA ID（可选，默认使用当前实例的 ID）
 */
export function getSQL(pwaId?: string) {
  const tauri = getTauri();
  if (pwaId) {
    // 如果需要指定 pwaId，调用 createSQL
    return (tauri as any).sql && typeof (tauri as any).createSQL === 'function'
      ? (tauri as any).createSQL(pwaId)
      : (tauri as any).sql;
  }
  return (tauri as any).sql;
}

/**
 * 获取 EAV 接口
 * @param pwaId PWA ID（可选，默认使用当前实例的 ID）
 * @param dbName 数据库名称
 */
export function getEAV(pwaId?: string, dbName?: string) {
  const tauri = getTauri();
  if (pwaId) {
    return (tauri as any).createEAV
      ? (tauri as any).createEAV(pwaId, dbName || 'default')
      : null;
  }
  return (tauri as any).eav;
}

/**
 * 获取 invoke 方法
 */
export function getInvoke(): (cmd: string, payload?: Record<string, unknown>) => Promise<SQLiteResult<unknown>> {
  const tauri = getTauri();
  return (tauri as any).invoke?.bind(tauri) || (() => {
    throw new Error('invoke method not found');
  });
}

/**
 * 获取当前 PWA ID
 */
export function getPwaId(): string {
  const tauri = getTauri();
  return (tauri as any).sql?.pwaId || (tauri as any).eav?.pwaId || 'default';
}

/**
 * 等待 Tauri 就绪
 */
export async function ready(): Promise<void> {
  const tauri = getTauri();
  if ((tauri as any).ready) {
    return (tauri as any).ready();
  }
  if ((tauri as any)._ready) {
    return Promise.resolve();
  }
  return Promise.resolve();
}

// 默认导出
export default {
  getTauri,
  getSQL,
  getEAV,
  getInvoke,
  getPwaId,
  ready,
};
