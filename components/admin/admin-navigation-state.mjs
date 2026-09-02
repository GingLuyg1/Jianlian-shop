export function isAdminPathActive(pathname, href) {
  if (href === "/admin") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function getNavigationGroupForPath(pathname, groups) {
  for (const group of groups ?? []) {
    if (group.children?.some((child) => isAdminPathActive(pathname, child.href))) {
      return group.key;
    }
  }
  return null;
}

export function toggleNavigationGroup(currentGroup, requestedGroup) {
  return currentGroup === requestedGroup ? null : requestedGroup;
}
