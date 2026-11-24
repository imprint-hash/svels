// Generic modal. Generated for a "quick view" feature that never shipped.
export function openModal({ title, body, onClose }) {
  const wrap = document.createElement("div");
  wrap.className = "modal-backdrop";
  wrap.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${title}"><h2>${title}</h2><div>${body}</div><button class="close">Close</button></div>`;
  const close = () => { wrap.remove(); onClose && onClose(); };
  wrap.querySelector(".close").addEventListener("click", close);
  wrap.addEventListener("click", (e) => e.target === wrap && close());
  document.addEventListener("keydown", function esc(e) { if (e.key === "Escape") { close(); document.removeEventListener("keydown", esc); } });
  document.body.appendChild(wrap);
  return close;
}
