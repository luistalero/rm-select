import { supabase } from '../core/supabase.js';
import { config } from '../core/config.js';

const $ = (id) => document.getElementById(id);
const status = $('module-status');
const list = $('products-list');
const productStatus = $('product-status');
const modal = $('product-modal');
const categoryModal = $('category-modal');
const form = $('product-form');
const categoryForm = $('category-form');
const saveButton = $('save-product');
const saveCategoryButton = $('save-category');
const imageInput = $('product-images');
const preview = $('image-preview');
let currentUser = null;
let categories = [];
let products = [];

function esc(value = '') {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#039;', '"':'&quot;' }[char]));
}

function money(value) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(value || 0));
}

function slugify(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function showMessage(message, type = 'success') {
  productStatus.hidden = false;
  productStatus.textContent = message;
  productStatus.className = `admin-status is-${type}`;
}

async function guard() {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) {
    window.location.href = '../login.html';
    return false;
  }
  currentUser = data.session.user;
  const { data: profile, error: profileError } = await supabase.from('profiles').select('full_name, role').eq('id', currentUser.id).single();
  if (profileError) throw profileError;
  if (!['ADMIN', 'SUPER_ADMIN'].includes(profile.role)) {
    await supabase.auth.signOut();
    window.location.href = '../login.html';
    return false;
  }
  $('module-user').textContent = profile.full_name || currentUser.email || 'Usuario';
  $('module-role').textContent = profile.role;
  status.textContent = `Sesión activa como ${profile.role}.`;
  status.className = 'admin-status is-success';
  return true;
}

function populateCategoryControls() {
  const activeOptions = categories.filter((category) => category.is_active);
  const allOptions = categories;
  $('category-filter').innerHTML = '<option value="">Todas</option>' + allOptions.map((category) => `<option value="${category.id}">${esc(category.name)}${category.is_active ? '' : ' (inactiva)'}</option>`).join('');
  $('product-category').innerHTML = '<option value="">Sin categoría</option>' + activeOptions.map((category) => `<option value="${category.id}">${esc(category.name)}</option>`).join('');
}

async function loadCategories() {
  const { data, error } = await supabase.from('categories').select('id,name,slug,description,sort_order,is_active,created_at,updated_at').order('sort_order').order('name');
  if (error) throw error;
  categories = data || [];
  populateCategoryControls();
  renderCategories();
}

function renderCategories() {
  const categoryList = $('categories-list');
  $('category-count').textContent = `${categories.length}`;
  if (!categories.length) {
    categoryList.innerHTML = '<div class="admin-empty"><strong>No hay categorías.</strong><span>Crea la primera para organizar el catálogo.</span></div>';
    return;
  }
  categoryList.innerHTML = categories.map((category) => `
    <article class="category-admin-card">
      <div class="category-admin-order">${esc(category.sort_order)}</div>
      <div class="category-admin-main">
        <strong>${esc(category.name)}</strong>
        <span>${esc(category.slug)}${category.description ? ` · ${esc(category.description)}` : ''}</span>
      </div>
      <span class="category-admin-state ${category.is_active ? 'is-active' : 'is-inactive'}">${category.is_active ? 'ACTIVA' : 'INACTIVA'}</span>
      <div class="category-admin-actions">
        <button class="button button--small button--ghost" type="button" data-edit-category="${category.id}">Editar</button>
        <button class="button button--small button--ghost" type="button" data-toggle-category="${category.id}">${category.is_active ? 'Desactivar' : 'Activar'}</button>
      </div>
    </article>
  `).join('');
}

function resetCategoryForm() {
  categoryForm.reset();
  $('category-id').value = '';
  $('category-sort-order').value = '0';
  $('category-active').checked = true;
  $('category-modal-title').textContent = 'Gestionar categorías';
  saveCategoryButton.textContent = 'Crear categoría';
  $('category-form-error').hidden = true;
}

