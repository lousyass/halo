/**
 * Pagination helper to prevent silent truncation by Supabase's 1000-row limit.
 */

export interface PaginatedQueryResponse<T> {
  data: T[] | null;
  error: any;
}

export type RangeQueryFn<T> = (
  from: number,
  to: number
) => Promise<PaginatedQueryResponse<T>>;

export interface FetchPaginatedOptions {
  pageSize?: number;
  maxPages?: number;
}

/**
 * Executes a paginated query in chunks of pageSize (default 1000) until fewer than
 * pageSize rows are returned.
 */
export async function fetchPaginated<T>(
  queryFn: RangeQueryFn<T>,
  options?: FetchPaginatedOptions
): Promise<T[]> {
  const pageSize = options?.pageSize ?? 1000;
  const maxPages = options?.maxPages ?? 100; // Safeguard against runaway loops
  const allRows: T[] = [];

  let pageIndex = 0;
  while (pageIndex < maxPages) {
    const from = pageIndex * pageSize;
    const to = from + pageSize - 1;

    const { data, error } = await queryFn(from, to);

    if (error) {
      throw error;
    }

    if (!data || data.length === 0) {
      break;
    }

    allRows.push(...data);

    if (data.length < pageSize) {
      break;
    }

    pageIndex++;
  }

  return allRows;
}
