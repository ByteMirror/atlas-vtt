import React from 'react';
import { cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Sidebar } from '../../src/app/packages/components/asset-manager/components/Sidebar';
import { useFollowSelectedCollection } from '../../src/app/packages/components/asset-manager/hooks/useFollowSelectedCollection';
import type { CollectionOption } from '../../src/app/packages/components/asset-manager/types';

afterEach(cleanup);

const collections: CollectionOption[] = [
  { id: 'default', uid: 'u-default', name: 'Default' },
  { id: 'winter-camp', uid: 'u-winter', name: 'Winter Camp' },
];

it('lists collections by name and selects them by id', () => {
  const onSelectCollection = vi.fn();
  render(
    <Sidebar
      selectedTagIds={[]} onSelectTag={() => {}} tags={[]} assets={[]}
      collections={collections} selectedCollection="default" onSelectCollection={onSelectCollection}
      onManageTags={() => {}} isCollapsed={false} onToggleCollapse={() => {}}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Default' }));
  fireEvent.click(screen.getByRole('button', { name: 'Winter Camp' }));
  expect(onSelectCollection).toHaveBeenCalledWith('winter-camp');
});

it('follows the selected collection to its new id and falls back to the default one once it is gone', () => {
  const select = vi.fn();
  const { rerender } = renderHook(
    ({ list, selected }) => useFollowSelectedCollection(list, selected, select),
    { initialProps: { list: collections, selected: 'winter-camp' } },
  );

  rerender({ list: [collections[0]!, { id: 'Frozen Keep', uid: 'u-winter', name: 'Frozen Keep' }], selected: 'winter-camp' });
  expect(select).toHaveBeenLastCalledWith('Frozen Keep');

  rerender({ list: [collections[0]!], selected: 'Frozen Keep' });
  expect(select).toHaveBeenLastCalledWith('default');
});

it('shows a renamed default collection under its new name and still selects it by id', () => {
  const onSelectCollection = vi.fn();
  render(
    <Sidebar
      selectedTagIds={[]} onSelectTag={() => {}} tags={[]} assets={[]}
      collections={[{ id: 'default', uid: 'u-default', name: '5e' }]} selectedCollection={null} onSelectCollection={onSelectCollection}
      onManageTags={() => {}} isCollapsed={false} onToggleCollapse={() => {}}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'All Collections' }));
  fireEvent.click(screen.getByRole('button', { name: '5e' }));
  expect(onSelectCollection).toHaveBeenCalledWith('default');
});
