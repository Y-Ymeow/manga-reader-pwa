# FS 模块 - 本地音乐文件读取

多平台兼容的文件系统模块，专注于读取用户本地音乐文件。

## 特性

- **Tauri FS 支持**：在 Linux 和 Android 上使用 Tauri 的 FS API
- **Android 自动适配**：自动路径转换（Tauri Adapt 会自动处理权限）
- **统一 API**：跨平台使用相同的接口

## 快速开始

### 基本使用

```typescript
import { FS, initFS } from './framework/fs';

// 初始化
const fs = await initFS();

// 读取音乐文件
// Linux: /home/user/Music/song.mp3
// Android: /sdcard/Music/song.mp3 (自动转换)
const musicFile = await fs.readBinaryFile('/sdcard/Music/song.mp3');

// 获取文件信息
const stat = await fs.stat('/sdcard/Music/song.mp3');
console.log('文件大小:', stat.size);
```

### Android 权限

**无需手动请求权限！**

Tauri Adapt 会在 Android 上自动引导用户授权。你只需要：

```typescript
import { initFS } from './framework/fs';

const fs = await initFS();

// 直接使用，权限由 Tauri Adapt 自动处理
const musicFile = await fs.readBinaryFile('/sdcard/Music/song.mp3');
```

## API 参考

### 初始化

```typescript
// 快速初始化
const fs = await initFS({
  baseDir: '/sdcard/Music'  // 可选的基础目录
});

// 手动控制
const fs = new FS();
await fs.init();

// 检查状态
fs.isReady();  // boolean
fs.getType();  // 'tauri' | 'web-file-picker' | 'unsupported'
```

### 文件读取

```typescript
// 读取二进制文件（音乐文件）
const musicData = await fs.readBinaryFile('/path/to/song.mp3');

// 读取文本文件（如歌词）
const lyrics = await fs.readTextFile('/path/to/lyrics.lrc');

// 通用读取方法
const content = await fs.readFile('/path/to/file', {
  encoding: 'binary'  // 'utf8' | 'base64' | 'binary'
});
```

### 目录操作

```typescript
// 列出音乐目录
const entries = await fs.readDir('/sdcard/Music');
for (const entry of entries) {
  if (entry.isFile && entry.name.endsWith('.mp3')) {
    console.log('找到音乐文件:', entry.name);
  }
}

// 检查文件是否存在
if (await fs.exists('/sdcard/Music/song.mp3')) {
  console.log('文件存在');
}

// 获取文件信息
const stat = await fs.stat('/sdcard/Music/song.mp3');
console.log({
  size: stat.size,
  modifiedAt: stat.modifiedAt,
  isFile: stat.isFile
});
```

## 平台支持

### Linux

**优先级：最高**

Tauri 在 Linux 上完全支持，可以直接访问任意路径。

```typescript
const fs = await initFS();

// 直接读取
const music = await fs.readBinaryFile('/home/user/Music/song.mp3');
```

### Android

**优先级：高**

#### 自动路径转换

模块会自动将常见路径转换为 Android 路径：

```typescript
// 这些路径会自动转换
'/music/song.mp3'      → '/sdcard/Music/song.mp3'
'/download/file.mp3'   → '/sdcard/Download/file.mp3'
'/dcim/photo.jpg'      → '/sdcard/DCIM/photo.jpg'
```

#### 权限处理

**无需手动请求权限！** Tauri Adapt 会在首次访问文件时自动引导用户授权。

```typescript
const fs = await initFS();

// 第一次访问时，Tauri Adapt 会自动请求权限
const music = await fs.readBinaryFile('/sdcard/Music/song.mp3');
```

#### Android 路径示例

```typescript
const fs = await initFS();

// 这些路径都可以直接使用
await fs.readBinaryFile('/sdcard/Music/song.mp3');
await fs.readBinaryFile('/storage/emulated/0/Music/song.mp3');
await fs.readBinaryFile('/Music/song.mp3');  // 自动转换
```

### 浏览器/PWA

**优先级：低**

浏览器环境不支持直接访问本地文件系统，需要使用文件选择器。

