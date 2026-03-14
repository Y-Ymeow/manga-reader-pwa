/**
 * Venera 插件运行时环境
 * 提供兼容 Venera 的全局 API
 */
import { CanvasImage } from './runtimes/ConvasImage';
import { Convert } from './runtimes/Convert';
import { HtmlDocumentClass } from './runtimes/HTMLElement';
import { NetworkClass, requestManager } from './runtimes/NetworkClass';
import { createUuid, getClipboard, randomDouble, randomInt, setClipboard } from './runtimes/utils';
import { loadMangaCache, saveMangaCache, loadPluginSetting, savePluginSetting, loadPluginData, savePluginData, loadAllPluginData } from './storage';


// Hack fetch: 创建一个兼容标准 fetch API 的函数，但使用我们的请求管理器
// 这样插件里直接调用 fetch 也能绕过 CORS
function createHackedFetch(): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = (init?.method || 'GET').toUpperCase();
    const headers = init?.headers as Record<string, string> | undefined;
    const body = init?.body as string | undefined;

    try {
      let response;
      if (method === 'GET') {
        response = await requestManager.get(url, { headers });
      } else if (method === 'POST') {
        response = await requestManager.post(url, body, { headers });
      } else if (method === 'PUT') {
        response = await requestManager.request({ url, method: 'PUT', data: body, headers });
      } else if (method === 'DELETE') {
        response = await requestManager.request({ url, method: 'DELETE', headers });
      } else if (method === 'PATCH') {
        response = await requestManager.request({ url, method: 'PATCH', data: body, headers });
      } else {
        response = await requestManager.request({ url, method: method as any, data: body, headers });
      }

      console.log(response);

      // 构造兼容的 Response 对象
      const responseBody = typeof response.data === 'string'
        ? response.data
        : JSON.stringify(response.data);

      return new Response(responseBody, {
        status: response.status,
        statusText: response.statusText || 'OK',
        headers: response.headers || {},
      });
    } catch (error: any) {
      // 返回一个错误的 Response
      return new Response(error.message || 'Network error', {
        status: error.status || 0,
        statusText: error.statusText || 'Network Error',
      });
    }
  };
}

const hackedFetch = createHackedFetch();

// Cookie 类
class CookieClass {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: Date;
  httpOnly?: boolean;
  secure?: boolean;

  constructor(init: Partial<CookieClass>) {
    this.name = init.name || '';
    this.value = init.value || '';
    this.domain = init.domain;
    this.path = init.path;
    this.expires = init.expires;
    this.httpOnly = init.httpOnly;
    this.secure = init.secure;
  }
}


// ComicSource 基类
class ComicSourceClass {
  name: string = '';
  key: string = '';
  version: string = '1.0.0';
  minAppVersion: string = '1.0.0';
  url: string = '';
  settings: Record<string, any> = {};

  private pluginSettings: Record<string, any> = {};
  private pluginData: Record<string, any> = {};

  // 从 IndexedDB 加载设置值（内部使用）
  _loadSettingFromStorage(key: string, value: any): void {
    this.pluginSettings[key] = value;
  }
  
  // 从 IndexedDB 加载数据值（内部使用）
  _loadDataFromStorage(data: Record<string, any>): void {
    this.pluginData = data;
  }

  loadSetting(key: string): any {
    return this.pluginSettings[key] ?? this.settings[key]?.default;
  }

  async saveSetting(key: string, value: any): Promise<void> {
    this.pluginSettings[key] = value;
    // 设置项使用 IndexedDB（异步存储）
    await savePluginSetting(this.key, key, value);
  }
  
  loadData(dataKey: string): any {
    return this.pluginData[dataKey] ?? null;
  }
  
  async saveData(dataKey: string, value: any): Promise<void> {
    this.pluginData[dataKey] = value;
    // 数据使用 IndexedDB（异步存储，每个插件一条数据）
    await savePluginData(this.key, dataKey, value);
  }
}

