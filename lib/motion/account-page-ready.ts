const accountPages = new Set(["/account", "/account/profile", "/account/security", "/account/privacy", "/account/api"]);

export function isAccountDataPage(pathname: string) {
  return accountPages.has(pathname);
}

/** Wait for the destination's own initial read, including a rendered failure.
 * Aborting a superseded navigation also disconnects its DOM observer. */
export function waitForAccountPageSettled(target: string, signal: AbortSignal): Promise<boolean> {
  return new Promise(resolve => {
    let observer: MutationObserver | undefined;
    const finish = (settled: boolean) => {
      observer?.disconnect();
      signal.removeEventListener("abort", onAbort);
      resolve(settled);
    };
    const onAbort = () => finish(false);
    const check = () => {
      if (signal.aborted) { finish(false); return; }
      const path = window.location.pathname;
      // A normal authentication redirect must not leave a loading overlay
      // over the login form. Never accept the previous account page.
      if ((path === "/login" || path === "/register") && document.querySelector("main") && !document.querySelector("[data-account-page]")) { finish(true); return; }
      if (path !== target) return;
      const page = Array.from(document.querySelectorAll<HTMLElement>("[data-account-page]")).find(node => node.dataset.accountPage === target);
      if (page?.getAttribute("aria-busy") === "false" || document.querySelector('main .next-error-h1, main [data-page-error="true"]')) finish(true);
    };
    if (signal.aborted) { resolve(false); return; }
    observer = new MutationObserver(check);
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["aria-busy", "data-account-page"] });
    signal.addEventListener("abort", onAbort, { once: true });
    check();
  });
}
