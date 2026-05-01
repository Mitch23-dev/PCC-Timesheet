export function safeGetLocalStorage(key: string) {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