function editCategory(category) {
  $('category-id').value = category.id;
  $('category-name').value = category.name;
  $('category-description').value = category.description || '';
  $('category-sort-order').value = category.sort_order ?? 0;
  $('category-active').checked = Boolean(category.is_active);
  $('category-modal-title').textContent = 'Editar categoría';
  saveCategoryButton.textContent = 'Guardar cambios';
  $('category-form-error').hidden = true;
  $('category-name').focus();
}

function openCategoryModal() {
  resetCategoryForm();
  categoryModal.hidden = false;
  $('category-name').focus();
}

function closeCategoryModal() {
  categoryModal.hidden = true;
  resetCategoryForm();
}

async function saveCategory(event) {
  event.preventDefault();
  const errorBox = $('category-form-error');
  errorBox.hidden = true;
  saveCategoryButton.disabled = true;
  saveCategoryButton.textContent = 'Guardando…';
  try {
    const id = $('category-id').value || null;
    const name = $('category-name').value.trim();
    if (!name) throw new Error('El nombre de la categoría es obligatorio.');
    const slug = slugify(name);
    if (!slug) throw new Error('El nombre no genera un slug válido.');
    const sortOrder = Number($('category-sort-order').value || 0);
    if (!Number.isInteger(sortOrder) || sortOrder < 0) throw new Error('El orden debe ser un número entero mayor o igual a 0.');
    const payload = {
      name,
      slug,
      description: $('category-description').value.trim() || null,
      sort_order: sortOrder,
      is_active: $('category-active').checked,
    };
    const query = id
      ? supabase.from('categories').update(payload).eq('id', id)
      : supabase.from('categories').insert(payload);
    const { error } = await query;
    if (error) throw error;
    await loadCategories();
    resetCategoryForm();
    showMessage(id ? 'Categoría actualizada correctamente.' : 'Categoría creada correctamente.', 'success');
  } catch (error) {
    console.error('[RM SELECT] category save error:', error);
    errorBox.textContent = error?.code === '23505' ? 'Ya existe una categoría con ese nombre o slug.' : (error?.message || 'No fue posible guardar la categoría.');
    errorBox.hidden = false;
  } finally {
    saveCategoryButton.disabled = false;
    saveCategoryButton.textContent = $('category-id').value ? 'Guardar cambios' : 'Crear categoría';
  }
}

async function toggleCategory(id) {
  const category = categories.find((item) => item.id === id);
  if (!category) return;
  const nextState = !category.is_active;
  const action = nextState ? 'activar' : 'desactivar';
  if (!confirm(`¿Quieres ${action} la categoría “${category.name}”?`)) return;
  const { error } = await supabase.from('categories').update({ is_active: nextState }).eq('id', id);
  if (error) {
    showMessage(error.message, 'error');
    return;
  }
  await loadCategories();
  showMessage(`Categoría ${nextState ? 'activada' : 'desactivada'} correctamente.`, 'success');
}

async function loadProducts() {
  list.innerHTML = '<div class="admin-status">Cargando productos…</div>';
  const { data, error } = await supabase.from('products').select('id,category_id,name,slug,description,sku,base_price,compare_at_price,status,featured,created_at,categories(name)').order('created_at', { ascending: false });
  if (error) throw error;
  products = data || [];
  renderProducts();
}

