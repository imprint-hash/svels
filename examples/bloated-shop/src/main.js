import { renderProducts, renderProduct } from "./components/ProductList.js";
import { renderCart } from "./components/Cart.js";
import { renderCheckout } from "./components/Checkout.js";
import { cart } from "./lib/cart-store.js";
import { applyTheme } from "./lib/theme.js";

const app = document.getElementById("app");
await applyTheme(localStorage.getItem("theme") || "light"); // colours must be set before first paint

function route() {
  const hash = location.hash || "#/";
  if (hash.startsWith("#/product/")) return renderProduct(app, hash.split("/")[2]);
  if (hash === "#/cart") return renderCart(app);
  if (hash === "#/checkout") return renderCheckout(app);
  return renderProducts(app);
}
window.addEventListener("hashchange", route);
route();
