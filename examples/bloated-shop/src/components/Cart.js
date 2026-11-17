import { byId } from "../lib/products.js";
import { money } from "../lib/format.js";
import { cart } from "../lib/cart-store.js";

export const cartTotal = () => cart.entries().reduce((t, [id, q]) => t + byId(id).price * q, 0);

export function renderCart(el) {
  const rows = cart.entries();
  if (!rows.length) { el.innerHTML = `<h1>Your cart</h1><p>Your cart is empty. <a href="#/">Keep shopping</a></p>`; return; }
  el.innerHTML = `<h1>Your cart</h1><table>${rows.map(([id, q]) => `<tr><td>${byId(id).name}</td><td>× ${q}</td><td>${money(byId(id).price * q)}</td></tr>`).join("")}</table>
    <p class="total">Total: <b>${money(cartTotal())}</b></p><a class="button" href="#/checkout">Go to checkout</a>`;
}
