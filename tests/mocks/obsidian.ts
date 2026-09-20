export class App {
  vault: any;
  workspace: any;
  fileManager: any;
  metadataCache: any;
  constructor() {}
}

export class Plugin {}

export class WorkspaceLeaf {
  view: any;
  app: any;
  constructor() {
    this.view = null;
    this.app = null;
  }
}

export class View {
  leaf: WorkspaceLeaf;
  app: any;
  containerEl: HTMLElement;

  constructor(leaf: WorkspaceLeaf) {
    this.leaf = leaf;
    this.app = (leaf as any)?.app ?? (leaf as any)?.view?.app ?? {};
    this.containerEl = document.createElement('div');
  }
}

export class FileView extends View {
  file: TFile | null;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
    this.file = null;
  }
}

export class TAbstractFile {
  path: string;
  name: string;
  parent: TFolder | null;

  constructor(path = '') {
    this.path = path;
    this.name = path.split('/').pop() || '';
    this.parent = null;
  }
}

export class TFile extends TAbstractFile {
  extension: string;
  basename: string;

  constructor(path = '') {
    super(path);
    const parts = this.name.split('.');
    this.extension = parts.length > 1 ? parts[parts.length - 1] || '' : '';
    this.basename = parts.length > 1 ? parts.slice(0, -1).join('.') : this.name;
  }
}

export class TFolder extends TAbstractFile {
  children: TAbstractFile[];

  constructor(path = '') {
    super(path);
    this.children = [];
  }
}

export class Notice {
  // Keep a signature close to Obsidian's constructor.
  constructor(_message: string, _timeout?: number) {}
}

export interface RequestUrlParam {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

export async function requestUrl(_params: RequestUrlParam): Promise<any> {
  throw new Error('requestUrl not mocked in tests');
}

export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+/g, '/');
}

export class Component {
  private cleanups: Array<() => void> = [];
  load(): void {}
  onload(): void {}
  unload(): void {
    this.cleanups.forEach((fn) => fn());
    this.cleanups = [];
  }
  onunload(): void {}
  register(cb: () => void): void {
    this.cleanups.push(cb);
  }
  addChild<T>(child: T): T {
    return child;
  }
}

export class MarkdownRenderChild extends Component {
  constructor(public containerEl: HTMLElement) {
    super();
  }
}

export const MarkdownRenderer = {
  /** Renders the source as plain text — enough for asserting on content. */
  render(_app: unknown, markdown: string, el: HTMLElement): Promise<void> {
    const p = el.ownerDocument.createElement('p');
    p.textContent = markdown;
    el.appendChild(p);
    return Promise.resolve();
  },
};

// Obsidian's YAML helpers are `yaml` under the hood, which is already a
// transitive dependency, so the mock can parse for real.
import { parse as parseYamlImpl, stringify as stringifyYamlImpl } from 'yaml';

export function parseYaml(source: string): unknown {
  return parseYamlImpl(source);
}

export function stringifyYaml(value: unknown): string {
  return stringifyYamlImpl(value);
}

export class Modal {
  app: unknown;
  contentEl: HTMLElement;
  modalEl: HTMLElement;
  titleEl: HTMLElement;

  constructor(app?: unknown) {
    this.app = app;
    this.contentEl = document.createElement('div');
    this.modalEl = document.createElement('div');
    this.titleEl = document.createElement('div');
  }

  open(): void {}
  close(): void {}
  onOpen(): void {}
  onClose(): void {}
}

export const Platform = {
  isMacOS: false,
  isWin: false,
  isLinux: false,
  isDesktop: true,
  isMobile: false,
};

export function setIcon(_parent: HTMLElement, _iconId: string): void {}
