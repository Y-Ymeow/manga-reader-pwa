import type { MemoryChapter } from "../types";

interface ChapterListModalProps {
  chapters: MemoryChapter[];
  currentChapterId: string;
  reverseOrder: boolean;
  show: boolean;
  onSelect: (chapterId: string) => void;
  onClose: () => void;
  onToggleReverse: () => void;
}

export function ChapterListModal({
  chapters,
  currentChapterId,
  reverseOrder,
  show,
  onSelect,
  onClose,
  onToggleReverse,
}: ChapterListModalProps) {
  if (!show) return null;

  const sortedChapters = reverseOrder
    ? [...chapters].sort((a, b) => b.number - a.number)
    : chapters;

  return (
    <div
      class="fixed inset-0 z-30 bg-black/80 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        class="bg-[#1a1a2e] rounded-xl w-full max-w-md max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div class="p-4 border-b border-gray-700 flex items-center justify-between">
          <h2 class="text-lg font-semibold">章节列表</h2>
          <button
            onClick={onToggleReverse}
            class="text-sm text-[#e94560] hover:text-[#ff6b8a]"
          >
            {reverseOrder ? "正序" : "倒序"}
          </button>
        </div>

        <div class="flex-1 overflow-y-auto p-4">
          <div class="grid grid-cols-4 gap-2">
            {sortedChapters.map((ch) => (
              <button
                key={ch.id}
                onClick={() => onSelect(ch.id)}
                class={`px-2 py-2 rounded-lg text-sm truncate transition-colors ${
                  ch.id === currentChapterId
                    ? "bg-[#e94560] text-white"
                    : ch.isRead
                      ? "bg-[#16213e] text-gray-500"
                      : "bg-[#16213e] text-white hover:bg-[#1a4a7a]"
                }`}
              >
                {ch.number}
              </button>
            ))}
          </div>
        </div>

        <div class="p-4 border-t border-gray-700">
          <button
            onClick={onClose}
            class="w-full py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
