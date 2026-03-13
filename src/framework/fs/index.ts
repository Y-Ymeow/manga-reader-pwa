/**
 * FS Module
 * 基于 Tauri Adapt Bridge 的文件系统模块
 *
 * 此模块提供真实的文件系统访问能力，但仅在 Tauri Adapt Bridge
 * 就绪且有效时才能使用。
 *
 * @example
 * ```typescript
 * import { FS, isFSAvailable, waitForFS } from './framework/fs';
 *
 * // 检查 FS 是否可用
 * if (isFSAvailable()) {
 *   const fs = new FS({ baseDir: '/app-data' });
 *   await fs.writeFile('config.json', JSON.stringify(config));
 * }
 *
 * // 或等待 FS 就绪
 * const ready = await waitForFS();
 * if (ready) {
 *   const fs = createFS();
 *   // ...
 * }
 * ```
 */

// 类型导出
export type {
  IFS,
  FSConfig,
  FileInfo,
  DirEntry,
  ReadFileOptions,
  WriteFileOptions,
  CopyMoveOptions,
  FileWatchEvent,
  FileWatcherCallback,
} from './types';

// 类与函数导出
export {
  FS,
  getFS,
  setFS,
  createFS,
  isFSAvailable,
  waitForFS,
} from './fs';
