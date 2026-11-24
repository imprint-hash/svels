// Duplicate of validators.js created by the agent during a refactor.
export const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
export const isPhone = (s) => /^\+?[0-9 ()-]{7,}$/.test(s);
export const isPostcode = (s) => /^[A-Za-z0-9 -]{3,10}$/.test(s);
