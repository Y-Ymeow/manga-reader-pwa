/**
 * FS Module - 多平台兼容版本
 * 
 * 专注于读取用户本地音乐文件
 * - Tauri 环境：使用 Tauri FS API（支持读取任意路径）
 * - 浏览器/PWA：不支持访问外部文件，需要用户选择
 * 
 * Android 说明：
 * - Tauri Adapt 会自动处理权限请求
 * - 路径会自动转换到 Android 可用的格式
 * 
 * @example
 * ```typescript
 * import { FS, initFS } from './framework/fs';
 *
 * const fs = await initFS();
 * 
 * // Linux: 读取 /music/song.mp3
 * // Android: 读取 /sdcard/Music/song.mp3（自动转换）
 * const content = await fs.readBinaryFile('/path/to/music.mp3');
 * ```
 */

import type {
  IFS,
  FSConfig,
  FileInfo,
  DirEntry,
  ReadFileOptions,
  WriteFileOptions,
  CopyMoveOptions,
} from './types';

/** 文件系统类型 */
export type FSType = 'tauri' | 'web-file-picker' | 'unsupported';

/** Tauri Bridge 类型定义 */
export interface TauriBridge {
  _ready: boolean;
  invoke: (cmd: string, payload: Record<string, unknown>) => Promise<unknown>;
}

/** 通用 FS 实现 */
export class FS implements IFS {
  readonly config: FSConfig;
  private _fsType: FSType | null = null;
  private _tauri: TauriBridge | null = null;
  private _cache = new Map<string, unknown>();

  constructor(config: FSConfig = {}) {
    this.config = {
      baseDir: config.baseDir || '',
      enableCache: config.enableCache ?? true,
      cacheSizeLimit: config.cacheSizeLimit ?? 1024 * 1024 * 10, // 10MB
    };
  }

  /**
   * 初始化文件系统
   * 自动检测并使用最佳可用实现
   */
  async init(): Promise<boolean> {
    // 1. 优先检测 Tauri
    if (this._detectTauri()) {
      this._fsType = 'tauri';
      return true;
    }

    // 2. 浏览器环境 - 仅支持文件选择器
    if (typeof window !== 'undefined') {
      this._fsType = 'web-file-picker';
      return true;
    }

    // 3. 不支持的环境
    this._fsType = 'unsupported';
    return false;
  }

  /**
   * 检测 Tauri 环境
   */
  private _detectTauri(): boolean {
    const win = window as unknown as { __TAURI__?: TauriBridge; tauri?: TauriBridge };
    this._tauri = win.__TAURI__ || win.tauri || null;
    return this._tauri !== null && this._tauri._ready === true;
  }

  /**
   * 检查 FS 是否可用
   */
  isReady(): boolean {
    return this._fsType === 'tauri' || this._fsType === 'web-file-picker';
  }

  /**
   * 获取当前使用的文件系统类型
   */
  getType(): FSType | null {
    return this._fsType;
  }

  /**
   * 解析路径（Android 特殊处理）
   */
  private resolvePath(path: string): string {
    let fullPath = path;
    
    // 如果有 baseDir，拼接路径
    if (this.config.baseDir && !path.startsWith(this.config.baseDir)) {
      fullPath = `${this.config.baseDir}/${path.replace(/^\//, '')}`;
    }

    // Android 路径转换（仅在 Tauri 环境下）
    if (this._fsType === 'tauri' && this._isAndroid()) {
      fullPath = this._convertToAndroidPath(fullPath);
    }

    return fullPath;
  }

  /**
   * 检测是否在 Android 上
   */
  private _isAndroid(): boolean {
    if (typeof navigator === 'undefined') return false;
    return /Android/i.test(navigator.userAgent);
  }

  /**
   * 将路径转换为 Android 可用路径
   * 
   * Tauri Adapt 会自动处理权限，这里只做路径转换
   */
  private _convertToAndroidPath(path: string): string {
    // 如果已经是 Android 路径，直接返回
    if (path.startsWith('/sdcard/') || path.startsWith('/storage/')) {
      return path;
    }

    // 将常见路径映射到 Android
    const pathMap: Record<string, string> = {
      '/music/': '/sdcard/Music/',
      '/Music/': '/sdcard/Music/',
      '/audio/': '/sdcard/Music/',
      '/sounds/': '/sdcard/Music/',
      '/download/': '/sdcard/Download/',
      '/Download/': '/sdcard/Download/',
      '/dcim/': '/sdcard/DCIM/',
      '/DCIM/': '/sdcard/DCIM/',
    };

    for (const [key, value] of Object.entries(pathMap)) {
      if (path.startsWith(key)) {
        return path.replace(key, value);
      }
    }

    // 默认添加到 Music 目录
    if (path.startsWith('/')) {
      return `/sdcard${path}`;
    }

    return path;
  }

