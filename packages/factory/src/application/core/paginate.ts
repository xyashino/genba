export const pageOf = <T>(
  all: readonly T[],
  { limit, cursor }: { limit: number; cursor?: string },
): { items: T[]; nextCursor: string | null } => {
  const start = Number(cursor ?? 0) || 0;
  const end = start + limit;
  return {
    items: all.slice(start, end),
    nextCursor: end < all.length ? String(end) : null,
  };
};
