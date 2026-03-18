/**
 * SQLite Query Builder
 * 流式查询构建器
 * 
 * @example
 * ```typescript
 * const users = await User.query()
 *   .where('age', '>=', 18)
 *   .where('name', 'like', '张%')
 *   .orderBy('createdAt', 'desc')
 *   .limit(10)
 *   .offset(0)
 *   .findMany();
 * 
 * const user = await User.query()
 *   .where('id', '=', 'user1')
 *   .findOne();
 * 
 * const count = await User.query()
 *   .where('status', '=', 'active')
 *   .count();
 * ```
 */

import type {
  ISQLiteStorage,
  EAVRecord,
  SQLiteModelData,
  SQLiteModelQueryOptions,
  SQLiteQueryOptions,
} from './types';
import type { SQLiteModel } from './model';

/**
 * 查询操作符
 */
type QueryOperator = '=' | '!=' | '>' | '>=' | '<' | '<=' | 'like' | 'in' | 'nin' | 'exists';

/**
 * 查询条件单元
 */
interface QueryCondition {
  field: string;
  operator: QueryOperator;
  value: unknown;
}

/**
 * SQLite 查询构建器
 */
export class SQLiteQueryBuilder<T extends SQLiteModelData = SQLiteModelData> {
  private storage: ISQLiteStorage;
  private tableName: string;
  private model?: SQLiteModel<T>;
  
  private conditions: QueryCondition[] = [];
  private orderByField?: string;
  private orderByDesc: boolean = false;
  private limitCount?: number;
  private offsetCount?: number;

  /**
   * 创建查询构建器
   * @param storage SQLite 存储实例
   * @param tableName 表名
   * @param model 模型实例（可选）
   */
  constructor(
    storage: ISQLiteStorage,
    tableName: string,
    model?: SQLiteModel<T>
  ) {
    this.storage = storage;
    this.tableName = tableName;
    this.model = model;
  }

  /**
   * 添加 WHERE 条件
   * @param field 字段名
   * @param operator 操作符
   * @param value 值
   */
  where(field: string, operator: QueryOperator | unknown, value?: unknown): this {
    let op: QueryOperator = '=';
    let val: unknown;

    if (value === undefined) {
      // where('field', value) - 默认等于
      val = operator;
    } else {
      // where('field', operator, value)
      op = this.parseOperator(operator as QueryOperator);
      val = value;
    }

    this.conditions.push({ field, operator: op, value: val });
    return this;
  }

  /**
   * 添加 AND 条件（别名）
   */
  andWhere(field: string, operator: QueryOperator | unknown, value?: unknown): this {
    return this.where(field, operator, value);
  }

  /**
   * 添加 OR 条件（暂不支持，预留）
   */
  orWhere(field: string, operator: QueryOperator | unknown, value?: unknown): this {
    // TODO: 支持 OR 条件
    return this.where(field, operator, value);
  }

  /**
   * 添加 IN 条件
   */
  whereIn(field: string, values: unknown[]): this {
    return this.where(field, 'in', values);
  }

  /**
   * 添加 NOT IN 条件
   */
  whereNotIn(field: string, values: unknown[]): this {
    return this.where(field, 'nin', values);
  }

  /**
   * 添加 IS NULL 条件
   */
  whereNull(field: string): this {
    return this.where(field, 'exists', false);
  }

  /**
   * 添加 IS NOT NULL 条件
   */
  whereNotNull(field: string): this {
    return this.where(field, 'exists', true);
  }

  /**
   * 添加 LIKE 条件
   */
  whereLike(field: string, pattern: string): this {
    return this.where(field, 'like', pattern);
  }

  /**
   * 排序
   * @param field 字段名
   * @param direction 方向
   */
  orderBy(field: string, direction: 'asc' | 'desc' = 'asc'): this {
    this.orderByField = field;
    this.orderByDesc = direction === 'desc';
    return this;
  }

  /**
   * 升序排序
   */
  orderByAsc(field: string): this {
    return this.orderBy(field, 'asc');
  }

  /**
   * 降序排序
   */
  orderByDescending(field: string): this {
    return this.orderBy(field, 'desc');
  }

