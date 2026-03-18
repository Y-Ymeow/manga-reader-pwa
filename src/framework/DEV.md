# Framework 开发文档

面向 PWA 的开发框架，提供完整的模块化解决方案。

---

## 项目简介

**Framework** 是一套为 Progressive Web App (PWA) 设计的开发框架。它提供了完整的工具集，帮助开发者快速构建 AI 驱动、数据持久化的应用程序。所有功能都针对浏览器环境优化，支持离线存储、跨域请求、状态管理等 PWA 核心特性。

### 核心特性

- **统一的 Provider 接口**：支持 OpenAI、Claude 等多种 AI 服务
- **智能的 Prompt 管理**：模板变量替换、分片组装、多轮对话支持
- **灵活的工具调用**：原生格式 + `<tool>` 标签格式，兼容所有模型
- **模糊匹配记忆系统**：基于 OPFS 的持久化存储，支持关键词搜索
- **多格式响应解析**：自动提取 thinking、tool calls 等内容
- **Token 预算管理**：精确控制和估算 Token 使用量
- **通用存储模块**：支持 OPFS、LocalStorage、Memory、IndexedDB
- **跨域请求支持**：通过油猴脚本/Chrome 插件绕过 CORS 限制
- **类 ORM 数据库**：IndexedDB 的 ORM 封装，支持迁移
- **Agent 系统**：简化的 ReAct Agent 实现，支持自定义工具
- **跨框架状态管理**：全局状态管理器，支持订阅、切片、持久化
- **工具类**：事件总线、Worker 管理、压缩解压等通用工具
- **SQLite 支持**：通过 Tauri 原生插件，支持 EAV 和 Table 双模式
- **Tauri 兼容层**：无缝集成 Tauri 原生功能

---

## 快速开始

### 安装

```bash
npm install
```

### 方式一：使用快捷函数（推荐）

```typescript
import {
  initFramework,
  createOpenAI,
  initDatabase,
  f
} from './framework';

// 快速初始化完整框架
const { core, storage, requests, db } = initFramework({
  openai: { apiKey: 'your-api-key', model: 'gpt-4' },
  storage: { type: 'localStorage', name: 'my-app' },
  indexedDB: { name: 'my-app-db', version: 1 }
});

// 定义 IndexedDB 模型
const User = defineModel(db!, 'users', {
  id: f.id(),
  name: f.string({ required: true }),
  email: f.string(),
  createdAt: f.date({ default: () => new Date() })
});

// 使用
await User.create({ name: '张三', email: 'zhang@test.com' });
```

### 方式二：按需导入特定模块

```typescript
// AI 模块
import { FrameworkCore, OpenAIProvider } from './framework/ai';

// 存储模块
import { StorageManager, LocalStorage } from './framework/storages';

// 请求模块
import { RequestManager, FetchAdapter } from './framework/requests';

// IndexedDB 模块
import { IDBDatabase, Model, field } from './framework/indexeddb';

// SQLite 模块
import { createSQLiteStorage, createSQLiteDB } from './framework/sqlite';

// Tauri 兼容层
import { getTauri, getSQL, getEAV } from './framework/tauri';
```

---

## 模块说明

### 快捷函数 (`helper.ts`)

框架提供一系列快捷函数，简化常用操作：

```typescript
import {
  // AI
  createCore,              // 创建框架核心
  createOpenAI,            // 创建 OpenAI Provider
  initOpenAICore,          // 快速初始化 OpenAI
  createProvider,          // 创建任意 OpenAI 兼容 Provider

  // 存储
  initStorage,             // 初始化存储管理器
  createOPFS,              // 创建 OPFS 存储
  createLocalStorage,      // 创建 LocalStorage

  // 压缩
  initCompression,         // 创建压缩实例
  compressText,            // 压缩文本
  decompressText,          // 解压文本
  compressObject,          // 压缩对象
  decompressObject,        // 解压对象

  // 请求
  initRequestManager,      // 初始化请求管理器

  // IndexedDB
  initDatabase,            // 初始化数据库
  defineModel,             // 定义模型
  f,                       // 字段快捷定义

  // SQLite
  initSQLite,              // 初始化 SQLite 存储
  getSQLite,               // 获取 SQLite 存储实例
  initSQLiteDB,            // 初始化 SQLite 数据库管理器
  getSQLiteDBHelper,       // 获取 SQLite 数据库管理器
  defineSQLiteModel,       // 定义 SQLite 模型
  createModel,             // 快速创建模型

  // State
  initStore,               // 创建状态管理器
  getGlobalStore,          // 获取全局 Store
  defineSlice,             // 定义状态切片

  // Utils - 事件
  initEventBus,            // 创建事件总线

  // Utils - Worker
  initWorker,              // 创建内联 Worker
  initWorkerPool,          // 创建 Worker 池

  // 组合
  initFramework            // 一键初始化完整框架
} from './framework';
```

