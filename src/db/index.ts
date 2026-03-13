/**
 * Manga Reader Database
 *
 * 使用框架的 IndexedDB ORM 封装
 */

import {
  DatabaseManager,
  createDatabase,
  Model,
  field,
  type ModelData,
} from "../framework/indexeddb";

// 数据库实例
let db: DatabaseManager | null = null;

// 模型类型
export interface MangaRecord extends ModelData {
  id: string;
  title: string;
  cover: string;
  description?: string;
  author?: string;
  status?: string;
  genres?: string[];
  sourceUrl?: string;
  pluginId: string;
  externalId?: string;
  lastReadAt?: number;
  lastReadChapterId?: string;
  isFavorite: boolean;
  favoriteAt?: number;
  categoryId?: string;
  createdAt: number;
  updatedAt: number;
  chapters?: Map<string, string>;
}

// 章节列表 JSON 存储（一条记录包含所有章节）
export interface ChapterListRecord extends ModelData {
  id: string;
  mangaId: string;
  chapters: Array<{
    id: string; // externalId (chapterId/mangaId 格式)
    title: string;
    number: number;
    isRead?: boolean;
    readAt?: number;
  }>;
  updatedAt: number;
}

export interface CategoryRecord extends ModelData {
  id: string;
  name: string;
  sort: number;
  createdAt: number;
}

export interface ReadHistoryRecord extends ModelData {
  id: string;
  mangaId: string;
  chapterId: string;
  page: number;
  readAt: number;
}

export interface PluginRecord extends ModelData {
  id: string;
  name: string;
  key: string;
  version: string;
  url: string;
  code: string;
  settings: Record<string, any>;
  isEnabled: boolean;
  installedAt: number;
  updatedAt: number;
}

export interface CacheRecord extends ModelData {
  id: string;
  type: "manga_list" | "manga_detail" | "chapter_list" | "image";
  key: string;
  data: any;
  expiresAt: number;
  createdAt: number;
}

export interface UpdateRecord extends ModelData {
  id: string;
  mangaId: string;
  newChapterCount: number;
  latestChapterTitle?: string;
  checkedAt: number;
  isRead: boolean;
}

// 模型实例
export let Manga: Model<MangaRecord>;
export let ChapterList: Model<ChapterListRecord>;
export let Category: Model<CategoryRecord>;
export let ReadHistory: Model<ReadHistoryRecord>;
export let Plugin: Model<PluginRecord>;
export let Cache: Model<CacheRecord>;
export let Update: Model<UpdateRecord>;

/**
 * 初始化数据库
 */
