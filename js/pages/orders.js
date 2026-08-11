import { supabase } from '../core/supabase.js';

const $ = (id) => document.getElementById(id);
const statusEl = $('module-status');
const userEl = $('module-user');
const roleEl = $('module-role');
const logout = $('logout-button');
const body = $('orders-body');
const search = $('order-search');
const statusFilter = $('order-status-filter');
const paymentFilter = $('payment-status-filter');
const refresh = $('refresh-orders');
const summary = $('orders-summary');
const modal = $('order-modal');
const modalDetail = $('order-detail');
const actionModal = $('action-modal');
const feedbackModal = $('feedback-modal');

let orders = [];
let activeOrderId = null;
let pendingAction = null;

const labels = {
  PENDING_PAYMENT: 'Pendiente de pago',
  PAYMENT_REVIEW: 'Revisión de pago',
  CONFIRMED: 'Confirmado',
  PREPARING: 'Preparando',
  SHIPPED: 'Enviado',
  DELIVERED: 'Entregado',
  CANCELLED: 'Cancelado',
  EXPIRED: 'Expirado',
  PENDING: 'Pendiente',
  RECEIPT_SUBMITTED: 'Comprobante enviado',
  VERIFIED: 'Verificado',
  REJECTED: 'Rechazado',
  REFUNDED: 'Reembolsado',
  WEB: 'Web',
  WHATSAPP: 'WhatsApp',
  MANUAL: 'Manual',
  NOT_REQUIRED: 'No requerido',
};

const money = (value) => new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
}).format(Number(value || 0));

const date = (value) => value
  ? new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  : '—';

const esc = (value) => String(value ?? '').replace(/[&<>\'"]/g, (char) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  "'": '&#039;',
  '"': '&quot;',
}[char]));

function statusClass(value) {
  if (['CONFIRMED', 'DELIVERED', 'VERIFIED'].includes(value)) return 'status-success';
  if (['CANCELLED', 'EXPIRED', 'REJECTED'].includes(value)) return 'status-danger';
  if (['PAYMENT_REVIEW', 'RECEIPT_SUBMITTED', 'PREPARING', 'SHIPPED'].includes(value)) return 'status-warning';
  return 'status-neutral';
}

function statusBadge(value, type = 'order') {
  return `<span class="${type === 'payment' ? 'payment-status' : 'order-status'} ${statusClass(value)}">${esc(labels[value] || value || '—')}</span>`;
}

async function guard() {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) {
    window.location.href = '../login.html';
    return false;
  }

  const user = data.session.user;
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('full_name,role')
    .eq('id', user.id)
    .single();

  if (profileError) throw profileError;

  if (!['ADMIN', 'SUPER_ADMIN'].includes(profile.role)) {
    await supabase.auth.signOut();
    window.location.href = '../login.html';
    return false;
  }

  userEl.textContent = profile.full_name || user.email || 'Usuario';
  roleEl.textContent = profile.role;
  statusEl.textContent = `Sesión activa como ${profile.role}.`;
  statusEl.className = 'admin-status is-success';
  return true;
}

function renderSummary(list) {
  summary.innerHTML = [
    'PENDING_PAYMENT',
    'PAYMENT_REVIEW',
    'CONFIRMED',
    'PREPARING',
    'SHIPPED',
    'DELIVERED',
    'CANCELLED',
    'EXPIRED',
  ].map((state) => `
    <article class="admin-stat">
      <span>${esc(labels[state])}</span>
      <strong>${list.filter((order) => order.order_status === state).length}</strong>
    </article>
  `).join('');
}

function render() {
  const query = search.value.trim().toLowerCase();
  const filtered = orders.filter((order) => {
    const text = `${order.order_number} ${order.customer_name} ${order.document_number} ${order.phone}`.toLowerCase();
    return (!query || text.includes(query))
      && (!statusFilter.value || order.order_status === statusFilter.value)
      && (!paymentFilter.value || order.payment_status === paymentFilter.value);
  });

  renderSummary(orders);

  if (!filtered.length) {
    body.innerHTML = '<tr><td colspan="8"><div class="admin-empty"><strong>No hay pedidos que coincidan.</strong><span>Prueba con otros filtros.</span></div></td></tr>';
    return;
  }

  body.innerHTML = filtered.map((order) => `
    <tr>
      <td><strong>#${esc(order.order_number)}</strong><br><small>${esc(labels[order.source] || order.source)}</small></td>
      <td><strong>${esc(order.customer_name)}</strong><br><small>${esc(order.phone)}</small></td>
      <td><strong>${money(order.total)}</strong></td>
      <td>${statusBadge(order.payment_status, 'payment')}</td>
      <td>${statusBadge(order.order_status)}</td>
      <td>${order.reservation_expires_at ? date(order.reservation_expires_at) : '—'}</td>
      <td>${date(order.created_at)}</td>
      <td><button class="button button--ghost button--small order-view" data-id="${esc(order.id)}" type="button">Ver pedido</button></td>
    </tr>
  `).join('');
}

