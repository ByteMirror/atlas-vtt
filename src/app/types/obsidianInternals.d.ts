import 'obsidian';
import type { EventRef, Menu, Plugin, TAbstractFile, View } from 'obsidian';

/**
 * Obsidian members that exist at runtime but are missing from the public
 * typings. Declared once here so call sites stay type-checked instead of
 * casting to `any`. Anything listed is undocumented API: guard optional
 * members before use.
 */
declare module 'obsidian' {
  interface App {
    openWithDefaultApp(path: string): void;
    showInFolder(path: string): void;
    /** Community plugin registry; read only for diagnostics in issue reports. */
    plugins?: {
      plugins: Record<string, Plugin>;
      enabledPlugins: Set<string>;
    };
    /** Active theme name, empty for the default theme. */
    customCss?: {
      theme?: string;
    };
  }

  interface FileManager {
    /** Opens Obsidian's rename prompt for `file`. */
    promptForFileRename?(file: TAbstractFile): void;
  }

  /** View of the core file explorer (`file-explorer` leaves); check for it at runtime before use. */
  interface FileExplorerView extends View {
    revealInFolder(file: TAbstractFile): void;
  }

  interface WorkspaceLeaf {
    containerEl: HTMLElement;
    tabHeaderEl?: HTMLElement;
  }

  interface Workspace {
    /** A detached leaf meant for popover-style views; not part of any workspace split. */
    getLeafPopover?(): WorkspaceLeaf | undefined;
    /** Renders `leaf` into `container`, turning it into a popover view for the leaf. */
    openPopover?(
      leaf: WorkspaceLeaf,
      container: HTMLElement | ShadowRoot,
      options?: { focus?: boolean },
    ): void;

    on(
      name: 'link-menu',
      callback: (menu: Menu, linktext: string, sourcePath: string) => unknown,
      ctx?: unknown,
    ): EventRef;
  }
}
