import { App, TFile, setIcon } from 'obsidian';

const RESULT_LIMIT = 30;

export interface PinNoteSearchOptions {
  app: App;
  /** A note (optionally `path#heading`) was chosen. */
  onPick: (notePath: string) => void;
  onCancel: () => void;
}

export interface PinNoteSearch {
  focus: () => void;
}

interface ResultEntry {
  element: HTMLElement;
  choose: () => void;
}

let listCount = 0;

/**
 * Search field, result list and key hints of the note pin dropdown. Typing
 * `note#` lists the note's headings. One result is always active (the first
 * after every change), so Enter picks it and the arrow keys move through the list.
 */
export function createPinNoteSearch(container: HTMLElement, options: PinNoteSearchOptions): PinNoteSearch {
  const { app } = options;
  const listId = `atlas-pin-results-${++listCount}`;

  const searchWrapper = container.createDiv({ cls: 'pin-search-wrapper' });
  setIcon(searchWrapper.createDiv({ cls: 'pin-search-icon' }), 'search');
  const search = searchWrapper.createEl('input', {
    cls: 'pin-search-input',
    attr: {
      type: 'text',
      placeholder: 'Search notes and maps...',
      role: 'combobox',
      'aria-label': 'Search notes and maps',
      'aria-controls': listId,
      'aria-expanded': 'true',
      'aria-autocomplete': 'list',
    },
  });

  const results = container.createDiv({ cls: 'pin-results', attr: { id: listId, role: 'listbox' } });

  const footer = container.createDiv({ cls: 'pin-footer' });
  const footerHints: Array<[key: string, label: string]> = [['↑↓', 'navigate'], ['Enter', 'select'], ['Esc', 'cancel']];
  footerHints.forEach(([key, label]) => {
    const hint = footer.createSpan({ cls: 'pin-footer-hint' });
    hint.createEl('kbd', { text: key });
    hint.appendText(label);
  });

  const files = app.vault.getAllLoadedFiles().filter((f): f is TFile =>
    f instanceof TFile && (f.extension === 'md' || f.extension === 'atlasmap')
  );

  let entries: ResultEntry[] = [];
  let activeIndex = -1;

  const setActive = (index: number): void => {
    entries[activeIndex]?.element.removeClass('is-active');
    entries[activeIndex]?.element.setAttribute('aria-selected', 'false');
    activeIndex = index;
    const active = entries[index];
    if (!active) {
      search.removeAttribute('aria-activedescendant');
      return;
    }
    active.element.addClass('is-active');
    active.element.setAttribute('aria-selected', 'true');
    search.setAttribute('aria-activedescendant', active.element.id);
    active.element.scrollIntoView({ block: 'nearest' });
  };

  const addEntry = (choose: () => void): HTMLElement => {
    const index = entries.length;
    const element = results.createDiv({
      cls: 'pin-result-item',
      attr: { id: `${listId}-${index}`, role: 'option', 'aria-selected': 'false' },
    });
    element.onclick = choose;
    element.onmousemove = () => {
      if (activeIndex !== index) setActive(index);
    };
    entries.push({ element, choose });
    return element;
  };

  const hasHeadings = (file: TFile): boolean => (app.metadataCache.getFileCache(file)?.headings?.length ?? 0) > 0;

  const showHeadings = (file: TFile): void => {
    search.value = `${file.basename}#`;
    search.focus();
    search.setSelectionRange(search.value.length, search.value.length);
    render();
  };

  const addWholeNoteEntry = (file: TFile, text: string): void => {
    const item = addEntry(() => options.onPick(file.path));
    item.addClass('pin-header-item');
    setIcon(item.createDiv({ cls: 'pin-result-icon' }), 'file');
    item.createSpan({ cls: 'pin-result-name', text });
    item.createSpan({ cls: 'pin-header-file', text: file.basename });
  };

  const findHeadingTarget = (fileNamePart: string): TFile | null => {
    const needle = fileNamePart.toLowerCase();
    const exact = files.find((f) => f.basename.toLowerCase() === needle);
    if (exact) return exact;
    const matches = files.filter((f) => f.basename.toLowerCase().includes(needle));
    return matches.length === 1 ? matches[0] ?? null : null;
  };

  const renderHeadings = (fileNamePart: string, headingQuery: string): void => {
    const targetFile = findHeadingTarget(fileNamePart);
    if (!targetFile) {
      results.createDiv({ cls: 'pin-empty-state', text: 'File not found' });
      return;
    }

    const headings = app.metadataCache.getFileCache(targetFile)?.headings ?? [];
    if (headings.length === 0) {
      addWholeNoteEntry(targetFile, 'Pin to entire note');
      return;
    }

    if (headingQuery === '') addWholeNoteEntry(targetFile, 'Entire note');

    const matching = headings.filter((h) => h.heading.toLowerCase().includes(headingQuery));
    if (matching.length === 0) {
      results.createDiv({ cls: 'pin-empty-state', text: 'No matching headers found' });
      return;
    }
    matching.forEach((header) => {
      const item = addEntry(() => options.onPick(`${targetFile.path}#${header.heading}`));
      item.addClass('pin-header-item');
      item.createSpan({ cls: 'pin-header-level', text: `H${header.level}` });
      item.createSpan({ cls: 'pin-result-name', text: header.heading });
      item.createSpan({ cls: 'pin-header-file', text: targetFile.basename });
    });
  };

  const renderFiles = (query: string): void => {
    const needle = query.toLowerCase();
    const matching = files.filter((f) => f.basename.toLowerCase().includes(needle));
    if (matching.length === 0) {
      results.createDiv({ cls: 'pin-empty-state', text: 'No notes found' });
      return;
    }
    matching.slice(0, RESULT_LIMIT).forEach((file) => {
      const isMap = file.extension === 'atlasmap';
      const item = addEntry(() => {
        if (hasHeadings(file)) showHeadings(file);
        else options.onPick(file.path);
      });
      setIcon(item.createDiv({ cls: 'pin-result-icon' }), isMap ? 'map' : 'file');
      item.createSpan({ cls: 'pin-result-name', text: file.basename });
      if (isMap) item.createSpan({ cls: 'pin-result-badge is-map', text: 'Map' });
    });
  };

  function render(): void {
    results.empty();
    entries = [];
    activeIndex = -1;

    const query = search.value;
    const hashIndex = query.indexOf('#');
    if (hashIndex === -1) renderFiles(query);
    else renderHeadings(query.substring(0, hashIndex), query.substring(hashIndex + 1).toLowerCase());

    setActive(entries.length > 0 ? 0 : -1);
  }

  search.addEventListener('input', render);
  search.addEventListener('keydown', (e) => {
    // Keys typed here belong to the search, not to the map's hotkeys
    e.stopPropagation();
    if (e.isComposing) return;
    if (e.key === 'Escape') {
      options.onCancel();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (entries.length === 0) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((activeIndex + step + entries.length) % entries.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      entries[activeIndex]?.choose();
    }
  });

  render();

  return { focus: () => search.focus() };
}
