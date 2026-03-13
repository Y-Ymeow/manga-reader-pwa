import type { ComponentChildren } from 'preact';

interface MangaGridProps {
  children: ComponentChildren;
}

export function MangaGrid({ children }: MangaGridProps) {
  return (
    <div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 gap-2 p-3">
      {children}
    </div>
  );
}
