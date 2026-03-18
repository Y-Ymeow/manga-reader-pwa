/**
 * Plugin UI Components
 * 插件系统 UI 组件 - 提供与 Tauri 原生 UI 一致的交互体验
 */

import { useState, useEffect } from 'preact/hooks';

// ==================== UI 状态管理 ====================

interface UIState {
  showMessage: {
    visible: boolean;
    message: string;
    duration: number;
  };
  showDialog: {
    visible: boolean;
    title: string;
    content: string;
    actions: Array<{
      text: string;
      callback: () => void | Promise<void>;
      style: 'text' | 'filled' | 'danger';
      loading: boolean;
    }>;
  };
  showLoading: Array<{
    id: number;
    onCancel: (() => void) | null;
  }>;
  showInputDialog: {
    visible: boolean;
    title: string;
    image?: string;
    validator?: (value: string) => string | null | undefined;
    value: string;
    error?: string;
    resolve: (value: string | null) => void;
  } | null;
  showSelectDialog: {
    visible: boolean;
    title: string;
    options: string[];
    initialIndex?: number;
    resolve: (index: number | null) => void;
  } | null;
}

const uiState: UIState = {
  showMessage: { visible: false, message: '', duration: 2000 },
  showDialog: { visible: false, title: '', content: '', actions: [] },
  showLoading: [],
  showInputDialog: null,
  showSelectDialog: null,
};

let loadingIdCounter = 0;
const eventListeners = new Set<() => void>();

function notifyUpdate() {
  eventListeners.forEach(listener => listener());
}

// ==================== UI 组件 ====================

/**
 * Toast 消息组件
 */
export function ToastMessage() {
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const listener = () => {
      if (uiState.showMessage.visible) {
        setMessage(uiState.showMessage.message);
        setVisible(true);
        setTimeout(() => {
          setVisible(false);
        }, uiState.showMessage.duration);
      }
    };

    eventListeners.add(listener);
    listener();

    return () => {
      eventListeners.delete(listener);
    };
  }, []);

  if (!visible) return null;

  return (
    <div class="fixed top-4 left-1/2 -translate-x-1/2 z-50 animate-fade-in-down">
      <div class="bg-gray-800/95 backdrop-blur-sm text-white px-6 py-3 rounded-lg shadow-lg border border-gray-700">
        <p class="text-sm">{message}</p>
      </div>
    </div>
  );
}

/**
 * 对话框组件
 */
