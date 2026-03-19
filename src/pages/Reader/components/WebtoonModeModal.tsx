interface WebtoonModeModalProps {
  show: boolean;
  enabled: boolean;
  onToggle: () => void;
  onClose: () => void;
}

export function WebtoonModeModal({ show, enabled, onToggle, onClose }: WebtoonModeModalProps) {
  if (!show) return null;

  return (
    <div
      class="fixed inset-0 z-30 bg-black/80 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        class="bg-[#1a1a2e] rounded-xl w-full max-w-sm p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 class="text-lg font-semibold mb-4 text-center">阅读模式</h2>

        <div class="space-y-3">
          <button
            onClick={() => { onToggle(); onClose(); }}
            class={`w-full p-4 rounded-lg flex items-center justify-between transition-colors ${
              !enabled ? "bg-[#e94560] text-white" : "bg-[#16213e] hover:bg-[#1a4a7a]"
            }`}
          >
            <div class="flex items-center gap-3">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width={2} d="M4 6h16M4 12h16M4 18h7" />
              </svg>
              <div class="text-left">
                <div class="font-medium">普通模式</div>
                <div class="text-xs opacity-70">左右滑动翻页</div>
              </div>
            </div>
            {!enabled && <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" /></svg>}
          </button>

          <button
            onClick={() => { onToggle(); onClose(); }}
            class={`w-full p-4 rounded-lg flex items-center justify-between transition-colors ${
              enabled ? "bg-[#e94560] text-white" : "bg-[#16213e] hover:bg-[#1a4a7a]"
            }`}
          >
            <div class="flex items-center gap-3">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
              </svg>
              <div class="text-left">
                <div class="font-medium">Webtoon 模式</div>
                <div class="text-xs opacity-70">垂直滚动阅读</div>
              </div>
            </div>
            {enabled && <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" /></svg>}
          </button>
        </div>

        <button
          onClick={onClose}
          class="w-full mt-4 py-2.5 bg-gray-700 text-white rounded-lg hover:bg-gray-600"
        >
          取消
        </button>
      </div>
    </div>
  );
}
