import { createLiuhaoyiMd5Signature, liuhaoyiTypeForChannel } from "./liuhaoyi-core.mjs";

const FORM_FIELDS = ["pid", "type", "out_trade_no", "notify_url", "return_url", "name", "money", "sign_type", "sign"];

export function buildLiuhaoyiSubmitForm({ apiBaseUrl, merchantId, merchantKey, channelCode, sessionNo, notifyUrl, returnUrl, subject, money }) {
  const action = new URL("submit.php", apiBaseUrl);
  if (action.protocol !== "https:" || action.username || action.password) throw new Error("六号易提交地址无效");
  const unsigned = {
    pid: String(merchantId),
    type: liuhaoyiTypeForChannel(channelCode),
    out_trade_no: String(sessionNo),
    notify_url: String(notifyUrl),
    return_url: String(returnUrl),
    name: String(subject).slice(0, 127),
    money: String(money),
  };
  const fields = { ...unsigned, sign_type: "MD5", sign: createLiuhaoyiMd5Signature(unsigned, merchantKey) };
  return { action: action.toString(), method: "POST", fields };
}

export function normalizeLiuhaoyiSubmitForm(value) {
  if (!value || typeof value !== "object" || value.method !== "POST") return null;
  let action;
  try {
    action = new URL(value.action);
    if (action.protocol !== "https:" || action.username || action.password || !action.pathname.endsWith("/submit.php")) return null;
  } catch { return null; }
  const fields = value.fields;
  if (!fields || typeof fields !== "object" || Object.keys(fields).length !== FORM_FIELDS.length) return null;
  if (FORM_FIELDS.some((name) => typeof fields[name] !== "string" || !fields[name] || fields[name].length > 2048)) return null;
  if (!/^[a-f0-9]{32}$/.test(fields.sign) || fields.sign_type !== "MD5") return null;
  if (!["alipay", "wxpay"].includes(fields.type)) return null;
  return { action: action.toString(), method: "POST", fields: Object.fromEntries(FORM_FIELDS.map((name) => [name, fields[name]])) };
}
