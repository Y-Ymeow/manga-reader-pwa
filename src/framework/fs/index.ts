/**
 * FS Module
 * 多平台兼容的文件系统模块 - 用于读取用户本地音乐文件
 *
 * 自动检测环境并使用最佳可用的实现：
 * - Tauri 环境：使用 Tauri FS API（支持读取任意路径）
 * - 浏览器/PWA：仅支持文件选择器
 * - Android：自动路径转换（Tauri Adapt 会自动处理权限）
 *
 * @example
 * ```typescript
 * import { FS, initFS, isFSAvailable } from './framework/fs';
 *
 * // 方式一：快速初始化
 * const fs = await initFS();
 * 
 * // 读取音乐文件
 * // Linux: /home/user/Music/song.mp3
 * // Android: /sdcard/Music/song.mp3 (自动转换)
 * const musicFile = await fs.readBinaryFile('/sdcard/Music/song.mp3');
 * 
 * // 方式二：手动控制
 * const fs = new FS();
 * await fs.init();
 * 
 * console.log('使用文件系统类型:', fs.getType());
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
  FSType,
  TauriBridge,
} from './types';

// 通用 FS 导出（推荐）
export {
  FS,
  getFS,
  setFS,
  createFS,
  isFSAvailable,
  waitForFS,
  initFS,
} from './fs-universal';

// 原始 Tauri FS 导出（保留向后兼容）
export { FS as TauriFS } from './fs';
