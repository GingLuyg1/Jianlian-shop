export type NavigationGroupLike = {
  key: string;
  children: readonly { href: string }[];
};

export function isAdminPathActive(pathname: string, href: string): boolean;
export function getNavigationGroupForPath(
  pathname: string,
  groups: readonly NavigationGroupLike[]
): string | null;
export function toggleNavigationGroup(
  currentGroup: string | null,
  requestedGroup: string
): string | null;
