import { vi } from 'vitest';

type ContextState = Record<string | symbol, unknown>;

const gradient = { addColorStop: (): void => undefined };

const factories: Record<string, (...args: never[]) => unknown> = {
  createLinearGradient: () => gradient,
  createRadialGradient: () => gradient,
  createPattern: () => null,
  measureText: (text: string) => ({
    width: text.length * 8,
    actualBoundingBoxAscent: 8,
    actualBoundingBoxDescent: 2,
    actualBoundingBoxLeft: 0,
    actualBoundingBoxRight: text.length * 8,
  }),
  getImageData: (_x: number, _y: number, width: number, height: number) => ({
    width,
    height,
    data: new Uint8ClampedArray(width * height * 4),
  }),
};

/** A 2D context that accepts every drawing call and draws nothing. */
function createNoopContext2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const state: ContextState = { canvas };
  return new Proxy(state, {
    get: (target, prop) => {
      if (prop in target) return target[prop];
      return (typeof prop === 'string' && factories[prop]) || ((): void => undefined);
    },
  }) as unknown as CanvasRenderingContext2D;
}

/** Stands in for a decoded bitmap; jsdom has no image decoder. */
class FakeImageBitmap {
  readonly width = 64;
  readonly height = 64;
  close(): void {}
}

/**
 * jsdom ships without canvas or image decoding. Gives every canvas a no-op 2D
 * context and makes image decoding succeed instantly, so code that paints
 * textures can run. Returns a function that undoes it.
 */
export function stubJsdomGraphics(): () => void {
  const contexts = new WeakMap<HTMLCanvasElement, CanvasRenderingContext2D>();
  const getContextSpy = vi
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockImplementation(function (this: HTMLCanvasElement, contextId: string) {
      if (contextId !== '2d') return null;
      let context = contexts.get(this);
      if (!context) {
        context = createNoopContext2d(this);
        contexts.set(this, context);
      }
      return context;
    } as HTMLCanvasElement['getContext']);

  const hadDecode = 'decode' in HTMLImageElement.prototype;
  if (!hadDecode) HTMLImageElement.prototype.decode = async (): Promise<void> => undefined;

  vi.stubGlobal('ImageBitmap', FakeImageBitmap);
  vi.stubGlobal('createImageBitmap', vi.fn(async () => new FakeImageBitmap()));

  return () => {
    getContextSpy.mockRestore();
    if (!hadDecode) delete (HTMLImageElement.prototype as Partial<HTMLImageElement>).decode;
    vi.unstubAllGlobals();
  };
}
