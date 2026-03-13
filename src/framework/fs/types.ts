/**
 * FS Types
 * 文件系统模块的类型定义
 */

/** 文件元数据 */
export interface FileInfo {
  /** 文件名 */
  name: string;
  /** 完整路径 */
  path: string;
  /** 文件大小（字节） */
  size: number;
  /** 创建时间 */
  createdAt: number;
  /** 修改时间 */
  modifiedAt: number;
  /** 是否为目录 */
  isDirectory: boolean;
  /** 是否为文件 */
  isFile: boolean;
}

/** 目录条目 */
export interface DirEntry {
  /** 条目名称 */
  name: string;
  /** 是否为目录 */
  isDirectory: boolean;
  /** 是否为文件 */
  isFile: boolean;
}

/** 文件系统配置 */
export interface FSConfig {
  /** 基础目录 */
  baseDir?: string;
  /** 是否启用缓存 */
  enableCache?: boolean;
  /** 缓存大小限制 */
  cacheSizeLimit?: number;
}

/** 读取文件选项 */
export interface ReadFileOptions {
  /** 编码方式 */
  encoding?: 'utf8' | 'base64' | 'binary';
}

/** 写入文件选项 */
export interface WriteFileOptions {
  /** 是否追加模式 */
  append?: boolean;
  /** 是否创建父目录 */
  createDirs?: boolean;
}

/** 复制/移动选项 */
export interface CopyMoveOptions {
  /** 是否覆盖已存在的目标 */
  overwrite?: boolean;
}

/** 监听回调 */
export type FileWatcherCallback = (event: FileWatchEvent) => void;

/** 文件监听事件 */
export interface FileWatchEvent {
  /** 事件类型 */
  type: 'create' | 'delete' | 'modify' | 'rename';
  /** 文件路径 */
  path: string;
  /** 旧路径（重命名时） */
  oldPath?: string;
  /** 时间戳 */
  timestamp: number;
}

/** 文件系统接口 */
export interface IFS {
  /** 是否已初始化 */
  isReady(): boolean;

  /**
   * 读取文件内容
   * @param path 文件路径
   * @param options 读取选项
   */
  readFile(path: string, options?: ReadFileOptions): Promise<string | Uint8Array>;

  /**
   * 写入文件
   * @param path 文件路径
   * @param content 文件内容
   * @param options 写入选项
   */
  writeFile(path: string, content: string | Uint8Array, options?: WriteFileOptions): Promise<void>;

  /**
   * 删除文件
   * @param path 文件路径
   */
  removeFile(path: string): Promise<void>;

  /**
   * 检查文件是否存在
   * @param path 文件路径
   */
  exists(path: string): Promise<boolean>;

  /**
   * 创建目录
   * @param path 目录路径
   * @param recursive 是否递归创建
   */
  createDir(path: string, recursive?: boolean): Promise<void>;

  /**
   * 删除目录
   * @param path 目录路径
   * @param recursive 是否递归删除
   */
  removeDir(path: string, recursive?: boolean): Promise<void>;

  /**
   * 读取目录内容
   * @param path 目录路径
   */
  readDir(path: string): Promise<DirEntry[]>;

  /**
   * 获取文件/目录信息
   * @param path 路径
   */
  stat(path: string): Promise<FileInfo>;

  /**
   * 复制文件
   * @param source 源路径
   * @param destination 目标路径
   * @param options 复制选项
   */
  copyFile(source: string, destination: string, options?: CopyMoveOptions): Promise<void>;

  /**
   * 重命名/移动文件
   * @param source 源路径
   * @param destination 目标路径
   */
  rename(source: string, destination: string): Promise<void>;
}
