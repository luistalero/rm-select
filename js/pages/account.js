import { supabase } from '../core/supabase.js';
import { config } from '../core/config.js';

const nameEl = document.getElementById('account-name');
const emailEl = document.getElementById('account-email');
const ordersEl = document.getElementById('account-orders');
const money = v => new Intl.NumberFormat('es-CO', { style:'currency', currency:'COP', maximumFractionDigits:0 }).format(Number(v || 0));
const labels = { PENDING_PAYMENT:'Pendiente de pago', PAYMENT_REVIEW:'Revisión de pago', CONFIRMED:'Confirmado', PREPARING:'Preparando', SHIPPED:'Enviado', DELIVERED:'Entregado', CANCELLED:'Cancelado', EXPIRED:'Expirado' };
const paymentLabels = { PENDING:'Pendiente', RECEIPT_SUBMITTED:'Comprobante enviado', VERIFIED:'Verificado', REJECTED:'Rechazado', REFUNDED:'Reembolsado' };
const escapeHtml = v => String(v ?? '').replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#039;', '"':'&quot;' }[c]));
const statusClass = v => ['CONFIRMED','DELIVERED','VERIFIED'].includes(v) ? 'is-success' : ['CANCELLED','EXPIRED','REJECTED'].includes(v) ? 'is-error' : '';

const { data, error } = await supabase.auth.getSession();
if (error || !data.session) { location.href = 'login.html'; throw new Error('No session'); }
const user = data.session.user;
const { data: profile, error: profileError } = await supabase.from('profiles').select('full_name,role,phone').eq('id', user.id).single();
if (profileError) console.error(profileError);
if (profile?.role !== 'CUSTOMER') { location.href = 'admin/index.html'; throw new Error('Staff account'); }
nameEl.textContent = profile?.full_name || user.user_metadata?.full_name || 'Cliente';
emailEl.textContent = user.email || '';

async function loadOrders(focusOrderId = new URLSearchParams(location.search).get('order')) {
  const { data: orders, error: ordersError } = await supabase.from('orders')
    .select('id,order_number,order_status,payment_status,payment_receipt_url,payment_submitted_at,total,created_at')
    .eq('customer_id', user.id).order('created_at', { ascending:false });
  if (ordersError) { ordersEl.innerHTML = '<p class="store-empty">No fue posible cargar tus pedidos.</p>'; return; }
  if (!orders?.length) { ordersEl.innerHTML = '<div class="store-empty"><h3>Aún no tienes pedidos</h3><p>Cuando realices tu primera compra aparecerá aquí.</p></div>'; return; }

  ordersEl.innerHTML = orders.map(o => {
    const canSubmit = o.order_status === 'PENDING_PAYMENT' && ['PENDING','REJECTED'].includes(o.payment_status);
    const rejected = o.payment_status === 'REJECTED';
    return `<article class="order-card ${o.id === focusOrderId ? 'is-focused' : ''}" id="order-${escapeHtml(o.id)}">
      <div><strong>Pedido #${escapeHtml(o.order_number)}</strong><small>${new Date(o.created_at).toLocaleString('es-CO')}</small></div>
      <div><span class="status-pill ${statusClass(o.order_status)}">${escapeHtml(labels[o.order_status] || o.order_status)}</span><small>Pago: ${escapeHtml(paymentLabels[o.payment_status] || o.payment_status)}</small></div>
      <strong>${money(o.total)}</strong>
      ${canSubmit ? `<div class="order-payment-box"><strong>${rejected ? 'El comprobante fue rechazado. Puedes enviarlo nuevamente.' : '¿Ya realizaste el pago?'}</strong><p>Sube una foto clara del comprobante para que podamos revisar tu pedido.</p><form class="receipt-form" data-order-id="${escapeHtml(o.id)}"><input type="file" name="receipt" accept="image/jpeg,image/png,image/webp" required><button class="button button--primary" type="submit">Enviar comprobante</button><p class="auth-status" data-receipt-status role="status" aria-live="polite"></p></form></div>` : ''}
      ${o.payment_receipt_url ? `<a class="text-link" href="${escapeHtml(o.payment_receipt_url)}" target="_blank" rel="noopener">Ver comprobante enviado</a>` : ''}
    </article>`;
  }).join('');
  if (focusOrderId) document.getElementById(`order-${focusOrderId}`)?.scrollIntoView({ behavior:'smooth', block:'center' });
}

async function uploadReceipt(file) {
  if (!config.cloudinaryCloudName || config.cloudinaryCloudName === 'YOUR_CLOUD_NAME') throw new Error('Cloudinary no está configurado en la tienda.');
  if (!config.cloudinaryUploadPreset || config.cloudinaryUploadPreset === 'YOUR_UPLOAD_PRESET') throw new Error('El upload preset de Cloudinary no está configurado.');
  if (!file || !file.type.startsWith('image/')) throw new Error('El comprobante debe ser una imagen.');
  if (file.size > 5 * 1024 * 1024) throw new Error('El comprobante no puede superar 5 MB.');
  const body = new FormData(); body.append('file', file); body.append('upload_preset', config.cloudinaryUploadPreset); body.append('folder', 'rm-select/payment-receipts');
  const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(config.cloudinaryCloudName)}/image/upload`, { method:'POST', body });
  const result = await response.json();
  if (!response.ok || !result.secure_url) throw new Error(result.error?.message || 'No fue posible subir el comprobante.');
  return { url: result.secure_url, publicId: result.public_id || null };
}

ordersEl.addEventListener('submit', async event => {
  const form = event.target.closest('.receipt-form'); if (!form) return; event.preventDefault();
  const file = form.elements.receipt.files[0], button = form.querySelector('button'), status = form.querySelector('[data-receipt-status]');
  button.disabled = true; status.textContent = 'Subiendo comprobante…'; status.className = 'auth-status';
  try {
    const uploaded = await uploadReceipt(file);
    const { error } = await supabase.rpc('submit_payment_receipt', { p_order_id: form.dataset.orderId, p_receipt_url: uploaded.url, p_receipt_public_id: uploaded.publicId });
    if (error) throw error;
    status.textContent = 'Comprobante enviado. El pedido quedó en revisión de pago.'; status.className = 'auth-status is-success';
    await loadOrders(form.dataset.orderId);
  } catch (error) {
    console.error('[RM SELECT] receipt submission:', error); status.textContent = error?.message || 'No fue posible enviar el comprobante.'; status.className = 'auth-status is-error'; button.disabled = false;
  }
});

document.getElementById('logout-button').addEventListener('click', async () => { await supabase.auth.signOut(); location.href = '../index.html'; });
await loadOrders();