async function loadOrders() {
  body.innerHTML = '<tr><td colspan="8">Cargando pedidos…</td></tr>';

  const { data, error } = await supabase
    .from('orders')
    .select('id,order_number,customer_id,source,order_status,payment_status,shipping_status,customer_name,document_number,phone,destination,address,additional_info,subtotal,discount,shipping_cost,total,reservation_expires_at,payment_receipt_url,payment_submitted_at,created_at,updated_at')
    .order('created_at', { ascending: false });

  if (error) throw error;
  orders = data || [];
  render();
}

function actionButtons(order) {
  const actions = [];

  if (order.order_status === 'PAYMENT_REVIEW') {
    actions.push('<button class="button order-action order-action--approve" type="button" data-order-action="approve">Aprobar pago</button>');
    actions.push('<button class="button button--danger order-action" type="button" data-order-action="reject">Rechazar pago</button>');
  }

  if (['PENDING_PAYMENT', 'PAYMENT_REVIEW'].includes(order.order_status)) {
    actions.push('<button class="button button--ghost order-action" type="button" data-order-action="cancel">Cancelar pedido</button>');
  }

  if (order.order_status === 'CONFIRMED') {
    actions.push('<button class="button order-action" type="button" data-order-action="prepare">Marcar como preparando</button>');
  }

  if (order.order_status === 'PREPARING') {
    actions.push('<button class="button order-action" type="button" data-order-action="ship">Marcar como enviado</button>');
  }

  if (order.order_status === 'SHIPPED') {
    actions.push('<button class="button order-action" type="button" data-order-action="deliver">Marcar como entregado</button>');
  }

  if (!actions.length) return '';

  return `
    <div class="order-actions">
      <div>
        <strong>Acciones disponibles</strong>
        <span>Las operaciones usan las funciones seguras de Supabase.</span>
      </div>
      <div class="order-actions__buttons">${actions.join('')}</div>
    </div>
  `;
}

async function openOrder(order) {
  activeOrderId = order.id;
  modalDetail.innerHTML = '<p>Cargando detalle…</p>';
  modal.hidden = false;
  document.body.style.overflow = 'hidden';

  const { data: items, error } = await supabase
    .from('order_items')
    .select('product_name_snapshot,variant_name_snapshot,unit_price,quantity,line_total')
    .eq('order_id', order.id)
    .order('created_at', { ascending: true });

  if (error) {
    modalDetail.innerHTML = `<div class="admin-status is-error">${esc(error.message)}</div>`;
    return;
  }

  const itemRows = (items || []).length
    ? items.map((item) => `
      <tr>
        <td>${esc(item.product_name_snapshot)}${item.variant_name_snapshot ? `<br><small>${esc(item.variant_name_snapshot)}</small>` : ''}</td>
        <td>${item.quantity}</td>
        <td>${money(item.unit_price)}</td>
        <td>${money(item.line_total)}</td>
      </tr>
    `).join('')
    : '<tr><td colspan="4">Este pedido no tiene productos registrados.</td></tr>';

  const receipt = order.payment_receipt_url
    ? `
      <article class="order-detail-card">
        <h3>Comprobante de pago</h3>
        <p><strong>Enviado:</strong> ${date(order.payment_submitted_at)}</p>
        <a class="text-link" href="${esc(order.payment_receipt_url)}" target="_blank" rel="noopener">Abrir comprobante en una pestaña nueva</a>
        <div class="order-receipt-preview">
          <img src="${esc(order.payment_receipt_url)}" alt="Comprobante de pago del pedido ${esc(order.order_number)}" loading="lazy">
        </div>
      </article>
    `
    : `
      <article class="order-detail-card">
        <h3>Comprobante de pago</h3>
        <p>El cliente todavía no ha enviado un comprobante.</p>
      </article>
    `;

  modalDetail.innerHTML = `
    <div class="order-detail">
      <div class="order-detail-grid">
        <article class="order-detail-card">
          <h3>Pedido #${esc(order.order_number)}</h3>
          <div class="order-detail-row"><span>Origen</span><strong>${esc(labels[order.source] || order.source)}</strong></div>
          <div class="order-detail-row"><span>Creado</span><strong>${date(order.created_at)}</strong></div>
          <div class="order-detail-row"><span>Estado</span>${statusBadge(order.order_status)}</div>
          <div class="order-detail-row"><span>Pago</span>${statusBadge(order.payment_status, 'payment')}</div>
          <div class="order-detail-row"><span>Envío</span>${statusBadge(order.shipping_status)}</div>
        </article>

        <article class="order-detail-card">
          <h3>Cliente</h3>
          <div class="order-detail-row"><span>Nombre</span><strong>${esc(order.customer_name)}</strong></div>
          <div class="order-detail-row"><span>Documento</span><strong>${esc(order.document_number)}</strong></div>
          <div class="order-detail-row"><span>Teléfono</span><strong>${esc(order.phone)}</strong></div>
          <div class="order-detail-row"><span>Destino</span><strong>${esc(order.destination)}</strong></div>
          <div class="order-detail-row"><span>Dirección</span><strong>${esc(order.address)}</strong></div>
          ${order.additional_info ? `<div class="order-detail-row"><span>Información adicional</span><strong>${esc(order.additional_info)}</strong></div>` : ''}
        </article>
      </div>

      ${receipt}

      <article class="order-detail-card">
        <h3>Productos</h3>
        <div class="admin-table-wrap">
          <table class="order-items">
            <thead><tr><th>Producto</th><th>Cant.</th><th>Precio</th><th>Total</th></tr></thead>
            <tbody>${itemRows}</tbody>
          </table>
        </div>
      </article>

      <article class="order-detail-card">
        <div class="order-detail-row"><span>Subtotal</span><strong>${money(order.subtotal)}</strong></div>
        <div class="order-detail-row"><span>Descuento</span><strong>${money(order.discount)}</strong></div>
        <div class="order-detail-row"><span>Envío</span><strong>${money(order.shipping_cost)}</strong></div>
        <div class="order-detail-row"><span>Total</span><strong class="order-detail-total">${money(order.total)}</strong></div>
        ${order.reservation_expires_at ? `<div class="order-detail-row"><span>Reserva expira</span><strong>${date(order.reservation_expires_at)}</strong></div>` : ''}
      </article>

      ${actionButtons(order)}
      <div class="order-action-bar"><button class="button button--ghost" type="button" data-close-order-modal>Cerrar</button></div>
    </div>
  `;
}

