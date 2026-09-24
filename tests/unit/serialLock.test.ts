import { expect, it } from 'vitest';
import { SerialLock } from '../../src/app/utils/serialLock';

it('runs tasks one after another, also after one failed', async () => {
  const lock = new SerialLock();
  const order: string[] = [];
  let finishFirst = (): void => {};
  const first = lock.run(() => new Promise<void>((resolve) => { finishFirst = resolve; }).then(() => { order.push('first'); }));
  const failing = lock.run(async () => { order.push('failing'); throw new Error('boom'); });
  const last = lock.run(async () => { order.push('last'); return 3; });

  await Promise.resolve();
  expect(order).toEqual([]);
  finishFirst();
  await first;
  await expect(failing).rejects.toThrow('boom');
  expect(await last).toBe(3);
  expect(order).toEqual(['first', 'failing', 'last']);
  await lock.idle();
});
