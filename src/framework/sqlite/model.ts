/**
 * SQLite Model
 * ORM 模型基类 - 基于 SQLite EAV 存储
 * 
 * @example
 * ```typescript
 * import { SQLiteModel, createSQLiteModel } from './sqlite';
 * 
 * // 定义模型
 * const User = new SQLiteModel(storage, 'users', {
 *   primaryKey: 'id'
 * });
 * 
 * // CRUD 操作
 * const user = await User.create({ id: 'user1', name: '张三', age: 25 });
 * const found = await User.findById('user1');
 * const updated = await User.update('user1', { age: 26 });
 * await User.delete('user1');
 * 
 * // 查询
 * const users = await User.findMany({
 *   where: { age: { $gte: 18 } },
 *   orderBy: { createdAt: 'desc' },
 *   limit: 10
 * });
 * ```
 */

import type {
  ISQLiteStorage,
  EAVRecord,
  SQLiteModelData,
  SQLiteModelConfig,
  SQLiteModelQueryOptions,
  SQLiteBatchResult,
  SQLiteChangeLog,
  SQLiteQueryOptions,
} from './types';
import { SQLiteQueryBuilder } from './query';

/**
 * SQLite 模型基类
 */
export class SQLiteModel<T extends SQLiteModelData = SQLiteModelData> {
  /** 存储实例 */
  protected storage: ISQLiteStorage;
  /** 表名 */
  readonly tableName: string;
  /** 主键字段名 */
  readonly primaryKey: string;
  /** 是否启用变更日志 */
  protected enableChangeLog: boolean;

  /**
   * 创建模型实例
   * @param storage SQLite 存储实例
   * @param tableName 表名
   * @param config 模型配置
   */
  constructor(
    storage: ISQLiteStorage,
    tableName: string,
    config?: SQLiteModelConfig
  ) {
    this.storage = storage;
    this.tableName = tableName;
    this.primaryKey = config?.primaryKey || 'dataId';
    this.enableChangeLog = config?.enableChangeLog ?? false;
  }

  /**
   * 日志变更
   */
  protected async logChange(
    action: 'create' | 'update' | 'delete',
    id: string,
    oldData?: T,
    newData?: T
  ): Promise<void> {
    if (!this.enableChangeLog) return;

    try {
      const log: SQLiteChangeLog = {
        action,
        table: this.tableName,
        id,
        oldData: oldData as Record<string, unknown>,
        newData: newData as Record<string, unknown>,
        timestamp: Date.now(),
      };
      await this.storage.upsert('_changelog', `${this.tableName}:${id}`, log as unknown as Record<string, unknown>);
    } catch {
      // 日志失败不影响主流程
    }
  }

  /**
   * 验证数据（可扩展）
   */
  protected validate(data: Partial<T>): void {
    // 默认不做验证，子类可重写
  }

  /**
   * 序列化数据（处理特殊类型）
   */
  protected serialize(data: Partial<T>): Record<string, unknown> {
    const serialized: Record<string, unknown> = { ...data };

    // 处理 Date 类型
    for (const [key, value] of Object.entries(serialized)) {
      if (value instanceof Date) {
        serialized[key] = value.toISOString();
      }
    }

    return serialized;
  }

  /**
   * 反序列化数据（还原特殊类型）
   */
  protected deserialize(data: Record<string, unknown>): T {
    const deserialized = { ...data } as T;

    // 还原 Date 类型（如果字段名包含 Date 或 At 后缀）
    for (const [key, value] of Object.entries(deserialized)) {
      if (
        typeof value === 'string' &&
        (key.endsWith('At') || key.endsWith('Date') || key === 'createdAt' || key === 'updatedAt')
      ) {
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
          (deserialized as Record<string, unknown>)[key] = date;
        }
      }
    }