### Tauri 兼容层 (`tauri.ts`)

提供与 Tauri 原生功能的无缝集成：

```typescript
import { getTauri, getSQL, getEAV, ready } from './framework/tauri';

// ===== 等待 Tauri 就绪 =====
await ready();

// ===== 获取 Tauri 桥接对象 =====
const tauri = getTauri();
console.log(tauri.sql);    // SQL 接口
console.log(tauri.eav);    // EAV 接口
console.log(tauri.fs);     // 文件系统
console.log(tauri.audio);  // 音频播放

// ===== 使用 SQL 接口 =====
const sql = getSQL();
await sql.execute('CREATE TABLE IF NOT EXISTS users (id TEXT, name TEXT)');
const users = await sql.select('SELECT * FROM users');

// ===== 使用 EAV 接口 =====
const eav = getEAV();
await eav.upsert('users', 'user1', { name: '张三', age: 25 });
const user = await eav.findOne('users', 'user1');

// ===== 获取当前 PWA ID =====
const pwaId = getPwaId();
```

### SQLite 模块 (`sqlite/`)

完整的 SQLite 存储解决方案，支持 EAV 和 Table 双模式：

```typescript
import {
  // 存储
  SQLiteStorage,
  createSQLiteStorage,
  getGlobalSQLiteStorage,
  
  // EAV 模式
  EAVStorage,
  createEAVStorage,
  
  // Table 模式
  SQLiteTable,
  createSQLiteTable,
  SQLiteDatabase,
  createSQLiteDatabase,
  
  // 模型层
  SQLiteModel,
  createSQLiteModel,
  SQLiteDatabaseManager,
  createSQLiteDB,
  
  // 查询构建器
  SQLiteQueryBuilder,
  
  // 快捷函数
  initSQLite,
  getSQLite,
  defineSQLiteModel,
  createModel,
} from './framework/sqlite';
```

#### EAV 模式（适合结构不固定的数据）

```typescript
// 创建存储实例
const storage = createSQLiteStorage(bridge, { 
  dbName: 'my-app',
  mode: 'eav'
});
await storage.init();

// CRUD 操作
await storage.upsert('users', 'user1', { name: '张三', age: 25 });
const user = await storage.findOne('users', 'user1');
const users = await storage.find('users', { 
  sort: { field: 'createdAt', order: 'desc' },
  limit: 10 
});
await storage.delete('users', 'user1');

// KV 存储
await storage.setItem('config.theme', 'dark');
const theme = await storage.getItem('config.theme');
```

#### Table 模式（适合结构固定的数据）

```typescript
const storage = createSQLiteStorage(bridge, { 
  dbName: 'my-app',
  mode: 'table'
});

// 创建表
await storage.createTable('users', `
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE
`);

// 插入数据
await storage.tableInsert('users', { 
  id: 'user1', 
  name: '张三' 
});

// 执行原生 SQL
await storage.execute('UPDATE users SET age = ? WHERE id = ?', [26, 'user1']);

// 事务
await storage.transaction([
  { sql: 'INSERT INTO users (id, name) VALUES (?, ?)', params: ['u1', '张三'] },
  { sql: 'INSERT INTO users (id, name) VALUES (?, ?)', params: ['u2', '李四'] }
]);
```

#### 使用模型层（ORM）

```typescript
import { createSQLiteDB } from './framework/sqlite';

const db = createSQLiteDB(bridge, { name: 'my-app' });
await db.init();

// 创建模型
const User = db.model('users', { primaryKey: 'id' });

// CRUD
const user = await User.create({ id: 'user1', name: '张三', age: 25 });
const found = await User.findById('user1');
const updated = await User.update('user1', { age: 26 });
await User.delete('user1');

// 查询构建器
const users = await User.query()
  .where('age', '>=', 18)
  .orderBy('createdAt', 'desc')
  .limit(10)
  .findMany();
```

