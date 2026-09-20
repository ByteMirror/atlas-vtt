export interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function extractConnectedComponentRects(
  mask: Uint8Array,
  width: number,
  height: number,
  seedX: number,
  seedY: number,
): PixelRect[] {
  if (width <= 0 || height <= 0) {
    return [];
  }
  if (seedX < 0 || seedY < 0 || seedX >= width || seedY >= height) {
    return [];
  }

  const seedIndex = seedY * width + seedX;
  if (mask[seedIndex] !== 1) {
    return [];
  }

  const visited = new Uint8Array(width * height);
  const stack: number[] = [seedIndex];

  while (stack.length > 0) {
    const index = stack.pop()!;
    if (visited[index] === 1 || mask[index] !== 1) {
      continue;
    }
    visited[index] = 1;

    const x = index % width;
    const y = Math.floor(index / width);

    if (x > 0) stack.push(index - 1);
    if (x < width - 1) stack.push(index + 1);
    if (y > 0) stack.push(index - width);
    if (y < height - 1) stack.push(index + width);
  }

  const rects: PixelRect[] = [];
  let activeRows = new Map<string, { xStart: number; xEnd: number; yStart: number; yEnd: number }>();

  for (let y = 0; y < height; y++) {
    const runs: Array<{ xStart: number; xEnd: number }> = [];
    let x = 0;
    while (x < width) {
      const idx = y * width + x;
      if (visited[idx] !== 1) {
        x += 1;
        continue;
      }
      const xStart = x;
      while (x < width && visited[y * width + x] === 1) {
        x += 1;
      }
      runs.push({ xStart, xEnd: x - 1 });
    }

    const nextActiveRows = new Map<string, { xStart: number; xEnd: number; yStart: number; yEnd: number }>();
    for (const run of runs) {
      const key = `${run.xStart}:${run.xEnd}`;
      const prior = activeRows.get(key);
      if (prior && prior.yEnd === y - 1) {
        nextActiveRows.set(key, {
          xStart: prior.xStart,
          xEnd: prior.xEnd,
          yStart: prior.yStart,
          yEnd: y,
        });
      } else {
        nextActiveRows.set(key, {
          xStart: run.xStart,
          xEnd: run.xEnd,
          yStart: y,
          yEnd: y,
        });
      }
    }

    for (const [key, rect] of activeRows.entries()) {
      if (!nextActiveRows.has(key)) {
        rects.push({
          x: rect.xStart,
          y: rect.yStart,
          width: rect.xEnd - rect.xStart + 1,
          height: rect.yEnd - rect.yStart + 1,
        });
      }
    }
    activeRows = nextActiveRows;
  }

  for (const rect of activeRows.values()) {
    rects.push({
      x: rect.xStart,
      y: rect.yStart,
      width: rect.xEnd - rect.xStart + 1,
      height: rect.yEnd - rect.yStart + 1,
    });
  }

  return rects;
}

