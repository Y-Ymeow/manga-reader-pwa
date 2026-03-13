import { navigate } from '@routes/index';

interface MangaCardProps {
  id: string;
  title: string;
  cover: string;
  latestChapter?: string;
  isFavorite?: boolean;
}

export function MangaCard({ id, title, cover, latestChapter, isFavorite }: MangaCardProps) {
  return (
    <div
      onClick={() => navigate('manga', { id })}
      class="group relative flex flex-col cursor-pointer"
    >
      <div class="relative aspect-[3/4] rounded-md overflow-hidden bg-[#16213e]">
        <img
          src={cover}
          alt={title}
          class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          loading="lazy"
        />
        {isFavorite && (
          <div class="absolute top-1 right-1 text-yellow-400 text-sm">⭐</div>
        )}
        <div class="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
      <div class="mt-1.5 px-0.5">
        <h3 class="text-xs font-medium text-white line-clamp-2 leading-snug">{title}</h3>
        {latestChapter && (
          <p class="text-[10px] text-gray-400 mt-0.5 truncate">{latestChapter}</p>
        )}
      </div>
    </div>
  );
}
