const KEY = 'rm_select_cart_v1';

export function getCart() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); }
  catch { return []; }
}

export function saveCart(cart) { localStorage.setItem(KEY, JSON.stringify(cart)); }
export function getCartCount() { return getCart().reduce((sum, item) => sum + Number(item.quantity || 0), 0); }
export function clearCart() { localStorage.removeItem(KEY); }
