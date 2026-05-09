type Listener = (event: { type: string; target: any; currentTarget: any }) => void;

class FakeStyle {
  [key: string]: any;

  setProperty(name: string, value: string): void {
    this[name] = value;
  }

  removeProperty(name: string): void {
    delete this[name];
  }
}

class FakeNode {
  nodeType: number;
  nodeName: string;
  ownerDocument: FakeDocument | null;
  parentNode: FakeNode | null = null;
  childNodes: FakeNode[] = [];

  constructor(nodeType: number, nodeName: string, ownerDocument: FakeDocument | null) {
    this.nodeType = nodeType;
    this.nodeName = nodeName;
    this.ownerDocument = ownerDocument;
  }

  appendChild<T extends FakeNode>(child: T): T {
    if (child.parentNode) {
      child.parentNode.removeChild(child);
    }
    this.childNodes.push(child);
    child.parentNode = this;
    return child;
  }

  insertBefore<T extends FakeNode>(child: T, before: FakeNode | null): T {
    if (before == null) {
      return this.appendChild(child);
    }
    if (child.parentNode) {
      child.parentNode.removeChild(child);
    }
    const index = this.childNodes.indexOf(before);
    if (index === -1) {
      return this.appendChild(child);
    }
    this.childNodes.splice(index, 0, child);
    child.parentNode = this;
    return child;
  }

  removeChild<T extends FakeNode>(child: T): T {
    const index = this.childNodes.indexOf(child);
    if (index >= 0) {
      this.childNodes.splice(index, 1);
      child.parentNode = null;
    }
    return child;
  }

  get firstChild(): FakeNode | null {
    return this.childNodes[0] ?? null;
  }

  get lastChild(): FakeNode | null {
    return this.childNodes[this.childNodes.length - 1] ?? null;
  }

  get nextSibling(): FakeNode | null {
    if (!this.parentNode) return null;
    const siblings = this.parentNode.childNodes;
    const index = siblings.indexOf(this);
    return index >= 0 ? (siblings[index + 1] ?? null) : null;
  }

  get previousSibling(): FakeNode | null {
    if (!this.parentNode) return null;
    const siblings = this.parentNode.childNodes;
    const index = siblings.indexOf(this);
    return index > 0 ? (siblings[index - 1] ?? null) : null;
  }

  get textContent(): string {
    return this.childNodes.map((child) => child.textContent).join('');
  }

  set textContent(value: string) {
    this.childNodes = [];
    if (value) {
      this.appendChild(new FakeText(value, this.ownerDocument));
    }
  }
}

class FakeText extends FakeNode {
  data: string;

  constructor(data: string, ownerDocument: FakeDocument | null) {
    super(3, '#text', ownerDocument);
    this.data = data;
  }

  get textContent(): string {
    return this.data;
  }

  set textContent(value: string) {
    this.data = value;
  }
}

class FakeComment extends FakeNode {
  data: string;

  constructor(data: string, ownerDocument: FakeDocument | null) {
    super(8, '#comment', ownerDocument);
    this.data = data;
  }

  get textContent(): string {
    return this.data;
  }

  set textContent(value: string) {
    this.data = value;
  }
}

class FakeElement extends FakeNode {
  tagName: string;
  localName: string;
  namespaceURI = 'http://www.w3.org/1999/xhtml';
  style = new FakeStyle();
  attributes = new Map<string, string>();
  dataset: Record<string, string> = {};
  listeners = new Map<string, Set<Listener>>();

  constructor(tagName: string, ownerDocument: FakeDocument | null) {
    super(1, tagName.toUpperCase(), ownerDocument);
    this.tagName = tagName.toUpperCase();
    this.localName = tagName.toLowerCase();
  }

  setAttribute(name: string, value: any): void {
    const stringValue = String(value);
    this.attributes.set(name, stringValue);
    const propertyName = name === 'class' ? 'className' : name === 'playsinline' ? 'playsInline' : name;
    (this as any)[propertyName] = stringValue;
    if (name === 'id') {
      (this as any).id = stringValue;
    }
    if (name.startsWith('data-')) {
      this.dataset[name.slice(5).replace(/-([a-z])/g, (_, char: string) => char.toUpperCase())] = stringValue;
    }
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  setAttributeNS(_namespace: string, name: string, value: any): void {
    this.setAttribute(name, value);
  }

  removeAttributeNS(_namespace: string, name: string): void {
    this.removeAttribute(name);
  }

  addEventListener(type: string, listener: Listener): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(listener);
  }

