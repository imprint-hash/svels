const listeners = [];
let items = {};
export const cart = {
  add(id) { items[id] = (items[id] || 0) + 1; listeners.forEach((f) => f()); },
  remove(id) { delete items[id]; listeners.forEach((f) => f()); },
  clear() { items = {}; listeners.forEach((f) => f()); },
  entries() { return Object.entries(items); },
  count() { return Object.values(items).reduce((a, b) => a + b, 0); },
  onChange(f) { listeners.push(f); },
};
