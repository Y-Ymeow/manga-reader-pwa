# Changelog

## Recent Fixes

### Plugin System
- **Fixed**: Convert class now matches Flutter implementation
  - MD5/SHA1/SHA256/SHA512 return Uint8Array instead of hex string
  - Added GBK encoding support via gbk.js
  - Fixed AES decryption methods
  - Added HMAC support
  
- **Fixed**: Plugin settings now stored in IndexedDB instead of localStorage
  - Added `savePluginSetting`/`loadPluginSetting` functions
  - Settings persist across sessions
  - Key format: `plugin_setting_{pluginKey}_{settingKey}`

- **Fixed**: Plugin initialization now runs only once
  - Added `pluginInitialized` Set to track initialized plugins
  - Prevents duplicate `init()` calls on page refresh
  - Plugin state properly restored from storage

- **Fixed**: Plugin restoration reliability
  - Added duplicate restoration prevention
  - Improved error handling and logging
  - Database version bumped to 2

### Explore Page
- **Fixed**: Support for multiple data formats
  - multiPartPage: `[{title, comics, viewMore}]`
  - multiPageComicList: `{comics, maxPage}`
  - mixed: `{data: [], maxPage}`
  - objectFormat: `{ [title: string]: Comic[] }`

- **Fixed**: Null/undefined handling in data parsing
  - Added safe array access
  - Better error messages

### Storage
- **Added**: Debug function `debugPluginStorage()`
- **Improved**: IndexedDB initialization with better logging
- **Fixed**: Store creation during database upgrade

### Type Definitions
- **Updated**: `ExplorePage.load` return type to `Promise<any>`
- **Updated**: `getExploreData` return type to `Promise<any>`
- **Added**: Type declaration for gbk.js

## Known Issues
- None currently tracked

## TODO
- [ ] Implement plugin search functionality
- [ ] Implement plugin category browsing
- [ ] Implement comments functionality
- [ ] Implement update check functionality
- [ ] Add history record functionality
