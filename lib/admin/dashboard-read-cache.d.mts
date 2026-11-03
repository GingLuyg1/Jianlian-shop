export function createDashboardReadCache(options?: { ttl?: number; maximum?: number; now?: () => number }): {
  clear(): void;
  read<T>(key: string, fetcher: () => Promise<T>): Promise<T>;
};