function closeOrder() {
  modal.hidden = true;
  document.body.style.overflow = '';
  activeOrderId = null;
}

function getActionConfig(action) {
  const config = {
    approve: {
      title: 'Aprobar pago',
      submit: 'Aprobar pago',
      warning: 'Al aprobar se consumirá el stock reservado y el pedido pasará a CONFIRMED.',
      label: 'Nota de aprobación (opcional)',
      required: false,
    },
    reject: {
      title: 'Rechazar pago',
      submit: 'Rechazar comprobante',
      warning: 'El comprobante será rechazado. Si la reserva sigue vigente, el cliente podrá enviar un comprobante corregido.',
      label: 'Motivo del rechazo',
      required: true,
    },
    cancel: {
      title: 'Cancelar pedido',
      submit: 'Cancelar pedido',
      warning: 'Esta acción cancelará el pedido y liberará la reserva de stock.',
      label: 'Motivo de cancelación',
      required: true,
    },
    prepare: {
      title: 'Preparar pedido',
      submit: 'Marcar como preparando',
      warning: 'El pedido pasará a PREPARING y el estado de envío quedará en PREPARANDO.',
      label: 'Nota de preparación (opcional)',
      required: false,
    },
    ship: {
      title: 'Enviar pedido',
      submit: 'Marcar como enviado',
      warning: 'El pedido pasará a SHIPPED y el estado de envío quedará en ENVIADO.',
      label: 'Nota de envío (opcional)',
      required: false,
    },
    deliver: {
      title: 'Marcar pedido como entregado',
      submit: 'Marcar como entregado',
      warning: 'El pedido pasará a DELIVERED y el estado de envío quedará en ENTREGADO.',
      label: 'Nota de entrega (opcional)',
      required: false,
    },
  };

  return config[action];
}

function openAction(action) {
  const order = orders.find((item) => item.id === activeOrderId);
  const config = getActionConfig(action);
  if (!order || !config) return;

  pendingAction = action;
  $('action-title').textContent = config.title;
  $('action-submit').textContent = config.submit;
  $('action-submit').className = `button ${['reject', 'cancel'].includes(action) ? 'button--danger' : ''}`;
  $('action-summary').innerHTML = `
    <strong>Pedido #${esc(order.order_number)} · ${money(order.total)}</strong>
    <span>${esc(order.customer_name)} · Estado: ${esc(labels[order.order_status])}</span>
  `;
  $('action-warning').textContent = config.warning;
  $('action-warning').hidden = !config.warning;
  $('action-reason-label').querySelector('input').value = '';
  $('action-reason-label').firstChild.textContent = config.label;
  $('action-reason').required = config.required;
  actionModal.hidden = false;
  setTimeout(() => $('action-reason').focus(), 0);
}