function renderProducts() {
  const query = $('product-search').value.trim().toLowerCase();
  const categoryId = $('category-filter').value;
  const filtered = products.filter((product) => {
    const matchesQuery = !query || `${product.name} ${product.sku || ''}`.toLowerCase().includes(query);
    const matchesCategory = !categoryId || product.category_id === categoryId;
    return matchesQuery && matchesCategory;
  });
  $('product-count').textContent = `${filtered.length} producto${filtered.length === 1 ? '' : 's'}`;
  if (!filtered.length) {
    list.innerHTML = '<div class="admin-empty"><strong>No hay productos para mostrar.</strong><span>Crea el primero o cambia los filtros.</span></div>';
    return;
  }
  list.innerHTML = filtered.map((product) => `
    <article class="product-admin-card">
      <div class="product-admin-thumb" data-product-image="${product.id}">⌚</div>
      <div class="product-admin-main">
        <div class="product-admin-title"><strong>${esc(product.name)}</strong><span class="product-state state-${esc(product.status).toLowerCase()}">${esc(product.status)}</span></div>
        <span>${esc(product.categories?.name || 'Sin categoría')} · ${esc(product.sku || 'Sin SKU')}</span>
        <strong>${money(product.base_price)}</strong>
      </div>
      <div class="product-admin-meta"><span>${product.featured ? 'Destacado' : 'No destacado'}</span><small>${new Date(product.created_at).toLocaleDateString('es-CO')}</small></div>
      <div class="product-admin-actions"><button class="button button--small button--ghost" data-edit="${product.id}">Editar</button>${product.status === 'DRAFT' ? `<button class="button button--small" data-publish="${product.id}">Publicar</button>` : ''}</div>
    </article>`).join('');
  loadFirstImages(filtered.map((p) => p.id));
}

async function loadFirstImages(ids) {
  if (!ids.length) return;
  const { data } = await supabase.from('product_images').select('product_id,url,sort_order').in('product_id', ids).order('sort_order');
  for (const image of data || []) {
    const holder = document.querySelector(`[data-product-image="${image.product_id}"]`);
    if (holder && holder.dataset.loaded !== 'true') {
      holder.dataset.loaded = 'true';
      holder.innerHTML = `<img src="${esc(image.url)}" alt="" loading="lazy">`;
    }
  }
}

function openModal(product = null) {
  form.reset();
  $('product-id').value = product?.id || '';
  $('modal-title').textContent = product ? 'Editar producto' : 'Nuevo producto';
  $('product-name').value = product?.name || '';
  $('product-sku').value = product?.sku || '';
  $('product-category').value = product?.category_id || '';
  $('product-price').value = product?.base_price ?? '';
  $('product-compare-price').value = product?.compare_at_price ?? '';
  $('product-description').value = product?.description || '';
  $('product-featured').checked = Boolean(product?.featured);
  $('variant-name').value = '';
  $('variant-sku').value = '';
  $('variant-price').value = '';
  preview.innerHTML = '';
  $('form-error').hidden = true;
  imageInput.value = '';
  modal.hidden = false;
  $('product-name').focus();
}

function closeModal() { modal.hidden = true; }

