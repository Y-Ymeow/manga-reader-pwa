/**
 * Venera 兼容的漫画源插件类型定义
 */

// 漫画信息
export interface Comic {
  id: string;
  title: string;
  cover: string;
  subTitle?: string;
  description?: string;
  tags?: string[];
  author?: string;
  status?: string;
  updateTime?: string;
  [key: string]: any;
}

// 章节信息
export interface Chapter {
  id: string;
  title: string;
  number?: number;
  [key: string]: any;
}

// 漫画详情
export interface ComicDetail extends Comic {
  chapters: Chapter[];
  isFavorite?: boolean;
}

// 探索页面
// 支持三种返回格式:
// 1. multiPartPage (singlePageWithMultiPart): [{title: string, comics: Comic[], viewMore?: string}]
// 2. multiPageComicList: {comics: Comic[], maxPage?: number}
// 3. mixed: {data: Array<Comic[] | {title: string, comics: Comic[], viewMore?: string}>, maxPage?: number}
export interface ExplorePage {
  title: string;
  type: "singlePageWithMultiPart" | "multiPageComicList";
  load: (page: number) => Promise<any>;
}

// 分类
export interface CategoryPart {
  name: string;
  type: "fixed" | "random";
  randomNumber?: number;
  categories: string[];
  itemType: "category" | "search";
  categoryParams?: string[];
}

export interface CategoryPage {
  title: string;
  parts: CategoryPart[];
  enableRankingPage: boolean;
}

// 分类漫画
export interface CategoryComicsOptions {
  load: (
    category: string,
    param: string,
    options: string[],
    page: number,
  ) => Promise<{
    comics: Comic[];
    maxPage?: number;
  }>;
  optionList?: { options: string[] }[];
}

// 搜索
export interface SearchOptions {
  load: (
    keyword: string,
    options: string[],
    page: number,
  ) => Promise<{
    comics: Comic[];
    maxPage?: number;
  }>;
  optionList?: { options: string[] }[];
}

// 收藏
export interface FavoritesOptions {
  multiFolder: boolean;
  addOrDelFavorite?: (
    comicId: string,
    folderId: string | null,
    isAdding: boolean,
  ) => Promise<string>;
  loadFolders?: (comicId?: string) => Promise<any[]>;
  loadComics: (
    page: number,
    folder?: any,
  ) => Promise<{
    comics: Comic[];
    maxPage?: number;
  }>;
}

// 图片加载配置
export interface ImageLoadingConfig {
  url?: string;
  method?: string;
  data?: any;
  headers?: Record<string, string>;
  onResponse?: (data: ArrayBuffer) => ArrayBuffer;
  modifyImage?: string;
  onLoadFailed?: () => any;
}

// 漫画详情页
export interface ComicOptions {
  loadInfo: (id: string) => Promise<ComicDetail>;
  loadEp: (id: any, epId: any) => Promise<{ images: string[] }>;
  loadChapters?: (id: string) => Promise<Chapter[]>;
  loadImages?: (comicId: string, chapterId: string) => Promise<string[]>;
  /** 处理图片加载，返回配置用于修改URL、添加headers或解混淆图片 */
  onImageLoad?: (url: string, comicId: string, epId: string) => ImageLoadingConfig | Promise<ImageLoadingConfig>;
}

// 账号
export interface AccountOptions {
  login: (account: string, pwd: string) => Promise<string>;
  logout: () => void;
  registerWebsite?: string;
}

// 设置项
export interface SettingOption {
  title: string;
  type: "select" | "input" | "switch" | "callback";
  options?: { value: string; text?: string }[];
  default?: string | boolean;
  buttonText?: string;
  callback?: () => void | Promise<void>;
}

// 插件定义
export interface PluginDefinition {
  name: string;
  key: string;
  version: string;
  minAppVersion?: string;
  url?: string;
  settings?: Record<string, SettingOption>;
  account?: AccountOptions | null;
  explore?: ExplorePage[];
  category?: CategoryPage | null;
  categoryComics?: CategoryComicsOptions;
  search?: SearchOptions;
  favorites?: FavoritesOptions | null;
  comic?: ComicOptions;
}

// 插件实例
export interface PluginInstance extends PluginDefinition {
  loadSetting: (key: string) => any;
  saveSetting: (key: string, value: any) => void;
}

// 源列表项（JSON 格式）
export interface SourceListItem {
  name: string;
  fileName: string;
  key: string;
  version: string;
}

// 插件管理器接口
export interface PluginManager {
  getPlugins(): PluginInstance[];
  getPlugin(key: string): Promise<PluginInstance | undefined>;
  loadPlugin(code: string): Promise<PluginInstance>;
  unloadPlugin(key: string): void;
  loadFromUrl(url: string): Promise<PluginInstance>;
  loadSourceList(url: string): Promise<SourceListItem[]>;
}
