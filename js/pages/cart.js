import { getCart, updateQuantity, removeFromCart, cartTotal, getPublicVariantStock } from '../core/cart.js';

const root = document.getElementById('cart-content');
const money = value => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(value || 0));
const esc = value => String(value ?? '').replace(/[&<>\'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#039;', '"':'&quot;' }[char]));
let stock = new Map();
let loading = false;

async function render() {
  const cart = getCart();

  if (!cart.length) {
    root.innerHTML = '<div class="store-empty"><h2>Tu carrito está vacío</h2><p>Explora la colección y agrega tus productos.</p><a class="button button--primary" href="shop.html">Explorar colección</a></div>';
    return;
  }

  loading = true;
  root.innerHTML = '<div class="store-loading">Verificando disponibilidad…</div>';

  try {
    stock = await getPublicVariantStock();
  } catch (error) {
    console.error('[RM SELECT] cart stock error:', error);
    loading = false;
    root.innerHTML = '<div class="store-empty"><h2>No pudimos verificar el inventario</h2><p>Actualiza la página e inténtalo nuevamente.</p></div>';
    return;
  }

  loading = false;
  const itemsWithStock = cart.map(item => ({
    ...item,
    available: stock.get(item.variant_id) ?? 0,
  }));
  const hasInsufficientStock = itemsWithStock.some(item => item.quantity > item.available);
  const subtotal = cartTotal();

  root.innerHTML = `<div class="cart-layout">
    <div class="cart-items">
      ${itemsWithStock.map(item => {
        const insufficient = item.quantity > item.available;
        const maxReached = item.quantity >= item.available;
        return `<article class="cart-item${insufficient ? ' cart-item--stock-error' : ''}">
          <div>
            <strong>${esc(item.product_name)}</strong>
            <span>${esc(item.variant_name || 'Única')} · ${esc(item.sku || '')}</span>
            <small class="cart-stock ${insufficient ? 'is-error' : ''}">${
              item.available > 0
                ? (insufficient ? `Solo hay ${item.available} disponible${item.available === 1 ? '' : 's'}. Reduce la cantidad.` : `${item.available} disponible${item.available === 1 ? '' : 's'}`)
                : 'Agotado temporalmente'
            }</small>
          </div>
          <div class="cart-qty">
            <button type="button" data-minus="${item.variant_id}" aria-label="Reducir cantidad">−</button>
            <span>${item.quantity}</span>
            <button type="button" data-plus="${item.variant_id}" aria-label="Aumentar cantidad" ${maxReached ? 'disabled' : ''}>+</button>
          </div>
          <strong>${money(Number(item.price) * item.quantity)}</strong>
          <button class="cart-remove" type="button" data-remove="${item.variant_id}">Eliminar</button>
        </article>`;
      }).join('')}
    </div>
    <aside class="cart-summary">
      <p class="eyebrow">RESUMEN</p>
      <div><span>Subtotal</span><strong>${money(subtotal)}</strong></div>
      <div><span>Envío</span><span>Se calcula en checkout</span></div>
      <hr>
      <div><span>Total productos</span><strong>${money(subtotal)}</strong></div>
      ${hasInsufficientStock ? '<div class="cart-stock-alert">Hay productos con una cantidad superior al stock disponible. Ajusta el carrito para continuar.</div>' : ''}
      <a class="button button--primary${hasInsufficientStock ? ' is-disabled' : ''}" ${hasInsufficientStock ? 'aria-disabled="true"' : 'href="checkout.html"'}>Continuar al checkout</a>
    </aside>
  </div>`;
}

root.addEventListener('click', async event => {
  if (loading) return;

  const minus = event.target.closest('[data-minus]');
  const plus = event.target.closest('[data-plus]');
  const remove = event.target.closest('[data-remove]');

  if (minus) {
    const item = getCart().find(x => x.variant_id === minus.dataset.minus);
    if (item) {
      updateQuantity(item.variant_id, item.quantity - 1);
      await render();
    }
    return;
  }

  if (plus) {
    const item = getCart().find(x => x.variant_id === plus.dataset.plus);
    const available = stock.get(item?.variant_id) ?? 0;
    if (item && item.quantity < available) {
      updateQuantity(item.variant_id, item.quantity + 1);
      await render();
    }
    return;
  }

  if (remove) {
    removeFromCart(remove.dataset.remove);
    await render();
  }
});

root.addEventListener('click', event => {
  const checkout = event.target.closest('.cart-summary .button.is-disabled');
  if (checkout) event.preventDefault();
});

render();
