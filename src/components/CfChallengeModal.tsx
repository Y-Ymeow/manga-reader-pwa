import { useState, useEffect } from 'preact/hooks';

interface CfChallengeModalProps {
  challengeUrl: string | null;
  onClose: () => void;
}

export function CfChallengeModal({ challengeUrl, onClose }: CfChallengeModalProps) {
  if (!challengeUrl) return null;

  return (
    <div class="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4">
      <div class="bg-[#1a1a2e] rounded-xl p-6 w-full max-w-md">
        <h2 class="text-xl font-bold text-white mb-4">⚠️ Cloudflare 验证</h2>
        <p class="text-gray-400 mb-6">
          检测到 Cloudflare 安全验证，需要在浏览器中完成验证后才能继续访问。
        </p>
        
        <div class="space-y-3">
          <button
            onClick={() => {
              window.open(challengeUrl, '_blank');
              // 用户可能需要手动返回并刷新
              setTimeout(() => {
                if (confirm('已完成验证？点击确定刷新页面。')) {
                  window.location.reload();
                }
              }, 5000);
            }}
            class="w-full px-6 py-3 bg-[#e94560] text-white rounded-lg hover:bg-[#d63d56]"
          >
            前往验证 →
          </button>
          
          <button
            onClick={onClose}
            class="w-full px-6 py-3 bg-[#16213e] text-gray-400 rounded-lg hover:bg-[#1e2a4a]"
          >
            稍后再说
          </button>
        </div>
        
        <p class="text-xs text-gray-500 mt-4 text-center">
          验证完成后请返回应用刷新页面
        </p>
      </div>
    </div>
  );
}

// 全局 CF 挑战状态管理
let cfChallengeCallback: ((url: string) => void) | null = null;

/**
 * 设置 CF 挑战回调
 */
export function setCfChallengeCallback(callback: (url: string) => void): void {
  cfChallengeCallback = callback;
}

/**
 * 清除 CF 挑战回调
 */
export function clearCfChallengeCallback(): void {
  cfChallengeCallback = null;
}

/**
 * 触发 CF 挑战提示
 */
export function triggerCfChallenge(url: string): void {
  if (cfChallengeCallback) {
    cfChallengeCallback(url);
  }
}

/**
 * Hook: 监听 CF 挑战
 */
export function useCfChallenge(): [string | null, () => void] {
  const [challengeUrl, setChallengeUrl] = useState<string | null>(null);

  useEffect(() => {
    const callback = (url: string) => {
      setChallengeUrl(url);
    };

    setCfChallengeCallback(callback);

    return () => {
      clearCfChallengeCallback();
    };
  }, []);

  const close = () => {
    setChallengeUrl(null);
  };

  return [challengeUrl, close];
}
