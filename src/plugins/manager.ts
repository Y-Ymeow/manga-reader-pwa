/**
 * 插件管理器
 */

import type {
  PluginInstance,
  PluginDefinition,
  SourceListItem,
  Comic,
  ComicDetail,
  Chapter,
  ImageLoadingConfig,
} from "./types";
import { setupRuntimeGlobals, getHackedFetch, CanvasImage } from "./runtime";
import {
  initPluginStorage,
  savePluginCode,
  loadPluginCode,
  deletePluginCode,
  saveSourceListUrl,
  getSourceListUrl,
  loadPluginSetting,
  savePluginSetting,
  loadAllPluginData,
} from "./storage";

// 插件存储
const plugins = new Map<string, PluginInstance>();
const pluginInitialized: any = {}; // 跟踪已初始化的插件
let isRestoring = false;
let restorePromise: Promise<void> | null = null;

/**
 * 调试：检查存储状态
 */
export async function debugPluginStorage(): Promise<void> {
  try {
    await initPluginStorage();
    const { listStoredPlugins, loadPluginCode } = await import("./storage");
    const keys = await listStoredPlugins();

    for (const key of keys) {
      const code = await loadPluginCode(key);
    }
  } catch (e) {
    console.error(e);
  }
}

/**
 * 初始化插件系统
 */
export async function initPluginSystem(): Promise<void> {
  setupRuntimeGlobals();
  await initPluginStorage();
}

/**
 * 获取所有已加载的插件
 */
export function getPlugins(): PluginInstance[] {
  return Array.from(plugins.values());
}

/**
 * 获取指定插件
 */
export async function getPlugin(
  key: string,
): Promise<PluginInstance | undefined> {
  const plugin = plugins.get(key);
  if (!plugin) {
    return undefined;
  }

  if (typeof (plugin as any).init === "function") {
    await (plugin as any).init();
  }

  return plugin;
}

/**
 * 从代码加载插件
 */