export async function initDatabase(): Promise<void> {
  if (db) return;

  db = createDatabase({
    name: "manga-reader",
    version: 2,
    migrations: [
      {
        version: 1,
        description: "Initial schema",
        steps: [
          {
            action: "create",
            model: "mangas",
            changes: { keyPath: "id" },
          },
          {
            action: "create",
            model: "chapters",
            changes: { keyPath: "id" },
          },
          {
            action: "create",
            model: "categories",
            changes: { keyPath: "id" },
          },
          {
            action: "create",
            model: "read_history",
            changes: { keyPath: "id" },
          },
          {
            action: "create",
            model: "plugins",
            changes: { keyPath: "id" },
          },
          {
            action: "create",
            model: "cache",
            changes: { keyPath: "id" },
          },
          {
            action: "create",
            model: "updates",
            changes: { keyPath: "id" },
          },
        ],
      },
      {
        version: 2,
        description: "Replace chapters with chapter_lists",
        steps: [
          {
            action: "drop",
            model: "chapters",
          },
          {
            action: "create",
            model: "chapter_lists",
            changes: { keyPath: "id" },
          },
        ],
      },
    ],
  });

  await db.init();

  // 初始化模型
  Manga = new Model<MangaRecord>(db, "mangas", {
    id: field.uuid(),
    title: field.string({ required: true }),
    cover: field.string({ required: true }),
    description: field.string(),
    author: field.string(),
    status: field.string(),
    genres: field.array(),
    sourceUrl: field.string(),
    pluginId: field.string({ required: true }),
    externalId: field.string(),
    lastReadAt: field.number(),
    lastReadChapterId: field.string(),
    isFavorite: field.boolean({ default: () => false }),
    favoriteAt: field.number(),
    categoryId: field.string(),
    createdAt: field.number({ default: () => Date.now() }),
    updatedAt: field.number({ default: () => Date.now() }),
  });

  ChapterList = new Model<ChapterListRecord>(db, "chapter_lists", {
    id: field.uuid(),
    mangaId: field.string({ required: true }),
    chapters: field.json({ default: () => [] }),
    updatedAt: field.number({ default: () => Date.now() }),
  });

  Category = new Model<CategoryRecord>(db, "categories", {
    id: field.uuid(),
    name: field.string({ required: true }),
    sort: field.number({ default: () => 0 }),
    createdAt: field.number({ default: () => Date.now() }),
  });

  ReadHistory = new Model<ReadHistoryRecord>(db, "read_history", {
    id: field.uuid(),
    mangaId: field.string({ required: true }),
    chapterId: field.string({ required: true }),
    page: field.number({ default: () => 0 }),
    readAt: field.number({ default: () => Date.now() }),
  });

  Plugin = new Model<PluginRecord>(db, "plugins", {
    id: field.uuid(),
    name: field.string({ required: true }),
    key: field.string({ required: true, unique: true }),
    version: field.string({ required: true }),
    url: field.string(),
    code: field.string({ required: true }),
    settings: field.object({ default: () => ({}) }),
    isEnabled: field.boolean({ default: () => true }),
    installedAt: field.number({ default: () => Date.now() }),
    updatedAt: field.number({ default: () => Date.now() }),
  });

  Cache = new Model<CacheRecord>(db, "cache", {
    id: field.uuid(),
    type: field.string({ required: true }),
    key: field.string({ required: true }),
    data: field.json(),
    expiresAt: field.number({ required: true }),
    createdAt: field.number({ default: () => Date.now() }),
  });

  Update = new Model<UpdateRecord>(db, "updates", {
    id: field.uuid(),
    mangaId: field.string({ required: true }),
    newChapterCount: field.number({ default: () => 0 }),
    latestChapterTitle: field.string(),
    checkedAt: field.number({ default: () => Date.now() }),
    isRead: field.boolean({ default: () => false }),
  });

  // 初始化默认分类
  await initDefaultCategories();
}

/**
 * 生成 UUID
 */
function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * 初始化默认分类
 */
async function initDefaultCategories(): Promise<void> {
  const count = await Category.count();
  if (count === 0) {
    await Category.create({
      id: generateUUID(),
      name: "全部",
      sort: 0,
      createdAt: Date.now(),
    });
    await Category.create({
      id: generateUUID(),
      name: "连载中",
      sort: 1,
      createdAt: Date.now(),
    });
    await Category.create({
      id: generateUUID(),
      name: "已完结",
      sort: 2,
      createdAt: Date.now(),
    });
    await Category.create({
      id: generateUUID(),
      name: "待看",
      sort: 3,
      createdAt: Date.now(),
    });
  }
}

/**
 * 获取数据库实例
 */
export function getDatabase(): DatabaseManager {
  if (!db) {
    throw new Error("Database not initialized. Call initDatabase() first.");
  }
  return db;
}

/**
 * 关闭数据库
 */
export async function closeDatabase(): Promise<void> {
  if (db) {
    await db.close();
    db = null;
  }
}

// 导出全局数据库管理
export * from "./global";
export * from "./migrations";

/**
 * 清空所有数据
 */
export async function clearDatabase(): Promise<void> {
  if (!db) return;
  await Manga.clear();
  await ChapterList.clear();
  await Category.clear();
  await ReadHistory.clear();
  await Plugin.clear();
  await Cache.clear();
  await Update.clear();
}
