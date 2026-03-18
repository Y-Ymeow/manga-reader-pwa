/**
 * 漫画缓存队列系统
 * 按漫画源分组，同一漫画源一次只缓存一本，避免触发反爬
 */

import { getChapterImages } from '@plugins/index';
import { getCacheManager } from './cache-manager';
import { getCacheIndex } from './cache-index';
import { requestManager } from '../plugins/runtimes/NetworkClass';

export interface CacheTask {
  id: string;
  pluginId: string;
  externalId: string;
  mangaTitle: string;
  chapters: { id: string; title: string }[];
  priority: 'high' | 'normal' | 'low';
  createdAt: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: {
    currentChapter: number;
    totalChapters: number;
    currentImage: number;
    totalImages: number;
    cachedImages: number;
    skippedImages: number;
  };
  error?: string;
}

// 队列状态监听器
type QueueListener = (tasks: CacheTask[]) => void;

class CacheQueueManager {
  private queues: Map<string, CacheTask[]> = new Map(); // pluginId -> tasks
  private running: Map<string, CacheTask | null> = new Map(); // pluginId -> current task
  private listeners: Set<QueueListener> = new Set();
  private isProcessing: Map<string, boolean> = new Map();

  // 生成任务ID
  private generateTaskId(): string {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // 获取所有任务
  getAllTasks(): CacheTask[] {
    const all: CacheTask[] = [];
    this.queues.forEach(tasks => all.push(...tasks));
    this.running.forEach(task => {
      if (task) all.push(task);
    });
    return all.sort((a, b) => b.createdAt - a.createdAt);
  }

  // 获取指定漫画源的任务
  getTasksByPlugin(pluginId: string): CacheTask[] {
    const queue = this.queues.get(pluginId) || [];
    const running = this.running.get(pluginId);
    if (running) {
      return [running, ...queue];
    }
    return queue;
  }

  // 检查是否已存在相同任务
  private findExistingTask(
    pluginId: string,
    externalId: string,
    chapterIds: string[]
  ): CacheTask | undefined {
    const allTasks = this.getTasksByPlugin(pluginId);
    return allTasks.find(task => {
      if (task.externalId !== externalId) return false;
      if (task.status === 'completed' || task.status === 'failed') return false;
      // 检查章节是否完全匹配
      const taskChapterIds = task.chapters.map(c => c.id);
      return chapterIds.length === taskChapterIds.length &&
        chapterIds.every(id => taskChapterIds.includes(id));
    });
  }

  // 添加任务到队列
  addTask(
    pluginId: string,
    externalId: string,
    mangaTitle: string,
    chapters: { id: string; title: string }[],
    priority: 'high' | 'normal' | 'low' = 'normal'
  ): { taskId: string; isNew: boolean } {
    const chapterIds = chapters.map(c => c.id);

    // 检查是否已存在相同任务
    const existingTask = this.findExistingTask(pluginId, externalId, chapterIds);
    if (existingTask) {
      return { taskId: existingTask.id, isNew: false };
    }

    const task: CacheTask = {
      id: this.generateTaskId(),
      pluginId,
      externalId,
      mangaTitle,
      chapters,
      priority,
      createdAt: Date.now(),
      status: 'pending',
      progress: {
        currentChapter: 0,
        totalChapters: chapters.length,
        currentImage: 0,
        totalImages: 0,
        cachedImages: 0,
        skippedImages: 0,
      },
    };

    if (!this.queues.has(pluginId)) {
      this.queues.set(pluginId, []);
    }
    this.queues.get(pluginId)!.push(task);
    this.notifyListeners();

    // 开始处理队列
    this.processQueue(pluginId);

    return { taskId: task.id, isNew: true };
  }

  // 取消任务
  cancelTask(taskId: string): boolean {
    // 从队列中移除
    for (const [pluginId, tasks] of this.queues) {
      const index = tasks.findIndex(t => t.id === taskId);
      if (index !== -1) {
        tasks.splice(index, 1);
        this.notifyListeners();
        return true;
      }
    }

    // 如果是正在运行的任务，标记为取消（实际会在下一章节停止）
    for (const [pluginId, running] of this.running) {
      if (running && running.id === taskId) {
        running.status = 'failed';
        running.error = '用户取消';
        this.running.set(pluginId, null);
        this.notifyListeners();
        this.processQueue(pluginId);
        return true;
      }
    }

    return false;
  }

  // 处理队列
  private async processQueue(pluginId: string): Promise<void> {
    if (this.isProcessing.get(pluginId)) return;

    const queue = this.queues.get(pluginId) || [];
    const current = this.running.get(pluginId);

    if (current || queue.length === 0) return;

    this.isProcessing.set(pluginId, true);

    // 按优先级排序
    queue.sort((a, b) => {
      const priorityMap = { high: 3, normal: 2, low: 1 };
      if (priorityMap[a.priority] !== priorityMap[b.priority]) {
        return priorityMap[b.priority] - priorityMap[a.priority];
      }
      return a.createdAt - b.createdAt;
    });

    const task = queue.shift()!;
    this.running.set(pluginId, task);
    this.notifyListeners();

    await this.executeTask(task);

    this.running.set(pluginId, null);
    this.isProcessing.set(pluginId, false);
    this.notifyListeners();

    // 继续处理队列中的下一个
    this.processQueue(pluginId);
  }

  // 执行任务
  private async executeTask(task: CacheTask): Promise<void> {
    task.status = 'running';
    this.notifyListeners();

    const cacheManager = getCacheManager();
    await cacheManager.init();

    const CONCURRENT_DOWNLOADS = 2; // 低并发，避免反爬
    const CHAPTER_DELAY = 1500; // 章节间延迟 1.5s
    const IMAGE_DELAY = 800; // 图片间延迟 800ms

    try {
      // 首先统计总图片数
      let totalImages = 0;
      for (const chapter of task.chapters) {
        try {
          const imageUrls = await getChapterImages(
            task.pluginId,
            task.externalId,
            chapter.id
          );
          totalImages += imageUrls.length;
        } catch (e) {
          console.warn(`[CacheQueue] Failed to get chapter info: ${chapter.id}`, e);
        }
      }
      task.progress.totalImages = totalImages;
      this.notifyListeners();

      // 开始缓存
      for (let i = 0; i < task.chapters.length; i++) {
        const chapter = task.chapters[i];
        task.progress.currentChapter = i + 1;
        this.notifyListeners();

        try {
          const imageUrls = await getChapterImages(
            task.pluginId,
            task.externalId,
            chapter.id
          );

          // 分批下载
          for (let j = 0; j < imageUrls.length; j += CONCURRENT_DOWNLOADS) {
            const batch = imageUrls.slice(j, j + CONCURRENT_DOWNLOADS);
            const batchIndices = Array.from({ length: batch.length }, (_, idx) => j + idx);

            const batchPromises = batch.map(async (url, idx) => {
              const imageIndex = batchIndices[idx];

              // 检查是否已缓存
              const exists = await cacheManager.exists(
                task.externalId,
                chapter.id,
                imageIndex
              );
              if (exists) {
                task.progress.skippedImages++;
                return true;
              }

              try {
                const response = await requestManager.get(url, {
                  responseType: 'arraybuffer',
                });
                if (response.status === 200 && response.data) {
                  const arrayBuffer = response.data as ArrayBuffer;
                  const blob = new Blob([arrayBuffer], { type: 'image/jpeg' });
                  const success = await cacheManager.write(
                    task.externalId,
                    chapter.id,
                    imageIndex,
                    blob,
                    blob.type
                  );
                  if (success) {
                    task.progress.cachedImages++;
                  }
                  return success;
                }
                return false;
              } catch (e) {
                console.warn(`[CacheQueue] Failed to cache image: ${url}`, e);
                return false;
              }
            });

            await Promise.all(batchPromises);
            task.progress.currentImage = Math.min(
              j + CONCURRENT_DOWNLOADS,
              imageUrls.length
            );
            this.notifyListeners();

            // 批次间延迟
            if (j + CONCURRENT_DOWNLOADS < imageUrls.length) {
              await new Promise(resolve => setTimeout(resolve, IMAGE_DELAY));
            }
          }

          // 章节间延迟
          if (i < task.chapters.length - 1) {
            await new Promise(resolve => setTimeout(resolve, CHAPTER_DELAY));
          }
        } catch (e) {
          console.warn(`[CacheQueue] Failed to cache chapter: ${chapter.id}`, e);
        }
      }

      task.status = 'completed';

      // 记录缓存索引
      const cacheIndex = getCacheIndex();
      for (const chapter of task.chapters) {
        try {
          const imageUrls = await getChapterImages(
            task.pluginId,
            task.externalId,
            chapter.id
          );
          await cacheIndex.addChapterCache(
            task.externalId,
            task.mangaTitle,
            task.pluginId,
            chapter.id,
            chapter.title,
            imageUrls
          );
        } catch (e) {
          console.warn('[CacheQueue] Failed to record cache index:', chapter.id, e);
        }
      }
    } catch (e: any) {
      console.error('[CacheQueue] Task failed:', e);
      task.status = 'failed';
      task.error = e.message;
    }

    this.notifyListeners();
  }

  // 检查指定章节是否已缓存
  async isChapterCached(
    externalId: string,
    chapterId: string
  ): Promise<boolean> {
    const cacheManager = getCacheManager();
    await cacheManager.init();

    // 尝试读取第一张图片
    const result = await cacheManager.read(externalId, chapterId, 0);
    return result !== null;
  }

  // 删除章节缓存
  async deleteChapterCache(externalId: string, chapterId: string): Promise<boolean> {
    const cacheManager = getCacheManager();
    await cacheManager.init();
    return await cacheManager.delete(externalId, chapterId);
  }

  // 订阅队列变化
  subscribe(listener: QueueListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // 通知监听器
  private notifyListeners(): void {
    const tasks = this.getAllTasks();
    this.listeners.forEach(fn => fn(tasks));
  }
}

// 单例实例
let queueManager: CacheQueueManager | null = null;

export function getCacheQueue(): CacheQueueManager {
  if (!queueManager) {
    queueManager = new CacheQueueManager();
  }
  return queueManager;
}
