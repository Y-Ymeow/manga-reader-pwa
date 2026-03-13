import { useState, useEffect } from "preact/hooks";
import { Home } from "@pages/Home";
import { Explore } from "@pages/Explore";
import { Search } from "@pages/Search";
import { Favorites } from "@pages/Favorites";
import { History } from "@pages/History";
import { Settings } from "@pages/Settings";
import { Plugins } from "@pages/Plugins";
import { PluginSettings } from "@pages/PluginSettings";
import { MangaDetail } from "@pages/MangaDetail";
import { Reader } from "@pages/Reader";
import { CacheManager } from "@pages/CacheManager";
import { BottomNav } from "@components/layout/BottomNav";

type Route =
  | "home"
  | "explore"
  | "search"
  | "favorites"
  | "history"
  | "settings"
  | "plugins"
  | "plugin-settings"
  | "manga"
  | "reader"
  | "cache-manager";

interface RouteState {
  route: Route;
  params?: Record<string, string>;
}

// 从 hash 解析路由
function parseHash(): RouteState {
  const hash = location.hash.slice(1) || "/";
  const [path, search] = hash.split("?");
  const params: Record<string, string> = {};

  if (search) {
    const searchParams = new URLSearchParams(search);
    searchParams.forEach((value, key) => {
      params[key] = value;
    });
  }

  // 解析路径
  const route = path.slice(1) || "home";
  return { route: route as Route, params };
}

// 当前路由状态
let currentRoute: RouteState = parseHash();

const listeners = new Set<(state: RouteState) => void>();

export function navigate(route: Route, params?: Record<string, string>) {
  currentRoute = { route, params };

  // 更新 hash
  let hash = `#/${route}`;
  if (params && Object.keys(params).length > 0) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value) searchParams.set(key, value);
    });
    hash += `?${searchParams.toString()}`;
  }
  location.hash = hash;

  listeners.forEach((fn) => fn({ ...currentRoute }));
}

export function useRoute(): RouteState {
  const [state, setState] = useState<RouteState>({ ...currentRoute });

  useEffect(() => {
    listeners.add(setState);

    // 监听 hash 变化
    const handleHashChange = () => {
      currentRoute = parseHash();
      listeners.forEach((fn) => fn({ ...currentRoute }));
    };

    window.addEventListener("hashchange", handleHashChange);
    return () => {
      listeners.delete(setState);
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, []);

  return state;
}

export function Router() {
  const { route, params } = useRoute();

  const renderContent = () => {
    switch (route) {
      case "home":
        return <Home />;
      case "explore":
        return <Explore />;
      case "search":
        return <Search />;
      case "favorites":
        return <Favorites />;
      case "history":
        return <History />;
      case "settings":
        return <Settings />;
      case "plugins":
        return <Plugins />;
      case "plugin-settings":
        return <PluginSettings pluginKey={params?.key} />;
      case "manga":
        return <MangaDetail mangaId={params?.id} />;
      case "reader":
        return (
          <Reader
            mangaId={params?.mangaId}
            chapterId={params?.chapterId}
            pluginKey={params?.pluginKey}
          />
        );
      case "cache-manager":
        return <CacheManager />;
      default:
        return <Home />;
    }
  };

  const showBottomNav = [
    "home",
    "explore",
    "search",
    "favorites",
    "history",
    "settings",
  ].includes(route);

  return (
    <>
      <main class="flex-1 overflow-y-auto scrollbar-hide min-h-0">
        {renderContent()}
      </main>
      {showBottomNav && (
        <BottomNav currentRoute={route} onNavigate={navigate} />
      )}
    </>
  );
}
