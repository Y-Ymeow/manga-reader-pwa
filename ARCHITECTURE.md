# Manga Reader PWA - Architecture Documentation

## Project Overview

A manga reader Progressive Web App built with Preact, TailwindCSS, Vite, and IndexedDB. Supports Venera-compatible manga source plugins.

## Tech Stack

- **Framework**: Preact (React alternative)
- **Styling**: TailwindCSS 4
- **Build Tool**: Vite
- **Database**: IndexedDB with custom ORM
- **Plugin System**: Venera-compatible ComicSource
- **Storage**: IndexedDB for plugins, cache, and settings

## Project Structure

```
src/
├── components/          # UI Components
│   ├── manga/          # Manga-related components
│   └── ui/             # Generic UI components
├── db/                 # Database layer
│   ├── index.ts        # Database initialization & models
│   ├── hooks.ts        # Database hooks
│   └── global.ts       # Global database state
├── framework/          # Framework utilities
│   └── requests.ts     # HTTP request manager with CORS bypass
├── pages/              # Application pages
│   ├── Explore.tsx     # Plugin explore page
│   ├── MangaDetail.tsx # Manga detail page
│   ├── Reader.tsx      # Manga reader
│   ├── Plugins.tsx     # Plugin management
│   └── ...
├── plugins/            # Plugin system
│   ├── manager.ts      # Plugin lifecycle management
│   ├── runtime.ts      # Venera runtime environment
│   ├── storage.ts      # Plugin storage (IndexedDB)
│   ├── types.ts        # TypeScript definitions
│   └── index.ts        # Public API exports
├── routes/             # Routing configuration
├── types/              # Global type definitions
└── main.tsx           # Application entry
```

## Database Schema

### IndexedDB Stores

1. **plugins** - Plugin code storage
   - key: string (plugin key)
   - code: string (plugin JavaScript code)
   - installedAt: number
   - updatedAt: number

2. **manga_cache** - Manga data cache
   - key: string (pluginKey:comicId)
   - data: any (cached data)
   - expiresAt: number
   - createdAt: number

3. **settings** - Plugin settings
   - key: string (plugin_setting_{pluginKey}_{settingKey})
   - value: any

### Main Database Models

- **Manga** - Manga metadata
- **ChapterList** - Chapter lists (stored as JSON)
- **Favorite** - User favorites
- **FavoriteCategory** - Favorite categories
- **History** - Reading history
- **Plugin** - Plugin metadata

## Plugin System

### Venera Compatibility

The app implements a Venera-compatible runtime environment:

```typescript
class ComicSource {
  name: string
  key: string
  version: string
  settings: Record<string, SettingOption>
  explore?: ExplorePage[]
  category?: CategoryPage
  search?: SearchOptions
  comic?: ComicOptions
  favorites?: FavoritesOptions
  
  // Methods
  loadSetting(key: string): any
  saveSetting(key: string, value: any): void
  async init(): Promise<void>
}
```

### Supported Explore Formats

1. **multiPartPage**: `[{title: string, comics: Comic[], viewMore?: string}]`
2. **multiPageComicList**: `{comics: Comic[], maxPage?: number}`
3. **mixed**: `{data: Array<Comic[] | {title, comics}>, maxPage?: number}`
4. **objectFormat**: `{ [title: string]: Comic[] }`

### Convert Utilities

Matching Flutter implementation:
- `encodeUtf8/decodeUtf8` - UTF-8 encoding
- `encodeGbk/decodeGbk` - GBK encoding (via gbk.js)
- `md5/sha1/sha256/sha512` - Hash functions (returns Uint8Array)
- `hmac/hmacString` - HMAC
- `encryptAesEcb/decryptAesEcb` - AES encryption
- `hexEncode/hexDecode` - Hex encoding
- `encodeBase64/decodeBase64` - Base64 encoding

## Request Handling

### CORS Bypass

The app supports multiple CORS bypass methods:
1. External adapter (Tampermonkey/Chrome extension)
2. Fetch adapter (fallback)

Priority: External > Fetch

### Network API

```typescript
Network.get(url, options): Promise<{status: number, body: string}>
Network.post(url, options): Promise<{status: number, body: string}>
```

## Initialization Flow

1. **main.tsx**
   - Initialize database
   - Initialize plugin system
   - Restore plugins from storage

2. **Plugin Restoration**
   - Load plugin code from IndexedDB
   - Instantiate plugin classes
   - Load settings from IndexedDB
   - Call init() only if not already initialized

3. **Plugin Initialization Tracking**
   - Uses `pluginInitialized` Set to track initialized plugins
   - Prevents duplicate init() calls
   - Persists across page reloads via storage

## Storage Architecture

### Data Flow

```
Plugin Installation:
  Plugin Code -> IndexedDB (plugins store)
  Plugin Metadata -> Main Database (Plugin model)

Plugin Settings:
  Setting Value -> IndexedDB (settings store)
  Key format: plugin_setting_{pluginKey}_{settingKey}

Manga Cache:
  Cache Data -> IndexedDB (manga_cache store)
  Key format: {pluginKey}:{comicId}
  TTL support with automatic cleanup
```

## Key Features

### PWA Support
- Service Worker for offline access
- Web App Manifest
- Responsive design

### Reader Features
- Webtoon mode with continuous scrolling
- Chapter preloading
- Reading direction (LTR/RTL)
- Image loading with retry

### Plugin Management
- Install from URL
- Install from source list (JSON)
- Auto-update detection
- Plugin settings UI

## Development Notes

### Adding New Plugin Support

1. Ensure plugin extends `ComicSource`
2. Implement required methods:
   - `explore` or `search` or `comic`
3. Use `loadSetting`/`saveSetting` for persistence
4. Use `init()` for one-time initialization

### Database Migrations

Increment `DB_VERSION` in storage.ts when adding new stores:
```typescript
const DB_VERSION = 2;
```

### Debug Mode

Enable debug logging in console:
```javascript
// Check plugin storage
await debugPluginStorage()
```

## Common Issues

### Plugins disappear after refresh
- Check IndexedDB is not cleared by browser
- Check console for initialization errors
- Verify `restorePluginsFromStorage` completed

### Plugin init() called multiple times
- Fixed by `pluginInitialized` tracking
- Check `loadPlugin` is not called with duplicate keys

### CORS errors
- Ensure external adapter is installed (Tampermonkey script)
- Check adapter is properly registered

## License

MIT
