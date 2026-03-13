/**
 * 数据库迁移管理
 */

export interface Migration {
  version: number;
  name: string;
  up: () => Promise<void>;
}

// 迁移记录
const migrations: Migration[] = [
  {
    version: 1,
    name: 'Initial schema',
    up: async () => {
      // 初始版本，由 DatabaseManager 创建基础表结构
      console.log('Running migration v1: Initial schema');
    },
  },
];

/**
 * 获取所有迁移
 */
export function getMigrations(): Migration[] {
  return migrations;
}

/**
 * 获取最新版本号
 */
export function getLatestVersion(): number {
  return migrations.length > 0
    ? Math.max(...migrations.map((m) => m.version))
    : 1;
}
