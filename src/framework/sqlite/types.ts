/**
 * SQLite Types
 * SQLite EAV 存储模块的类型定义
 */

/**
 * SQLite 桥接接口 - 由 Tauri 适配层提供
 */
export interface SQLiteBridge {
  /**
   * 调用 Tauri 命令
   */
  invoke<T = unknown>(cmd: string, payload?: Record<string, unknown>): Promise<SQLiteResult<T>>;
}

/**
 * SQLite 命令执行结果
 */
export interface SQLiteResult<T = unknown> {
  /** 是否成功 */
  success: boolean;
  /** 返回数据 */
  data?: T;
  /** 错误信息 */
  error?: string;
}

/**
 * EAV 记录格式
 */
export interface EAVRecord<T = Record<string, unknown>> {
  /** 记录 ID */
  dataId: string;
  /** 创建时间 */
  createdAt: number;
  /** 更新时间 */
  updatedAt: number;
  /** 数据内容 */
  data: T;
}

/**
 * 查询选项
 */
export interface SQLiteQueryOptions {
  /** 过滤条件 */
  filter?: Record<string, unknown>;
  /** 排序字段 */
  orderBy?: string;
  /** 是否降序 */
  desc?: boolean;
  /** 限制数量 */
  limit?: number;
  /** 偏移量 */
  offset?: number;
}

/**
 * SQLite 存储配置
 */
export interface SQLiteStorageConfig {
  /** 应用 ID */
  appId?: string;
  /** 数据库名称 */
  dbName?: string;
  /** 调试模式 */
  debug?: boolean;
}

/**
 * SQLite 存储接口
 */
export interface ISQLiteStorage {
  /** 应用 ID */
  readonly appId: string;
  /** 数据库名称 */
  readonly dbName: string;

  /**
   * 插入或更新记录
   */
  upsert<T extends Record<string, unknown> = Record<string, unknown>>(
    table: string,
    dataId: string,
    data: T
  ): Promise<boolean>;

  /**
   * 查询记录
   */
  find<T extends Record<string, unknown> = Record<string, unknown>>(
    table: string,
    options?: SQLiteQueryOptions
  ): Promise<EAVRecord<T>[]>;

  /**
   * 查询单条记录
   */
  findOne<T extends Record<string, unknown> = Record<string, unknown>>(
    table: string,
    dataId: string
  ): Promise<EAVRecord<T> | null>;

  /**
   * 删除记录
   */
  delete(table: string, dataId: string): Promise<boolean>;

  /**
   * 统计记录数
   */
  count(table: string, filter?: Record<string, unknown>): Promise<number>;

  /**
   * 清空表
   */
  clear(table: string): Promise<boolean>;

  /**
   * 列出所有表
   */
  listTables(): Promise<string[]>;

  /**
   * 键值存储 - 设置
   */
  setItem(key: string, value: unknown): Promise<boolean>;

  /**
   * 键值存储 - 获取
   */
  getItem<T = unknown>(key: string): Promise<T | null>;

  /**
   * 键值存储 - 删除
   */
  removeItem(key: string): Promise<boolean>;

  /**
   * 键值存储 - 清空
   */
  clearAll(): Promise<boolean>;

  /**
   * 键值存储 - 获取所有键
   */
  keys(): Promise<string[]>;
}

/**
 * SQLite 模型配置
 */
export interface SQLiteModelConfig {
  /** 表名 */
  tableName: string;
  /** 主键字段名 */
  primaryKey?: string;
  /** 启用变更日志 */
  enableChangeLog?: boolean;
}

/**
 * SQLite 模型数据
 */
export interface SQLiteModelData extends Record<string, unknown> {
  /** 记录 ID */
  dataId?: string;
  /** 创建时间 */
  createdAt?: number;
  /** 更新时间 */
  updatedAt?: number;
}

/**
 * SQLite 查询条件
 */
export interface SQLiteFilterCondition {
  /** 等于 */
  $eq?: unknown;
  /** 不等于 */
  $ne?: unknown;
  /** 大于 */
  $gt?: unknown;
  /** 大于等于 */
  $gte?: unknown;
  /** 小于 */
  $lt?: unknown;
  /** 小于等于 */
  $lte?: unknown;
  /** 包含（数组或字符串） */
  $in?: unknown[];
  /** 不包含 */
  $nin?: unknown[];
  /** 模糊匹配（LIKE） */
  $like?: string;
  /** 正则匹配 */
  $regex?: string;
  /** 字段存在 */
  $exists?: boolean;
}

/**
 * SQLite 排序方向
 */
export type SQLiteSortDirection = 'asc' | 'desc';

/**
 * SQLite 排序选项
 */
export interface SQLiteSortOptions {
  [field: string]: SQLiteSortDirection;
}

/**
 * SQLite 查询选项（模型层）
 */
export interface SQLiteModelQueryOptions {
  /** 查询条件 */
  where?: Record<string, unknown | SQLiteFilterCondition>;
  /** 排序 */
  orderBy?: string | SQLiteSortOptions;
  /** 限制数量 */
  limit?: number;
  /** 偏移量 */
  offset?: number;
}

/**
 * 批量操作结果
 */
export interface SQLiteBatchResult {
  /** 成功数量 */
  success: number;
  /** 失败数量 */
  failed: number;
  /** 错误详情 */
  errors: Array<{ item: unknown; error: Error }>;
}

/**
 * 变更日志
 */
export interface SQLiteChangeLog {
  /** 操作类型 */
  action: 'create' | 'update' | 'delete';
  /** 表名 */
  table: string;
  /** 记录 ID */
  id: string;
  /** 旧数据 */
  oldData?: Record<string, unknown>;
  /** 新数据 */
  newData?: Record<string, unknown>;
  /** 时间戳 */
  timestamp: number;
}

/**
 * SQLite 数据库配置
 */
export interface SQLiteDatabaseConfig {
  /** 数据库名称 */
  name?: string;
  /** 调试模式 */
  debug?: boolean;
}
