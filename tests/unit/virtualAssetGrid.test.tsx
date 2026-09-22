import React, { useState } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';

import { VirtualAssetGrid } from '../../src/app/packages/components/asset-manager/components/VirtualAssetGrid';
import type { AnyAsset } from '../../src/app/packages/components/asset-manager/types';

const TOTAL = 100;
const assets: AnyAsset[] = Array.from({ length: TOTAL }, (_, index) => ({
  id: `token-${index}`, name: `Token ${index}`, type: 'tokens', imageUrl: '', thumbnailUrl: '',
}));

function Harness(): React.JSX.Element {
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null);
  return (
    <div ref={setScrollElement} data-testid="scroll">
      <VirtualAssetGrid
        assets={assets}
        scrollElement={scrollElement}
        renderCard={(asset) => <div key={asset.id} role="listitem">{asset.name}</div>}
        onBackgroundClick={() => {}}
      />
    </div>
  );
}

const VIEWPORT = { width: 800, height: 600 };
const rect = (): DOMRect => ({
  ...VIEWPORT, top: 0, left: 0, right: VIEWPORT.width, bottom: VIEWPORT.height, x: 0, y: 0, toJSON: () => ({}),
}) as DOMRect;

// jsdom has no layout: give every element the viewport's box, so the scroll
// container shows one row and each row is as tall as the viewport.
const layoutStubs: Array<[object, string, PropertyDescriptor]> = [
  [Element.prototype, 'getBoundingClientRect', { configurable: true, value: rect }],
  [Element.prototype, 'clientWidth', { configurable: true, get: () => VIEWPORT.width }],
  [HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => VIEWPORT.width }],
  [HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => VIEWPORT.height }],
];
const originals = layoutStubs.map(([target, name]) => [target, name, Object.getOwnPropertyDescriptor(target, name)] as const);

beforeAll(() => {
  for (const [target, name, descriptor] of layoutStubs) Object.defineProperty(target, name, descriptor);
});

afterAll(() => {
  for (const [target, name, descriptor] of originals) {
    if (descriptor) Object.defineProperty(target, name, descriptor);
    else Reflect.deleteProperty(target, name);
  }
});

afterEach(cleanup);

it('mounts only the rows around the viewport and lays each out with the computed column count', async () => {
  render(<Harness />);

  await screen.findByText('Token 0');
  const rendered = screen.getAllByRole('listitem');
  const columns = Math.floor(VIEWPORT.width / 132);

  expect(rendered.length % columns).toBe(0);
  expect(rendered.length).toBeLessThan(TOTAL);
  expect(screen.queryByText(`Token ${TOTAL - 1}`)).toBeNull();
  const row = rendered[0]!.parentElement!;
  expect(row.style.getPropertyValue('--atlas-grid-columns')).toBe(String(columns));
  expect(row.children).toHaveLength(columns);
});