  /**
   * 限制数量
   */
  limit(count: number): this {
    this.limitCount = count;
    return this;
  }

  /**
   * 偏移量
   */
  offset(count: number): this {
    this.offsetCount = count;
    return this;
  }

  /**
   * 分页
   * @param page 页码（从 1 开始）
   * @param pageSize 每页数量
   */
  page(page: number, pageSize: number = 20): this {
    this.limitCount = pageSize;
    this.offsetCount = (page - 1) * pageSize;
    return this;
  }

  /**
   * 执行查询，返回多条记录
   */
  async findMany(): Promise<T[]> {
    const options = this.buildOptions();
    const records = await this.storage.find<T>(this.tableName, options);
    
    // 直接返回数据，不进行 deserialize（由调用方自行处理）
    return records.map((r: EAVRecord<T>) => r.data as T);
  }

  /**
   * 执行查询，返回单条记录
   */
  async findOne(): Promise<T | null> {
    this.limitCount = 1;
    const records = await this.findMany();
    return records[0] || null;
  }

  /**
   * 执行查询，返回所有记录
   */
  async findAll(): Promise<T[]> {
    return this.findMany();
  }

  /**
   * 计数
   */
  async count(): Promise<number> {
    const filter = this.buildFilter();
    return this.storage.count(this.tableName, filter);
  }

  /**
   * 检查是否存在
   */
  async exists(): Promise<boolean> {
    const count = await this.count();
    return count > 0;
  }

  /**
   * 构建查询选项
   */
  private buildOptions(): SQLiteQueryOptions {
    const options: SQLiteQueryOptions = {};

    const filter = this.buildFilter();
    if (Object.keys(filter).length > 0) {
      options.filter = filter;
    }

    if (this.orderByField) {
      options.orderBy = this.orderByField;
      options.desc = this.orderByDesc;
    }

    if (this.limitCount !== undefined) {
      options.limit = this.limitCount;
    }

    if (this.offsetCount !== undefined) {
      options.offset = this.offsetCount;
    }

    return options;
  }

  /**
   * 构建过滤条件
   */
  private buildFilter(): Record<string, unknown> {
    const filter: Record<string, unknown> = {};

    for (const condition of this.conditions) {
      const key = this.getFilterKey(condition.field, condition.operator);
      filter[key] = condition.value;
    }

    return filter;
  }

  /**
   * 获取过滤条件的键名
   */
  private getFilterKey(field: string, operator: QueryOperator): string {
    const operatorMap: Record<QueryOperator, string> = {
      '=': '$eq',
      '!=': '$ne',
      '>': '$gt',
      '>=': '$gte',
      '<': '$lt',
      '<=': '$lte',
      'like': '$like',
      'in': '$in',
      'nin': '$nin',
      'exists': '$exists',
    };

    const opKey = operatorMap[operator];
    return `${field}.${opKey}`;
  }

  /**
   * 解析操作符
   */
  private parseOperator(op: QueryOperator): QueryOperator {
    const operatorMap: Record<string, QueryOperator> = {
      '=': '=',
      '==': '=',
      '===': '=',
      '!=': '!=',
      '<>': '!=',
      '>': '>',
      '>=': '>=',
      '<': '<',
      '<=': '<=',
      'like': 'like',
      'in': 'in',
      'nin': 'nin',
      'exists': 'exists',
    };

    return operatorMap[op] || '=';
  }

  /**
   * 重置查询条件
   */
  reset(): this {
    this.conditions = [];
    this.orderByField = undefined;
    this.orderByDesc = false;
    this.limitCount = undefined;
    this.offsetCount = undefined;
    return this;
  }

  /**
   * 克隆查询构建器
   */
  clone(): SQLiteQueryBuilder<T> {
    const cloned = new SQLiteQueryBuilder<T>(this.storage, this.tableName, this.model);
    cloned.conditions = [...this.conditions];
    cloned.orderByField = this.orderByField;
    cloned.orderByDesc = this.orderByDesc;
    cloned.limitCount = this.limitCount;
    cloned.offsetCount = this.offsetCount;
    return cloned;
  }
}
