// CanvasImage 类 - 使用 Canvas API 实现图片处理
export class CanvasImage {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  constructor(canvas: HTMLCanvasElement) {
    if (!canvas) {
      throw new Error('Canvas is undefined or null');
    }
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get canvas context');
    }
    this.ctx = ctx;
  }

  /** 获取图片宽度 */
  get width(): number {
    return this.canvas.width;
  }

  /** 获取图片高度 */
  get height(): number {
    return this.canvas.height;
  }

  /** 获取底层 Canvas 元素 */
  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  /**
   * 复制图片指定区域
   * @param x 起始X坐标
   * @param y 起始Y坐标
   * @param width 宽度
   * @param height 高度
   * @returns 新 Image 对象
   */
  copyRange(x: number, y: number, width: number, height: number): CanvasImage | null {
    try {
      const newCanvas = document.createElement('canvas');
      newCanvas.width = width;
      newCanvas.height = height;
      const newCtx = newCanvas.getContext('2d');
      if (!newCtx) return null;

      newCtx.drawImage(this.canvas, x, y, width, height, 0, 0, width, height);
      return new CanvasImage(newCanvas);
    } catch (e) {
      console.error('copyRange failed:', e);
      return null;
    }
  }

  /**
   * 复制图片并顺时针旋转90度
   * @returns 新 Image 对象
   */
  copyAndRotate90(): CanvasImage | null {
    try {
      const newCanvas = document.createElement('canvas');
      newCanvas.width = this.canvas.height;
      newCanvas.height = this.canvas.width;
      const newCtx = newCanvas.getContext('2d');
      if (!newCtx) return null;

      newCtx.translate(newCanvas.width / 2, newCanvas.height / 2);
      newCtx.rotate(Math.PI / 2);
              newCtx.drawImage(this.canvas, -this.canvas.width / 2, -this.canvas.height / 2);
              return new CanvasImage(newCanvas);    } catch (e) {
      console.error('copyAndRotate90 failed:', e);
      return null;
    }
  }

  /**
   * 在指定位置填充另一张图片
   * @param x 目标X坐标
   * @param y 目标Y坐标
   * @param image 源图片
   */
  fillImageAt(x: number, y: number, image: CanvasImage): void {
    try {
      this.ctx.drawImage(image.canvas, x, y);
    } catch (e) {
      console.error('fillImageAt failed:', e);
    }
  }

  /**
   * 将源图片的指定区域填充到当前图片的指定位置
   * @param x 目标X坐标
   * @param y 目标Y坐标
   * @param image 源图片
   * @param srcX 源X坐标
   * @param srcY 源Y坐标
   * @param width 宽度
   * @param height 高度
   */
  fillImageRangeAt(x: number, y: number, image: CanvasImage, srcX: number, srcY: number, width: number, height: number): void {
    try {
      this.ctx.drawImage(image.canvas, srcX, srcY, width, height, x, y, width, height);
    } catch (e) {
      console.error('fillImageRangeAt failed:', e);
    }
  }

  /**
   * 从 URL 加载图片
   * @param url 图片URL
   * @returns Promise<Image>
   */
  static async fromURL(url: string): Promise<CanvasImage> {
    return new Promise((resolve, reject) => {
      const img = new (window as any).orginImage();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }
        ctx.drawImage(img, 0, 0);
        try {
          const image = new CanvasImage(canvas);
          resolve(image);
        } catch (e) {
          reject(e);
        }
      };
      img.onerror = () => reject(new Error(`Failed to load image: ${url.substring(0, 50)}`));
      img.src = url;
    });
  }

  /**
   * 从 Blob 加载图片
   * @param blob 图片Blob
   * @returns Promise<CanvasImage>
   */
  static async fromBlob(blob: Blob): Promise<CanvasImage> {
    // 使用 FileReader 读取 blob 为 data URL
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        CanvasImage.fromURL(dataUrl).then(resolve).catch(reject);
      };
      reader.onerror = () => reject(new Error('Failed to read blob'));
      reader.readAsDataURL(blob);
    });
  }

  /**
   * 创建空白图片
   * @param width 宽度
   * @param height 高度
   * @returns Image 对象
   */
  static empty(width: number, height: number): CanvasImage {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return new CanvasImage(canvas);
  }

  /**
   * 导出为 Blob
   * @param type MIME类型
   * @param quality 质量(0-1)
   * @returns Promise<Blob>
   */
  toBlob(type: string = 'image/png', quality?: number): Promise<Blob> {
    return new Promise((resolve, reject) => {
      this.canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Failed to convert to blob'));
        },
        type,
        quality
      );
    });
  }

  /**
   * 导出为 Data URL
   * @param type MIME类型
   * @param quality 质量(0-1)
   * @returns string
   */
  toDataURL(type: string = 'image/png', quality?: number): string {
    return this.canvas.toDataURL(type, quality);
  }
}