    return deserialized;
  }

  /**
   * 创建记录
   * @param data 数据对象
   * @returns 创建的记录
   */
  async create(data: Partial<T>): Promise<T> {
    // 验证
    this.validate(data);

    // 序列化
    const serialized = this.serialize(data);

    // 获取或生成 ID
    let dataId = data[this.primaryKey] as string;
    if (!dataId) {
      dataId = this.generateId();
      (serialized as Record<string, unknown>)[this.primaryKey] = dataId;
    }

    // 添加时间戳
    const now = Date.now();
    if (!serialized.createdAt) {
      serialized.createdAt = now;
    }
    serialized.updatedAt = now;

    // 保存
    const success = await this.storage.upsert(this.tableName, dataId, serialized);
    if (!success) {
      throw new Error('Failed to create record');
    }

    // 记录日志
    const result = { ...serialized, [this.primaryKey]: dataId } as T;
    await this.logChange('create', dataId, undefined, result);

    return this.deserialize(result);
  }

  /**
   * 批量创建
   * @param dataList 数据对象数组
   * @returns 批量操作结果
   */
  async createMany(dataList: Partial<T>[]): Promise<SQLiteBatchResult> {
    const result: SQLiteBatchResult = {
      success: 0,
      failed: 0,
      errors: [],
    };

    for (const data of dataList) {
      try {
        await this.create(data);
        result.success++;
      } catch (error) {
        result.failed++;
        result.errors.push({ item: data, error: error as Error });
      }
    }

    return result;
  }

  /**
   * 根据主键查找
   * @param id 主键值
   * @returns 记录或 null
   */
  async findById(id: string): Promise<T | null> {
    return this.findOne(id);
  }

  /**
   * 查找单条记录
   * @param dataId 记录 ID
   * @returns 记录或 null
   */
  async findOne(dataId: string): Promise<T | null> {
    const record = await this.storage.findOne<T>(this.tableName, dataId);
    return record ? this.deserialize(record.data) : null;
  }

  /**
   * 查找多条记录
   * @param options 查询选项
   * @returns 记录数组
   */
  async findMany(options: SQLiteModelQueryOptions = {}): Promise<T[]> {
    const queryOptions = this.buildQueryOptions(options);
    const records = await this.storage.find<T>(this.tableName, queryOptions);
    return records.map((r: EAVRecord<T>) => this.deserialize(r.data));
  }

  /**
   * 查找所有记录
   * @returns 记录数组
   */
  async findAll(): Promise<T[]> {
    return this.findMany();
  }

  /**
   * 更新记录
   * @param id 主键值
   * @param data 更新数据
   * @returns 更新后的记录或 null
   */
  async update(id: string, data: Partial<T>): Promise<T | null> {
    // 获取旧数据
    const oldData = await this.findById(id);
    if (!oldData) {
      return null;
    }

    // 验证
    this.validate({ ...oldData, ...data });

    // 合并数据
    const merged = { ...oldData, ...data };

    // 序列化
    const serialized = this.serialize(merged);

    // 更新时间戳
    serialized.updatedAt = Date.now();

    // 保存
    const success = await this.storage.upsert(this.tableName, id, serialized);
    if (!success) {
      throw new Error('Failed to update record');
    }

    // 记录日志
    const result = { ...serialized, [this.primaryKey]: id } as T;
    await this.logChange('update', id, oldData, result);

    return this.deserialize(result);
  }

  /**
   * 批量更新
   * @param where 查询条件
   * @param data 更新数据
   * @returns 更新统计
   */
  async updateMany(
    where: SQLiteModelQueryOptions['where'],
    data: Partial<T>
  ): Promise<{ updated: number; failed: number }> {
    const records = await this.findMany({ where });
    let updated = 0;
    let failed = 0;

    for (const record of records) {
      const id = record[this.primaryKey] as string;
      try {
        await this.update(id as string, data);
        updated++;
      } catch {
        failed++;
      }
    }

    return { updated, failed };
  }

  /**
   * 删除记录
   * @param id 主键值
   * @returns 是否成功
   */
  async delete(id: string): Promise<boolean> {
    // 获取旧数据用于日志
    const oldData = this.enableChangeLog ? await this.findById(id) : undefined;

    const success = await this.storage.delete(this.tableName, id);

    if (success && oldData) {
      await this.logChange('delete', id, oldData, undefined);
    }

    return success;
  }

  /**
   * 批量删除
   * @param where 查询条件
   * @returns 删除统计
   */
  async deleteMany(where: SQLiteModelQueryOptions['where']): Promise<{ deleted: number; failed: number }> {
    const records = await this.findMany({ where });
    let deleted = 0;
    let failed = 0;

    for (const record of records) {
      const id = record[this.primaryKey] as string;
      try {
        await this.delete(id as string);
        deleted++;
      } catch {
        failed++;
      }
    }

    return { deleted, failed };
  }

  /**
   * 清空所有记录
   */
  async clear(): Promise<void> {
    await this.storage.clear(this.tableName);
  }

  /**
   * 计数
   * @param where 查询条件
   * @returns 记录数
   */
  async count(where?: SQLiteModelQueryOptions['where']): Promise<number> {
    if (!where) {
      return this.storage.count(this.tableName);
    }

    const queryOptions = this.buildQueryOptions({ where });
    // 使用 filter 统计
    return this.storage.count(this.tableName, queryOptions.filter);
  }

  /**
   * 检查记录是否存在
   * @param id 主键值
   * @returns 是否存在
   */
  async exists(id: string): Promise<boolean> {
    const record = await this.findById(id);
    return record !== null;
  }

  /**
   * 创建或更新（UPSERT）
   * @param data 数据对象
   * @returns 记录
   */
  async upsert(data: Partial<T> & { [key: string]: unknown }): Promise<T> {
    const id = data[this.primaryKey] as string;

    if (id !== undefined) {
      const existing = await this.findById(id);
      if (existing) {
        return (await this.update(id, data))!;
      }
    }

    return this.create(data);
  }

  /**
   * 构建查询选项
   */
  protected buildQueryOptions(options: SQLiteModelQueryOptions): SQLiteQueryOptions {
    const queryOptions: SQLiteQueryOptions = {};

    if (options.where) {
      queryOptions.filter = this.transformWhere(options.where);
    }

    if (options.orderBy) {
      if (typeof options.orderBy === 'string') {
        queryOptions.orderBy = options.orderBy;
      } else {
        // 取第一个排序字段
        const [field, direction] = Object.entries(options.orderBy)[0] || [];
        if (field) {
          queryOptions.orderBy = field;
          queryOptions.desc = direction === 'desc';
        }
      }
    }

    if (options.limit) {
      queryOptions.limit = options.limit;
    }

    if (options.offset) {
      queryOptions.offset = options.offset;
    }

    return queryOptions;
  }

  /**
   * 转换 where 条件为 filter 格式
   */
  protected transformWhere(where: Record<string, unknown>): Record<string, unknown> {
    const filter: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(where)) {
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        // 已经是操作符格式
        filter[key] = value;
      } else {
        // 简单等值匹配
        filter[`${key}.$eq`] = value;
      }
    }

    return filter;
  }

  /**
   * 生成唯一 ID
   */
  protected generateId(): string {
    return `${Date.now().toString(36)}${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 获取查询构建器
   */
  query(): SQLiteQueryBuilder<T> {
    return new SQLiteQueryBuilder<T>(this.storage, this.tableName, this);
  }
}

/**
 * 创建模型工厂函数
 * @param storage SQLite 存储实例
 * @param tableName 表名
 * @param config 模型配置
 */
export function createSQLiteModel<T extends SQLiteModelData>(
  storage: ISQLiteStorage,
  tableName: string,
  config?: SQLiteModelConfig
): SQLiteModel<T> {
  return new SQLiteModel<T>(storage, tableName, config);
}