```typescript
const fs = await initFS();

// 浏览器环境会抛出错误
try {
  await fs.readBinaryFile('/path/to/file');
} catch (err) {
  console.log('需要使用文件选择器');
}
```

## 完整示例

### 音乐播放器场景

```typescript
import { initFS } from './framework/fs';

class MusicPlayer {
  private fs: FS;
  
  async init() {
    // 初始化文件系统
    this.fs = await initFS();
    
    // 扫描音乐目录
    await this.scanMusicDirectory();
  }
  
  async scanMusicDirectory() {
    const musicDir = '/sdcard/Music';
    
    try {
      const entries = await this.fs.readDir(musicDir);
      
      for (const entry of entries) {
        if (entry.isFile && this.isMusicFile(entry.name)) {
          const filePath = `${musicDir}/${entry.name}`;
          const musicData = await this.fs.readBinaryFile(filePath);
          
          // 解析 ID3 标签...
          this.addSong({
            name: entry.name,
            path: filePath,
            data: musicData
          });
        }
      }
    } catch (err) {
      console.error('扫描音乐目录失败:', err);
    }
  }
  
  isMusicFile(name: string): boolean {
    const ext = name.toLowerCase().split('.').pop();
    return ['mp3', 'flac', 'wav', 'ogg', 'm4a'].includes(ext!);
  }
}
```

## 故障排除

### Android 上读取失败

**错误：权限错误**

```
文件访问权限错误：/sdcard/Music/song.mp3
请确保应用已获得存储权限（Tauri Adapt 会自动引导授权）
```

**解决**：
- Tauri Adapt 会在首次访问文件时自动请求权限
- 如果用户拒绝了权限，需要在系统设置中手动允许

**错误：文件不存在**

```
文件不存在：/sdcard/Music/song.mp3
```

**解决**：
```typescript
// 检查实际路径
const exists = await fs.exists('/sdcard/Music/song.mp3');
if (!exists) {
  // 尝试其他路径
  const exists2 = await fs.exists('/storage/emulated/0/Music/song.mp3');
}
```

### 路径问题

**问题**：使用 `/Music/song.mp3` 在 Android 上找不到文件

**解决**：使用完整路径
```typescript
// 推荐：使用完整路径
await fs.readBinaryFile('/sdcard/Music/song.mp3');

// 或者让模块自动转换
await fs.readBinaryFile('/Music/song.mp3');  // 会自动转换为 /sdcard/Music/song.mp3
```

### Tauri 未就绪

**错误**：`FS is not available. Tauri Adapt is not ready`

**解决**：
1. 确保 `adapt.js` 已加载（检查 `index.html`）
2. 确保在 Tauri 容器中运行
3. 检查 `window.__TAURI__._ready === true`

```typescript
// 检查 Tauri 状态
console.log('Tauri ready:', window.__TAURI__?._ready);

// 等待 Tauri 就绪
await waitForFS();
```

## 与 OPFS 存储的区别

本 FS 模块用于**读取用户本地音乐文件**，而 `storages/opfs.ts` 用于**存储应用数据**：

| 功能 | FS 模块 | OPFS Storage |
|------|--------|--------------|
| 用途 | 读取本地音乐文件 | 存储应用数据 |
| 示例 | `/sdcard/Music/song.mp3` | `playlist.json` |
| Android | Tauri Adapt 自动处理权限 | 无需权限 |
| 持久化 | 用户文件 | 应用私有数据 |

```typescript
// FS 模块 - 读取音乐文件
const fs = await initFS();
const musicData = await fs.readBinaryFile('/sdcard/Music/song.mp3');

// OPFS Storage - 存储播放列表
import { OPFSStorage } from './framework/storages';
const storage = new OPFSStorage('musicplayer');
await storage.init();
await storage.set('playlist', ['song1.mp3', 'song2.mp3']);
```

## 相关文档

- [Tauri FS API](https://tauri.app/v1/api/js/fs)
- [Tauri Adapt](https://tauri.app/)
- [OPFS Storage](./storages/README.md)
