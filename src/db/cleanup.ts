/**
 * 数据库清理工具
 * 统一清理 manga-reader 数据库的所有 store
 */

// 主数据库名称
const DB_NAME = 'manga-reader';

// 所有 store 名称
const STORE_NAMES = [
  'mangas',           // 漫画列表
  'chapter_lists',    // 章节列表
  'categories',       // 分类
  'read_history',     // 阅读历史
  'plugins',          // 插件元数据
  'plugin_codes',     // 插件代码
  'manga_cache',      // 漫画详情缓存
  'plugin_settings',  // 插件设置
  'cache_index',      // 缓存索引
  'file_cache',       // 文件缓存（OPFS 回退）
  'cache',            // 通用缓存
  'updates',          // 更新记录
];

export interface DatabaseCleanupResult {
  storeName: string;
  success: boolean;
  error?: string;
  recordCount?: number;
}

/**
 * 获取数据库的所有 store 和记录数
 */
export async function getDatabaseStats(): Promise<DatabaseCleanupResult[]> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME);
    
    request.onsuccess = async () => {
      const db = request.result;
      const results: DatabaseCleanupResult[] = [];
      
      for (const storeName of Array.from(db.objectStoreNames)) {
        try {
          const tx = db.transaction([storeName], 'readonly');
          const store = tx.objectStore(storeName);
          const count = await new Promise<number>((resolve, reject) => {
            const req = store.count();
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
          });
          
          results.push({
            storeName,
            success: true,
            recordCount: count,
          });
        } catch (e: any) {
          results.push({
            storeName,
            success: false,
            error: e.message,
          });
        }
      }
      
      db.close();
      resolve(results);
    };
    
    request.onerror = () => {
      resolve(STORE_NAMES.map(name => ({
        storeName: name,
        success: false,
        error: 'Failed to open database',
      })));
    };
  });
}

/**
 * 清除指定 store 的所有数据
 */
export async function clearStore(storeName: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME);
    
    request.onsuccess = () => {
      const db = request.result;
      
      if (!db.objectStoreNames.contains(storeName)) {
        db.close();
        resolve(false);
        return;
      }
      
      const tx = db.transaction([storeName], 'readwrite');
      const store = tx.objectStore(storeName);
      const clearRequest = store.clear();
      
      clearRequest.onsuccess = () => {
        db.close();
        resolve(true);
      };
      
      clearRequest.onerror = () => {
        db.close();
        reject(clearRequest.error);
      };
    };
    
    request.onerror = () => {
      reject(request.error);
    };
  });
}

/**
 * 清除所有 store 的数据
 */
export async function clearAllStores(): Promise<DatabaseCleanupResult[]> {
  const results: DatabaseCleanupResult[] = [];
  
  for (const storeName of STORE_NAMES) {
    try {
      await clearStore(storeName);
      results.push({
        storeName,
        success: true,
      });
    } catch (e: any) {
      results.push({
        storeName,
        success: false,
        error: e.message,
      });
    }
  }
  
  return results;
}

/**
 * 删除整个数据库
 */
export async function deleteDatabase(): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    
    request.onsuccess = () => {
      resolve(true);
    };
    
    request.onerror = () => {
      reject(new Error(`Failed to delete database: ${DB_NAME}`));
    };
    
    request.onblocked = () => {
      reject(new Error(`Database deletion blocked: ${DB_NAME}`));
    };
  });
}

/**
 * 清除 localStorage 中的所有相关数据
 */
export function clearLocalStorage(): number {
  const keysToRemove: string[] = [];
  
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && (
      key.startsWith('plugin_data_') ||
      key.startsWith('plugin_setting_') ||
      key.startsWith('manga_reader_') ||
      key.startsWith('reader_settings')
    )) {
      keysToRemove.push(key);
    }
  }
  
  for (const key of keysToRemove) {
    localStorage.removeItem(key);
  }
  
  return keysToRemove.length;
}

/**
 * 检查数据库是否需要升级
 * 如果版本低于 3，说明是旧数据库，需要清除
 */
export async function checkDatabaseVersion(): Promise<{ needsUpgrade: boolean; currentVersion: number }> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('manga-reader');
    
    request.onsuccess = () => {
      const db = request.result;
      const version = db.version;
      db.close();
      
      // 版本低于 3 说明没有新的 store
      resolve({
        needsUpgrade: version < 3,
        currentVersion: version,
      });
    };
    
    request.onerror = () => {
      // 数据库不存在
      resolve({
        needsUpgrade: false,
        currentVersion: 0,
      });
    };
  });
}

/**
 * 强制删除数据库（用于升级）
 */
export async function forceDeleteDatabase(): Promise<boolean> {
  return deleteDatabase();
}
