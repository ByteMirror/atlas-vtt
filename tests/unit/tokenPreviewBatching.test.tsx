import React from 'react';
import { act, cleanup, render, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useTokenPreviews } from '../../src/app/packages/components/asset-manager/token-creator/useTokenPreviews';
import { TokenPreviewCard } from '../../src/app/packages/components/asset-manager/token-creator/TokenPreviewCard';
import type { TokenPreview } from '../../src/app/packages/components/asset-manager/token-creator/types';

const ringRenders = vi.hoisted(() => [] as string[]);
vi.mock('../../src/app/utils/imageOptimizer', () => ({
  // Each optimization takes a few milliseconds, so completions arrive one by one as in the plugin.
  optimizeImage: vi.fn((file: File) => new Promise(resolve => { setTimeout(() => resolve({ blob: new Blob([file.name]) }), 5); })),
  OPTIMIZATION_PRESETS: { token: {}, map: {} },
}));
vi.mock('../../src/app/packages/components/asset-manager/token-creator/TokenRingToggle', () => ({
  TokenRingToggle: ({ label }: { label: string }) => { ringRenders.push(label); return null; },
}));

let urls = 0;
beforeEach(() => {
  urls = 0;
  ringRenders.length = 0;
  URL.createObjectURL = vi.fn(() => `blob:url-${++urls}`);
  URL.revokeObjectURL = vi.fn();
  vi.stubGlobal('ResizeObserver', class { observe(): void {} unobserve(): void {} disconnect(): void {} });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('applies finished optimizations to the preview list in batches', async () => {
  vi.useFakeTimers();
  const seen: TokenPreview[][] = [];
  const { result } = renderHook(() => {
    const api = useTokenPreviews('token');
    if (seen[seen.length - 1] !== api.previews) seen.push(api.previews);
    return api;
  });
  const images = Array.from({ length: 40 }, (_, i) => ({ file: new File(['art'], `art-${i}.png`, { type: 'image/png' }) }));
  act(() => result.current.addImages(images));
  const afterAdd = seen.length;
  expect(result.current.previews).toHaveLength(40);

  // One act per completion, so React cannot fold separate list updates into one render.
  for (let step = 0; step < 100; step++) await act(async () => { await vi.advanceTimersByTimeAsync(5); });

  expect(seen.length - afterAdd).toBeGreaterThan(0);
  expect(seen.length - afterAdd).toBeLessThanOrEqual(3);
  expect(result.current.previews.every(p => !p.isOptimizing && p.optimizedFile)).toBe(true);
  // Each card's upload URL is revoked once its optimized URL takes over.
  expect(URL.revokeObjectURL).toHaveBeenCalledTimes(40);
});

it('does not re-render a card when a sibling preview changes', () => {
  const preview = (id: string, name: string): TokenPreview => ({
    id, name, file: null, previewUrl: `blob:${id}`, imageScale: 1, imagePosition: { x: 0, y: 0 }, isSelected: true, isOptimizing: false,
  });
  const grid = (previews: TokenPreview[]): React.JSX.Element => (
    <>{previews.map((p, index) => (
      <TokenPreviewCard key={p.id} preview={p} mode="token" index={index} onChange={() => {}} onToggleSelected={() => {}} onRemove={() => {}} />
    ))}</>
  );
  const goblin = preview('a', 'Goblin');
  const view = render(grid([goblin, preview('b', 'Orc')]));
  const count = (name: string): number => ringRenders.filter(label => label.endsWith(name)).length;
  const goblinRenders = count('Goblin');

  view.rerender(grid([goblin, preview('b', 'Orc chief')]));

  expect(count('Goblin')).toBe(goblinRenders);
  expect(count('Orc chief')).toBeGreaterThan(0);
});
