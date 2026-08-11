import { supabase } from '../core/supabase.js';
const $ = (id) => document.getElementById(id);
const state = { rows: [], variants: [], operation: 'adjust' };
function esc(value = '') { return String(value).replace(/[&<>'"]/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#039;', '"':'&quot;' }[c])); }
function available(row) { return Number(row.stock_on_hand || 0) - Number(row.stock_reserved || 0); }
function fmt(value) { return new Intl.NumberFormat('es-CO').format(Number(value || 0)); }
function showError(message) { const el = $('operation-error'); el.textContent = message; el.hidden = false; }
async function guard() {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) { window.location.href = '../login.html'; return false; }
  const user = data.session.user;
  const { data: profile, error: profileError } = await supabase.from('profiles').select('full_name,role').eq('id', user.id).single();
  if (profileError) throw profileError;
  if (!['ADMIN','SUPER_ADMIN'].includes(profile.role)) { await supabase.auth.signOut(); window.location.href = '../login.html'; return false; }
  $('module-user').textContent = profile.full_name || user.email || 'Usuario'; $('module-role').textContent = profile.role;
  $('module-status').textContent = `Sesión activa como ${profile.role}.`; $('module-status').className = 'admin-status is-success'; return true;
}
async function loadInventory() {
  $('inventory-list').innerHTML = '<div class="admin-status">Cargando inventario…</div>';
  const { data, error } = await supabase.from('inventory').select('variant_id,stock_on_hand,stock_reserved,updated_at,product_variants(id,name,sku,price,product_id,products(id,name,sku,category_id))').order('updated_at', { ascending: false });
  if (error) throw error; state.rows = data || []; renderInventory(); updateSummary();
}
async function loadVariants() {
  const { data, error } = await supabase.from('product_variants').select('id,name,sku,price,product_id,products(name,sku)').eq('is_active', true).order('created_at', { ascending: false });
  if (error) throw error; state.variants = data || [];
  $('operation-variant').innerHTML = '<option value="">Selecciona una variante…</option>' + state.variants.map(v => `<option value="${v.id}">${esc(v.products?.name || 'Producto')} — ${esc(v.name)}${v.sku ? ` · ${esc(v.sku)}` : ''}</option>`).join('');
}
function statusFor(row) { const a = available(row); if (a <= 0) return ['OUT','AGOTADO']; if (a <= 2) return ['LOW','STOCK BAJO']; return ['AVAILABLE','DISPONIBLE']; }
function renderInventory() {
  const query = $('inventory-search').value.trim().toLowerCase(), filter = $('inventory-state').value;
  const rows = state.rows.filter(row => { const v = row.product_variants, p = v?.products; const text = `${p?.name || ''} ${p?.sku || ''} ${v?.name || ''} ${v?.sku || ''}`.toLowerCase(); const [status] = statusFor(row); return (!query || text.includes(query)) && (!filter || status === filter); });
  if (!rows.length) { $('inventory-list').innerHTML = '<div class="admin-empty"><strong>No hay existencias para mostrar.</strong><span>Los productos necesitan una variante con registro de inventario.</span></div>'; return; }
  $('inventory-list').innerHTML = rows.map(row => { const v = row.product_variants, p = v?.products, a = available(row), [status,label] = statusFor(row); return `<article class="inventory-admin-card"><div class="inventory-admin-main"><strong>${esc(p?.name || 'Producto')}</strong><span>${esc(v?.name || 'Variante')}${v?.sku ? ` · ${esc(v.sku)}` : ''}</span></div><div class="inventory-admin-number"><span>Disponible</span><strong>${fmt(a)}</strong></div><div class="inventory-admin-number"><span>En mano</span><strong>${fmt(row.stock_on_hand)}</strong></div><div class="inventory-admin-number"><span>Reservado</span><strong>${fmt(row.stock_reserved)}</strong></div><span class="product-state state-${status.toLowerCase()}">${label}</span><div class="inventory-admin-actions"><button class="button button--small button--ghost" type="button" data-adjust="${row.variant_id}">Ajustar</button><button class="button button--small" type="button" data-sale="${row.variant_id}">Venta externa</button></div></article>`; }).join('');
}
function updateSummary() { let availableTotal = 0, reservedTotal = 0, low = 0, out = 0; for (const row of state.rows) { const a = available(row); availableTotal += a; reservedTotal += Number(row.stock_reserved || 0); if (a <= 0) out++; else if (a <= 2) low++; } $('stat-available').textContent = fmt(availableTotal); $('stat-reserved').textContent = fmt(reservedTotal); $('stat-low').textContent = fmt(low); $('stat-out').textContent = fmt(out); }
async function loadMovements() {
  const { data, error } = await supabase.from('inventory_movements').select('id,variant_id,movement_type,quantity_delta,stock_before,stock_after,reason,notes,order_id,actor_id,created_at,product_variants(name,sku,products(name)),profiles(full_name,email)').order('created_at', { ascending: false }).limit(30);
  if (error) { $('movement-list').innerHTML = `<div class="admin-status is-error">No fue posible cargar movimientos: ${esc(error.message)}</div>`; return; }
  if (!data?.length) { $('movement-list').innerHTML = '<div class="admin-empty"><strong>Aún no hay movimientos.</strong><span>Los ajustes y ventas externas aparecerán aquí.</span></div>'; return; }
  $('movement-list').innerHTML = data.map(m => `<article class="movement-admin-row"><div><strong>${esc(m.product_variants?.products?.name || 'Producto')}</strong><span>${esc(m.product_variants?.name || 'Variante')} · ${esc(m.movement_type)}</span></div><strong class="movement-delta ${m.quantity_delta < 0 ? 'is-negative' : 'is-positive'}">${m.quantity_delta > 0 ? '+' : ''}${m.quantity_delta}</strong><div><span>${esc(m.reason)}</span><small>${new Date(m.created_at).toLocaleString('es-CO')}</small></div><span>${esc(m.profiles?.full_name || m.profiles?.email || 'Sistema')}</span></article>`).join('');
}
function openOperation(type, variantId = '') { state.operation = type; $('operation-title').textContent = type === 'adjust' ? 'Ajustar stock' : 'Registrar venta externa'; $('operation-submit').textContent = type === 'adjust' ? 'Aplicar ajuste' : 'Registrar venta'; $('operation-form').reset(); $('operation-error').hidden = true; if (variantId) $('operation-variant').value = variantId; $('operation-modal').hidden = false; $('operation-variant').focus(); }
function closeOperation() { $('operation-modal').hidden = true; }
async function submitOperation(event) {
  event.preventDefault(); $('operation-error').hidden = true;
  const variantId = $('operation-variant').value, quantity = Number($('operation-quantity').value), reason = $('operation-reason').value.trim(), notes = $('operation-notes').value.trim() || null;
  if (!variantId || !Number.isInteger(quantity) || quantity <= 0 || !reason) { showError('Selecciona una variante, una cantidad válida y escribe el motivo.'); return; }
  $('operation-submit').disabled = true;
  try { const rpc = state.operation === 'adjust' ? 'adjust_stock' : 'record_external_sale'; const args = state.operation === 'adjust' ? { p_variant_id: variantId, p_quantity_delta: quantity, p_reason: reason, p_notes: notes } : { p_variant_id: variantId, p_quantity: quantity, p_reason: reason, p_notes: notes }; const { error } = await supabase.rpc(rpc, args); if (error) throw error; closeOperation(); await Promise.all([loadInventory(), loadMovements()]); }
  catch (error) { console.error('[RM SELECT] inventory operation error:', error); showError(error?.message || 'No fue posible completar la operación.'); }
  finally { $('operation-submit').disabled = false; }
}
document.addEventListener('click', (event) => { const adjust = event.target.closest('[data-adjust]'); if (adjust) return openOperation('adjust', adjust.dataset.adjust); const sale = event.target.closest('[data-sale]'); if (sale) return openOperation('external', sale.dataset.sale); if (event.target.matches('[data-close-modal]') || event.target.closest('[data-close-modal]')) closeOperation(); });
$('open-adjust').addEventListener('click', () => openOperation('adjust')); $('open-external').addEventListener('click', () => openOperation('external')); $('operation-form').addEventListener('submit', submitOperation); $('refresh-inventory').addEventListener('click', async () => Promise.all([loadInventory(), loadMovements()])); $('inventory-search').addEventListener('input', renderInventory); $('inventory-state').addEventListener('change', renderInventory); $('operation-modal').addEventListener('click', (event) => { if (event.target.classList.contains('modal__backdrop')) closeOperation(); }); $('logout-button').addEventListener('click', async () => { $('logout-button').disabled = true; await supabase.auth.signOut(); window.location.href = '../login.html'; });
try { if (await guard()) await Promise.all([loadInventory(), loadVariants(), loadMovements()]); } catch (error) { console.error('[RM SELECT] inventory error:', error); $('module-status').textContent = error?.message || 'No fue posible cargar el inventario.'; $('module-status').className = 'admin-status is-error'; }