export function Dialog() {
  const [visible, setVisible] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [actions, setActions] = useState<Array<{
    text: string;
    callback: () => void | Promise<void>;
    style: 'text' | 'filled' | 'danger';
    loading: boolean;
  }>>([]);

  useEffect(() => {
    const listener = () => {
      if (uiState.showDialog.visible) {
        setTitle(uiState.showDialog.title);
        setContent(uiState.showDialog.content);
        setActions(uiState.showDialog.actions.map(action => ({
          ...action,
          loading: false,
        })));
        setVisible(true);
      }
    };

    eventListeners.add(listener);
    listener();

    return () => {
      eventListeners.delete(listener);
    };
  }, []);

  const handleAction = async (index: number) => {
    const action = actions[index];
    if (!action) return;

    // 设置 loading 状态
    setActions(prev => prev.map((a, i) => 
      i === index ? { ...a, loading: true } : a
    ));

    try {
      await action.callback();
    } catch (e) {
      console.error('Dialog action error:', e);
    } finally {
      setActions(prev => prev.map((a, i) => 
        i === index ? { ...a, loading: false } : a
      ));
    }

    setVisible(false);
  };

  const handleClose = () => {
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        class="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      />
      
      {/* Dialog */}
      <div class="relative bg-[#16213e] rounded-xl shadow-2xl max-w-md w-full border border-gray-700 animate-scale-in">
        {/* Header */}
        <div class="px-6 py-4 border-b border-gray-700">
          <h3 class="text-lg font-bold text-white">{title}</h3>
        </div>

        {/* Content */}
        <div class="px-6 py-4">
          <p class="text-gray-300 text-sm whitespace-pre-wrap">{content}</p>
        </div>

        {/* Actions */}
        <div class="px-6 py-4 border-t border-gray-700 flex gap-3 justify-end">
          {actions.map((action, index) => (
            <button
              key={index}
              onClick={() => handleAction(index)}
              disabled={action.loading}
              class={`
                px-4 py-2 rounded-lg text-sm font-medium transition-all
                ${action.style === 'filled' 
                  ? 'bg-[#e94560] text-white hover:bg-[#d63850]' 
                  : action.style === 'danger'
                  ? 'bg-red-600 text-white hover:bg-red-700'
                  : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
                }
                disabled:opacity-50 disabled:cursor-not-allowed
              `}
            >
              {action.loading ? (
                <span class="flex items-center gap-2">
                  <span class="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  加载中...
                </span>
              ) : (
                action.text
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Loading 组件
 */
export function LoadingOverlay() {
  const [loadings, setLoadings] = useState<Array<{
    id: number;
    onCancel: (() => void) | null;
  }>>([]);

  useEffect(() => {
    const listener = () => {
      setLoadings([...uiState.showLoading]);
    };

    eventListeners.add(listener);
    listener();

    return () => {
      eventListeners.delete(listener);
    };
  }, []);

  const handleCancel = (id: number, onCancel?: (() => void) | null) => {
    if (onCancel) {
      try {
        onCancel();
      } catch (e) {
        console.error('Loading cancel error:', e);
      }
    }
    uiState.showLoading = uiState.showLoading.filter(l => l.id !== id);
    notifyUpdate();
  };

  if (loadings.length === 0) return null;

  // 只显示最新的 loading
  const latestLoading = loadings[loadings.length - 1];

  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div class="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      
      {/* Loading */}
      <div class="relative bg-[#16213e] rounded-xl shadow-2xl p-8 border border-gray-700 animate-scale-in flex flex-col items-center gap-4">
        <div class="w-12 h-12 border-4 border-[#e94560] border-t-transparent rounded-full animate-spin" />
        <p class="text-white text-sm">加载中...</p>
        
        {latestLoading?.onCancel && (
          <button
            onClick={() => handleCancel(latestLoading.id, latestLoading.onCancel)}
            class="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
          >
            取消
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * 输入对话框组件
 */
export function InputDialog() {
  const [visible, setVisible] = useState(false);
  const [title, setTitle] = useState('');
  const [image, setImage] = useState<string | undefined>();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [validator, setValidator] = useState<((value: string) => string | null | undefined) | null>(null);
  const [resolve, setResolve] = useState<((value: string | null) => void) | null>(null);

  useEffect(() => {
    const listener = () => {
      if (uiState.showInputDialog) {
        setTitle(uiState.showInputDialog.title);
        setImage(uiState.showInputDialog.image);
        setValue(uiState.showInputDialog.value);
        setError(uiState.showInputDialog.error);
        setValidator(() => uiState.showInputDialog?.validator || null);
        setResolve(() => uiState.showInputDialog?.resolve);
        setVisible(uiState.showInputDialog.visible);
      } else {
        setVisible(false);
      }
    };

    eventListeners.add(listener);
    listener();

    return () => {
      eventListeners.delete(listener);
    };
  }, []);

  const handleSubmit = () => {
    if (validator) {
      const errorMsg = validator(value);
      if (errorMsg) {
        setError(errorMsg);
        return;
      }
    }

    resolve?.(value);
    uiState.showInputDialog = null;
    notifyUpdate();
    setVisible(false);
  };

  const handleCancel = () => {
    resolve?.(null);
    uiState.showInputDialog = null;
    notifyUpdate();
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        class="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleCancel}
      />
      
      {/* Dialog */}
      <div class="relative bg-[#16213e] rounded-xl shadow-2xl max-w-md w-full border border-gray-700 animate-scale-in">
        {/* Header */}
        <div class="px-6 py-4 border-b border-gray-700">
          <h3 class="text-lg font-bold text-white">{title}</h3>
        </div>

        {/* Content */}
        <div class="px-6 py-4 space-y-4">
          {image && (
            <div class="flex justify-center">
              <img src={image} alt="" class="max-h-48 rounded-lg object-contain" />
            </div>
          )}
          
          <input
            type="text"
            value={value}
            onChange={(e) => {
              setValue(e.currentTarget.value);
              setError(undefined);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleSubmit();
              } else if (e.key === 'Escape') {
                handleCancel();
              }
            }}
            autoFocus
            class="w-full px-4 py-2 bg-[#1a1a2e] border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-[#e94560] focus:ring-1 focus:ring-[#e94560]"
            placeholder="请输入..."
          />
          
          {error && (
            <p class="text-red-400 text-sm">{error}</p>
          )}
        </div>

        {/* Actions */}
        <div class="px-6 py-4 border-t border-gray-700 flex gap-3 justify-end">
          <button
            onClick={handleCancel}
            class="px-4 py-2 rounded-lg text-sm font-medium bg-gray-700 text-gray-200 hover:bg-gray-600 transition-all"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            class="px-4 py-2 rounded-lg text-sm font-medium bg-[#e94560] text-white hover:bg-[#d63850] transition-all"
          >
            确定
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * 选择对话框组件
 */
export function SelectDialog() {
  const [visible, setVisible] = useState(false);
  const [title, setTitle] = useState('');
  const [options, setOptions] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | undefined>();
  const [resolve, setResolve] = useState<((index: number | null) => void) | null>(null);

  useEffect(() => {
    const listener = () => {
      if (uiState.showSelectDialog) {
        setTitle(uiState.showSelectDialog.title);
        setOptions(uiState.showSelectDialog.options);
        setSelectedIndex(uiState.showSelectDialog.initialIndex);
        setResolve(() => uiState.showSelectDialog?.resolve);
        setVisible(uiState.showSelectDialog.visible);
      } else {
        setVisible(false);
      }
    };

    eventListeners.add(listener);
    listener();

    return () => {
      eventListeners.delete(listener);
    };
  }, []);

  const handleSelect = (index: number) => {
    resolve?.(index);
    uiState.showSelectDialog = null;
    notifyUpdate();
    setVisible(false);
  };

  const handleCancel = () => {
    resolve?.(null);
    uiState.showSelectDialog = null;
    notifyUpdate();
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        class="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleCancel}
      />
      
      {/* Dialog */}
      <div class="relative bg-[#16213e] rounded-xl shadow-2xl max-w-md w-full border border-gray-700 animate-scale-in max-h-[80vh] flex flex-col">
        {/* Header */}
        <div class="px-6 py-4 border-b border-gray-700">
          <h3 class="text-lg font-bold text-white">{title}</h3>
        </div>

        {/* Options */}
        <div class="flex-1 overflow-y-auto p-4 space-y-2">
          {options.map((option, index) => (
            <button
              key={index}
              onClick={() => handleSelect(index)}
              class={`
                w-full px-4 py-3 rounded-lg text-left transition-all
                ${selectedIndex === index
                  ? 'bg-[#e94560] text-white'
                  : 'bg-[#1a1a2e] text-gray-200 hover:bg-[#1f294a]'
                }
              `}
            >
              {option}
            </button>
          ))}
        </div>

        {/* Cancel */}
        <div class="px-4 py-3 border-t border-gray-700">
          <button
            onClick={handleCancel}
            class="w-full px-4 py-2 rounded-lg text-sm font-medium bg-gray-700 text-gray-200 hover:bg-gray-600 transition-all"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
}

// ==================== UI API ====================

/**
 * 插件 UI 接口
 */
export const PluginUI = {
  /**
   * 显示消息
   * @param message 消息内容
   * @param duration 持续时间（毫秒）
   */
  showMessage: (message: string, duration = 2000) => {
    uiState.showMessage = { visible: true, message, duration };
    notifyUpdate();
  },

  /**
   * 显示对话框
   * @param title 标题
   * @param content 内容
   * @param actions 操作按钮
   */
  showDialog: (
    title: string,
    content: string,
    actions: Array<{
      text: string;
      callback: () => void | Promise<void>;
      style?: 'text' | 'filled' | 'danger';
    }>
  ) => {
    uiState.showDialog = {
      visible: true,
      title,
      content,
      actions: actions.map(action => ({
        text: action.text,
        callback: action.callback,
        style: action.style || 'text',
        loading: false,
      })),
    };
    notifyUpdate();
  },

  /**
   * 显示加载对话框
   * @param onCancel 取消回调
   * @returns 加载 ID，用于取消
   */
  showLoading: (onCancel?: (() => void) | null) => {
    const id = ++loadingIdCounter;
    uiState.showLoading.push({ id, onCancel: onCancel ?? null });
    notifyUpdate();
    return id;
  },

  /**
   * 取消加载对话框
   * @param id 加载 ID
   */
  cancelLoading: (id: number) => {
    uiState.showLoading = uiState.showLoading.filter(l => l.id !== id);
    notifyUpdate();
  },

  /**
   * 显示输入对话框
   * @param title 标题
   * @param validator 验证函数
   * @param image 图片 URL 或 ArrayBuffer
   * @returns 输入值
   */
  showInputDialog: (
    title: string,
    validator?: (value: string) => string | null | undefined,
    image?: string | ArrayBuffer | null
  ): Promise<string | null> => {
    return new Promise((resolve) => {
      let imageSrc: string | undefined;
      if (typeof image === 'string') {
        imageSrc = image;
      } else if (image instanceof ArrayBuffer) {
        imageSrc = URL.createObjectURL(new Blob([image]));
      }

      uiState.showInputDialog = {
        visible: true,
        title,
        image: imageSrc,
        validator,
        value: '',
        resolve,
      };
      notifyUpdate();
    });
  },

  /**
   * 显示选择对话框
   * @param title 标题
   * @param options 选项列表
   * @param initialIndex 初始选中索引
   * @returns 选中的索引
   */
  showSelectDialog: (
    title: string,
    options: string[],
    initialIndex?: number
  ): Promise<number | null> => {
    return new Promise((resolve) => {
      uiState.showSelectDialog = {
        visible: true,
        title,
        options,
        initialIndex,
        resolve,
      };
      notifyUpdate();
    });
  },
};

// ==================== 全局注册 ====================

/**
 * 注册全局 UI 对象
 */
export function registerGlobalUI() {
  if (typeof window !== 'undefined') {
    (window as any).PluginUI = PluginUI;
  }
}