  removeEventListener(type: string, listener: Listener): void {
    this.listeners.get(type)?.delete(listener);
  }

  dispatchEvent(event: { type: string; target?: any; currentTarget?: any }): boolean {
    const payload = {
      ...event,
      target: event.target ?? this,
      currentTarget: event.currentTarget ?? this
    };
    for (const listener of this.listeners.get(event.type) ?? []) {
      listener(payload);
    }
    if (this.parentNode instanceof FakeElement) {
      this.parentNode.dispatchEvent({ ...event, target: payload.target });
      return true;
    }
    if (this.ownerDocument) {
      this.ownerDocument.dispatchEvent({ ...event, target: payload.target });
      this.ownerDocument.defaultView?.dispatchEvent({ ...event, target: payload.target });
    }
    return true;
  }

  get children(): FakeElement[] {
    return this.childNodes.filter((child): child is FakeElement => child instanceof FakeElement);
  }

  get parentElement(): FakeElement | null {
    return this.parentNode instanceof FakeElement ? this.parentNode : null;
  }

  contains(node: FakeNode | null): boolean {
    if (!node) return false;
    if (node === this) return true;
    return this.childNodes.some((child) => child === node || (child instanceof FakeElement && child.contains(node)));
  }

  querySelector(tagName: string): FakeElement | null {
    const normalized = tagName.toLowerCase();
    for (const child of this.children) {
      if (child.localName === normalized) return child;
      const nested = child.querySelector(normalized);
      if (nested) return nested;
    }
    return null;
  }

  focus(): void {
    this.ownerDocument?.setActiveElement(this);
  }

  blur(): void {
    if (this.ownerDocument?.activeElement === this) {
      this.ownerDocument.setActiveElement(this.ownerDocument.body);
    }
  }
}

class FakeHTMLElement extends FakeElement {}

class FakeHTMLIFrameElement extends FakeHTMLElement {
  constructor(ownerDocument: FakeDocument | null) {
    super('iframe', ownerDocument);
  }
}

class FakeHTMLVideoElement extends FakeHTMLElement {
  currentTime = 0;
  duration = 1.5;
  loop = false;
  autoplay = false;
  muted = false;
  playsInline = false;
  src = '';
  play = (): Promise<void> => Promise.resolve();
  pause = (): void => undefined;

  constructor(ownerDocument: FakeDocument | null) {
    super('video', ownerDocument);
  }
}

class FakeDocument extends FakeNode {
  documentElement: FakeHTMLElement;
  body: FakeHTMLElement;
  activeElement: FakeElement | null = null;
  defaultView: any = null;
  private listeners = new Map<string, Set<Listener>>();

  constructor() {
    super(9, '#document', null);
    this.ownerDocument = this;
    this.documentElement = new FakeHTMLElement('html', this);
    this.body = new FakeHTMLElement('body', this);
    this.documentElement.appendChild(this.body);
    this.appendChild(this.documentElement);
    this.activeElement = this.body;
  }

  createElement(tagName: string): FakeHTMLElement {
    if (tagName.toLowerCase() === 'video') {
      return new FakeHTMLVideoElement(this) as unknown as FakeHTMLElement;
    }
    return new FakeHTMLElement(tagName, this);
  }

  createElementNS(_namespace: string, tagName: string): FakeHTMLElement {
    return this.createElement(tagName);
  }

  createTextNode(data: string): FakeText {
    return new FakeText(data, this);
  }

  createComment(data: string): FakeComment {
    return new FakeComment(data, this);
  }

  addEventListener(type: string, listener: Listener): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(listener);
  }

  removeEventListener(type: string, listener: Listener): void {
    this.listeners.get(type)?.delete(listener);
  }

  dispatchEvent(event: { type: string; target?: any; currentTarget?: any }): boolean {
    const payload = {
      ...event,
      target: event.target ?? this,
      currentTarget: event.currentTarget ?? this
    };
    for (const listener of this.listeners.get(event.type) ?? []) {
      listener(payload);
    }
    return true;
  }

  getElementById(id: string): FakeElement | null {
    const visit = (node: FakeElement): FakeElement | null => {
      if (node.getAttribute('id') === id) return node;
      for (const child of node.children) {
        const found = visit(child);
        if (found) return found;
      }
      return null;
    };
    return visit(this.body);
  }

  setActiveElement(element: FakeElement | null): void {
    this.activeElement = element;
  }
}

