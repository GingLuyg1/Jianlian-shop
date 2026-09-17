const REQUIRED_FIELDS = ["pid", "type", "out_trade_no", "notify_url", "return_url", "name", "money", "sign_type", "sign"];

// Called only after an explicit user payment action, never when a return/status page loads.
export function submitPaymentForm(form, doc = document) {
  if (!form || form.method !== "POST" || !form.fields || typeof form.fields !== "object") return false;
  let action;
  try {
    action = new URL(form.action);
    if (action.protocol !== "https:" || action.username || action.password || !action.pathname.endsWith("/submit.php")) return false;
  } catch { return false; }
  if (Object.keys(form.fields).length !== REQUIRED_FIELDS.length
    || REQUIRED_FIELDS.some((name) => typeof form.fields[name] !== "string" || !form.fields[name])) return false;
  const element = doc.createElement("form");
  element.method = "POST";
  element.action = action.toString();
  element.hidden = true;
  for (const name of REQUIRED_FIELDS) {
    const field = doc.createElement("input");
    field.type = "hidden";
    field.name = name;
    field.value = form.fields[name];
    element.appendChild(field);
  }
  doc.body.appendChild(element);
  element.submit();
  return true;
}
