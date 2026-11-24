export const products = [
  { id: "oats", name: "Rolled oats", price: 4.5, unit: "1 kg bag", blurb: "Slow-cooked porridge oats from a small mill." },
  { id: "honey", name: "Wildflower honey", price: 9.0, unit: "340 g jar", blurb: "Raw honey, lightly filtered." },
  { id: "beans", name: "Black beans", price: 3.25, unit: "500 g", blurb: "Dried beans for soups and stews." },
  { id: "rice", name: "Jasmine rice", price: 6.75, unit: "2 kg bag", blurb: "Fragrant long-grain rice." },
];
export const byId = (id) => products.find((p) => p.id === id);

// Leftovers from a search box and a "featured" strip that were never built.
export function searchProducts(q) {
  const t = q.trim().toLowerCase();
  return products.filter((p) => p.name.toLowerCase().includes(t) || p.blurb.toLowerCase().includes(t));
}
export const featured = () => products.filter((p) => p.price > 5);
export function sortByPrice(list, dir = "asc") {
  return [...list].sort((a, b) => (dir === "asc" ? a.price - b.price : b.price - a.price));
}
