# SQLite 模块文档

基于 SQLite 的数据存储模块，支持 **EAV** 和 **Table** 双模式，通过 `window.tauri.sql` 和 `window.tauri.eav` 与 Tauri 原生 SQLite 插件通信。

## 目录结构

```
src/framework/sqlite/
├── index.ts        # 模块入口，导出所有类型和函数
├── types.ts        # 类型定义
├── storage.ts      # 核心存储实现（支持双模式）
├── model.ts        # ORM 模型层
├── query.ts        # 查询构建器
├── database.ts     # 数据库管理器
├── helper.ts       # 快捷函数
├── sqlite.ts       # 原生 SQLite 表操作
└── eav.ts          # EAV 模式存储
```

## 核心特性

### 1. 双模式支持

- **EAV 模式**（Entity-Attribute-Value）：适合结构不固定的数据，属性可动态添加
- **Table 模式**：适合结构固定的数据，直接使用原生 SQL，性能更好

### 2. Tauri SQL 集成

通过 `window.tauri.sql` 和 `window.tauri.eav` 调用原生 SQLite 插件：
- 数据库文件由 Tauri 侧管理（路径：`~/.local/share/com.pwa.container/pwa_data/{pwaId}/`）
- 自动等待 Tauri 就绪
- 支持完整的 SQL 语句执行

### 3. 排序支持

```typescript
// 字符串简写
await storage.find('tasks', { sort: 'priority' });

// 单字段对象
await storage.find('tasks', { 
  sort: { field: 'createdAt', order: 'desc' } 
});

// 多字段数组
await storage.find('tasks', {
  sort: [
    { field: 'priority', order: 'desc' },
    { field: 'createdAt', order: 'asc' }
  ]
});

// 兼容旧版
await storage.find('tasks', { orderBy: 'createdAt', desc: true });
```

## 使用指南

### 基础使用（推荐）

```typescript
import { createSQLiteStorage } from './framework/sqlite';

// 创建存储实例（默认 EAV 模式）
const storage = createSQLiteStorage(bridge, { 
  dbName: 'my-app',
  mode: 'eav'  // 或 'table'
});

// 初始化
await storage.init();

// CRUD 操作
await storage.upsert('users', 'user1', { name: '张三', age: 25 });
const user = await storage.findOne('users', 'user1');
const users = await storage.find('users', { 
  sort: { field: 'createdAt', order: 'desc' },
  limit: 10 
});
await storage.delete('users', 'user1');
```

### Table 模式（原生 SQL）

```typescript
import { createSQLiteStorage } from './framework/sqlite';

const storage = createSQLiteStorage(bridge, { 
  dbName: 'my-app',
  mode: 'table'
});

// 创建表
await storage.createTable('users', `
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  age INTEGER
`);

// 插入数据
await storage.tableInsert('users', { 
  id: 'user1', 
  name: '张三', 
  age: 25 
});

// 执行原生 SQL
await storage.execute('UPDATE users SET age = ? WHERE id = ?', [26, 'user1']);

// 查询
const users = await storage.find('users', {
  where: { age: { $gte: 18 } },
  sort: { field: 'age', order: 'desc' },
  limit: 10
});
```

### 使用模型层（ORM）

```typescript
import { createSQLiteDB } from './framework/sqlite';

// 创建数据库管理器
const db = createSQLiteDB(bridge, { name: 'my-app' });
await db.init();

// 创建模型
const User = db.model('users', { primaryKey: 'id' });

// CRUD
const user = await User.create({ id: 'user1', name: '张三', age: 25 });
const found = await User.findById('user1');
const updated = await User.update('user1', { age: 26 });
await User.delete('user1');

// 查询
const users = await User.query()
  .where('age', '>=', 18)
  .orderBy('createdAt', 'desc')
  .limit(10)
  .findMany();
```

### 使用 EAV 存储

```typescript
import { createEAVStorage } from './framework/sqlite/eav';

const eav = createEAVStorage(bridge, 'my-app', 'default');
await eav.init();

// CRUD
await eav.upsert('users', 'user1', { name: '张三', tags: ['admin', 'editor'] });
const user = await eav.findOne('users', 'user1');
const users = await eav.find('users', { limit: 10 });
await eav.delete('users', 'user1');

// KV 存储
await eav.setItem('config.theme', 'dark');
const theme = await eav.getItem('config.theme');
await eav.removeItem('config.theme');

// 查询条件（where）
const activeUsers = await eav.find('users', {
  where: {
    status: 'active',
    age: { $gt: 18, $lt: 60 },
    role: { $in: ['admin', 'user'] },
    name: { $contains: 'John' },
    email: { $startswith: 'admin' },
  },
  limit: 10
});
```

### 使用原生 SQLite 表操作