export async function loadPlugin(
  code: string,
  saveToStorage: boolean = true,
): Promise<PluginInstance> {
  // 确保全局变量已设置
  setupRuntimeGlobals();

  // 将代码包装成一个模块，返回类定义
  // 使用 new Function 创建函数，将全局对象作为参数传入
  const globals: Record<string, any> = {
    ComicSource: (globalThis as any).ComicSource,
    Network: (globalThis as any).Network,
    Cookie: (globalThis as any).Cookie,
    HtmlDocument: (globalThis as any).HtmlDocument,
    UI: (globalThis as any).UI,
    APP: (globalThis as any).APP,
    Comic: (globalThis as any).Comic,
    ComicDetails: (globalThis as any).ComicDetails,
    Comment: (globalThis as any).Comment,
    ImageLoadingConfig: (globalThis as any).ImageLoadingConfig,
    Convert: (globalThis as any).Convert,
    createUuid: (globalThis as any).createUuid,
    randomInt: (globalThis as any).randomInt,
    randomDouble: (globalThis as any).randomDouble,
    setClipboard: (globalThis as any).setClipboard,
    getClipboard: (globalThis as any).getClipboard,
    console: console,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    Promise: Promise,
    JSON: JSON,
    Math: Math,
    Date: Date,
    Array: Array,
    Object: Object,
    String: String,
    Number: Number,
    Boolean: Boolean,
    RegExp: RegExp,
    Error: Error,
    parseInt: parseInt,
    parseFloat: parseFloat,
    isNaN: isNaN,
    isFinite: isFinite,
    encodeURI: encodeURI,
    decodeURI: decodeURI,
    encodeURIComponent: encodeURIComponent,
    decodeURIComponent: decodeURIComponent,
    escape: escape,
    unescape: unescape,
    btoa: btoa,
    atob: atob,
    URL: URL,
    URLSearchParams: URLSearchParams,
    Blob: Blob,
    DOMParser: DOMParser,
    fetch: getHackedFetch(),
    navigator: navigator,
    location: location,
    document: document,
    window: window,
    localStorage: localStorage,
    sessionStorage: sessionStorage,
    indexedDB: indexedDB,
  };
  // 构建参数列表
  const globalNames = Object.keys(globals);
  const globalValues = globalNames.map((name) => globals[name]);

  // 包装代码：定义类并返回
  // 先尝试从代码中提取类名
  const classNameMatch = code.match(/class\s+(\w+)\s+extends\s+ComicSource/);
  const className = classNameMatch ? classNameMatch[1] : null;

  const wrappedCode = `
    "use strict";
    ${code}
    // 返回类定义
    ${className ? `return typeof ${className} !== 'undefined' ? ${className} : null;` : "return null;"}
  `;

  // 创建函数并执行
  const fn = new Function(...globalNames, wrappedCode);
  const PluginClass = fn(...globalValues);

  if (!PluginClass) {
    throw new Error("No plugin class found in code");
  }

  // 实例化插件
  const instance = new PluginClass();

  // 包装为 PluginInstance - 保留所有实例方法和属性
  const plugin: PluginInstance = Object.create(Object.getPrototypeOf(instance));
  Object.assign(plugin, instance);
  plugin.loadSetting = instance.loadSetting.bind(instance);
  plugin.saveSetting = instance.saveSetting.bind(instance);
  if (typeof (instance as any).init === "function") {
    plugin.init = instance.init.bind(instance);
  }

  // 从 IndexedDB 加载插件设置
  if (plugin.settings) {
    let hasNewSettings = false;

    for (const key of Object.keys(plugin.settings)) {
      const value = await loadPluginSetting(plugin.key, key);
      if (value !== null && (instance as any)._loadSettingFromStorage) {
        (instance as any)._loadSettingFromStorage(key, value);
        console.log(`[Plugin] Loaded setting: ${plugin.key}.${key} =`, value);
      } else {
        // 没有保存过的设置，使用默认值并保存
        const defaultValue = plugin.settings[key]?.default;
        if (
          defaultValue !== undefined &&
          (instance as any)._loadSettingFromStorage
        ) {
          (instance as any)._loadSettingFromStorage(key, defaultValue);
          await savePluginSetting(plugin.key, key, defaultValue);
          console.log(
            `[Plugin] Saved default setting: ${plugin.key}.${key} =`,
            defaultValue,
          );
          hasNewSettings = true;
        }
      }
    }

    if (hasNewSettings) {
      console.log(
        `[Plugin] Initialized ${Object.keys(plugin.settings).length} settings for ${plugin.key}`,
      );
    }
  }

  // 批量加载插件所有数据并注入
  try {
    const allData = await loadAllPluginData(plugin.key);
    if (Object.keys(allData).length > 0) {
      (instance as any)._loadDataFromStorage(allData);
      console.log(
        `[Plugin] Loaded ${Object.keys(allData).length} data entries for ${plugin.key}`,
      );
    }
  } catch (e) {
    console.warn(`[Plugin] Failed to load data for ${plugin.key}:`, e);
  }

  // 从存储恢复插件
  plugins.set(plugin.key, plugin);

  // 调用插件的 onLoad 回调（如果存在）- 用于恢复内部状态
  if (typeof (plugin as any).onLoad === "function") {
    try {
      await (plugin as any).onLoad();
    } catch (e) {
      console.warn(`[Plugin] ${plugin.key} onLoad failed:`, e);
    }
  }

  // 保存到 IndexedDB
  if (saveToStorage) {
    try {
      // 保存代码到 IndexedDB
      await savePluginCode(plugin.key, code);

      // 保存元数据到数据库
      try {
        const { waitForDatabase } = await import("../db/global");
        await waitForDatabase();
        const db = await import("../db");
        const PluginModel = db.Plugin;
        const existing = await PluginModel.findOne({
          where: { key: plugin.key },
        });
        if (existing) {
          await PluginModel.update((existing as any).id, {
            version: plugin.version,
            updatedAt: Date.now(),
          });
        } else {
          // 生成 UUID
          const id = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
            /[xy]/g,
            (c) => {
              const r = (Math.random() * 16) | 0;
              const v = c === "x" ? r : (r & 0x3) | 0x8;
              return v.toString(16);
            },
          );
          await PluginModel.create({
            id,
            name: plugin.name,
            key: plugin.key,
            version: plugin.version,
            url: plugin.url || "",
            code: "", // 代码存储在 IndexedDB，这里留空
            settings: {},
            isEnabled: true,
            installedAt: Date.now(),
            updatedAt: Date.now(),
          });
        }
      } catch (e) {
        console.warn("Database not initialized, skipping metadata save", e);
      }
    } catch (e) {
      console.error("Failed to save plugin:", e);
    }
  }

  return plugin;
}

