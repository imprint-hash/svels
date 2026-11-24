import { money } from "../lib/format.js";
import { cart } from "../lib/cart-store.js";
import { cartTotal } from "./Cart.js";

export function renderCheckout(el) {
  el.innerHTML = `<h1>Checkout</h1><form id="f" class="card">
    <label>Full name <input name="name" required></label>
    <label>Email <input name="email" type="email" required></label>
    <label>Promo code <input name="promo" placeholder="optional"></label>
    <button>Place order</button></form><p id="msg"></p>`;
  el.querySelector("#f").addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    let total = cartTotal(), note = "";
    // Promo rules live in one file per campaign, picked by the code the shopper types.
    if (data.promo) {
      try { const promo = (await import(`../promos/${data.promo.toLowerCase()}.js`)).default; total = promo.apply(total); note = ` (${promo.label})`; }
      catch { document.getElementById("msg").textContent = "That promo code isn't valid."; return; }
    }
    // Order reference derived from the order itself, so the same order always gets the same reference.
    const ref = "LD-" + [...`${data.email}|${total}`].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7).toString(36).toUpperCase().slice(0, 6);
    cart.clear();
    el.innerHTML = `<h1>Thank you, ${data.name.split(" ")[0]}!</h1><p class="ok">Order ${ref} confirmed. We charged ${money(total)}${note}. A receipt is on its way to ${data.email}.</p><a href="#/">Back to the shop</a>`;
  });
}
