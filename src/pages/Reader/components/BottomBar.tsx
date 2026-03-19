interface BottomBarProps {
  currentPage: number;
  totalPages: number;
  show: boolean;
  onSeek: (page: number) => void;
  onPrevPage: () => void;
  onNextPage: () => void;
  webtoonMode?: boolean;
  onScrollToPage?: (page: number) => void;
}

export function BottomBar({
  currentPage,
  totalPages,
  show,
  onSeek,
  onPrevPage,
  onNextPage,
  webtoonMode,
  onScrollToPage,
}: BottomBarProps) {
  const handleSeek = (e: MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = x / rect.width;
    const newPage = Math.floor(percentage * totalPages);
    const targetPage = Math.max(0, Math.min(totalPages - 1, newPage));
    onSeek(targetPage);
    
    if (webtoonMode && onScrollToPage) {
      onScrollToPage(targetPage);
    }
  };

  const progress = totalPages > 0 ? ((currentPage + 1) / totalPages) * 100 : 0;

  return (
    <div
      class={`absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black/90 to-black/40 transition-opacity duration-300 ${
        show ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
    >
      <div class="px-4 py-3">
        <div class="flex items-center gap-3 mb-2">
          <button
            onClick={(e) => { e.stopPropagation(); onPrevPage(); }}
            class="p-1.5 bg-white/10 rounded hover:bg-white/20"
            disabled={currentPage === 0}
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          <div
            class="flex-1 h-1.5 bg-gray-600 rounded-full overflow-hidden cursor-pointer"
            onClick={handleSeek}
          >
            <div
              class="h-full bg-[#e94560] transition-all duration-150"
              style={{ width: `${progress}%` }}
            />
          </div>

          <button
            onClick={(e) => { e.stopPropagation(); onNextPage(); }}
            class="p-1.5 bg-white/10 rounded hover:bg-white/20"
            disabled={currentPage >= totalPages - 1}
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        <div class="flex items-center justify-between text-xs text-gray-400">
          <span>{currentPage + 1} / {totalPages}</span>
          <span>{Math.round(progress)}%</span>
        </div>
      </div>
    </div>
  );
}
