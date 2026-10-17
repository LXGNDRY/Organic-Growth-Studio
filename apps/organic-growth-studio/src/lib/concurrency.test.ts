import { expect, test } from 'vitest';
import { mapConcurrent } from './concurrency.ts';

test('mapConcurrent bounds active tasks and preserves input order', async () => {
  let active = 0;
  let peak = 0;
  const result = await mapConcurrent([5, 4, 3, 2, 1], 2, async (value) => {
    active++;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, value));
    active--;
    return value * 2;
  });

  expect(peak).toBe(2);
  expect(result).toEqual([10, 8, 6, 4, 2]);
});

test('mapConcurrent rejects invalid limits', async () => {
  await expect(mapConcurrent([1], 0, async (value) => value)).rejects.toBeInstanceOf(RangeError);
});
