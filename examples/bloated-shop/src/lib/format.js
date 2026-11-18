export const money = (n) => "$" + n.toFixed(2);
export const badgeText = (n) => `Cart (${n})`;

// Added by the agent "in case we need them later".
export const percent = (n, digits = 0) => (n * 100).toFixed(digits) + "%";
export function formatDate(d, locale = "en-GB") {
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(new Date(d));
}
export function pluralize(n, one, many = one + "s") {
  return `${n} ${n === 1 ? one : many}`;
}
export const truncate = (s, max = 40) => (s.length > max ? s.slice(0, max - 1) + "…" : s);
