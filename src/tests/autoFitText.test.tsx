// @vitest-environment jsdom

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import { AutoFitText } from '../app/packages/components/shared/AutoFitText';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function mockMeasurements({
  containerWidth,
  textWidth,
}: {
  containerWidth: number;
  textWidth: number;
}): void {
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });

  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function offsetWidthMock(this: HTMLElement) {
    return this.classList.contains('atlas-auto-fit-text') ? containerWidth : 0;
  });

  vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(function scrollWidthMock(this: HTMLElement) {
    return this.classList.contains('atlas-auto-fit-text-inner') ? textWidth : 0;
  });
}

describe('AutoFitText', () => {
  it('shrinks the font size when the content is wider than its container', async () => {
    mockMeasurements({ containerWidth: 60, textWidth: 120 });

    const { container } = render(
      <AutoFitText minFontSize={12} maxFontSize={24}>
        123456789
      </AutoFitText>
    );

    await waitFor(() => {
      const fittedText = container.querySelector('.atlas-auto-fit-text');
      expect(fittedText).not.toBeNull();
      expect((fittedText as HTMLElement).style.fontSize).toBe('12px');
    });
  });

  it('keeps the maximum font size when the content already fits', async () => {
    mockMeasurements({ containerWidth: 120, textWidth: 80 });

    const { container } = render(
      <AutoFitText minFontSize={12} maxFontSize={24}>
        88
      </AutoFitText>
    );

    await waitFor(() => {
      const fittedText = container.querySelector('.atlas-auto-fit-text');
      expect(fittedText).not.toBeNull();
      expect((fittedText as HTMLElement).style.fontSize).toBe('24px');
    });
  });
});
