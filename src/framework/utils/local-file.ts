export interface LocalFileInfo {
  filePath?: string;
  fileName?: string;
  sourceType?: string;
}

export interface LocalFileResolver {
  resolve: (info: LocalFileInfo) => Promise<string | null>;
}

let resolver: LocalFileResolver | null = null;

export function setLocalFileResolver(next: LocalFileResolver | null) {
  resolver = next;
}

export async function resolveLocalFileUrl(
  info: LocalFileInfo,
): Promise<string | null> {
  if (resolver) {
    return resolver.resolve(info);
  }

  const globalResolver =
    (window as any)?.resolve_local_file_url ||
    (window as any)?.tauri.resolve_local_file_url;

  if (typeof globalResolver === "function" && info.filePath) {
    try {
      const result = await globalResolver(info.filePath);

      if (typeof result === "string") return result;
      if (
        result &&
        typeof result === "object" &&
        typeof result.url === "string"
      )
        return result.url;
    } catch (e) {
      console.error(e);
      return null;
    }
  }

  return null;
}
