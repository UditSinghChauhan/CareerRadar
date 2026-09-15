export interface PaginationParams {
  page: number;
  limit: number;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * The largest page any endpoint will serve.
 *
 * Phase 7 raised this from 100. The old cap was the most visible limitation in
 * the app: the Jobs page asked for 200 rows, silently got 100, and then
 * paginated those 100 in the browser — so with 4,074 active postings the
 * explorer said "Page 1 of 5" and the other 3,974 were simply unreachable. It
 * also capped the Applications page, which asks for 200 for the same reason.
 *
 * Phase 7 fixes the Jobs page properly, by paginating server-side, so the cap
 * is no longer what decides how much of the result set is reachable — the
 * total row count is. What the cap still does is bound one response, and 200
 * is chosen for that: a job row carries its full description and its company,
 * so 200 of them is already a multi-megabyte payload to parse on a phone.
 * Removing the bound entirely would let `?limit=100000` ask the free-tier
 * instance to load the whole table into its 512 MB.
 */
export const MAX_PAGE_SIZE = 200;

export function paginate(params: {
  page?: unknown;
  limit?: unknown;
}): PaginationParams {
  const page = Math.max(1, Number(params.page) || 1);
  const limit = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number(params.limit) || 20),
  );
  return { page, limit };
}

export function buildPaginatedResult<T>(
  data: T[],
  total: number,
  params: PaginationParams,
): PaginatedResult<T> {
  return {
    data,
    meta: {
      page: params.page,
      limit: params.limit,
      total,
      totalPages: Math.ceil(total / params.limit),
    },
  };
}
