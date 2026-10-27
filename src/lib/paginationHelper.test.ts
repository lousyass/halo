import { describe, it, expect } from 'vitest';
import { fetchPaginated, RangeQueryFn } from './paginationHelper';

describe('paginationHelper', () => {
  it('returns all rows correctly when total exceeds 1000 (e.g. 2450 rows)', async () => {
    // Generate 2450 mock items
    const totalItems = 2450;
    const mockDb = Array.from({ length: totalItems }, (_, i) => ({
      id: `item-${i + 1}`,
      num: i + 1,
    }));

    // Mock query function mimicking Supabase .range(from, to)
    const mockQuery: RangeQueryFn<{ id: string; num: number }> = async (
      from,
      to
    ) => {
      // Supabase range is inclusive [from, to]
      const sliced = mockDb.slice(from, to + 1);
      return {
        data: sliced,
        error: null,
      };
    };

    const results = await fetchPaginated(mockQuery, { pageSize: 1000 });

    expect(results.length).toBe(2450);
    expect(results[0].id).toBe('item-1');
    expect(results[999].id).toBe('item-1000');
    expect(results[1000].id).toBe('item-1001');
    expect(results[2449].id).toBe('item-2450');
  });

  it('handles empty results and small results under 1000', async () => {
    const emptyQuery: RangeQueryFn<any> = async () => ({
      data: [],
      error: null,
    });
    const emptyRes = await fetchPaginated(emptyQuery);
    expect(emptyRes).toEqual([]);

    const smallQuery: RangeQueryFn<number> = async (from, to) => ({
      data: [1, 2, 3].slice(from, to + 1),
      error: null,
    });
    const smallRes = await fetchPaginated(smallQuery);
    expect(smallRes).toEqual([1, 2, 3]);
  });

  it('throws when the query returns an error', async () => {
    const errorQuery: RangeQueryFn<any> = async () => ({
      data: null,
      error: new Error('Network failure'),
    });

    await expect(fetchPaginated(errorQuery)).rejects.toThrow('Network failure');
  });
});
