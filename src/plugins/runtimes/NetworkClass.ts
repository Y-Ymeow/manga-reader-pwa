// 网络请求类

import { createAutoExternalAdapter, FetchAdapter, RequestManager } from "@/framework/requests";


const requestManager = new RequestManager();

// 优先注册外部适配器（油猴/Chrome 插件）以绕过 CORS
const externalAdapter = createAutoExternalAdapter();
if (externalAdapter) {
  requestManager.register(externalAdapter);
  requestManager.setDefault('external');
} else {
  // 降级到 fetch
  requestManager.register(new FetchAdapter());
}

export {requestManager};

// Venera 格式：Network.get(url, { headers: {...}, ... })
export class NetworkClass {
  async get(url: string, options?: Record<string, any>): Promise<{ status: number; body: string }> {
    try {
      // 支持两种格式:
      // 1. Network.get(url, { headers: { Referer: '...' } })
      // 2. Network.get(url, { Referer: '...' }) - 直接传 headers
      let headers: Record<string, string> | undefined;
      if (options) {
        if (options.headers && typeof options.headers === 'object') {
          headers = options.headers;
        } else {
          // 如果 options 没有 headers 属性，把整个 options 当作 headers
          const { body, method, ...rest } = options;
          if (Object.keys(rest).length > 0) {
            headers = rest as Record<string, string>;
          }
        }
      }
      const response = await requestManager.get(url, { headers });

      // 检测 Cloudflare 挑战页面
      if (response.status === 403 || response.status === 503) {
        const responseText = typeof response.data === 'string' ? response.data : '';
        if (responseText.includes('cdn-cgi/challenge-platform') ||
            responseText.includes('Just a moment') ||
            responseText.includes('cf_chl')) {
          // 触发全局 CF 挑战回调
          import('../../components/CfChallengeModal').then(({ triggerCfChallenge }) => {
            triggerCfChallenge(url);
          });
          throw new Error(`CF_CHALLENGE:${url}`);
        }
      }

      return {
        status: response.status,
        body: typeof response.data === 'string' ? response.data : JSON.stringify(response.data),
      };
    } catch (error: any) {
      // CF 挑战错误直接抛出
      if (error.message?.startsWith('CF_CHALLENGE:')) {
        throw error;
      }
      // 请求错误时，如果状态码是 403/503，也触发 CF 挑战提示
      // 因为错误时拿不到响应内容，所以只要状态码符合就认为是 CF 挑战
      if (error.status === 403 || error.status === 503) {
        import('../../components/CfChallengeModal').then(({ triggerCfChallenge }) => {
          triggerCfChallenge(url);
        });
        throw new Error(`CF_CHALLENGE:${url}`);
      }
      return { status: error.status || 0, body: error.message || 'Network error' };
    }
  }

  async post(url: string, options?: Record<string, any>): Promise<{ status: number; body: string }> {
    try {
      let headers: Record<string, string> | undefined;
      let body: string | undefined;
      if (options) {
        body = options.body;
        if (options.headers && typeof options.headers === 'object') {
          headers = options.headers;
        } else {
          const { body: _, method, ...rest } = options;
          if (Object.keys(rest).length > 0) {
            headers = rest as Record<string, string>;
          }
        }
      }
      const response = await requestManager.post(url, body, { headers });

      // 检测 Cloudflare 挑战页面
      if (response.status === 403 || response.status === 503) {
        const responseText = typeof response.data === 'string' ? response.data : '';
        if (responseText.includes('cdn-cgi/challenge-platform') ||
            responseText.includes('Just a moment') ||
            responseText.includes('cf_chl')) {
          // 触发全局 CF 挑战回调
          import('../../components/CfChallengeModal').then(({ triggerCfChallenge }) => {
            triggerCfChallenge(url);
          });
          throw new Error(`CF_CHALLENGE:${url}`);
        }
      }

      return {
        status: response.status,
        body: typeof response.data === 'string' ? response.data : JSON.stringify(response.data),
      };
    } catch (error: any) {
      // CF 挑战错误直接抛出
      if (error.message?.startsWith('CF_CHALLENGE:')) {
        throw error;
      }
      // 请求错误时，如果状态码是 403/503，也触发 CF 挑战提示
      // 因为错误时拿不到响应内容，所以只要状态码符合就认为是 CF 挑战
      if (error.status === 403 || error.status === 503) {
        import('../../components/CfChallengeModal').then(({ triggerCfChallenge }) => {
          triggerCfChallenge(url);
        });
        throw new Error(`CF_CHALLENGE:${url}`);
      }
      return { status: error.status || 0, body: error.message || 'Network error' };
    }
  }

  setCookies(url: string, cookies: any[]): void {
    // TODO: Implement cookie storage
    console.log('Set cookies:', url, cookies);
  }

  deleteCookies(domain: string): void {
    // TODO: Implement cookie deletion
    console.log('Delete cookies:', domain);
  }
}