// UI 对象
const UI = {
  showMessage: (message: string) => {
    alert(message);
  },

  showDialog: async (title: string, content: string, actions: any[]) => {
    const confirmed = confirm(`${title}\n\n${content}`);
    if (confirmed && actions && actions[0]?.callback) {
      await actions[0].callback();
    }
  },

  launchUrl: (url: string) => {
    window.open(url, '_blank');
  },

  showLoading: (onCancel?: (() => void) | null) => {
    return Date.now();
  },

  cancelLoading: (id: number) => {
    console.log('[UI Loading] Cancel', id);
  },

  showInputDialog: async (title: string, validator?: (value: string) => string | null | undefined, image?: string | ArrayBuffer | null): Promise<string | null> => {
    const value = prompt(title);
    if (value === null) return null;
    if (validator) {
      const error = validator(value);
      if (error) {
        alert(error);
        return null;
      }
    }
    return value;
  },

  showSelectDialog: async (title: string, options: string[], initialIndex?: number): Promise<number | null> => {
    const optionList = options.map((opt, i) => `${i + 1}. ${opt}`).join('\n');
    const input = prompt(`${title}\n\n${optionList}\n\n请输入序号:`);
    if (input === null) return null;
    const index = parseInt(input, 10) - 1;
    if (isNaN(index) || index < 0 || index >= options.length) {
      return null;
    }
    return index;
  },
};

// App 对象
const APP = {
  get version() {
    return '1.0.0';
  },
  get locale() {
    return navigator.language || 'zh_CN';
  },
  get platform() {
    return 'web';
  },
};

// Comic 类
class Comic {
  id: string;
  title: string;
  subtitle?: string;
  subTitle?: string;
  cover: string;
  tags?: string[];
  description?: string;
  maxPage?: number;
  language?: string;
  favoriteId?: string;
  stars?: number;

  constructor({
    id,
    title,
    subtitle,
    subTitle,
    cover,
    tags,
    description,
    maxPage,
    language,
    favoriteId,
    stars,
  }: {
    id: string;
    title: string;
    subtitle?: string;
    subTitle?: string;
    cover: string;
    tags?: string[];
    description?: string;
    maxPage?: number;
    language?: string;
    favoriteId?: string;
    stars?: number;
  }) {
    this.id = id;
    this.title = title;
    this.subtitle = subtitle;
    this.subTitle = subTitle;
    this.cover = cover;
    this.tags = tags;
    this.description = description;
    this.maxPage = maxPage;
    this.language = language;
    this.favoriteId = favoriteId;
    this.stars = stars;
  }
}

// ComicDetails 类
class ComicDetails {
  title: string;
  subtitle?: string;
  cover: string;
  description?: string;
  tags?: Record<string, string[]>;
  chapters?: Record<string, string>;
  isFavorite?: boolean;
  subId?: string;
  thumbnails?: string[];
  recommend?: any[];
  commentCount?: number;
  likesCount?: number;
  isLiked?: boolean;
  uploader?: string;
  updateTime?: string;
  uploadTime?: string;
  url?: string;
  stars?: number;
  maxPage?: number;
  comments?: any[];

