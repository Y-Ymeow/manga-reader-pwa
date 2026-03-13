interface BottomNavProps {
  currentRoute: string;
  onNavigate: (route: 'home' | 'explore' | 'search' | 'favorites' | 'history' | 'settings') => void;
}

const navItems = [
  { id: 'home', label: '首页', icon: '🏠' },
  { id: 'explore', label: '发现', icon: '🔥' },
  {
    id: "search",
    icon: "🔍",
    label: "搜索",
  },
  { id: 'history', label: '历史', icon: '📖' },
  { id: 'settings', label: '设置', icon: '⚙️' },
] as const;

export function BottomNav({ currentRoute, onNavigate }: BottomNavProps) {
  return (
    <nav class="flex items-center justify-around bg-[#16213e] border-t border-[#2a2a4a] h-14 shrink-0">
      {navItems.map((item) => (
        <button
          key={item.id}
          onClick={() => onNavigate(item.id)}
          class={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${
            currentRoute === item.id
              ? 'text-[#e94560]'
              : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          <span class="text-lg">{item.icon}</span>
          <span class="text-xs mt-0.5">{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
