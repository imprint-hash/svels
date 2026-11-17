// Carousel for a homepage hero that was cut from the design.
export class Carousel {
  constructor(el, slides, intervalMs = 5000) { this.el = el; this.slides = slides; this.i = 0; this.ms = intervalMs; }
  mount() {
    this.el.innerHTML = `<div class="carousel">${this.slides.map((s, k) => `<figure class="slide${k ? "" : " on"}"><img src="${s.img}" alt="${s.alt}"><figcaption>${s.caption}</figcaption></figure>`).join("")}</div>`;
    this.timer = setInterval(() => this.next(), this.ms);
  }
  next() { const f = this.el.querySelectorAll(".slide"); f[this.i].classList.remove("on"); this.i = (this.i + 1) % f.length; f[this.i].classList.add("on"); }
  destroy() { clearInterval(this.timer); }
}
