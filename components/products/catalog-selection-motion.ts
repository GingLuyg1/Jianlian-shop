import type { PointerEvent } from "react";

// Public presentation state only. Never changes a category/product selection.
export function updateCatalogPointer(event: PointerEvent<HTMLButtonElement>) {
  const card = event.currentTarget;
  if (card.disabled || event.pointerType === "touch") return;
  const bounds = card.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return;
  const x = (event.clientX - bounds.left) / bounds.width;
  const y = (event.clientY - bounds.top) / bounds.height;
  const centered = x >= 0.2 && x <= 0.82 && y >= 0.15 && y <= 0.85;
  const value = centered ? "true" : "false";
  if (card.dataset.cardCenter !== value) card.dataset.cardCenter = value;
}

export function clearCatalogPointer(event: PointerEvent<HTMLButtonElement>) {
  delete event.currentTarget.dataset.cardCenter;
}