/**
 * 卸载插件
 */
export async function unloadPlugin(key: string): Promise<void> {
  plugins.delete(key);
  try {
    await deletePluginCode(key);
    try {
      const { waitForDatabase } = await import("../db/global");
      await waitForDatabase();
      const db = await import("../db");
      const PluginModel = db.Plugin;
      const record = await PluginModel.findOne({ where: { key } });
      if (record) {
        await PluginModel.delete((record as any).id);
      }
    } catch (e) {
      // 数据库可能未初始化
    }
  } catch (e) {
    console.error("Failed to unload plugin:", e);
  }
}

/**
 * 从 URL 加载插件代码
 */
export async function loadPluginFromUrl(
  url: string,
  save: boolean = true,
): Promise<PluginInstance> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load plugin: ${response.status}`);
  }
  const code = await response.text();
  return loadPlugin(code, save);
}

/**
 * 加载源列表（JSON 格式）
 */
export async function loadSourceList(
  url: string,
  save: boolean = true,
): Promise<SourceListItem[]> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load source list: ${response.status}`);
  }
  const data = await response.json();

  if (save) {
    saveSourceListUrl(url);
  }

  return data;
}

/**
 * 获取保存的源列表地址
 */
export function getSavedSourceListUrl(): string | null {
  return getSourceListUrl();
}

/**
 * 删除插件
 */
export async function deletePlugin(pluginKey: string): Promise<void> {
  // 从内存中移除
  plugins.delete(pluginKey);

  // 从存储中删除
  const { deletePluginCode } = await import("./storage");
  await deletePluginCode(pluginKey);

  // 从数据库中删除
  try {
    const { waitForDatabase } = await import("../db/global");
    await waitForDatabase();
    const db = await import("../db");
    const PluginModel = db.Plugin;
    const record = await PluginModel.findOne({ where: { key: pluginKey } });
    if (record) {
      await PluginModel.delete((record as any).id);
    }
  } catch (e) {
    console.error("Failed to delete plugin from database:", e);
  }
}

/**
 * 从存储恢复插件
 */
export async function restorePluginsFromStorage(): Promise<void> {
  // 防止重复恢复
  if (isRestoring && restorePromise) {
    return restorePromise;
  }

  isRestoring = true;
  restorePromise = doRestorePlugins();

  try {
    await restorePromise;
  } finally {
    isRestoring = false;
    restorePromise = null;
  }
}

async function doRestorePlugins(): Promise<void> {
  try {
    // 确保存储已初始化
    await initPluginStorage();
    // 从 IndexedDB 获取插件代码列表
    const { listStoredPlugins } = await import("./storage");
    const pluginKeys = await listStoredPlugins();

    for (const key of pluginKeys) {
      try {
        const code = await loadPluginCode(key);
        if (code) {
          await loadPlugin(code, false); // 不重复保存，会自动检查是否需要 init
        }
      } catch (e) {
        console.error(`Failed to restore plugin ${key}:`, e);
      }
    }

    // 如果数据库已初始化，也尝试从数据库恢复（用于迁移或补充）
    try {
      const { waitForDatabase } = await import("../db/global");
      await waitForDatabase();
      const db = await import("../db");
      const PluginModel = db.Plugin;
      const records = await PluginModel.findMany({
        where: { isEnabled: true },
      });
      for (const record of records) {
        // 如果插件已加载，跳过
        if (plugins.has(record.key)) continue;

        try {
          const code = await loadPluginCode(record.key);
          if (code) {
            await loadPlugin(code, false); // 不重复保存，会自动检查是否需要 init
          }
        } catch (e) {
          console.error(`Failed to restore plugin ${record.key}:`, e);
        }
      }
    } catch (e) {
      // 数据库可能未初始化，忽略
      console.log("[Plugin] Database not available for plugin restore");
    }
  } catch (e) {
    console.error("Failed to restore plugins:", e);
  }
}

// ===== 图片加载处理 =====

