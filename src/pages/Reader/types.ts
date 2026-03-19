/**
 * Reader 组件类型定义
 */

import type { MangaRecord as MangaRecordType, ChapterListRecord as ChapterListRecordType } from "@db/index";

export interface ReaderProps {
  mangaId?: string;
  chapterId?: string;
  pluginKey?: string;
  page?: string;
}

export interface ReaderSettings {
  webtoonMode: boolean;
  readingDirection: "ltr" | "rtl";
}

export interface MemoryChapter {
  id: string;
  title: string;
  number: number;
  isRead?: boolean;
}

export interface ImageItem {
  url: string;
  originalUrl: string;
  blobUrl?: string;
  headers?: Record<string, string>;
  loaded: boolean;
  error?: boolean;
}

export type MangaRecord = MangaRecordType;
export type ChapterListRecord = ChapterListRecordType;
