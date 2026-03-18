/**
 * FS Module
 * 基于 Tauri Adapt Bridge 的文件系统实现
 *
 * 此模块通过 Tauri Adapt Bridge 调用真实的文件系统 API
 * 只有在 adapt 真实有效时才能使用
 *
 * @example
 * ```typescript
 * import { FS } from './framework/fs';
 *
 * const fs = new FS({ baseDir: '/data' });
 *
 * // 检查是否可用
 * if (fs.isReady()) {
 *   await fs.writeFile('/test.txt', 'Hello World');
 *   const content = await fs.readFile('/test.txt');
 * }
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
} from "./types";

/** Tauri Bridge 类型定义 */
interface TauriBridgeInternal {
  _ready: boolean;
  invoke: (cmd: string, payload: Record<string, unknown>) => Promise<unknown>;
  audio?: {
    play: (url: string) => Promise<void>;
    pause: () => void;
    resume: () => void;
    stop: () => void;
    setVolume: (volume: number) => void;
    setMuted: (muted: boolean) => void;
    setLoop: (loop: boolean) => void;
    getState: () => Promise<{
      positionMs: number;
      durationMs: number;
      isPlaying: boolean;
    }>;
    getPosition: () => Promise<number>;
    getDuration: () => Promise<number>;
    getCurrentUrl: () => Promise<string>;
    seek: (positionMs: number) => void;
    setProgressCallback: (callback: (state: unknown) => void) => void;
    AdaptAudio: new (url: string) => unknown;
  };
}

/** 全局 Tauri 对象 */
declare global {
  interface Window {
    __TAURI__?: TauriBridgeInternal;
    tauri?: TauriBridgeInternal;
  }
}

/** 文件系统实现 */
export class FS implements IFS {
  readonly config: FSConfig;
  private _cache = new Map<string, unknown>();

  constructor(config: FSConfig = {}) {
    this.config = {
      baseDir: config.baseDir || "",
      enableCache: config.enableCache ?? true,
      cacheSizeLimit: config.cacheSizeLimit ?? 1024 * 1024 * 10, // 10MB
    };
  }

  /**
   * 获取 Tauri Bridge 实例
   */
  private getTauriBridge(): TauriBridgeInternal | null {
    return window.__TAURI__ || window.tauri || null;
  }

  /**
   * 检查 FS 是否可用（Tauri Adapt 已就绪）
   */
  isReady(): boolean {
    const tauri = this.getTauriBridge();
    return tauri?._ready === true;
  }

  /**
   * 确保 FS 可用
   */
  private ensureReady(): TauriBridgeInternal {
    const tauri = this.getTauriBridge();
    if (!tauri || !tauri._ready) {
      throw new Error(
        "FS is not available. Tauri Adapt is not ready or not injected. " +
          "Make sure the app is running in a Tauri container with adapt.js loaded.",
      );
    }
    return tauri;
  }

  /**
   * 解析完整路径
   */
  private resolvePath(path: string): string {
    if (this.config.baseDir) {
      return `${this.config.baseDir}/${path.replace(/^\//, "")}`;
    }
    return path;
  }

  /**
   * 调用 Tauri 命令
   */
  private async invoke<T>(
    cmd: string,
    payload: Record<string, unknown>,
  ): Promise<T> {
    const tauri = this.ensureReady();
    return tauri.invoke(cmd, payload) as Promise<T>;
  }

