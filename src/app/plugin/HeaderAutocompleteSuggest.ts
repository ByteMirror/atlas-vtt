import {
  Editor,
  EditorPosition,
  EditorSuggest,
  EditorSuggestContext,
  EditorSuggestTriggerInfo,
  TFile,
} from 'obsidian';

interface HeaderSuggestion {
  heading: string;
  level: number;
  linkText: string;
}

/** Suggests headings while typing `[[note#` so links can target a section. */
export class HeaderAutocompleteSuggest extends EditorSuggest<HeaderSuggestion> {
  onTrigger(cursor: EditorPosition, editor: Editor): EditorSuggestTriggerInfo | null {
    const beforeCursor = editor.getLine(cursor.line).substring(0, cursor.ch);
    const linkMatch = beforeCursor.match(/\[\[([^\]#]+)#([^\]]*)$/);
    if (!linkMatch) return null;

    const [fullMatch, filePath, query] = linkMatch;
    return {
      start: { line: cursor.line, ch: beforeCursor.lastIndexOf(fullMatch) },
      end: cursor,
      query: `${filePath}#${query}`,
    };
  }

  getSuggestions(context: EditorSuggestContext): HeaderSuggestion[] {
    const parts = context.query.split('#');
    if (parts.length !== 2) return [];

    const [filePath, headerQuery] = parts;
    if (!filePath || !headerQuery) return [];

    const targetFile = this.resolveNote(filePath);
    if (!targetFile) return [];

    const headings = this.app.metadataCache.getFileCache(targetFile)?.headings;
    if (!headings) return [];

    const lowerQuery = headerQuery.toLowerCase();
    return headings
      .filter((h) => h.heading.toLowerCase().includes(lowerQuery))
      .map((h) => ({
        heading: h.heading,
        level: h.level,
        linkText: `[[${targetFile.path}#${h.heading}]]`,
      }));
  }

  renderSuggestion(suggestion: HeaderSuggestion, el: HTMLElement): void {
    el.addClass('atlas-header-suggestion');
    el.createSpan({ cls: 'atlas-header-level', text: `H${suggestion.level}` });
    el.createSpan({ cls: 'atlas-header-text', text: suggestion.heading });
  }

  selectSuggestion(suggestion: HeaderSuggestion): void {
    if (!this.context) return;

    const { editor, start, end } = this.context;
    editor.replaceRange(suggestion.linkText, start, end);
    editor.setCursor({ line: start.line, ch: start.ch + suggestion.linkText.length });
  }

  private resolveNote(filePath: string): TFile | null {
    return this.app.vault.getFileByPath(filePath) ?? this.app.vault.getFileByPath(`${filePath}.md`);
  }
}
