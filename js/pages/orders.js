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

let orders = [];

const labels = {
  PENDING_PAYMENT: 'Pendiente de pago', PAYMENT_REVIEW: 'Revisión de pago', CONFIRMED: 'Confirmado',
  PREPARING: 'Preparando', SHIPPED: 'Enviado', DELIVERED: 'Entregado', CANCELLED: 'Cancelado', EXPIRED: 'Expirado',
  PENDING: 'Pendiente', RECEIPT_SUBMITTED: 'Comprobante enviado', VERIFIED: 'Verificado', REJECTED: 'Rechazado', REFUNDED: 'Reembolsado'
};

const money = value => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(value || 0));
const date = value => value ? new Intl.DateTimeFormat('es-CO', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '—';
const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));

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
  if (!filtered.length) { body.innerHTML = '<tr><td colspan="8">No hay pedidos que coincidan.</td></tr>'; return; }
  body.innerHTML = filtered.map(o => `<tr>
    <td><strong>#${escapeHtml(o.order_number)}</strong></td>
    <td>${escapeHtml(o.customer_name)}<br><small>${escapeHtml(o.phone)}</small></td>
    <td>${money(o.total)}</td>
    <td>${escapeHtml(labels[o.payment_status] || o.payment_status)}</td>
    <td>${escapeHtml(labels[o.order_status] || o.order_status)}</td>
    <td>${o.reservation_expires_at ? date(o.reservation_expires_at) : '—'}</td>
    <td>${date(o.created_at)}</td>
    <td><button class="button button--ghost order-view" data-id="${escapeHtml(o.id)}" type="button">Ver</button></td>
  </tr>`).join('');
}

async function loadOrders() {
  body.innerHTML = '<tr><td colspan="8">Cargando pedidos…</td></tr>';
  const { data, error } = await supabase.from('orders').select('id,order_number,customer_id,source,order_status,payment_status,shipping_status,customer_name,document_number,phone,destination,address,additional_info,subtotal,discount,shipping_cost,total,reservation_expires_at,created_at,updated_at').order('created_at', { ascending: false });
  if (error) throw error;
  orders = data || [];
  render();
}

search.addEventListener('input', render);
statusFilter.addEventListener('change', render);
paymentFilter.addEventListener('change', render);
refresh.addEventListener('click', () => loadOrders().catch(showError));
body.addEventListener('click', event => {
  const button = event.target.closest('.order-view');
  if (!button) return;
  const order = orders.find(item => item.id === button.dataset.id);
  if (!order) return;
  alert(`Pedido #${order.order_number}\n\nCliente: ${order.customer_name}\nTotal: ${money(order.total)}\nPago: ${labels[order.payment_status] || order.payment_status}\nEstado: ${labels[order.order_status] || order.order_status}\nReserva: ${order.reservation_expires_at ? date(order.reservation_expires_at) : 'Sin reserva'}`);
});

function showError(error) {
  console.error('[RM SELECT] orders error:', error);
  body.innerHTML = `<tr><td colspan="8">${escapeHtml(error?.message || 'No fue posible cargar los pedidos.')}</td></tr>`;
}

logout?.addEventListener('click', async () => { logout.disabled = true; await supabase.auth.signOut(); window.location.href = '../login.html'; });

try { if (await guard()) await loadOrders(); } catch (error) { showError(error); statusEl.textContent = error?.message || 'Error al cargar pedidos.'; statusEl.className = 'admin-status is-error'; }
