# Reader 组件拆分方案

## 当前结构 (1327 行)

```
Reader.tsx
├── 工具函数 (1-125 行)
│   ├── getSettings
│   ├── saveSettings
│   ├── cacheChapterImages
│   ├── getCachedChapterImages
│   └── generateUUID
│
├── Reader 主组件 (127-1328 行)
│   ├── State 定义 (128-150 行)
│   ├── Refs 定义 (150-155 行)
│   ├── useEffect - 加载数据 (155-300 行)
│   ├── useEffect - 滚动定位 (300-320 行)
│   ├── cleanupBlobUrls (320-335 行)
│   ├── loadChapterImages (335-400 行)
│   ├── processImageUrls (400-500 行)
│   ├── processNearbyImages (500-580 行)
│   ├── saveProgress (580-640 行)
│   ├── handlePrevPage/handleNextPage (640-660 行)
│   ├── goToNextChapter/goToPrevChapter (660-700 行)
│   ├── handleTap (700-740 行)
│   ├── handleWebtoonScroll (740-800 行)
│   ├── loadNextChapterForWebtoon (800-850 行)
│   ├── handleKeyDown (850-900 行)
│   ├── handleImageLoad (900-920 行)
│   └── JSX Render (940-1328 行)
│       ├── Top Bar
│       ├── Image Viewer (Normal Mode)
│       ├── Webtoon Mode
│       ├── Bottom Bar
│       ├── Settings Modal
│       └── Chapter List Modal
```

## 拆分方案

### 1. `types.ts` - 类型定义
```typescript
export interface ReaderProps { ... }
export interface ReaderSettings { ... }
export interface MemoryChapter { ... }
export interface ProcessedImage { ... }
```

### 2. `utils.ts` - 工具函数
```typescript
export function getSettings(): ReaderSettings { ... }
export function saveSettings(settings: ReaderSettings): void { ... }
export function generateUUID(): string { ... }
export async function cacheChapterImages(...): Promise<void> { ... }
export async function getCachedChapterImages(...): Promise<string[] | null> { ... }
```

### 3. `hooks/useReaderState.ts` - 状态管理
```typescript
export function useReaderState(props: ReaderProps) {
  // 所有 state 和 ref
  // 返回状态对象
}
```

### 4. `hooks/useImageLoader.ts` - 图片加载逻辑
```typescript
export function useImageLoader(manga, chapter, images) {
  // processImageUrls
  // processNearbyImages
  // getOfflineImageUrl
  // loadChapterImages
}
```

### 5. `hooks/useReaderActions.ts` - 用户操作
```typescript
export function useReaderActions(state, callbacks) {
  // saveProgress
  // handlePrevPage/handleNextPage
  // goToNextChapter/goToPrevChapter
  // handleTap
  // handleWebtoonScroll
  // loadNextChapterForWebtoon
  // handleKeyDown
  // handleImageLoad
}
```

### 6. `components/TopBar.tsx` - 顶部栏
```typescript
export function TopBar({ manga, chapter, onBack, onSettings, onChapterList }) { ... }
```

### 7. `components/ImageViewer.tsx` - 普通模式图片查看器
```typescript
export function ImageViewer({ images, currentPage, readingDirection, onTap }) { ... }
```

### 8. `components/WebtoonViewer.tsx` - Webtoon 模式查看器
```typescript
export function WebtoonViewer({ 
  images, 
  loadedImages, 
  onImageLoad,
  onScroll,
  nextChapterImages,
  isLoadingNextChapter,
  hasMoreChapters,
  onNextChapter 
}) { ... }
```

### 9. `components/BottomBar.tsx` - 底部控制栏
```typescript
export function BottomBar({ 
  currentPage, 
  totalPages, 
  onPrevPage, 
  onNextPage,
  onPrevChapter,
  onNextChapter,
  hasNextChapter 
}) { ... }
```

### 10. `components/SettingsModal.tsx` - 设置弹窗
```typescript
export function SettingsModal({ 
  settings, 
  onSave, 
  onClose,
  chapterReverseOrder,
  onChapterReverseOrderChange 
}) { ... }
```

### 11. `components/ChapterListModal.tsx` - 章节列表弹窗
```typescript
export function ChapterListModal({ 
  chapters, 
  currentChapterId, 
  onSelect, 
  onClose 
}) { ... }
```

### 12. `Reader.tsx` - 主组件（协调器）
```typescript
import { useReaderState } from './hooks/useReaderState';
import { useImageLoader } from './hooks/useImageLoader';
import { useReaderActions } from './hooks/useReaderActions';
import { TopBar } from './components/TopBar';
import { ImageViewer } from './components/ImageViewer';
import { WebtoonViewer } from './components/WebtoonViewer';
import { BottomBar } from './components/BottomBar';
import { SettingsModal } from './components/SettingsModal';
import { ChapterListModal } from './components/ChapterListModal';

export function Reader(props: ReaderProps) {
  const state = useReaderState(props);
  const imageLoader = useImageLoader(state.manga, state.chapter, state.images);
  const actions = useReaderActions(state, imageLoader);
  
  return (
    <div class="h-full flex flex-col bg-[#0a0a0f] text-white">
      <TopBar ... />
      {state.settings.webtoonMode ? (
        <WebtoonViewer ... />
      ) : (
        <ImageViewer ... />
      )}
      <BottomBar ... />
      <SettingsModal ... />
      <ChapterListModal ... />
    </div>
  );
}
```

## 文件结构

```
src/pages/Reader/
├── index.tsx           # 主组件入口（原 Reader.tsx）
├── types.ts            # 类型定义
├── utils.ts            # 工具函数
├── hooks/
│   ├── useReaderState.ts
│   ├── useImageLoader.ts
│   └── useReaderActions.ts
└── components/
    ├── TopBar.tsx
    ├── ImageViewer.tsx
    ├── WebtoonViewer.tsx
    ├── BottomBar.tsx
    ├── SettingsModal.tsx
    └── ChapterListModal.tsx
```

## 优先级

1. **第一阶段**：先拆分 UI 组件（TopBar, BottomBar, SettingsModal, ChapterListModal）
2. **第二阶段**：拆分图片查看器（ImageViewer, WebtoonViewer）
3. **第三阶段**：提取 hooks（useReaderState, useImageLoader, useReaderActions）
4. **第四阶段**：清理和优化