function closeAction() {
  actionModal.hidden = true;
  pendingAction = null;
}

function showFeedback(title, message, error = false) {
  $('feedback-title').textContent = title;
  $('feedback-message').innerHTML = `<div class="feedback-icon ${error ? 'is-error' : ''}">${error ? '!' : '✓'}</div><p>${esc(message)}</p>`;
  feedbackModal.hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeFeedback() {
  feedbackModal.hidden = true;
  document.body.style.overflow = '';
}

async function submitAction(event) {
  event.preventDefault();

  const order = orders.find((item) => item.id === activeOrderId);
  if (!order || !pendingAction) return;

  const reason = $('action-reason').value.trim();
  if (['cancel', 'reject'].includes(pendingAction) && !reason) {
    $('action-reason').focus();
    return;
  }

  const action = pendingAction;
  const submitButton = $('action-submit');
  submitButton.disabled = true;

  try {
    let rpc;
    let args;
    let successMessage;

    if (action === 'approve' || action === 'reject') {
      rpc = 'review_order_payment';
      args = {
        p_order_id: order.id,
        p_verified: action === 'approve',
        p_notes: reason || null,
      };
      successMessage = action === 'approve'
        ? 'El pago fue aprobado y la reserva de stock fue consumida.'
        : 'El comprobante fue rechazado. Si la reserva sigue vigente, el cliente podrá enviarlo nuevamente.';
    } else if (action === 'cancel') {
      rpc = 'cancel_order';
      args = { p_order_id: order.id, p_reason: reason };
      successMessage = 'El pedido fue cancelado y la reserva fue liberada.';
    } else {
      rpc = 'transition_order_status';
      args = {
        p_order_id: order.id,
        p_target_status: {
          prepare: 'PREPARING',
          ship: 'SHIPPED',
          deliver: 'DELIVERED',
        }[action],
        p_notes: reason || null,
      };
      successMessage = {
        prepare: 'El pedido pasó a preparación.',
        ship: 'El pedido fue marcado como enviado.',
        deliver: 'El pedido fue marcado como entregado.',
      }[action];
    }

    const { error } = await supabase.rpc(rpc, args);
    if (error) throw error;

    closeAction();
    closeOrder();
    await loadOrders();
    showFeedback('Operación completada', successMessage);
  } catch (error) {
    console.error('[RM SELECT] order action:', error);
    showFeedback('No fue posible completar la operación', error?.message || 'Ocurrió un error.', true);
  } finally {
    submitButton.disabled = false;
  }
}

body.addEventListener('click', (event) => {
  const button = event.target.closest('.order-view');
  if (!button) return;

  const order = orders.find((item) => item.id === button.dataset.id);
  if (order) openOrder(order).catch(showError);
});

modal.addEventListener('click', (event) => {
  if (event.target.closest('[data-close-order-modal]')) closeOrder();
  const action = event.target.closest('[data-order-action]');
  if (action) openAction(action.dataset.orderAction);
});

actionModal.addEventListener('click', (event) => {
  if (event.target.closest('[data-close-action-modal]')) closeAction();
});

$('action-form').addEventListener('submit', submitAction);

feedbackModal.addEventListener('click', (event) => {
  if (event.target.closest('[data-close-feedback]')) closeFeedback();
});

search.addEventListener('input', render);
statusFilter.addEventListener('change', render);
paymentFilter.addEventListener('change', render);
refresh.addEventListener('click', () => loadOrders().catch(showError));

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (!actionModal.hidden) closeAction();
  else if (!modal.hidden) closeOrder();
  else if (!feedbackModal.hidden) closeFeedback();
});

$('menu-button')?.addEventListener('click', () => $('admin-sidebar')?.classList.toggle('is-open'));

logout?.addEventListener('click', async () => {
  logout.disabled = true;
  await supabase.auth.signOut();
  window.location.href = '../login.html';
});

function showError(error) {
  console.error('[RM SELECT] orders error:', error);
  showFeedback('Error', error?.message || 'No fue posible cargar los pedidos.', true);
}

try {
  if (await guard()) await loadOrders();
} catch (error) {
  showError(error);
  statusEl.textContent = error?.message || 'Error al cargar pedidos.';
  statusEl.className = 'admin-status is-error';
}
