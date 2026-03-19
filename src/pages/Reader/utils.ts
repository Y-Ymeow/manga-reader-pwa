/**
 * Reader 工具函数
 */

import { Cache } from "@db/index";
import type { ReaderSettings } from "./types";

const SETTINGS_KEY = "reader_settings";

export function getSettings(): ReaderSettings {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {}
  return {
    webtoonMode: false,
    readingDirection: "ltr",
  };
}

export function saveSettings(settings: ReaderSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// 缓存章节图片
export async function cacheChapterImages(chapterId: string, images: string[]) {
  try {
    const existing = await Cache.findOne({
      where: { type: "chapter_list", key: `chapter_images_${chapterId}` },
    });
    const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 天
    if (existing) {
      await Cache.update((existing as any).id, {
        data: images,
        expiresAt,
        createdAt: Date.now(),
      });
    } else {
      const id = generateUUID();
      await Cache.create({
        id,
        type: "chapter_list",
        key: `chapter_images_${chapterId}`,
        data: images,
        expiresAt,
        createdAt: Date.now(),
      });
    }
  } catch (e) {
    console.error("Failed to cache chapter images:", e);
  }
}

// 获取缓存的章节图片
export async function getCachedChapterImages(
  chapterId: string,
): Promise<string[] | null> {
  try {
    const cached = await Cache.findOne({
      where: { type: "chapter_list", key: `chapter_images_${chapterId}` },
    });
    if (cached && (cached as any).expiresAt > Date.now()) {
      return (cached as any).data;
    }
    return null;
  } catch {
    return null;
  }
}