import {
  RequestManager,
  createAutoExternalAdapter,
  FetchAdapter,
} from "../framework/requests";

// 创建图片请求管理器（优先使用外部适配器绕过 CORS）
const imageRequestManager = new RequestManager();
const externalAdapter = createAutoExternalAdapter();
if (externalAdapter) {
  imageRequestManager.register(externalAdapter);
  imageRequestManager.setDefault("external");
} else {
  imageRequestManager.register(new FetchAdapter());
}

/**
 * 处理图片加载
 * 调用插件的 onImageLoad 方法获取配置，并执行图片修改
 * @returns 处理后的图片 URL 和 headers
 */
export async function processImageLoad(
  pluginKey: string,
  url: string,
  comicId: string,
  epId: string,
): Promise<{
  url: string;
  headers?: Record<string, string>;
  blobUrl?: string;
}> {
  const plugin = await getPlugin(pluginKey);
  if (!plugin?.comic?.onImageLoad) {
    // 没有 onImageLoad，直接返回原URL
    return { url };
  }

  try {
    // 调用插件的 onImageLoad 获取配置
    const config: ImageLoadingConfig = await plugin.comic.onImageLoad(
      url,
      comicId,
      epId,
    );

    if (!config) {
      return { url };
    }

    // 处理后的URL（可能被插件修改）
    const finalUrl = config.url || url;

    // 使用 getMediaProxyUrl 生成代理 URL
    const proxyUrl = (window as any).getImageProxyUrl
      ? (window as any).getImageProxyUrl(finalUrl, config.headers || {})
      : finalUrl;

    // 如果有 headers 但没有 modifyImage，直接返回代理 URL，不需要下载转换
    if (config.headers && !config.modifyImage) {
      return {
        url: finalUrl,
        headers: config.headers,
      };
    }

    // 只有 config.modifyImage 存在时，才需要下载图片并使用 Canvas 处理
    if (config.modifyImage) {
      try {
        // 使用 requestManager 下载图片（绕过 CORS）
        // 使用 arraybuffer 因为 GM adapter 不直接支持 blob
        console.log(finalUrl);
        const response = await imageRequestManager.get<ArrayBuffer>(finalUrl, {
          headers: config.headers,
          responseType: "arraybuffer",
        });

        // 检测 Cloudflare 挑战页面
        if (response.status === 403 || response.status === 503) {
          const responseText =
            typeof response.data === "string" ? response.data : "";
          if (
            responseText.includes("cdn-cgi/challenge-platform") ||
            responseText.includes("Just a moment") ||
            responseText.includes("cf_chl")
          ) {
            console.log("[processImageLoad] Detected CF challenge");
            // 触发全局 CF 挑战回调
            import("../components/CfChallengeModal").then(
              ({ triggerCfChallenge }) => {
                triggerCfChallenge(finalUrl);
              },
            );
            throw new Error(`CF_CHALLENGE:${finalUrl}`);
          }
        }

        if (response.status < 200 || response.status >= 300) {
          throw new Error(`Failed to load image: ${response.status}`);
        }

        // 将 arraybuffer 转换为 blob
        const blob = new Blob([response.data]);

        // 使用 Canvas 加载图片
        const originalImage = await CanvasImage.fromBlob(blob);
        // 执行 modifyImage 函数
        // modifyImage 是一个字符串，包含函数定义
        const modifyFunction = new Function(
          "image",
          config.modifyImage + "\nreturn modifyImage(image);",
        );
        const modifiedImage = modifyFunction(originalImage);

        if (modifiedImage && modifiedImage instanceof CanvasImage) {
          // 转换为 Blob URL
          const mimeType = blob.type || "image/png";
          const modifiedBlob = await modifiedImage.toBlob(mimeType);
          const blobUrl = URL.createObjectURL(modifiedBlob);

          return {
            url: finalUrl,
            headers: config.headers,
            blobUrl,
          };
        }
      } catch (e) {
        console.error(
          "[processImageLoad] Failed to download/modify image:",
          e,
          finalUrl,
        );
        // 修改失败，返回代理 URL（让代理服务器处理）
        return { url: proxyUrl, headers: config.headers };
      }
    }

    // 没有 modifyImage 和 headers，只返回 URL
    return { url: proxyUrl };
  } catch (e) {
    console.error("[processImageLoad] Error:", e);
    return { url };
  }
}

