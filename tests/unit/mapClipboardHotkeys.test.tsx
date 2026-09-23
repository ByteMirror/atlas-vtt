import React from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AtlasUIContext } from '../../src/app/react/root/AtlasUIContext';
import { useMapHotkeys } from '../../src/app/keyboard/useMapHotkeys';

afterEach(() => { cleanup(); document.getSelection()?.removeAllRanges(); document.body.innerHTML = ''; });

it('leaves Cmd/Ctrl+C to the browser while page text is selected', () => {
  const app = { vault: { adapter: { exists: async () => true, write: async () => {} } } } as never;
  const copy = vi.fn();
  const paste = vi.fn();
  function View(): React.JSX.Element {
    useMapHotkeys({ copy, paste }, 'map');
    return <div data-view-id="map"><p id="log">Rolled 17</p></div>;
  }
  render(<AtlasUIContext.Provider value={{ app } as never}>
    <div className="workspace-leaf mod-active"><View /></div>
  </AtlasUIContext.Provider>);

  expect(fireEvent.keyDown(window, { key: 'c', metaKey: true })).toBe(false);
  expect(copy).toHaveBeenCalledTimes(1);

  const range = document.createRange();
  range.selectNodeContents(document.getElementById('log')!);
  document.getSelection()!.addRange(range);

  expect(fireEvent.keyDown(window, { key: 'c', metaKey: true })).toBe(true);
  expect(copy).toHaveBeenCalledTimes(1);
  fireEvent.keyDown(window, { key: 'v', ctrlKey: true });
  expect(paste).toHaveBeenCalledTimes(1);
});
