export interface Manga {
  id: string;
  title: string;
  cover: string;
  latestChapter?: string;
  isFavorite?: boolean;
  pluginId?: string;
  sourceUrl?: string;
}

export interface MangaDetail extends Manga {
  description: string;
  author: string;
  status: string;
  genres: string[];
  chapters?: Chapter[];
}

export interface Chapter {
  id: string;
  title: string;
  number: number;
  isRead?: boolean;
  timestamp?: number;
  pageCount?: number;
}

export interface MangaImage {
  id: string;
  url: string;
  index: number;
}
