// Old analytics shim from a provider the shop no longer uses.
const queue = [];
export function track(event, props = {}) { queue.push({ event, props, at: Date.now() }); if (queue.length > 20) flush(); }
export function flush() { const batch = queue.splice(0); navigator.sendBeacon?.("https://collect.example-analytics.invalid/v1", JSON.stringify(batch)); }
window.addEventListener("pagehide", flush);
