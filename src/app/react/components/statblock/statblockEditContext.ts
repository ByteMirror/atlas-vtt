import { createContext, useContext } from 'react';

export interface StatblockEditApi {
  /** Whether values in this statblock can be edited in place. */
  editable: boolean;
  /** Writes a value back to the note. `path` addresses the frontmatter key. */
  commit(path: Array<string | number>, value: string): void;
}

const noop: StatblockEditApi = { editable: false, commit: () => undefined };

export const StatblockEditContext = createContext<StatblockEditApi>(noop);

export function useStatblockEdit(): StatblockEditApi {
  return useContext(StatblockEditContext);
}
