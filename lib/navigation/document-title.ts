"use client";

const DEFAULT_SITE_TITLE = "Jianlian Shop";

let baseRouteTitle = DEFAULT_SITE_TITLE;
const modalTitleStack: Array<{ id: number; title: string }> = [];
let nextModalTitleId = 1;

function applyActiveDocumentTitle() {
  if (typeof document === "undefined") return;
  const topModal = modalTitleStack[modalTitleStack.length - 1];
  const nextTitle = topModal?.title || baseRouteTitle || DEFAULT_SITE_TITLE;
  if (document.title !== nextTitle) {
    document.title = nextTitle;
  }
}

export function setRouteDocumentTitle(title: string) {
  const normalized = title.trim() || DEFAULT_SITE_TITLE;
  baseRouteTitle = normalized;
  applyActiveDocumentTitle();
}

export function pushModalDocumentTitle(title: string): () => void {
  const normalized = title.trim();
  if (!normalized) return () => undefined;
  const id = nextModalTitleId++;
  modalTitleStack.push({ id, title: normalized });
  applyActiveDocumentTitle();
  return () => {
    const idx = modalTitleStack.findIndex((entry) => entry.id === id);
    if (idx >= 0) {
      modalTitleStack.splice(idx, 1);
      applyActiveDocumentTitle();
    }
  };
}
