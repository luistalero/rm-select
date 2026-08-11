import { supabase } from '../core/supabase.js';

const statusEl = document.getElementById('module-status');
const userEl = document.getElementById('module-user');
const roleEl = document.getElementById('module-role');
const logout = document.getElementById('logout-button');
const body = document.getElementById('orders-body');
const search = document.getElementById('order-search');
const statusFilter = document.getElementById('order-status-filter');
const paymentFilter = document.getElementById('payment-status-filter');
const refresh = document.getElementById('refresh-orders');
const summary = document.getElementById('orders-summary');
const menuButton = document.getElementById('menu-button');
const sidebar = document.getElementById('admin-sidebar');
const modal = document.getElementById('order-modal');
const modalDetail = document.getElementById('order-detail');

let orders = [];

const labels = {
  PENDING_PAYMENT: 'Pendiente de pago', PAYMENT_REVIEW: 'Revisión de pago', CONFIRMED: 'Confirmado',
  PREPARING: 'Preparando', SHIPPED: 'Enviado', DELIVERED: 'Entregado', CANCELLED: 'Cancelado', EXPIRED: 'Expirado',
  PENDING: 'Pendiente', RECEIPT_SUBMITTED: 'Comprobante enviado', VERIFIED: 'Verificado', REJECTED: 'Rechazado', REFUNDED: 'Reembolsado',
  WEB: 'Web', WHATSAPP: 'WhatsApp', MANUAL: 'Manual', NOT_REQUIRED: 'No requerido'
};

const money = value => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(value || 0));
const date = value => value ? new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';
const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#039;', '"':'&quot;' }[c]));

function statusClass(value) {
  if (['CONFIRMED','DELIVERED','VERIFIED'].includes(value)) return 'status-success';
  if (['CANCELLED','EXPIRED','REJECTED'].includes(value)) return 'status-danger';
  if (['PAYMENT_REVIEW','RECEIPT_SUBMITTED','PREPARING','SHIPPED'].includes(value)) return 'status-warning';
  return 'status-neutral';
}

function statusBadge(value, type = 'order') {
  const label = labels[value] || value || '—';
  return `<span class="${type === 'payment' ? 'payment-status' : 'order-status'} ${statusClass(value)}">${escapeHtml(label)}</span>`;
}

async function guard() {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) { window.location.href = '../login.html'; return false; }
  const user = data.session.user;
  const { data: profile, error: profileError } = await supabase.from('profiles').select('full_name, role').eq('id', user.id).single();
  if (profileError) throw profileError;
  if (!['ADMIN', 'SUPER_ADMIN'].includes(profile.role)) { await supabase.auth.signOut(); window.location.href = '../login.html'; return false; }
  userEl.textContent = profile.full_name || user.email || 'Usuario';
  roleEl.textContent = profile.role;
  statusEl.textContent = `Sesión activa como ${profile.role}.`;
  statusEl.className = 'admin-status is-success';
  return true;
}

function renderSummary(list) {
  const counts = ['PENDING_PAYMENT','PAYMENT_REVIEW','CONFIRMED','PREPARING','SHIPPED','DELIVERED','CANCELLED','EXPIRED'].map(s => [s, list.filter(o => o.order_status === s).length]);
  summary.innerHTML = counts.map(([key, count]) => `<article class="admin-stat"><span>${escapeHtml(labels[key])}</span><strong>${count}</strong></article>`).join('');
}

function render() {
  const q = search.value.trim().toLowerCase();
  const filtered = orders.filter(o => {
    const text = `${o.order_number} ${o.customer_name} ${o.document_number} ${o.phone}`.toLowerCase();
    return (!q || text.includes(q)) && (!statusFilter.value || o.order_status === statusFilter.value) && (!paymentFilter.value || o.payment_status === paymentFilter.value);
  });
  renderSummary(orders);
  if (!filtered.length) {
    body.innerHTML = '<tr><td colspan="8"><div class="admin-empty"><strong>No hay pedidos que coincidan.</strong><span>Prueba con otros filtros o actualiza la lista.</span></div></td></tr>';
    return;
  }
  body.innerHTML = filtered.map(o => `<tr>
    <td><strong>#${escapeHtml(o.order_number)}</strong><br><small>${escapeHtml(labels[o.source] || o.source)}</small></td>
    <td><strong>${escapeHtml(o.customer_name)}</strong><br><small>${escapeHtml(o.phone)}</small></td>
    <td><strong>${money(o.total)}</strong></td>
    <td>${statusBadge(o.payment_status, 'payment')}</td>
    <td>${statusBadge(o.order_status)}</td>
    <td>${o.reservation_expires_at ? date(o.reservation_expires_at) : '—'}</td>
    <td>${date(o.created_at)}</td>
    <td><button class="button button--ghost button--small order-view" data-id="${escapeHtml(o.id)}" type="button">Ver pedido</button></td>
  </tr>`).join('');
}

async function loadOrders() {
  body.innerHTML = '<tr><td colspan="8">Cargando pedidos…</td></tr>';
  const { data, error } = await supabase.from('orders').select('id,order_number,customer_id,source,order_status,payment_status,shipping_status,customer_name,document_number,phone,destination,address,additional_info,subtotal,discount,shipping_cost,total,reservation_expires_at,created_at,updated_at').order('created_at', { ascending: false });
  if (error) throw error;
  orders = data || [];
  render();
}

