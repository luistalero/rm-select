import { supabase } from '../core/supabase.js';
import { getCart, cartTotal, clearCart, getPublicVariantStock } from '../core/cart.js';

const cart = getCart();
const form = document.getElementById('checkout-form');
const summary = document.getElementById('checkout-summary');
const status = document.getElementById('checkout-status');
const button = document.getElementById('place-order');
const money = value => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(value || 0));
const esc = value => String(value ?? '').replace(/[&<>\'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#039;', '"':'&quot;' }[char]));

if (!cart.length) {
  document.getElementById('checkout-guard').innerHTML = '<div class="store-empty"><h2>Tu carrito está vacío</h2><a class="button button--primary" href="shop.html">Volver a la tienda</a></div>';
  form.hidden = true;
  summary.hidden = true;
} else {
  summary.innerHTML = `<p class="eyebrow">TU PEDIDO</p>${cart.map(item => `<div><span>${esc(item.product_name)} · ${esc(item.variant_name || 'Única')} × ${item.quantity}</span><strong>${money(Number(item.price) * item.quantity)}</strong></div>`).join('')}<hr><div><span>Total</span><strong>${money(cartTotal())}</strong></div>`;
}

async function validateStock({ showSuccess = false } = {}) {
  if (!cart.length) return false;

  try {
    const stock = await getPublicVariantStock();
    const insufficient = cart
      .map(item => ({ item, available: stock.get(item.variant_id) ?? 0 }))
      .filter(({ item, available }) => Number(item.quantity) > available);

    if (insufficient.length) {
      const message = insufficient.map(({ item, available }) =>
        `${item.product_name}: ${available} disponible${available === 1 ? '' : 's'} y tienes ${item.quantity}`
      ).join(' · ');
      status.textContent = `El inventario cambió. Ajusta tu carrito antes de continuar: ${message}.`;
      status.className = 'auth-status is-error';
      button.disabled = true;
      return false;
    }

    if (showSuccess) {
      status.textContent = 'Stock verificado. Puedes crear el pedido.';
      status.className = 'auth-status is-success';
    }
    return true;
  } catch (error) {
    console.error('[RM SELECT] stock validation error:', error);
    status.textContent = 'No pudimos verificar el inventario. Actualiza la página e inténtalo nuevamente.';
    status.className = 'auth-status is-error';
    button.disabled = true;
    return false;
  }
}

const { data: sessionData } = await supabase.auth.getSession();
const session = sessionData.session;

if (!session && !form.hidden) {
  location.href = `login.html?next=${encodeURIComponent('checkout.html')}`;
} else if (session) {
  const { data: profile, error } = await supabase.from('profiles').select('full_name,phone,role').eq('id', session.user.id).single();
  if (error) {
    console.error('[RM SELECT] profile error:', error);
    status.textContent = 'No pudimos cargar los datos de tu cuenta.';
    status.className = 'auth-status is-error';
    button.disabled = true;
  } else if (profile?.role !== 'CUSTOMER') {
    status.textContent = 'Esta compra debe realizarse con una cuenta de cliente.';
    status.className = 'auth-status is-error';
    button.disabled = true;
  } else {
    document.getElementById('customer-name').value = profile.full_name || session.user.user_metadata?.full_name || '';
    document.getElementById('phone').value = profile.phone || session.user.user_metadata?.phone || '';
    await validateStock();
  }
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (!form.reportValidity() || !cart.length) return;

  button.disabled = true;
  status.textContent = 'Verificando disponibilidad del inventario...';
  status.className = 'auth-status';

  // UX pre-check: prevents the user from discovering a stock problem only after
  // submitting. The database still performs the authoritative atomic reservation.
  if (!(await validateStock())) return;

  status.textContent = 'Creando tu pedido y reservando el inventario...';
  status.className = 'auth-status';

  const items = cart.map(item => ({ variant_id: item.variant_id, quantity: Number(item.quantity) }));

  try {
    const { data: currentSession } = await supabase.auth.getSession();
    if (!currentSession.session) throw new Error('Tu sesión expiró. Vuelve a iniciar sesión.');

    const { data: orderId, error } = await supabase.rpc('create_order', {
      p_items: items,
      p_customer_name: document.getElementById('customer-name').value.trim(),
      p_document_number: document.getElementById('document-number').value.trim(),
      p_phone: document.getElementById('phone').value.trim(),
      p_destination: document.getElementById('destination').value.trim(),
      p_address: document.getElementById('address').value.trim(),
      p_additional_info: document.getElementById('additional-info').value.trim() || null
    });

    if (error) throw error;
    if (!orderId) throw new Error('Supabase no devolvió el identificador del pedido.');

    clearCart();
    status.className = 'auth-status is-success';
    status.textContent = 'Pedido creado correctamente. El inventario quedó reservado durante 2 horas.';
    setTimeout(() => { location.href = `account.html?order=${encodeURIComponent(orderId)}`; }, 700);
  } catch (error) {
    console.error('[RM SELECT] create_order error:', error);
    status.className = 'auth-status is-error';
    status.textContent = error?.message || 'No fue posible crear el pedido.';
    button.disabled = false;
  }
});
