/**
 * 统一 Model 包装器
 * 在 Tauri 环境使用 SQLite，浏览器环境使用 IndexedDB
 */

import { Model, type ModelData } from '../framework/indexeddb';
import { SQLiteModel } from '../framework/sqlite';
import { isTauri } from '../fs/storage-adapter';
import { getGlobalBridge, createSQLiteDB } from '../framework/sqlite';

/**
 * 创建 SQLite 模型实例
 */
function createSQLiteModelInstance<T extends ModelData>(
  tableName: string
): SQLiteModel<T> {
  const bridge = getGlobalBridge();
  if (!bridge) {
    throw new Error('SQLite bridge not initialized');
  }
  const db = createSQLiteDB(bridge, { name: 'manga-reader', debug: false });
  return new SQLiteModel<T>(db.getStorage(), tableName, { tableName, primaryKey: 'id', enableChangeLog: false });
}

/**
 * 统一 Model 包装器 - 在两种后端上提供一致的 API
 */
export class UnifiedModel<T extends ModelData> {
  private idbModel: Model<T>;
  private sqliteModel: SQLiteModel<T> | null = null;
  private tableName: string;

  constructor(idbModel: Model<T>, tableName: string) {
    this.idbModel = idbModel;
    this.tableName = tableName;
  }

  /**
   * 检查是否在 Tauri 环境且已初始化
   */
  private get isSQLite(): boolean {
    if (!isTauri()) return false;
    try {
      const bridge = getGlobalBridge();
      return bridge !== null;
    } catch {
      return false;
    }
  }

  /**
   * 获取或创建 SQLite 模型
   */
  private async getSQLiteModel(): Promise<SQLiteModel<T> | null> {
    if (!this.sqliteModel) {
      try {
        this.sqliteModel = createSQLiteModelInstance<T>(this.tableName);
      } catch (e) {
        console.warn('[UnifiedModel] Failed to create SQLite model:', e);
        return null;
      }
    }
    return this.sqliteModel;
  }

  async create(data: Partial<T>): Promise<T> {
    if (this.isSQLite) {
      const model = await this.getSQLiteModel();
      if (model) {
        return await model.create(data);
      }
    }
    return await this.idbModel.create(data);
  }

  async findById(id: string | number): Promise<T | null> {
    if (this.isSQLite) {
      const model = await this.getSQLiteModel();
      if (model) {
        return await model.findById(String(id));
      }
    }
    return await this.idbModel.findOne({ where: { id } });
  }

  async findOne(options: { where: Partial<T> }): Promise<T | null> {
    if (this.isSQLite) {
      const model = await this.getSQLiteModel();
      if (model) {
        const where = options.where as Record<string, unknown>;
        const id = where.id;
        if (id !== undefined) {
          return await model.findById(String(id));
        }
        const results = await model.findMany({ where });
        return results.length > 0 ? results[0] : null;
      }
    }
    return await this.idbModel.findOne(options);
  }

  async findMany(options?: {
    where?: Partial<T>;
    orderBy?: Record<string, 'asc' | 'desc'>;
    sort?: string | { field: string; order?: 'asc' | 'desc' } | Array<{ field: string; order?: 'asc' | 'desc' }>;
    limit?: number;
    offset?: number;
  }): Promise<T[]> {
    if (this.isSQLite) {
      const model = await this.getSQLiteModel();
      if (model) {
        return await model.findMany(options as any);
      }
    }
    return await this.idbModel.findMany(options as any);
  }

  async findAll(): Promise<T[]> {
    if (this.isSQLite) {
      const model = await this.getSQLiteModel();
      if (model) {
        return await model.findAll();
      }
    }
    return await this.idbModel.findMany();
  }

  async update(id: string | number, data: Partial<T>): Promise<T | null> {
    if (this.isSQLite) {
      const model = await this.getSQLiteModel();
      if (model) {
        return await model.update(String(id), data);
      }
    }
    return await this.idbModel.update(typeof id === 'number' ? id : Number(id), data);
  }

  async delete(id: string | number): Promise<boolean> {
    if (this.isSQLite) {
      const model = await this.getSQLiteModel();
      if (model) {
        return await model.delete(String(id));
      }
    }
    return await this.idbModel.delete(typeof id === 'number' ? id : Number(id));
  }

  async updateMany(where: Partial<T>, data: Partial<T>): Promise<{ updated: number; failed: number }> {
    if (this.isSQLite) {
      const model = await this.getSQLiteModel();
      if (model) {
        return await model.updateMany(where as any, data);
      }
    }
    // IndexedDB 降级处理
    const records = await this.findMany({ where });
    let updated = 0;
    let failed = 0;
    for (const record of records) {
      try {
        await this.update(record.id as any, data);
        updated++;
      } catch {
        failed++;
      }
    }
    return { updated, failed };
  }

  async clear(): Promise<void> {
    if (this.isSQLite) {
      const model = await this.getSQLiteModel();
      if (model) {
        await model.clear();
        return;
      }
    }
    await this.idbModel.clear();
  }

  async count(where?: Partial<T>): Promise<number> {
    if (this.isSQLite) {
      const model = await this.getSQLiteModel();
      if (model) {
        return await model.count(where ? { where } as any : undefined);
      }
    }
    return await this.idbModel.count(where ? { where } as any : undefined);
  }

  async exists(id: string | number): Promise<boolean> {
    if (this.isSQLite) {
      const model = await this.getSQLiteModel();
      if (model) {
        return await model.exists(String(id));
      }
    }
    const record = await this.idbModel.findOne({ where: { id } });
    return record !== null;
  }
}
