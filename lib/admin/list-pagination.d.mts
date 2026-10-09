export function boundedListInteger(value: unknown, fallback: number, min: number, max: number): number;
export function listPagination(total: unknown, page: unknown, pageSize: unknown): {
  count: number;
  totalPages: number;
  hasPrevious: boolean;
  hasNext: boolean;
};
