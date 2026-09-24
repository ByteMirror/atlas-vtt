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

export class ItemView extends View {
  contentEl: HTMLElement;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
    this.contentEl = document.createElement('div');
  }
}

export class FileView extends ItemView {
  file: TFile | null;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
    this.file = null;
  }
}

/**
 * A markdown note view with the state pinned previews save: mode, ephemeral
 * state (cursor) and scroll. Like Obsidian, it only takes a scroll over once mounted.
 */
export class MarkdownView extends FileView {
  private mode: 'source' | 'preview' = 'source';
  private eState: Record<string, unknown> = {};
  private scrollLine = 0;
  currentMode = {
    getScroll: (): number => this.scrollLine,
    applyScroll: (scroll: number): void => {
      this.scrollLine = scroll;
    },
  };

  getMode(): 'source' | 'preview' {
    return this.mode;
  }

  setMode(mode: 'source' | 'preview'): void {
    this.mode = mode;
  }

  getEphemeralState(): Record<string, unknown> {
    return { ...this.eState };
  }

  setEphemeralState(state: Record<string, unknown>): void {
    const rest = { ...state };
    delete rest.scroll;
    this.eState = rest;
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

  setTitle(title: string): this { this.titleEl.textContent = title; return this; }
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

export const apiVersion = '1.13.1';

/** The subset of Obsidian's `Setting` components the tests drive, on real DOM elements. Grow it per test need. */
abstract class ValueComponent<T> {
  protected changed: ((value: T) => void) | undefined;
  onChange(callback: (value: T) => void): this {
    this.changed = callback;
    return this;
  }
  setDisabled(_disabled: boolean): this { return this; }
}

class InputBacked<E extends HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement> extends ValueComponent<string> {
  constructor(public inputEl: E) {
    super();
    inputEl.addEventListener('input', () => this.changed?.(inputEl.value));
    inputEl.addEventListener('change', () => this.changed?.(inputEl.value));
  }
  setValue(value: string): this { this.inputEl.value = value; return this; }
  setPlaceholder(text: string): this { this.inputEl.setAttribute('placeholder', text); return this; }
}

export class TextComponent extends InputBacked<HTMLInputElement> {}
export class TextAreaComponent extends InputBacked<HTMLTextAreaElement> {}

export class DropdownComponent extends InputBacked<HTMLSelectElement> {
  addOptions(options: Record<string, string>): this {
    for (const [value, display] of Object.entries(options)) {
      const option = this.inputEl.ownerDocument.createElement('option');
      option.value = value;
      option.textContent = display;
      this.inputEl.appendChild(option);
    }
    return this;
  }
}

export class ToggleComponent extends ValueComponent<boolean> {
  private value = false;
  constructor(public toggleEl: HTMLElement) { super(); }
  setValue(value: boolean): this {
    if (this.value !== value) { this.value = value; this.changed?.(value); }
    this.toggleEl.classList.toggle('is-enabled', value);
    return this;
  }
}

export class ButtonComponent {
  constructor(public buttonEl: HTMLButtonElement) {}
  setButtonText(text: string): this { this.buttonEl.textContent = text; return this; }
  setCta(): this { this.buttonEl.classList.add('mod-cta'); return this; }
  onClick(callback: () => unknown): this { this.buttonEl.addEventListener('click', () => void callback()); return this; }
}

export class Setting {
  settingEl: HTMLElement;
  nameEl: HTMLElement;
  descEl: HTMLElement;
  controlEl: HTMLElement;

  constructor(containerEl: HTMLElement) {
    const doc = containerEl.ownerDocument;
    this.settingEl = doc.createElement('div');
    this.settingEl.className = 'setting-item';
    const info = doc.createElement('div');
    info.className = 'setting-item-info';
    this.nameEl = doc.createElement('div');
    this.nameEl.className = 'setting-item-name';
    this.descEl = doc.createElement('div');
    this.descEl.className = 'setting-item-description';
    info.append(this.nameEl, this.descEl);
    this.controlEl = doc.createElement('div');
    this.controlEl.className = 'setting-item-control';
    this.settingEl.append(info, this.controlEl);
    containerEl.appendChild(this.settingEl);
  }

  setName(name: string): this { this.nameEl.textContent = name; return this; }
  setDesc(desc: string): this { this.descEl.textContent = desc; return this; }
  setClass(cls: string): this { this.settingEl.classList.add(cls); return this; }

  private create<T extends HTMLElement>(tag: string): T {
    const el = this.settingEl.ownerDocument.createElement(tag) as T;
    this.controlEl.appendChild(el);
    return el;
  }

  addText(callback: (component: TextComponent) => void): this { callback(new TextComponent(this.create('input'))); return this; }
  addTextArea(callback: (component: TextAreaComponent) => void): this { callback(new TextAreaComponent(this.create('textarea'))); return this; }
  addDropdown(callback: (component: DropdownComponent) => void): this { callback(new DropdownComponent(this.create('select'))); return this; }
  addToggle(callback: (component: ToggleComponent) => void): this { callback(new ToggleComponent(this.create('div'))); return this; }
  addButton(callback: (component: ButtonComponent) => void): this { callback(new ButtonComponent(this.create('button'))); return this; }
}

export function setIcon(_parent: HTMLElement, _iconId: string): void {}
