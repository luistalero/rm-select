import { supabase } from '../core/supabase.js';

const $ = (id) => document.getElementById(id);
let variants = [];

const esc = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#039;', '"':'&quot;' }[char]));
const money = (value) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(value || 0));

function showError(message) {
  const box = $('variant-form-error');
  if (box) { box.textContent = message; box.hidden = false; }
}

function clearForm() {
  $('variant-id').value = '';
  $('variant-name').value = '';
  $('variant-sku').value = '';
  $('variant-price').value = '';
  $('variant-attributes').value = '';
  $('variant-active').checked = true;
  $('variant-form-error').hidden = true;
  $('variant-form').hidden = true;
}

function openForm(variant = null) {
  $('variant-id').value = variant?.id || '';
  $('variant-name').value = variant?.name || '';
  $('variant-sku').value = variant?.sku || '';
  $('variant-price').value = variant?.price ?? '';
  $('variant-attributes').value = variant?.attributes && Object.keys(variant.attributes).length ? JSON.stringify(variant.attributes) : '';
  $('variant-active').checked = variant ? Boolean(variant.is_active) : true;
  $('variant-form-error').hidden = true;
  $('variant-form').hidden = false;
  $('variant-name').focus();
}

function syncVariantControls() {
  const productId = $('product-id')?.value || '';
  const modal = $('product-modal');
  const button = $('new-variant-button');
  const canManage = Boolean(productId) && modal && !modal.hidden;
  if (button) button.disabled = !canManage;
  if (!canManage) {
    variants = [];
    if ($('variants-list')) $('variants-list').innerHTML = '';
    if ($('variant-empty')) $('variant-empty').hidden = false;
    if ($('variant-form')) $('variant-form').hidden = true;
  }
  return canManage;
}

async function loadVariants() {
  const productId = $('product-id')?.value;
  const list = $('variants-list');
  if (!productId || !list) return;
  const { data, error } = await supabase
    .from('product_variants')
    .select('id,product_id,name,sku,price,attributes,is_active')
    .eq('product_id', productId)
    .order('created_at');
  if (error) { showError(error.message); return; }
  variants = data || [];
  renderVariants();
}

function renderVariants() {
  const list = $('variants-list');
  const empty = $('variant-empty');
  if (!list || !empty) return;
  empty.hidden = variants.length > 0;
  list.innerHTML = variants.map((variant) => `<article class="variant-admin-card">
    <div><strong>${esc(variant.name)}</strong><span>${esc(variant.sku || 'Sin SKU')} · ${variant.price == null ? 'Precio del producto' : money(variant.price)}</span>${variant.attributes && Object.keys(variant.attributes).length ? `<small>${esc(JSON.stringify(variant.attributes))}</small>` : ''}</div>
    <span class="category-admin-state ${variant.is_active ? 'is-active' : 'is-inactive'}">${variant.is_active ? 'ACTIVA' : 'INACTIVA'}</span>
    <div class="variant-admin-actions"><button type="button" class="button button--small button--ghost" data-edit-variant="${variant.id}">Editar</button><button type="button" class="button button--small button--ghost" data-toggle-variant="${variant.id}">${variant.is_active ? 'Desactivar' : 'Activar'}</button></div>
  </article>`).join('');
}

async function ensureInventory(variantId) {
  const { error } = await supabase.from('inventory').insert({ variant_id: variantId, stock_on_hand: 0, stock_reserved: 0 });
  if (error && error.code !== '23505') throw error;
}

async function saveVariant() {
  const productId = $('product-id').value;
  if (!productId) { showError('Primero guarda el producto.'); return; }
  const button = $('save-variant');
  button.disabled = true;
  button.textContent = 'Guardando…';
  $('variant-form-error').hidden = true;
  try {
    const id = $('variant-id').value || null;
    const name = $('variant-name').value.trim();
    if (!name) throw new Error('El nombre de la variante es obligatorio.');
    const raw = $('variant-attributes').value.trim();
    let attributes = {};
    if (raw) {
      try { attributes = JSON.parse(raw); } catch { throw new Error('Los atributos deben ser JSON válido.'); }
      if (!attributes || Array.isArray(attributes) || typeof attributes !== 'object') throw new Error('Los atributos deben ser un objeto JSON.');
    }
    const priceRaw = $('variant-price').value.trim();
    const price = priceRaw === '' ? null : Number(priceRaw);
    if (price !== null && (!Number.isFinite(price) || price < 0)) throw new Error('El precio de la variante no es válido.');
    const payload = { product_id: productId, name, sku: $('variant-sku').value.trim() || null, price, attributes, is_active: $('variant-active').checked };
    if (id) {
      const { error } = await supabase.from('product_variants').update(payload).eq('id', id);
      if (error) throw error;
    } else {
      const { data, error } = await supabase.from('product_variants').insert(payload).select('id').single();
      if (error) throw error;
      await ensureInventory(data.id);
    }
    clearForm();
    await loadVariants();
    const status = $('product-status');
    if (status) { status.hidden = false; status.textContent = id ? 'Variante actualizada correctamente.' : 'Variante creada y preparada para inventario.'; status.className = 'admin-status is-success'; }
  } catch (error) {
    console.error('[RM SELECT] variant save error:', error);
    showError(error?.code === '23505' ? 'Ya existe una variante con ese SKU o identificador.' : error?.message || 'No fue posible guardar la variante.');
  } finally {
    button.disabled = false;
    button.textContent = 'Guardar variante';
  }
}

async function toggleVariant(id) {
  const variant = variants.find((item) => item.id === id);
  if (!variant) return;
  if (!confirm(`¿Quieres ${variant.is_active ? 'desactivar' : 'activar'} la variante “${variant.name}”?`)) return;
  const { error } = await supabase.from('product_variants').update({ is_active: !variant.is_active }).eq('id', id);
  if (error) { showError(error.message); return; }
  await loadVariants();
}

$('new-variant-button')?.addEventListener('click', () => {
  if (!syncVariantControls()) {
    showError('Primero guarda el producto y vuelve a abrirlo para agregar variantes.');
    return;
  }
  openForm();
});
$('cancel-variant')?.addEventListener('click', clearForm);
$('save-variant')?.addEventListener('click', saveVariant);
$('variants-list')?.addEventListener('click', (event) => {
  const edit = event.target.closest('[data-edit-variant]');
  const toggle = event.target.closest('[data-toggle-variant]');
  if (edit) {
    const variant = variants.find((item) => item.id === edit.dataset.editVariant);
    if (variant) openForm(variant);
  }
  if (toggle) toggleVariant(toggle.dataset.toggleVariant);
});

const modal = $('product-modal');
if (modal) {
  const sync = () => {
    if (syncVariantControls()) loadVariants();
  };

  new MutationObserver(sync).observe(modal, { attributes: true, attributeFilter: ['hidden'] });
  document.addEventListener('rm-select:product-modal-open', sync);
  document.addEventListener('rm-select:product-saved', sync);

  // products.js changes the input value before showing the modal. A value
  // property change does not fire a MutationObserver, so synchronize after
  // the product/edit click has completed as a fallback.
  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-edit], #new-product-button')) {
      setTimeout(sync, 0);
    }
  });

  sync();
}
