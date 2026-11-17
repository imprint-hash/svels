// Draft admin page the agent scaffolded when asked "maybe an admin later?".
import { products } from "../lib/products.js";
export function renderAdmin(el) {
  el.innerHTML = `<h1>Admin (draft)</h1><table><tr><th>Product</th><th>Price</th><th></th></tr>${products.map((p) => `<tr><td>${p.name}</td><td><input value="${p.price}" data-id="${p.id}"></td><td><button>Save</button></td></tr>`).join("")}</table>`;
}