  constructor({
    title,
    subtitle,
    subTitle,
    cover,
    description,
    tags,
    chapters,
    isFavorite,
    subId,
    thumbnails,
    recommend,
    commentCount,
    likesCount,
    isLiked,
    uploader,
    updateTime,
    uploadTime,
    url,
    stars,
    maxPage,
    comments,
  }: {
    title: string;
    subtitle?: string;
    subTitle?: string;
    cover: string;
    description?: string;
    tags?: Record<string, string[]>;
    chapters?: Record<string, string>;
    isFavorite?: boolean;
    subId?: string;
    thumbnails?: string[];
    recommend?: any[];
    commentCount?: number;
    likesCount?: number;
    isLiked?: boolean;
    uploader?: string;
    updateTime?: string;
    uploadTime?: string;
    url?: string;
    stars?: number;
    maxPage?: number;
    comments?: any[];
  }) {
    this.title = title;
    this.subtitle = subtitle ?? subTitle;
    this.cover = cover;
    this.description = description;
    this.tags = tags;
    this.chapters = chapters;
    this.isFavorite = isFavorite;
    this.subId = subId;
    this.thumbnails = thumbnails;
    this.recommend = recommend;
    this.commentCount = commentCount;
    this.likesCount = likesCount;
    this.isLiked = isLiked;
    this.uploader = uploader;
    this.updateTime = updateTime;
    this.uploadTime = uploadTime;
    this.url = url;
    this.stars = stars;
    this.maxPage = maxPage;
    this.comments = comments;
  }
}

// Comment 类
class Comment {
  userName: string;
  avatar?: string;
  content: string;
  time?: string;
  replyCount?: number;
  id?: string;
  isLiked?: boolean;
  score?: number;
  voteStatus?: number;

  constructor({
    userName,
    avatar,
    content,
    time,
    replyCount,
    id,
    isLiked,
    score,
    voteStatus,
  }: {
    userName: string;
    avatar?: string;
    content: string;
    time?: string;
    replyCount?: number;
    id?: string;
    isLiked?: boolean;
    score?: number;
    voteStatus?: number;
  }) {
    this.userName = userName;
    this.avatar = avatar;
    this.content = content;
    this.time = time;
    this.replyCount = replyCount;
    this.id = id;
    this.isLiked = isLiked;
    this.score = score;
    this.voteStatus = voteStatus;
  }
}

// ImageLoadingConfig 类
class ImageLoadingConfig {
  url?: string;
  method?: string;
  data?: any;
  headers?: Record<string, string>;
  onResponse?: (data: ArrayBuffer) => ArrayBuffer;
  modifyImage?: string;
  onLoadFailed?: () => any;

  constructor({
    url,
    method,
    data,
    headers,
    onResponse,
    modifyImage,
    onLoadFailed,
  }: {
    url?: string;
    method?: string;
    data?: any;
    headers?: Record<string, string>;
    onResponse?: (data: ArrayBuffer) => ArrayBuffer;
    modifyImage?: string;
    onLoadFailed?: () => any;
  }) {
    this.url = url;
    this.method = method;
    this.data = data;
    this.headers = headers;
    this.onResponse = onResponse;
    this.modifyImage = modifyImage;
    this.onLoadFailed = onLoadFailed;
  }
}


// 导出全局对象
export const Network = new NetworkClass();
export const Cookie = CookieClass;
export const HtmlDocument = HtmlDocumentClass;
export const ComicSource = ComicSourceClass;

// 导出 hacked fetch 供插件管理器使用
export function getHackedFetch(): typeof fetch {
  return hackedFetch;
}

// 设置全局变量
export function setupRuntimeGlobals(): void {
  (globalThis as any).Network = Network;
  (globalThis as any).Cookie = Cookie;
  (globalThis as any).HtmlDocument = HtmlDocument;
  (globalThis as any).ComicSource = ComicSource;
  (globalThis as any).UI = UI;
  (globalThis as any).APP = APP;
  (globalThis as any).Comic = Comic;
  (globalThis as any).ComicDetails = ComicDetails;
  (globalThis as any).Comment = Comment;
  (globalThis as any).ImageLoadingConfig = ImageLoadingConfig;
  (globalThis as any).Image = CanvasImage;
  (globalThis as any).Convert = Convert;
  (globalThis as any).createUuid = createUuid;
  (globalThis as any).randomInt = randomInt;
  (globalThis as any).randomDouble = randomDouble;
  (globalThis as any).setClipboard = setClipboard;
  (globalThis as any).getClipboard = getClipboard;
}

// 导出 CanvasImage 类供外部使用
export { CanvasImage };