async function openOrder(order) {
  modalDetail.innerHTML = '<p>Cargando detalle…</p>';
  modal.hidden = false;
  document.body.style.overflow = 'hidden';

  const { data: items, error } = await supabase.from('order_items').select('product_name_snapshot,variant_name_snapshot,unit_price,quantity,line_total').eq('order_id', order.id).order('created_at', { ascending: true });
  if (error) {
    modalDetail.innerHTML = `<div class="admin-status is-error">${escapeHtml(error.message)}</div>`;
    return;
  }

  const itemRows = (items || []).length
    ? items.map(item => `<tr><td>${escapeHtml(item.product_name_snapshot)}${item.variant_name_snapshot ? `<br><small>${escapeHtml(item.variant_name_snapshot)}</small>` : ''}</td><td>${item.quantity}</td><td>${money(item.unit_price)}</td><td>${money(item.line_total)}</td></tr>`).join('')
    : '<tr><td colspan="4">Este pedido no tiene productos registrados.</td></tr>';

  modalDetail.innerHTML = `<div class="order-detail">
    <div class="order-detail-grid">
      <article class="order-detail-card"><h3>Pedido #${escapeHtml(order.order_number)}</h3><div class="order-detail-row"><span>Origen</span><strong>${escapeHtml(labels[order.source] || order.source)}</strong></div><div class="order-detail-row"><span>Creado</span><strong>${date(order.created_at)}</strong></div><div class="order-detail-row"><span>Actualizado</span><strong>${date(order.updated_at)}</strong></div><div class="order-detail-row"><span>Estado</span>${statusBadge(order.order_status)}</div><div class="order-detail-row"><span>Pago</span>${statusBadge(order.payment_status, 'payment')}</div><div class="order-detail-row"><span>Envío</span><strong>${escapeHtml(labels[order.shipping_status] || order.shipping_status || '—')}</strong></div></article>
      <article class="order-detail-card"><h3>Cliente</h3><div class="order-detail-row"><span>Nombre</span><strong>${escapeHtml(order.customer_name)}</strong></div><div class="order-detail-row"><span>Documento</span><strong>${escapeHtml(order.document_number)}</strong></div><div class="order-detail-row"><span>Teléfono</span><strong>${escapeHtml(order.phone)}</strong></div><div class="order-detail-row"><span>Destino</span><strong>${escapeHtml(order.destination)}</strong></div><div class="order-detail-row"><span>Dirección</span><strong>${escapeHtml(order.address)}</strong></div>${order.additional_info ? `<div class="order-detail-row"><span>Información adicional</span><strong>${escapeHtml(order.additional_info)}</strong></div>` : ''}</article>
    </div>
    <article class="order-detail-card"><h3>Productos</h3><div class="admin-table-wrap"><table class="order-items"><thead><tr><th>Producto</th><th>Cant.</th><th>Precio</th><th>Total</th></tr></thead><tbody>${itemRows}</tbody></table></div></article>
    <article class="order-detail-card"><div class="order-detail-row"><span>Subtotal</span><strong>${money(order.subtotal)}</strong></div><div class="order-detail-row"><span>Descuento</span><strong>${money(order.discount)}</strong></div><div class="order-detail-row"><span>Envío</span><strong>${money(order.shipping_cost)}</strong></div><div class="order-detail-row"><span>Total</span><strong class="order-detail-total">${money(order.total)}</strong></div>${order.reservation_expires_at ? `<div class="order-detail-row"><span>Reserva expira</span><strong>${date(order.reservation_expires_at)}</strong></div>` : ''}</article>
    <div class="order-action-bar"><button class="button button--ghost" type="button" data-close-order-modal>Cerrar</button></div>
  </div>`;
}

function closeOrder() {
  modal.hidden = true;
  document.body.style.overflow = '';
}

search.addEventListener('input', render);
statusFilter.addEventListener('change', render);
paymentFilter.addEventListener('change', render);
refresh.addEventListener('click', () => loadOrders().catch(showError));
body.addEventListener('click', event => {
  const button = event.target.closest('.order-view');
  if (!button) return;
  const order = orders.find(item => item.id === button.dataset.id);
  if (order) openOrder(order).catch(showError);
});
modal.addEventListener('click', event => { if (event.target.closest('[data-close-order-modal]')) closeOrder(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !modal.hidden) closeOrder(); });
menuButton?.addEventListener('click', () => sidebar?.classList.toggle('is-open'));
sidebar?.addEventListener('click', event => { if (event.target.closest('a')) sidebar.classList.remove('is-open'); });

function showError(error) {
  console.error('[RM SELECT] orders error:', error);
  body.innerHTML = `<tr><td colspan="8"><div class="admin-status is-error">${escapeHtml(error?.message || 'No fue posible cargar los pedidos.')}</div></td></tr>`;
}

logout?.addEventListener('click', async () => { logout.disabled = true; await supabase.auth.signOut(); window.location.href = '../login.html'; });

try { if (await guard()) await loadOrders(); } catch (error) { showError(error); statusEl.textContent = error?.message || 'Error al cargar pedidos.'; statusEl.className = 'admin-status is-error'; }
