import { describe, expect, it } from 'vitest';
import { forEachLimited, onceByKey } from '../../src/shared/pool.ts';

describe('forEachLimited y onceByKey', () => {
  it('no pasa del límite, procesa todo y, si algo falla, no empieza más y lanza el error', async () => {
    let running = 0;
    let peak = 0;
    const done: number[] = [];
    await forEachLimited([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 2));
      done.push(n);
      running--;
    });
    expect(peak).toBe(3);
    expect(done.sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);

    const started: number[] = [];
    await expect(
      forEachLimited([1, 2, 3, 4, 5, 6], 2, async (n) => {
        started.push(n);
        await new Promise((r) => setTimeout(r, 2));
        if (n === 2) throw new Error('falla 2');
      }),
    ).rejects.toThrow('falla 2');
    expect(started.length).toBeLessThan(6);
  });

  it('comparte el trabajo en curso por clave y olvida los fallos', async () => {
    const once = onceByKey<number>();
    let calls = 0;
    const task = async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 2));
      return 7;
    };
    expect(await Promise.all([once('a', task), once('a', task), once('b', task)])).toEqual([
      7, 7, 7,
    ]);
    expect(calls).toBe(2);
    await expect(once('c', () => Promise.reject(new Error('no')))).rejects.toThrow('no');
    expect(await once('c', task)).toBe(7);
  });
});