class FakeWindow {
  document: FakeDocument;
  navigator = { userAgent: 'minidom' };
  location = { href: 'http://localhost/' };
  listeners = new Map<string, Set<Listener>>();

  constructor(document: FakeDocument) {
    this.document = document;
  }

  addEventListener(type: string, listener: Listener): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(listener);
  }

  removeEventListener(type: string, listener: Listener): void {
    this.listeners.get(type)?.delete(listener);
  }

  dispatchEvent(event: { type: string; target?: any; currentTarget?: any }): boolean {
    const payload = {
      ...event,
      target: event.target ?? this,
      currentTarget: event.currentTarget ?? this
    };
    for (const listener of this.listeners.get(event.type) ?? []) {
      listener(payload);
    }
    return true;
  }
}

export interface MiniDomEnvironment {
  window: FakeWindow & typeof globalThis;
  document: FakeDocument;
  container: FakeHTMLElement;
  cleanup(): void;
}

export function installMiniDom(): MiniDomEnvironment {
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    navigatorDescriptor: Object.getOwnPropertyDescriptor(globalThis, 'navigator'),
    HTMLElement: (globalThis as any).HTMLElement,
    HTMLVideoElement: (globalThis as any).HTMLVideoElement,
    HTMLIFrameElement: (globalThis as any).HTMLIFrameElement,
    Element: (globalThis as any).Element,
    Node: (globalThis as any).Node,
    Document: (globalThis as any).Document,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
    IS_REACT_ACT_ENVIRONMENT: (globalThis as any).IS_REACT_ACT_ENVIRONMENT
  };

  const document = new FakeDocument();
  const window = new FakeWindow(document) as MiniDomEnvironment['window'];
  document.defaultView = window;

  window.window = window;
  window.self = window;
  window.top = window;
  window.parent = window;
  window.document = document;
  window.navigator = { userAgent: 'minidom' } as any;
  window.location = { href: 'http://localhost/' } as any;
  window.setTimeout = globalThis.setTimeout.bind(globalThis);
  window.clearTimeout = globalThis.clearTimeout.bind(globalThis);
  window.requestAnimationFrame = ((cb: FrameRequestCallback) => globalThis.setTimeout(() => cb(Date.now()), 16)) as any;
  window.cancelAnimationFrame = ((id: number) => globalThis.clearTimeout(id)) as any;
  window.HTMLElement = FakeHTMLElement as any;
  window.HTMLVideoElement = FakeHTMLVideoElement as any;
  window.HTMLIFrameElement = FakeHTMLIFrameElement as any;
  window.Element = FakeElement as any;
  window.Node = FakeNode as any;
  window.Document = FakeDocument as any;
  window.getComputedStyle = (() => ({ getPropertyValue: () => '' })) as any;

  (globalThis as any).window = window;
  (globalThis as any).document = document;
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: window.navigator,
    writable: true
  });
  (globalThis as any).HTMLElement = FakeHTMLElement;
  (globalThis as any).HTMLVideoElement = FakeHTMLVideoElement;
  (globalThis as any).HTMLIFrameElement = FakeHTMLIFrameElement;
  (globalThis as any).Element = FakeElement;
  (globalThis as any).Node = FakeNode;
  (globalThis as any).Document = FakeDocument;
  globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
  globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

  const container = document.createElement('div');
  document.body.appendChild(container);

  return {
    window,
    document,
    container,
    cleanup() {
      document.body.removeChild(container);
      (globalThis as any).window = previous.window;
      (globalThis as any).document = previous.document;
      if (previous.navigatorDescriptor) {
        Object.defineProperty(globalThis, 'navigator', previous.navigatorDescriptor);
      } else {
        delete (globalThis as any).navigator;
      }
      (globalThis as any).HTMLElement = previous.HTMLElement;
      (globalThis as any).HTMLVideoElement = previous.HTMLVideoElement;
      (globalThis as any).HTMLIFrameElement = previous.HTMLIFrameElement;
      (globalThis as any).Element = previous.Element;
      (globalThis as any).Node = previous.Node;
      (globalThis as any).Document = previous.Document;
      globalThis.requestAnimationFrame = previous.requestAnimationFrame;
      globalThis.cancelAnimationFrame = previous.cancelAnimationFrame;
      (globalThis as any).IS_REACT_ACT_ENVIRONMENT = previous.IS_REACT_ACT_ENVIRONMENT;
    }
  };
}

export function isFakeVideoElement(value: unknown): value is FakeHTMLVideoElement {
  return value instanceof FakeHTMLVideoElement;
}