async function uploadImages(files, productId) {
  const uploaded = [];
  if (!files.length) return uploaded;
  if (!config.cloudinaryCloudName || config.cloudinaryCloudName === 'YOUR_CLOUD_NAME') throw new Error('Cloudinary no está configurado en el build de producción.');
  if (!config.cloudinaryUploadPreset || config.cloudinaryUploadPreset === 'YOUR_UPLOAD_PRESET') throw new Error('El upload preset de Cloudinary no está configurado.');
  for (const file of files) {
    const body = new FormData();
    body.append('file', file);
    body.append('upload_preset', config.cloudinaryUploadPreset);
    const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(config.cloudinaryCloudName)}/image/upload`, { method: 'POST', body });
    const result = await response.json();
    if (!response.ok) throw new Error(result?.error?.message || 'Cloudinary rechazó una imagen.');
    uploaded.push({ product_id: productId, cloudinary_public_id: result.public_id || null, url: result.secure_url, alt_text: $('product-name').value.trim(), sort_order: uploaded.length });
  }
  return uploaded;
}

async function saveProduct(event) {
  event.preventDefault();
  $('form-error').hidden = true;
  saveButton.disabled = true;
  saveButton.textContent = 'Guardando…';
  try {
    const id = $('product-id').value || null;
    const name = $('product-name').value.trim();
    const price = Number($('product-price').value);
    if (!name || !Number.isFinite(price) || price < 0) throw new Error('Completa el nombre y un precio válido.');
    const payload = {
      name,
      slug: slugify(name),
      description: $('product-description').value.trim() || null,
      sku: $('product-sku').value.trim() || null,
      category_id: $('product-category').value || null,
      base_price: price,
      compare_at_price: $('product-compare-price').value ? Number($('product-compare-price').value) : null,
      featured: $('product-featured').checked,
    };
    let productId = id;
    if (id) {
      const { error } = await supabase.from('products').update(payload).eq('id', id);
      if (error) throw error;
    } else {
      const { data, error } = await supabase.from('products').insert(payload).select('id').single();
      if (error) throw error;
      productId = data.id;
    }

    const variantName = $('variant-name').value.trim();
    if (!id && variantName) {
      const variantPayload = { product_id: productId, name: variantName, sku: $('variant-sku').value.trim() || null, price: $('variant-price').value ? Number($('variant-price').value) : null };
      const { error } = await supabase.from('product_variants').insert(variantPayload);
      if (error) throw error;
    }

    const files = Array.from(imageInput.files || []);
    if (files.length) {
      const images = await uploadImages(files, productId);
      const { error } = await supabase.from('product_images').insert(images);
      if (error) throw error;
    }
    closeModal();
    showMessage(id ? 'Producto actualizado correctamente.' : 'Producto creado como BORRADOR.', 'success');
    await loadProducts();
  } catch (error) {
    console.error('[RM SELECT] product save error:', error);
    $('form-error').textContent = error?.message || 'No fue posible guardar el producto.';
    $('form-error').hidden = false;
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = 'Guardar producto';
  }
}

async function publishProduct(id) {
  const product = products.find((item) => item.id === id);
  if (!product || !confirm(`¿Publicar “${product.name}”? Quedará visible en la tienda si cumple las condiciones del catálogo.`)) return;
  const { error } = await supabase.from('products').update({ status: 'ACTIVE' }).eq('id', id);
  if (error) {
    showMessage(error.message, 'error');
    return;
  }
  showMessage('Producto publicado correctamente.', 'success');
  await loadProducts();
}

$('new-product-button').addEventListener('click', () => openModal());
$('manage-categories-button').addEventListener('click', openCategoryModal);
$('product-search').addEventListener('input', renderProducts);
$('category-filter').addEventListener('change', renderProducts);
form.addEventListener('submit', saveProduct);
categoryForm.addEventListener('submit', saveCategory);
$('cancel-category-edit').addEventListener('click', resetCategoryForm);
imageInput.addEventListener('change', () => {
  preview.innerHTML = Array.from(imageInput.files || []).map((file) => `<span>${esc(file.name)}</span>`).join('');
});
list.addEventListener('click', (event) => {
  const edit = event.target.closest('[data-edit]');
  const publish = event.target.closest('[data-publish]');
  if (edit) openModal(products.find((product) => product.id === edit.dataset.edit));
  if (publish) publishProduct(publish.dataset.publish);
});
$('categories-list').addEventListener('click', (event) => {
  const edit = event.target.closest('[data-edit-category]');
  const toggle = event.target.closest('[data-toggle-category]');
  if (edit) {
    const category = categories.find((item) => item.id === edit.dataset.editCategory);
    if (category) editCategory(category);
  }
  if (toggle) toggleCategory(toggle.dataset.toggleCategory);
});
document.querySelectorAll('[data-close-modal]').forEach((element) => element.addEventListener('click', closeModal));
document.querySelectorAll('[data-close-category-modal]').forEach((element) => element.addEventListener('click', closeCategoryModal));
$('logout-button').addEventListener('click', async () => { await supabase.auth.signOut(); window.location.href = '../login.html'; });
$('menu-button')?.addEventListener('click', () => $('admin-sidebar').classList.toggle('is-open'));

try {
  if (await guard()) {
    await loadCategories();
    await loadProducts();
  }
} catch (error) {
  console.error('[RM SELECT] products module error:', error);
  status.textContent = error?.message || 'No fue posible cargar el catálogo.';
  status.className = 'admin-status is-error';
}
