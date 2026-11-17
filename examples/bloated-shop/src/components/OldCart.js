// OldCart: the first cart, before the store module existed. Kept "just in case".
export function renderOldCart(el, items) {
  let total = 0;
  let html = "<h1>Cart</h1><ul>";
  for (var i = 0; i < items.length; i++) {
    total = total + items[i].price * items[i].qty;
    html += "<li>" + items[i].name + " x" + items[i].qty + " = $" + (items[i].price * items[i].qty).toFixed(2) + "</li>";
  }
  html += "</ul><p>Total: $" + total.toFixed(2) + "</p>";
  el.innerHTML = html;
}
export function oldCartFromStorage() {
  try { return JSON.parse(localStorage.getItem("old_cart") || "[]"); } catch (e) { return []; }
}
