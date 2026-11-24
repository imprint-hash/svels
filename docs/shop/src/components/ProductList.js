import { products, byId } from "../lib/products.js";
import { money } from "../lib/format.js";
import { cart } from "../lib/cart-store.js";

export function renderProducts(el) {
  el.innerHTML = `<h1>Pantry goods</h1><ul class="grid">${products.map((p) => `
    <li class="card"><a href="#/product/${p.id}"><h2>${p.name}</h2></a><p>${p.unit}</p><p class="price">${money(p.price)}</p>
    <button data-add="${p.id}">Add to cart</button></li>`).join("")}</ul>`;
  el.querySelectorAll("[data-add]").forEach((b) => b.addEventListener("click", () => { cart.add(b.dataset.add); b.textContent = "Added"; }));
}

export function renderProduct(el, id) {
  const p = byId(id);
  if (!p) { el.innerHTML = `<p>Not found. <a href="#/">Back to the shop</a></p>`; return; }
  el.innerHTML = `<article class="card"><h1>${p.name}</h1><p>${p.blurb}</p><p>${p.unit}</p><p class="price">${money(p.price)}</p>
    <button id="add">Add to cart</button> <a href="#/">Back to the shop</a></article>`;
  el.querySelector("#add").addEventListener("click", (e) => { cart.add(p.id); e.target.textContent = "Added"; });
}