**详细文档见 `sqlite/README.md`**

### AI 模块 (`ai/`)

AI 相关功能的统一入口。

```typescript
import {
  FrameworkCore,
  OpenAIProvider,
  PromptManager,
  ToolManager,
} from './framework/ai';
```

#### Core - 框架核心

```typescript
const core = new FrameworkCore({
  defaultProvider: 'openai',
  timeout: 30000,
});
```

#### Providers - AI Provider

```typescript
import { createProvider, createOpenAI } from './framework';

// 通用方式 - 支持任何 OpenAI 兼容 API
const provider = createProvider({
  name: 'deepseek',
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseUrl: 'https://api.deepseek.com/v1',
  model: 'deepseek-chat'
});

// 快速创建 OpenAI
const openai = createOpenAI(process.env.OPENAI_API_KEY, {
  model: 'gpt-4o',
  organization: 'org-xxx',
  project: 'proj-xxx'
});

// 启用思考模式
provider.enableThinking({
  type: 'enabled',
  max_tokens: 8192
});
```

### 存储模块 (`storages/`)

通用存储接口，支持多种后端：

```typescript
import {
  StorageManager,
  OPFSStorage,
  LocalStorage,
  MemoryStorage,
  Compression,
} from './framework/storages';

// 使用管理器
const storage = new StorageManager({ defaultStorage: 'localStorage' });
await storage.set('user', { name: '张三' });
const user = await storage.getValue('user');

// 压缩功能
const compression = new Compression();
const compressed = await compression.compressText(largeText);
const original = await compression.decompressText(compressed);
```

### 请求模块 (`requests/`)

统一请求接口，支持多种适配器：

```typescript
import {
  RequestManager,
  FetchAdapter,
  createAutoExternalAdapter
} from './framework/requests';

const manager = new RequestManager();

// 自动注册外部适配器（绕过 CORS）
const externalAdapter = createAutoExternalAdapter();
if (externalAdapter) {
  manager.register(externalAdapter);
  manager.setDefault('gm_xhr');
}

// 发送请求
const response = await manager.get('https://api.example.com/data');
```

### IndexedDB 模块 (`indexeddb/`)

类 ORM 的 IndexedDB 封装：

```typescript
import {
  IDBDatabase,
  Model,
  field,
  defineSchema
} from './framework/indexeddb';

// 创建数据库
const db = new IDBDatabase({
  name: 'my-app',
  version: 2,
  migrations: [
    {
      version: 1,
      steps: [{ action: 'create', model: 'users', changes: { keyPath: 'id' } }]
    }
  ]
});
await db.init();

// 定义模型
const User = new Model(db, 'users', {
  id: field.primary(),
  name: field.string({ required: true }),
  email: field.string({ unique: true }),
});

// CRUD 操作
await User.create({ name: '张三', email: 'zhang@test.com' });
const users = await User.findMany({
  where: { age: { $gte: 18 } },
  sort: { field: 'createdAt', order: 'desc' },  // 或使用 orderBy 兼容
  limit: 10
});
```

### Memory 模块 (`memory/`)

基于 OPFS 的记忆系统：

```typescript
import { Memory } from './framework/memory';

const memory = new Memory();
await memory.init();

// 存储记忆
await memory.add('用户喜欢深色模式', { tags: ['preference'] });

// 模糊搜索
const results = await memory.search('深色主题', { limit: 5 });
```

### Agent 模块 (`agent/`)

简化的 Agent 系统，支持 ReAct 模式：

```typescript
import {
  Agent,
  createAgent,
  createCoderAgent,
} from './framework/agent';

// 从预设创建
const coder = createCoderAgent(core);
const result = await coder.execute('帮我分析这个代码文件');

// 自定义配置
const agent = createAgent(core, {
  name: 'my-agent',
  provider: 'openai',
  tools: ['think', 'finish', 'read_file', 'write_file'],
  maxIterations: 5
});
```

### State 模块 (`state/`)

跨框架全局状态管理器：

