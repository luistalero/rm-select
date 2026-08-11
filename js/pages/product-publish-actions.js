import { supabase } from '../core/supabase.js';

const list = document.getElementById('products-list');
if (!list) throw new Error('Products list not found.');

const modal = document.createElement('div');
modal.className = 'admin-modal';
modal.hidden = true;
modal.innerHTML = `
  <div class="admin-modal-backdrop" data-publish-close></div>
  <section class="admin-modal-card admin-publish-modal" role="dialog" aria-modal="true" aria-labelledby="publish-modal-title">
    <header class="admin-modal-header">
      <div><p class="eyebrow">CATÁLOGO</p><h2 id="publish-modal-title">Publicar producto</h2></div>
      <button class="admin-close" type="button" data-publish-close aria-label="Cerrar">×</button>
    </header>
    <div class="admin-form">
      <div class="publish-product-summary"><span id="publish-product-state">BORRADOR</span><strong id="publish-product-name"></strong><p id="publish-product-message"></p></div>
      <div id="publish-product-error" class="admin-status is-error" hidden></div>
      <footer class="admin-modal-actions">
        <button class="button button--ghost" type="button" data-publish-close>Cancelar</button>
        <button id="publish-product-confirm" class="button" type="button">Publicar</button>
      </footer>
    </div>
  </section>`;
document.body.appendChild(modal);

let selected = null;
let busy = false;

const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#039;', '"':'&quot;' }[c]));

function open(product) {
  selected = product;
  busy = false;
  document.getElementById('publish-modal-title').textContent = product.status === 'ACTIVE' ? 'Despublicar producto' : 'Publicar producto';
  document.getElementById('publish-product-state').textContent = product.status === 'ACTIVE' ? 'PUBLICADO' : 'BORRADOR';
  document.getElementById('publish-product-name').textContent = product.name;
  document.getElementById('publish-product-message').textContent = product.status === 'ACTIVE'
    ? 'El producto dejará de aparecer en la tienda, pero seguirá guardado en el catálogo.'
    : 'El producto pasará a ACTIVO y podrá aparecer públicamente en la tienda.';
  document.getElementById('publish-product-confirm').textContent = product.status === 'ACTIVE' ? 'Despublicar' : 'Publicar';
  document.getElementById('publish-product-error').hidden = true;
  modal.hidden = false;
}

function close() { if (!busy) modal.hidden = true; }

async function execute() {
  if (!selected || busy) return;
  busy = true;
  const button = document.getElementById('publish-product-confirm');
  const errorBox = document.getElementById('publish-product-error');
  button.disabled = true;
  button.textContent = 'Guardando…';
  errorBox.hidden = true;
  try {
    const nextStatus = selected.status === 'ACTIVE' ? 'DRAFT' : 'ACTIVE';
    const { error } = await supabase.from('products').update({ status: nextStatus }).eq('id', selected.id);
    if (error) throw error;
    modal.hidden = true;
    // Re-render the existing product module by dispatching an input event.
    const search = document.getElementById('product-search');
    search?.dispatchEvent(new Event('input', { bubbles: true }));
    window.location.reload();
  } catch (error) {
    console.error('[RM SELECT] product publication error:', error);
    errorBox.textContent = error?.message || 'No fue posible actualizar la publicación del producto.';
    errorBox.hidden = false;
    button.disabled = false;
    button.textContent = selected.status === 'ACTIVE' ? 'Despublicar' : 'Publicar';
    busy = false;
  }
}

list.addEventListener('click', async event => {
  const action = event.target.closest('[data-publish], [data-unpublish]');
  if (!action) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const id = action.dataset.publish || action.dataset.unpublish;
  const { data, error } = await supabase.from('products').select('id,name,status').eq('id', id).single();
  if (error) {
    console.error('[RM SELECT] product publication lookup error:', error);
    return;
  }
  open(data);
}, true);

// The original renderer only adds a button for DRAFT products. Add the matching
// DESPUBLICAR action for ACTIVE products without duplicating the product renderer.
const observer = new MutationObserver(() => {
  document.querySelectorAll('.product-admin-card').forEach(card => {
    const state = card.querySelector('.product-state')?.textContent?.trim();
    const actions = card.querySelector('.product-admin-actions');
    if (!actions || !state || state === 'DRAFT' || actions.querySelector('[data-unpublish]')) return;
    const edit = actions.querySelector('[data-edit]');
    if (!edit) return;
    const button = document.createElement('button');
    button.className = 'button button--small button--ghost';
    button.type = 'button';
    button.dataset.unpublish = edit.dataset.edit;
    button.textContent = 'Despublicar';
    actions.appendChild(button);
  });
});
observer.observe(list, { childList: true, subtree: true });

document.addEventListener('click', event => {
  if (event.target.closest('[data-publish-close]')) close();
});
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !modal.hidden) close(); });
document.getElementById('publish-product-confirm').addEventListener('click', execute);
