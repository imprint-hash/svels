// Date helpers written before the shop showed any dates.
export const toISODate = (d) => new Date(d).toISOString().slice(0, 10);
export function daysBetween(a, b) { return Math.round((new Date(b) - new Date(a)) / 86400000); }
export function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
export function formatRelative(d) { const n = daysBetween(new Date(), d); return n === 0 ? "today" : n === 1 ? "tomorrow" : n > 0 ? `in ${n} days` : `${-n} days ago`; }
