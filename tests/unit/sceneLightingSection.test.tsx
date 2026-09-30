import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SceneLightingSection } from '../../src/app/packages/components/toolbar/SceneLightingSection';
import { DEFAULT_SCENE_LIGHTING } from '../../src/app/types/lightingTypes';

afterEach(cleanup);

function renderSection(overrides: Partial<React.ComponentProps<typeof SceneLightingSection>> = {}): React.ComponentProps<typeof SceneLightingSection> {
  const props = {
    lighting: { ...DEFAULT_SCENE_LIGHTING, enabled: true },
    onChange: vi.fn(),
    preview: false,
    onPreviewChange: vi.fn(),
    onResetExplored: vi.fn(),
    ...overrides,
  };
  render(<SceneLightingSection {...props} />);
  return props;
}

describe('SceneLightingSection', () => {
  it('switches dynamic lighting on', () => {
    const props = renderSection({ lighting: DEFAULT_SCENE_LIGHTING });
    fireEvent.click(screen.getByText('Dynamic lighting').parentElement!.querySelector('.atlas-toggle')!);
    expect(props.onChange).toHaveBeenCalledWith({ enabled: true });
  });

  it('sets the ambient light from a time of day', () => {
    const props = renderSection();
    fireEvent.click(screen.getByRole('radio', { name: 'Night' }));
    expect(props.onChange).toHaveBeenCalledWith({ ambient: 0.15 });
  });

  it('hides the scene controls while lighting is off', () => {
    renderSection({ lighting: DEFAULT_SCENE_LIGHTING });
    expect(screen.queryByRole('radio', { name: 'Night' })).toBeNull();
    expect(screen.queryByText('Forget explored areas')).toBeNull();
  });

  it('forgets explored areas and previews the players view', () => {
    const props = renderSection();
    fireEvent.click(screen.getByText('Forget explored areas'));
    expect(props.onResetExplored).toHaveBeenCalled();
    fireEvent.click(screen.getByText('Preview player view').parentElement!.querySelector('.atlas-toggle')!);
    expect(props.onPreviewChange).toHaveBeenCalledWith(true);
  });
});