```typescript
import { createSQLiteTable, createSQLiteDatabase } from './framework/sqlite/sqlite';

// 表操作
const table = createSQLiteTable(bridge, 'users', pwaId);
await table.create(`
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL
`);
await table.insert({ name: '张三' });
const users = await table.select('WHERE id > ?', [10]);
await table.update({ name: '李四' }, 'WHERE id = ?', [1]);
await table.delete('WHERE id = ?', [1]);

// 数据库管理
const database = createSQLiteDatabase(bridge, pwaId);
await database.execute('PRAGMA journal_mode = WAL');
const tables = await database.listTables();
await database.transaction([
  { sql: 'INSERT INTO users (name) VALUES (?)', params: ['张三'] },
  { sql: 'INSERT INTO users (name) VALUES (?)', params: ['李四'] }
]);
```

## 快捷函数

```typescript
import {
  // 初始化
  initSQLite,
  getSQLite,
  initSQLiteDB,
  getSQLiteDBHelper,
  
  // 模型
  defineSQLiteModel,
  createModel,
  
  // 桥接
  setGlobalBridge,
  getGlobalBridge,
} from './framework/sqlite';

// 快速初始化
const storage = initSQLite(bridge, { dbName: 'my-app', debug: true });

// 使用全局实例
const storage2 = getSQLite({ dbName: 'my-app' });
const User = createModel('users', { primaryKey: 'id' });
```

## 类型定义

```typescript
import type {
  SQLiteBridge,           // 桥接接口
  SQLiteStorageConfig,    // 存储配置
  SQLiteModelConfig,      // 模型配置
  SQLiteModelData,        // 模型数据
  SQLiteModelQueryOptions,// 查询选项
  SQLiteDatabaseConfig,   // 数据库配置
  EAVRecord,              // EAV 记录
  StorageMode,            // 存储模式 ('eav' | 'table')
  SQLiteFilterCondition,  // 过滤条件
  SQLiteSortDirection,    // 排序方向
  SQLiteBatchResult,      // 批量操作结果
  SQLiteChangeLog,        // 变更日志
} from './framework/sqlite';
```

## 注意事项

1. **等待 Tauri 就绪**：所有操作会自动等待 `window.tauri.sql` 可用（5 秒超时）
2. **数据库路径**：由 Tauri 侧管理，无需手动指定路径
3. **数据序列化**：自动处理 JSON 序列化，跳过不可序列化的字段（如 FileHandle、Blob）
4. **EAV 限制**：EAV 模式下，`data` 中的字段无法在 SQL 中直接排序，会在前端处理
5. **事务支持**：通过 `storage.transaction()` 或 `database.transaction()` 使用
6. **where 查询条件**：EAV 模式支持以下查询条件：
   - 简单等值：`{ status: 'active', count: 5 }`
   - 操作符：`{ age: { $gt: 18, $lt: 60 } }`
   - 数组 (`$in`): `{ status: ['active', 'pending'] }` 或 `{ status: { $in: ['active', 'pending'] } }`
   - 包含 (`$contains`): `{ name: { $contains: 'John' } }`
   - 开头 (`$startswith`): `{ email: { $startswith: 'admin' } }`
   - 结尾 (`$endswith`): `{ email: { $endswith: '@gmail.com' } }`
   - 不等于 (`$ne`): `{ status: { $ne: 'deleted' } }`
   - 支持的操作符：`$eq`, `$ne`, `$gt`, `$gte`, `$lt`, `$lte`, `$in`, `$nin`, `$contains`, `$startswith`, `$endswith`

## 迁移指南

### 从旧版迁移

```typescript
// 旧版
const storage = createSQLiteStorage(bridge);
await storage.upsert('users', 'user1', { name: '张三' });

// 新版（添加 mode 参数）
const storage = createSQLiteStorage(bridge, { 
  dbName: 'my-app',
  mode: 'eav'  // 默认值，可省略
});
```

### 从 IndexedDB 迁移

```typescript
// IndexedDB
const users = await User.findMany({
  where: { status: 'active' },
  orderBy: { createdAt: 'desc' },
  limit: 10
});

// SQLite（兼容相同 API）
const users = await User.findMany({
  where: { status: 'active' },
  sort: { field: 'createdAt', order: 'desc' },  // 或使用 orderBy 兼容
  limit: 10
});
```

## 性能建议

1. **大数据量**：使用 Table 模式 + 原生 SQL
2. **动态属性**：使用 EAV 模式
3. **批量操作**：使用 `transaction()` 包裹
4. **频繁查询**：添加索引（EAV 模式已自动添加常用索引）
5. **缓存**：结合 `createCache()` 使用

## 故障排除

### "Tauri SQL not available"
- 确保 Tauri 适配层已加载
- 检查 `window.tauri.sql` 是否存在

### "unable to open database file"
- 数据库路径由 Tauri 侧管理，检查 Tauri 配置
- 确保有文件系统权限

### "no such column"
- EAV 模式下，`data` 中的字段无法在 SQL 中直接查询
- 使用 `sort` 参数代替 `orderBy` 进行排序
