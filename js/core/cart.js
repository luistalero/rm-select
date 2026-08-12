import { supabase } from './supabase.js';

const KEY='rm_select_cart_v1';
export const getCart=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'[]')}catch{return[]}};
export const saveCart=cart=>{localStorage.setItem(KEY,JSON.stringify(cart));window.dispatchEvent(new CustomEvent('cart:updated',{detail:cart}));};
export const addToCart=(item,quantity=1)=>{const cart=getCart();const existing=cart.find(x=>x.variant_id===item.variant_id);if(existing)existing.quantity+=quantity;else cart.push({...item,quantity});saveCart(cart);return cart;};
export const updateQuantity=(variantId,quantity)=>{const cart=getCart().map(x=>x.variant_id===variantId?{...x,quantity}:x).filter(x=>x.quantity>0);saveCart(cart);return cart;};
export const removeFromCart=variantId=>saveCart(getCart().filter(x=>x.variant_id!==variantId));
export const clearCart=()=>saveCart([]);
export const cartCount=()=>getCart().reduce((n,x)=>n+x.quantity,0);
export const cartTotal=()=>getCart().reduce((n,x)=>n+Number(x.price||0)*x.quantity,0);

export async function getPublicVariantStock() {
  const { data, error } = await supabase.rpc('get_public_variant_stock');
  if (error) throw error;
  return new Map((data || []).map(row => [row.variant_id, Number(row.available_quantity || 0)]));
}

export async function getCartStockStatus(cart = getCart()) {
  const stock = await getPublicVariantStock();
  return cart.map(item => ({
    ...item,
    available_quantity: stock.get(item.variant_id) ?? 0,
    sufficient: Number(item.quantity) <= (stock.get(item.variant_id) ?? 0),
  }));
}

export const refreshCartCount=()=>{document.querySelectorAll('#cart-count').forEach(el=>el.textContent=cartCount());};
window.addEventListener('cart:updated',refreshCartCount);document.addEventListener('DOMContentLoaded',refreshCartCount);refreshCartCount();