```typescript
import {
  Store,
  createStore,
  createSlice,
} from './framework/state';

// 创建 Store
const store = createStore({
  initialState: { count: 0, user: null },
  persist: { key: 'my-app-state' }
});

// 订阅状态变化
store.subscribe((state, prevState, info) => {
  console.log('状态变化:', info.path, info.value);
});

// 使用切片
const counter = createSlice({
  name: 'counter',
  initialState: { value: 0 },
  reducers: {
    increment: (state) => ({ value: state.value + 1 }),
    decrement: (state) => ({ value: state.value - 1 }),
  }
});
counter.register(store);

// 更新状态
counter.actions.increment();
```

### Utils 模块 (`utils/`)

通用工具类集合：

#### EventBus - 事件总线

```typescript
import { EventBus, createEventBus } from './framework/utils';

const events = createEventBus();

// 订阅事件
events.on('user:login', (user) => {
  console.log('用户登录:', user);
});

// 触发事件
await events.emit('user:login', { id: 1, name: '张三' });

// 取消订阅
events.off('user:login');
```

#### WorkerManager - WebWorker 管理

```typescript
import { WorkerManager, createWorker, createWorkerPool } from './framework/utils';

// 内联 Worker
const worker = createWorker((ctx) => {
  ctx.onmessage = (e) => {
    const result = e.data.n * 2;
    ctx.postMessage(result);
  };
});

const result = await worker.exec('calculate', { n: 100 }, 5000);

// Worker 池
const pool = createWorkerPool('workers/processor.js', { size: 4 });
const results = await pool.execAll(tasks);
```

---

## 项目结构

```
src/framework/
├── index.ts          # 统一入口（导出快捷函数）
├── helper.ts         # 快捷创建函数
├── types.ts          # 共享类型
├── tauri.ts          # Tauri 兼容层
├── ai/               # AI 相关模块
│   ├── index.ts
│   ├── core.ts       # 框架核心
│   ├── providers/    # AI Provider
│   ├── prompts/      # Prompt 管理
│   └── tools/        # 工具调用
├── storages/         # 通用存储模块
│   ├── index.ts
│   ├── opfs.ts       # OPFS 存储
│   ├── local.ts      # LocalStorage
│   ├── memory.ts     # 内存存储
│   └── compression.ts # 压缩解压
├── requests/         # 通用请求模块
│   ├── index.ts
│   ├── adapters/     # 适配器
│   └── manager.ts
├── indexeddb/        # IndexedDB ORM
│   ├── index.ts
│   ├── database.ts
│   ├── model.ts
│   └── query.ts
├── sqlite/           # SQLite 模块
│   ├── index.ts
│   ├── types.ts
│   ├── storage.ts    # 核心存储（双模式）
│   ├── model.ts      # ORM 模型
│   ├── query.ts      # 查询构建器
│   ├── database.ts   # 数据库管理
│   ├── helper.ts     # 快捷函数
│   ├── sqlite.ts     # 原生表操作
│   ├── eav.ts        # EAV 模式
│   └── README.md     # 详细文档
├── memory/           # 记忆系统
├── agent/            # Agent 系统
├── state/            # 状态管理
└── utils/            # 通用工具
    ├── event.ts      # 事件总线
    └── worker.ts     # Worker 管理
```

---

## 跨域请求解决方案

由于浏览器 CORS 限制，框架提供两种绕过方案：

### 方案一：油猴脚本

安装 `plugins/request-bridge.user.js` 到 Tampermonkey/Greasemonkey

### 方案二：Chrome 插件

1. 打开 Chrome 扩展管理页面 `chrome://extensions/`
2. 开启开发者模式
3. 加载已解压的扩展程序，选择 `plugins/chrome-extension/`

安装后，框架会自动检测并使用外部请求接口。

---

## 开发流程

本项目采用敏捷开发流程，使用 `docs/` 文件夹管理任务：

1. **规划中** → 创建任务文档
2. **进行中** → 开始开发
3. **待审查** → 提交代码，等待审查
4. **待处理修复** → Bug 和技术债务
5. **已完成** → 归档

**详细说明见 `docs/README.md`**

---

## 技术栈

- **TypeScript** 5.9+（严格模式）
- **Vite** 构建工具
- **OPFS** 浏览器文件系统
- **IndexedDB** 浏览器数据库
- **SQLite** Tauri 原生数据库
- **Fetch API** HTTP 请求

---

## 许可证

MIT

---

*Framework - 构建下一代 PWA 应用*
