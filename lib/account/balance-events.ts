export const ACCOUNT_BALANCE_UPDATED_EVENT = "jianlian:account-balance-updated";

export function notifyAccountBalanceUpdated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(ACCOUNT_BALANCE_UPDATED_EVENT));
}
