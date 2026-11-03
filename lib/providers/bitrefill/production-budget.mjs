import { bitrefillRpc } from './production-loaders.mjs';
import { decimalMicros } from './quote-core.mjs';
export function createBitrefillBudgetReserver({ service, skuId, accountFingerprint, authMode, readBalance, clock = Date.now }) {
  async function transition(receipt, next, invoice = null) {
    return bitrefillRpc(service, 'internal_bitrefill_pin_transition_budget', { p_key:receipt.logicalKey,
      p_account:accountFingerprint, p_contract:receipt.contractFingerprint, p_next:next, p_invoice:invoice });
  }
  return Object.freeze({
    async reserve(input) {
      if (input.accountFingerprint !== accountFingerprint || input.currency !== 'USD') throw Error('BITREFILL_BUDGET_IDENTITY_MISMATCH');
      const b = await readBalance(), at = Date.parse(b.checkedAt);
      const usd = b.balances?.filter(x => x.paymentMethod === 'balance' && x.currency === 'USD');
      if (b.source !== 'authenticated_mcp_balances' || b.accountFingerprint !== accountFingerprint ||
          !Number.isFinite(at) || at > clock() || clock() - at > 60000 || usd?.length !== 1 ||
          decimalMicros(usd[0].availableAmount) < decimalMicros(input.amount)) throw Error('BITREFILL_SUPPLIER_BALANCE_MANUAL_REVIEW');
      const r = await bitrefillRpc(service, 'internal_bitrefill_pin_reserve_budget', {
        p_sku:skuId, p_key:input.logicalKey, p_account:accountFingerprint, p_amount:input.amount,
        p_contract:input.contractFingerprint, p_auth_mode:authMode, p_available:usd[0].availableAmount, p_balance_at:b.checkedAt });
      if (!r.reserved || r.logicalKey !== input.logicalKey || r.accountFingerprint !== accountFingerprint ||
          r.contractFingerprint !== input.contractFingerprint || r.currency !== 'USD' ||
          decimalMicros(r.amount) !== decimalMicros(input.amount)) throw Error('BITREFILL_BUDGET_RECEIPT_INVALID');
      return { ...r, amount:input.amount };
    },
    hold: receipt => transition(receipt, 'HELD'),
    releaseBeforeSend: receipt => transition(receipt, 'RELEASED'),
    async consume(receipt, evidence) {
      // Never infer a successful debit from createInvoice/POST, invoice status
      // alone, or from a balance decrease that may include unrelated activity.
      if (evidence?.source !== 'authoritative_invoice_debit' || evidence.accountFingerprint !== accountFingerprint ||
          evidence.currency !== 'USD' || evidence.paid !== true ||
          decimalMicros(evidence.amount) !== decimalMicros(receipt.amount)) throw Error('BITREFILL_BUDGET_DEBIT_UNVERIFIED');
      return transition(receipt, 'CONSUMED', evidence.invoiceId);
    },
  });
}
