import { supabase } from '../core/supabase.js';

const list = document.getElementById('customers-list');
const search = document.getElementById('customers-search');
const count = document.getElementById('customers-count');
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[char]));
let customers = [];

function render() {
  const query = search.value.trim().toLowerCase();
  const filtered = customers.filter(customer => `${customer.full_name} ${customer.phone || ''} ${customer.document_number || ''}`.toLowerCase().includes(query));
  count.textContent = `${filtered.length} cliente${filtered.length === 1 ? '' : 's'}`;
  list.innerHTML = filtered.length ? filtered.map(customer => {
    const orders = customer.orders || [];
    const total = orders.reduce((sum, order) => sum + Number(order.total || 0), 0);
    return `<article class="admin-person-card"><div class="admin-person-avatar">${esc((customer.full_name || 'C').slice(0, 1).toUpperCase())}</div><div class="admin-person-main"><strong>${esc(customer.full_name)}</strong><span>${esc(customer.phone || 'Sin teléfono')} · ${esc(customer.document_number || 'Sin documento')}</span></div><div class="admin-person-meta"><strong>${orders.length} pedido${orders.length === 1 ? '' : 's'}</strong><small>${new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(total)}</small></div><span class="admin-person-state">${customer.welcome_shipping_discount_available ? 'BENEFICIO ACTIVO' : 'CLIENTE'}</span></article>`;
  }).join('') : '<div class="admin-empty"><strong>No hay clientes que coincidan.</strong><span>Prueba con otro término de búsqueda.</span></div>';
}

async function load() {
  const { data, error } = await supabase.from('profiles').select('id,full_name,phone,document_number,welcome_shipping_discount_available,created_at,orders(id,total)').eq('role', 'CUSTOMER').order('created_at', { ascending: false });
  if (error) throw error;
  customers = data || [];
  render();
}

search.addEventListener('input', render);
load().catch(error => { list.innerHTML = `<div class="admin-status is-error">${esc(error.message)}</div>`; });
