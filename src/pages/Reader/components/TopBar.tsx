import type { MangaRecord } from "@db/index";
import type { MemoryChapter } from "../types";

interface TopBarProps {
  manga: MangaRecord | null;
  chapter: MemoryChapter | null;
  show: boolean;
  onBack: () => void;
  onChapterList: () => void;
  onWebtoonMode: () => void;
}

export function TopBar({ manga, chapter, show, onBack, onChapterList, onWebtoonMode }: TopBarProps) {
  return (
    <div
      class={`absolute top-0 left-0 right-0 z-20 bg-gradient-to-b from-black/90 to-black/40 transition-opacity duration-300 ${
        show ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
    >
      <div class="px-3 py-3 flex items-center justify-between">
        <button
          onClick={onBack}
          class="p-2 bg-white/10 rounded-lg hover:bg-white/20 transition-colors"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <div class="flex-1 mx-3 text-center min-w-0">
          <h2 class="text-white font-semibold text-sm truncate">{manga?.title || "未知漫画"}</h2>
          <p class="text-xs text-gray-400 truncate">{chapter?.title}</p>
        </div>

        <div class="flex items-center gap-2">
          <button
            onClick={onWebtoonMode}
            class="p-2 bg-white/10 rounded-lg hover:bg-white/20 transition-colors"
            title="Webtoon模式"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width={2} d="M4 6h16M4 12h16M4 18h7" />
            </svg>
          </button>
          <button
            onClick={onChapterList}
            class="px-3 py-2 bg-white/10 rounded-lg hover:bg-white/20 transition-colors text-sm"
          >
            章节
          </button>
        </div>
      </div>
    </div>
  );
}
