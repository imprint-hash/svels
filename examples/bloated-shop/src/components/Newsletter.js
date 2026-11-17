// Newsletter signup box. The marketing page it was for was dropped.
import { isEmail } from "../lib/validators.js";
export function renderNewsletter(el) {
  el.innerHTML = `<form class="newsletter"><input type="email" placeholder="you@example.com"><button>Subscribe</button><p class="nl-msg"></p></form>`;
  el.querySelector("form").addEventListener("submit", (e) => {
    e.preventDefault();
    const v = el.querySelector("input").value;
    el.querySelector(".nl-msg").textContent = isEmail(v) ? "Thanks! Check your inbox." : "Please enter a valid email.";
  });
}
