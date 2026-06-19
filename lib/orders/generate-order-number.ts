export function generateOrderNumber(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0");
  const timestamp = [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("");
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();

  return `JL${timestamp}${random}`;
}