  /**
   * 读取文件内容
   */
  async readFile(path: string, options: ReadFileOptions = {}): Promise<string | Uint8Array> {
    const fullPath = this.resolvePath(path);
    const encoding = options.encoding || 'utf8';

    switch (this._fsType) {
      case 'tauri':
        return this._readFileTauri(fullPath, encoding);
      case 'web-file-picker':
        throw new Error('浏览器环境需要使用文件选择器选择文件后才能读取');
      default:
        throw new Error('FS 未初始化或当前环境不支持，请先调用 init()');
    }
  }

  /**
   * Tauri 实现 - 读取文件
   */
  private async _readFileTauri(path: string, encoding: string): Promise<string | Uint8Array> {
    if (!this._tauri) throw new Error('Tauri 不可用');

    try {
      const result = await this._tauri.invoke('fs_read_file', {
        path,
        encoding,
      }) as {
        content: string;
        encoding: string;
        isBase64?: boolean;
      };

      if (encoding === 'binary' || encoding === 'base64') {
        if (result.isBase64 && typeof result.content === 'string') {
          const binaryString = atob(result.content);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          return bytes;
        }
        return new Uint8Array();
      }

      return result.content;
    } catch (error) {
      const err = error as Error & { message?: string };
      
      // 权限错误提示
      if (err.message?.includes('permission') || err.message?.includes('denied')) {
        throw new Error(
          `文件访问权限错误：${path}\n` +
          '请确保应用已获得存储权限（Tauri Adapt 会自动引导授权）'
        );
      }
      
      // 文件不存在
      if (err.message?.includes('not found') || err.message?.includes('No such file')) {
        throw new Error(`文件不存在：${path}`);
      }
      
      throw error;
    }
  }

  /**
   * 写入文件
   */
  async writeFile(
    path: string,
    content: string | Uint8Array,
    options: WriteFileOptions = {}
  ): Promise<void> {
    const fullPath = this.resolvePath(path);

    if (this._fsType !== 'tauri') {
      throw new Error('当前环境不支持写入文件');
    }

    await this._writeFileTauri(fullPath, content, options);
  }

  /**
   * Tauri 实现 - 写入文件
   */
  private async _writeFileTauri(
    path: string,
    content: string | Uint8Array,
    options: WriteFileOptions = {}
  ): Promise<void> {
    if (!this._tauri) throw new Error('Tauri 不可用');

    let contentStr: string;
    let isBase64 = false;

    if (content instanceof Uint8Array) {
      const binaryString = Array.from(content)
        .map(byte => String.fromCharCode(byte))
        .join('');
      contentStr = btoa(binaryString);
      isBase64 = true;
    } else {
      contentStr = content;
    }

    await this._tauri.invoke('fs_write_file', {
      path,
      content: contentStr,
      isBase64,
      append: options.append ?? false,
      createDirs: options.createDirs ?? true,
    });

    if (this.config.enableCache) {
      this._cache.delete(path);
    }
  }

  /**
   * 删除文件
   */
  async removeFile(path: string): Promise<void> {
    const fullPath = this.resolvePath(path);

    if (this._fsType !== 'tauri') {
      throw new Error('当前环境不支持删除文件');
    }

    if (!this._tauri) throw new Error('Tauri 不可用');

    await this._tauri.invoke('fs_remove_file', {
      path: fullPath,
    });

    if (this.config.enableCache) {
      this._cache.delete(fullPath);
    }
  }

  /**
   * 检查文件/目录是否存在
   */
  async exists(path: string): Promise<boolean> {
    const fullPath = this.resolvePath(path);

    if (this._fsType !== 'tauri') {
      return false;
    }

    try {
      if (!this._tauri) return false;
      
      const result = await this._tauri.invoke('fs_exists', {
        path: fullPath,
      }) as { exists: boolean };
      
      return result.exists;
    } catch {
      return false;
    }
  }

  /**
   * 创建目录
   */
  async createDir(path: string, recursive = true): Promise<void> {
    const fullPath = this.resolvePath(path);

    if (this._fsType !== 'tauri') {
      throw new Error('当前环境不支持创建目录');
    }

    if (!this._tauri) throw new Error('Tauri 不可用');

    await this._tauri.invoke('fs_create_dir', {
      path: fullPath,
      recursive,
    });
  }

