// CartV2: second attempt at the cart with quantity steppers. Never wired in; Cart.js is used instead.
import { byId } from "../lib/products.js";
import { money } from "../lib/format.js";
import { cart } from "../lib/cart-store.js";
import { debounce } from "../lib/helpers.js";

export function renderCartV2(el) {
  const rows = cart.entries();
  el.innerHTML = `<section class="cart-v2"><h1>Basket</h1>${rows.map(([id, q]) => `
    <div class="row"><span>${byId(id).name}</span>
      <button data-dec="${id}">−</button><output>${q}</output><button data-inc="${id}">+</button>
      <span>${money(byId(id).price * q)}</span></div>`).join("")}</section>`;
  const save = debounce(() => localStorage.setItem("cart", JSON.stringify(cart.entries())), 300);
  el.querySelectorAll("[data-inc]").forEach((b) => b.addEventListener("click", () => { cart.add(b.dataset.inc); save(); renderCartV2(el); }));
  el.querySelectorAll("[data-dec]").forEach((b) => b.addEventListener("click", () => { cart.remove(b.dataset.dec); save(); renderCartV2(el); }));
}