  /**
   * 读取文件内容
   */
  async readFile(
    path: string,
    options: ReadFileOptions = {},
  ): Promise<string | Uint8Array> {
    const fullPath = this.resolvePath(path);
    const encoding = options.encoding || "utf8";

    const result = await this.invoke<{
      content: string;
      encoding: string;
      isBase64?: boolean;
    }>("fs_read_file", {
      path: fullPath,
      encoding,
    });

    if (encoding === "binary" || encoding === "base64") {
      if (result.isBase64 && typeof result.content === "string") {
        // 将 base64 转换为 Uint8Array
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
  }

  /**
   * 写入文件
   */
  async writeFile(
    path: string,
    content: string | Uint8Array,
    options: WriteFileOptions = {},
  ): Promise<void> {
    const fullPath = this.resolvePath(path);

    let contentStr: string;
    let isBase64 = false;

    if (content instanceof Uint8Array) {
      // 将 Uint8Array 转换为 base64
      const binaryString = Array.from(content)
        .map((byte) => String.fromCharCode(byte))
        .join("");
      contentStr = btoa(binaryString);
      isBase64 = true;
    } else {
      contentStr = content;
    }

    await this.invoke("fs_write_file", {
      path: fullPath,
      content: contentStr,
      isBase64,
      append: options.append ?? false,
      createDirs: options.createDirs ?? true,
    });

    // 清除缓存
    if (this.config.enableCache) {
      this._cache.delete(fullPath);
    }
  }

  /**
   * 删除文件
   */
  async removeFile(path: string): Promise<void> {
    const fullPath = this.resolvePath(path);

    await this.invoke("fs_remove_file", {
      path: fullPath,
    });

    // 清除缓存
    if (this.config.enableCache) {
      this._cache.delete(fullPath);
    }
  }

  /**
   * 检查文件/目录是否存在
   */
  async exists(path: string): Promise<boolean> {
    const fullPath = this.resolvePath(path);

    try {
      const result = await this.invoke<{ exists: boolean }>("fs_exists", {
        path: fullPath,
      });
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

    await this.invoke("fs_create_dir", {
      path: fullPath,
      recursive,
    });
  }

  /**
   * 删除目录
   */
  async removeDir(path: string, recursive = false): Promise<void> {
    const fullPath = this.resolvePath(path);

    await this.invoke("fs_remove_dir", {
      path: fullPath,
      recursive,
    });
  }

  /**
   * 读取目录内容
   */
  async readDir(path: string): Promise<DirEntry[]> {
    const fullPath = this.resolvePath(path);

    const result = await this.invoke<{ entries: DirEntry[] }>("fs_read_dir", {
      path: fullPath,
    });

    return result.entries;
  }

  /**
   * 获取文件/目录信息
   */
  async stat(path: string): Promise<FileInfo> {
    const fullPath = this.resolvePath(path);

    const result = await this.invoke<FileInfo>("fs_stat", {
      path: fullPath,
    });

    return result;
  }

  /**
   * 复制文件
   */
  async copyFile(
    source: string,
    destination: string,
    options: CopyMoveOptions = {},
  ): Promise<void> {
    const fullSource = this.resolvePath(source);
    const fullDest = this.resolvePath(destination);

    await this.invoke("fs_copy_file", {
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

    await this.invoke("fs_rename", {
      source: fullSource,
      destination: fullDest,
    });
  }

  /**
   * 确保目录存在（不存在则创建）
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
    const result = await this.readFile(path, { encoding: "utf8" });
    return result as string;
  }

  /**
   * 读取二进制文件（快捷方法）
   */
  async readBinaryFile(path: string): Promise<Uint8Array> {
    const result = await this.readFile(path, { encoding: "binary" });
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
 * 检查 FS 是否可用（静态方法）
 */
export function isFSAvailable(): boolean {
  const tauri = window.__TAURI__ || window.tauri;
  return tauri?._ready === true;
}

/**
 * 等待 FS 就绪
 * @param timeout 超时时间（毫秒）
 */
export function waitForFS(timeout = 10000): Promise<boolean> {
  return new Promise((resolve) => {
    // 如果已经就绪
    if (isFSAvailable()) {
      resolve(true);
      return;
    }

    // 监听 tauri-ready 事件
    const handler = () => {
      resolve(isFSAvailable());
      window.removeEventListener("tauri-ready", handler);
      clearTimeout(timer);
    };

    window.addEventListener("tauri-ready", handler);

    // 超时处理
    const timer = setTimeout(() => {
      window.removeEventListener("tauri-ready", handler);
      resolve(false);
    }, timeout);
  });
}
