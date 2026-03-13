# Manga Reader PWA

一个支持插件的 PWA 漫画阅读器，可在浏览器中安装并离线阅读。

## 功能特性

### 核心功能
- **插件系统** - 兼容 Venera 插件格式，支持自定义漫画源
- **离线阅读** - 多级缓存系统（OPFS/FS/IndexedDB），支持下载章节离线阅读
- **智能缓存队列** - 按漫画源分组，顺序下载避免触发反爬
- **缓存索引** - 记录图片 URL 结构，无需重复请求远程
- **图片处理** - 支持跨域头修改、图片解混淆等插件功能
- **PWA 支持** - 可安装到桌面/手机，离线可用

### 阅读功能
- 章节列表浏览
- 已读/未读标记
- 阅读历史记录
- 图片懒加载
- 缓存状态实时显示

### 缓存管理
- 查看缓存队列和进度
- 单独缓存/删除章节
- 批量缓存所有章节
- 缓存统计和清理

## 安装使用

### 开发环境
```bash
# 安装依赖
bun install

# 开发模式
bun run dev

# 构建
bun run build

# 预览构建结果
bun run preview
```

### PWA 安装
1. 使用 Chrome/Edge/Safari 访问部署后的网站
2. 点击地址栏右侧的"安装"图标
3. 或在菜单中选择"添加到主屏幕"

## 插件开发

支持兼容 Venera 的插件格式：

```javascript
// 插件示例
class MyComicSource extends ComicSource {
  // 漫画源信息
  get name() { return '漫画源名称'; }
  get key() { return 'unique-key'; }
  get version() { return '1.0.0'; }
  
  // 获取漫画详情
  async getComicDetail(id) {
    return {
      title: '标题',
      cover: '封面URL',
      description: '简介',
      chapters: [...]
    };
  }
  
  // 获取章节图片
  async getChapterImages(comicId, chapterId) {
    return ['url1', 'url2', ...];
  }
  
  // 图片处理（可选）
  onImageLoad(url, comicId, epId) {
    return {
      headers: { 'Referer': '...' }
    };
  }
}
```

## 缓存系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                        缓存队列                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │
│  │  漫画源 A    │  │  漫画源 B    │  │  漫画源 C    │          │
│  │  顺序执行    │  │  顺序执行    │  │  顺序执行    │          │
│  └─────────────┘  └─────────────┘  └─────────────┘          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      三级存储系统                            │
│                                                             │
│  1. OPFS (Origin Private File System) - 大文件存储          │
│  2. Tauri FS - 桌面应用文件系统                             │
│  3. IndexedDB - 降级兼容存储                                │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      缓存索引                                │
│  记录元数据：漫画ID、章节ID、图片URL、缓存时间等             │
└─────────────────────────────────────────────────────────────┘
```

### 缓存策略
- **并发控制**: 同一漫画源一次只下载一本漫画
- **延迟策略**: 章节间 1.5s，图片间 800ms 延迟
- **并发数**: 单章节 2-3 张图片同时下载
- **去重机制**: 相同章节不会重复加入队列

## 项目结构

```
src/
├── components/        # UI 组件
│   ├── layout/        # 布局组件
│   ├── manga/         # 漫画相关组件
│   └── ui/            # 基础 UI 组件
├── pages/             # 页面
│   ├── Home.tsx       # 首页
│   ├── Explore.tsx    # 发现/分类
│   ├── Search.tsx     # 搜索
│   ├── MangaDetail.tsx# 漫画详情
│   ├── Reader.tsx     # 阅读器
│   ├── CacheManager.tsx# 缓存管理
│   └── Settings.tsx   # 设置
├── plugins/           # 插件系统
│   ├── index.ts       # 插件管理
│   ├── runtime.ts     # 插件运行时
│   ├── types.ts       # 类型定义
│   └── runtimes/      # 运行时工具
├── fs/                # 文件系统
│   ├── cache-manager.ts  # 缓存管理器
│   ├── cache-queue.ts    # 缓存队列
│   └── cache-index.ts    # 缓存索引
├── db/                # 数据库
│   ├── index.ts       # 模型定义
│   └── migrations.ts  # 数据库迁移
├── framework/         # 框架层
│   ├── indexeddb/     # IndexedDB ORM
│   ├── requests/      # 请求管理
│   └── ...
└── routes/            # 路由
    └── index.tsx
```

## 技术栈

- **前端**: Preact + TypeScript + Vite
- **样式**: Tailwind CSS
- **存储**: IndexedDB + OPFS
- **构建**: Vite + TypeScript
- **PWA**: Vite PWA Plugin

## CORS 解决方案

由于漫画图片通常有跨域限制，提供两种解决方案：

### 1. Tampermonkey 脚本
安装 `plugins/request-bridge.user.js` 脚本，自动拦截请求并添加 CORS 头。

### 2. Chrome 扩展
安装 `plugins/chrome-extension/` 扩展，提供请求代理功能。

## 缓存管理

### 缓存位置
- **OPFS**: 浏览器私有文件系统，容量大
- **Tauri FS**: 桌面应用本地文件系统
- **IndexedDB**: 浏览器数据库，降级兼容

### 缓存路径结构
```
manga-cache/
└── {mangaId}/
    └── {chapterId}/
        ├── 0.webp
        ├── 1.webp
        └── ...
```

## 开发计划

查看 [docs/](docs/) 文件夹了解开发任务管理。

## License

MIT