  /**
   * 删除目录
   */
  async removeDir(path: string, recursive = false): Promise<void> {
    const fullPath = this.resolvePath(path);

    if (this._fsType !== 'tauri') {
      throw new Error('当前环境不支持删除目录');
    }

    if (!this._tauri) throw new Error('Tauri 不可用');

    await this._tauri.invoke('fs_remove_dir', {
      path: fullPath,
      recursive,
    });
  }

  /**
   * 读取目录内容
   */
  async readDir(path: string): Promise<DirEntry[]> {
    const fullPath = this.resolvePath(path);

    if (this._fsType !== 'tauri') {
      return [];
    }

    if (!this._tauri) return [];

    try {
      const result = await this._tauri.invoke('fs_read_dir', {
        path: fullPath,
      }) as { entries: DirEntry[] };
      
      return result.entries;
    } catch {
      return [];
    }
  }

  /**
   * 获取文件/目录信息
   */
  async stat(path: string): Promise<FileInfo> {
    const fullPath = this.resolvePath(path);

    if (this._fsType !== 'tauri') {
      throw new Error('当前环境不支持获取文件信息');
    }

    if (!this._tauri) throw new Error('Tauri 不可用');

    return await this._tauri.invoke('fs_stat', {
      path: fullPath,
    }) as FileInfo;
  }

  /**
   * 复制文件
   */
  async copyFile(source: string, destination: string, options: CopyMoveOptions = {}): Promise<void> {
    const fullSource = this.resolvePath(source);
    const fullDest = this.resolvePath(destination);

    if (this._fsType !== 'tauri') {
      throw new Error('当前环境不支持复制文件');
    }

    if (!this._tauri) throw new Error('Tauri 不可用');

    await this._tauri.invoke('fs_copy_file', {
      source: fullSource,
      destination: fullDest,
      overwrite: options.overwrite ?? false,
    });
  }

  /**
   * 重命名/移动文件
   */
  async rename(source: string, destination: string): Promise<void> {
    const fullSource = this.resolvePath(source);
    const fullDest = this.resolvePath(destination);

    if (this._fsType !== 'tauri') {
      throw new Error('当前环境不支持重命名文件');
    }

    if (!this._tauri) throw new Error('Tauri 不可用');

    await this._tauri.invoke('fs_rename', {
      source: fullSource,
      destination: fullDest,
    });
  }

  /**
   * 确保目录存在
   */
  async ensureDir(path: string): Promise<void> {
    const exists = await this.exists(path);
    if (!exists) {
      await this.createDir(path, true);
    }
  }

  /**
   * 读取文本文件（快捷方法）
   */
  async readTextFile(path: string): Promise<string> {
    const result = await this.readFile(path, { encoding: 'utf8' });
    return result as string;
  }

  /**
   * 读取二进制文件（快捷方法）
   */
  async readBinaryFile(path: string): Promise<Uint8Array> {
    const result = await this.readFile(path, { encoding: 'binary' });
    return result as Uint8Array;
  }

  /**
   * 清空目录内容
   */
  async emptyDir(path: string): Promise<void> {
    const entries = await this.readDir(path);
    for (const entry of entries) {
      const entryPath = `${path}/${entry.name}`;
      if (entry.isDirectory) {
        await this.removeDir(entryPath, true);
      } else {
        await this.removeFile(entryPath);
      }
    }
  }
}

/** 默认 FS 实例 */
let defaultFS: FS | null = null;

/**
 * 获取默认 FS 实例
 */
export function getFS(config?: FSConfig): FS {
  if (!defaultFS) {
    defaultFS = new FS(config);
  }
  return defaultFS;
}

/**
 * 设置默认 FS 实例
 */
export function setFS(fs: FS): void {
  defaultFS = fs;
}

/**
 * 创建 FS 实例
 */
export function createFS(config?: FSConfig): FS {
  return new FS(config);
}

/**
 * 检查 FS 是否可用
 */
export function isFSAvailable(): boolean {
  const win = window as unknown as { __TAURI__?: { _ready: boolean }; tauri?: { _ready: boolean } };
  const tauri = win.__TAURI__ || win.tauri;
  return tauri?._ready === true;
}

/**
 * 等待 FS 就绪
 */
export async function waitForFS(timeout = 10000): Promise<boolean> {
  const fs = getFS();
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (fs.isReady()) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  return false;
}

/**
 * 快速初始化 FS
 */
export async function initFS(config?: FSConfig): Promise<FS> {
  const fs = createFS(config);
  await fs.init();
  return fs;
}
