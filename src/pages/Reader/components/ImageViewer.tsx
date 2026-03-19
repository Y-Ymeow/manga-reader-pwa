import { useEffect, useRef, useCallback } from "preact/hooks";
import type { ImageItem } from "../types";
import type { RefObject } from "preact";

interface ImageViewerProps {
  ref?: RefObject<HTMLDivElement>;
  imageItems: ImageItem[];
  currentPage: number;
  readingDirection: "ltr" | "rtl";
  webtoonMode: boolean;
  onTap: (e: MouseEvent) => void;
  onWebtoonScroll?: (page: number) => void;
}

export function ImageViewer({
  ref,
  imageItems,
  currentPage,
  readingDirection,
  webtoonMode,
  onTap,
  onWebtoonScroll,
}: ImageViewerProps) {
  const internalRef = useRef<HTMLDivElement>(null);
  const containerRef = ref || internalRef;
  const safePage = Math.max(0, Math.min(currentPage, imageItems.length - 1));
  const currentImage = imageItems[safePage];
  const isScrolling = useRef(false);

  useEffect(() => {
    if (!webtoonMode && containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  }, [currentPage, webtoonMode]);

  const handleScroll = useCallback(() => {
    if (!webtoonMode || !containerRef.current || isScrolling.current) return;

    isScrolling.current = true;
    requestAnimationFrame(() => {
      if (!containerRef.current || !onWebtoonScroll) {
        isScrolling.current = false;
        return;
      }

      const images = containerRef.current.querySelectorAll('.webtoon-image');
      
      for (let i = 0; i < images.length; i++) {
        const img = images[i] as HTMLElement;
        const rect = img.getBoundingClientRect();
        const containerRect = containerRef.current!.getBoundingClientRect();
        
        if (rect.top >= containerRect.top && rect.top < containerRect.bottom) {
          onWebtoonScroll(i);
          break;
        }
      }
      isScrolling.current = false;
    });
  }, [webtoonMode, onWebtoonScroll]);

  if (webtoonMode) {
    return (
      <div
        ref={containerRef}
        class="flex-1 overflow-y-auto"
        onClick={onTap}
        onScroll={handleScroll}
      >
        <div class="w-full max-w-3xl mx-auto">
          {imageItems.map((img, index) => (
            <div key={index} class="webtoon-image w-full bg-[#1a1a2e]">
              {img.loaded && img.url ? (
                <img
                  src={img.url}
                  alt={`Page ${index + 1}`}
                  class="w-full h-auto block"
                  loading="lazy"
                />
              ) : (
                <div class="w-full h-48 flex items-center justify-center">
                  <div class="w-6 h-6 border-2 border-[#e94560] border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      class="flex-1 flex items-center justify-center overflow-hidden"
      onClick={onTap}
    >
      {currentImage?.loaded && currentImage.url ? (
        <img
          src={currentImage.url}
          alt={`Page ${safePage + 1}`}
          class="max-h-full max-w-full object-contain"
          style={{
            transform: readingDirection === "rtl" ? "scaleX(-1)" : "none",
          }}
        />
      ) : (
        <div class="w-8 h-8 border-2 border-[#e94560] border-t-transparent rounded-full animate-spin" />
      )}
    </div>
  );
}
