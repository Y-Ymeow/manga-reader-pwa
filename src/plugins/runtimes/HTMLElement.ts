// HTML 元素类（简化版）
export class HtmlElement {
  private element: Element;

  constructor(element: Element) {
    this.element = element;
  }

  get text(): string {
    return this.element.textContent || '';
  }

  // 兼容非标准属性访问
  get attributes(): Record<string, string> {
    const attrs: Record<string, string> = {};
    // 使用 getAttributeNames() 获取所有属性名
    const attrNames = (this.element as any).getAttributeNames?.() || [];
    for (const name of attrNames) {
      const value = this.element.getAttribute(name);
      if (value !== null) {
        attrs[name] = value;
      }
    }
    return attrs;
  }

  // 直接获取属性值的辅助方法
  getAttribute(name: string): string | null {
    return this.element.getAttribute(name);
  }

  querySelector(selector: string): HtmlElement | null {
    const el = this.element.querySelector(selector);
    return el ? new HtmlElement(el) : null;
  }

  querySelectorAll(selector: string): HtmlElement[] {
    return Array.from(this.element.querySelectorAll(selector)).map(el => new HtmlElement(el));
  }

  get children(): HtmlElement[] {
    return Array.from(this.element.children).map(el => new HtmlElement(el));
  }
}

// HTML 文档类
export class HtmlDocumentClass {
  private doc: Document;

  constructor(html: string) {
    const parser = new DOMParser();
    this.doc = parser.parseFromString(html, 'text/html');
  }

  querySelector(selector: string): HtmlElement | null {
    const el = this.doc.querySelector(selector);
    return el ? new HtmlElement(el) : null;
  }

  querySelectorAll(selector: string): HtmlElement[] {
    return Array.from(this.doc.querySelectorAll(selector)).map(el => new HtmlElement(el));
  }
}

