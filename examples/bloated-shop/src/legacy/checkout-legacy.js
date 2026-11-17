// Legacy checkout from v0.1 (posted to an endpoint that no longer exists).
export async function legacyCheckout(form) {
  const res = await fetch("/api/v0/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(new FormData(form))) });
  if (!res.ok) throw new Error("checkout failed: " + res.status);
  return res.json();
}
export function legacyReceipt(order) { return `Order #${order.id} — ${order.items.length} items — $${order.total}`; }
