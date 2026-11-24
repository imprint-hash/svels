// Grab-bag of helpers an agent generated "for later". Only CartV2 imports debounce, and CartV2 is unused.
export function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
export function throttle(fn, ms) { let last = 0; return (...a) => { const n = Date.now(); if (n - last >= ms) { last = n; fn(...a); } }; }
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
export const slugify = (s) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
export function groupBy(arr, key) { return arr.reduce((m, x) => ((m[x[key]] ||= []).push(x), m), {}); }
export function deepClone(o) { return JSON.parse(JSON.stringify(o)); }