/**
 * 清理图片 Blob URL
 */
export function revokeImageBlobUrl(blobUrl: string): void {
  if (blobUrl && blobUrl.startsWith("blob:")) {
    URL.revokeObjectURL(blobUrl);
  }
}

// ===== 插件功能调用 =====

/**
 * 搜索漫画
 */
export async function searchManga(
  pluginKey: string,
  keyword: string,
  page: number = 1,
  options: string[] = [],
): Promise<{ comics: Comic[]; maxPage?: number }> {
  const plugin = await getPlugin(pluginKey);
  if (!plugin?.search) {
    throw new Error("Plugin does not support search");
  }
  return plugin.search.load(keyword, options, page);
}

/**
 * 获取分类漫画
 */
export async function getCategoryComics(
  pluginKey: string,
  category: string,
  param: string,
  options: string[],
  page: number = 1,
): Promise<{ comics: Comic[]; maxPage?: number }> {
  const plugin = await getPlugin(pluginKey);
  if (!plugin?.categoryComics) {
    throw new Error("Plugin does not support category comics");
  }
  return plugin.categoryComics.load(category, param, options, page);
}

/**
 * 获取探索页面数据
 * 支持三种返回格式:
 * 1. multiPartPage: [{title: string, comics: Comic[], viewMore?: string}]
 * 2. multiPageComicList: {comics: Comic[], maxPage: number}
 * 3. mixed: {data: [], maxPage?: number} - data 包含 Comic[] 或 {title, comics, viewMore}
 */
export async function getExploreData(
  pluginKey: string,
  pageTitle: string,
  pageNum: number = 1,
): Promise<any> {
  const plugin = await getPlugin(pluginKey);
  if (!plugin?.explore) {
    throw new Error("Plugin does not support explore");
  }
  const page = plugin.explore.find((p) => p.title === pageTitle);

  if (!page) {
    throw new Error("Explore page not found");
  }
  // load 是个async
  return await page.load(pageNum);
}

/**
 * 获取漫画详情
 */
export async function getComicDetail(
  pluginKey: string,
  comicId: string,
): Promise<ComicDetail> {
  const plugin = await getPlugin(pluginKey);
  if (!plugin?.comic?.loadInfo) {
    throw new Error("Plugin does not support comic detail");
  }
  return plugin.comic.loadInfo(comicId);
}

/**
 * 获取章节图片
 * 支持两种格式:
 * 1. Venera 标准: comic.loadImages(comicId, chapterId) -> string[]
 * 2. Venera 替代: loadEp(comicId, chapterId) -> { images: string[] }
 */
export async function getChapterImages(
  pluginKey: string,
  comicId: string,
  chapterId?: string,
): Promise<string[]> {
  const plugin = await getPlugin(pluginKey);
  if (!plugin) {
    throw new Error("Plugin not found");
  }

  // chapterId 现在已经是 chapterId/mangaId 格式（如：chapter-6/i-cant-stand-it-sister-in-law-raw）
  // 或者只是 chapterId（如：chapter-6），插件内部会处理

  // 尝试方式 1: comic.loadImages (Venera 标准格式)
  if (plugin.comic?.loadImages) {
    return plugin.comic.loadImages(comicId, chapterId || "");
  }

  if (chapterId?.includes("/")) {
    chapterId = chapterId.replace(new RegExp("\/" + comicId + "$"), "");
  }

  // 尝试方式 2: comic.loadEp (返回 { images: string[] })
  if (plugin.comic?.loadEp) {
    const result = await plugin.comic.loadEp(comicId, chapterId);
    if (result && Array.isArray(result.images)) {
      console.log("[processImageUrls] Loaded images:", result.images.length);
      return result.images;
    }
    throw new Error("Plugin loadEp returned invalid format");
  }

  throw new Error("Plugin does not support chapter images");
}

/**
 * 获取分类页面数据
 */
export async function getCategoryData(
  pluginKey: string,
): Promise<{ title: string; parts: any[]; enableRankingPage: boolean } | null> {
  const plugin = await getPlugin(pluginKey);
  if (!plugin?.category) {
    return null;
  }
  console.log(plugin.category);
  return plugin.category;
}
