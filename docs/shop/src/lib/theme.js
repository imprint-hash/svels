// Themes are loaded by name, so a static import scanner can't see which theme files are used.
export async function applyTheme(name) {
  const mod = await import(`../themes/${name}.js`);
  for (const [k, v] of Object.entries(mod.default)) document.documentElement.style.setProperty(k, v);
}
