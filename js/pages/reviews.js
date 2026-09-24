import { supabase } from '../core/supabase.js';

const list = document.getElementById('reviews-list');
const filter = document.getElementById('reviews-filter');
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[char]));
let reviews = [];

function render() {
  const rows = filter.value ? reviews.filter(review => review.status === filter.value) : reviews;
  list.innerHTML = rows.length ? rows.map(review => `<article class="review-row"><div><strong>${esc(review.products?.name || 'Producto')}</strong><span>${esc(review.customer?.full_name || 'Cliente')} · ${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)}</span><p>${esc(review.comment)}</p></div><div><span class="product-state state-${review.status === 'PUBLISHED' ? 'active' : review.status === 'REJECTED' ? 'archived' : 'draft'}">${esc(review.status)}</span><div class="review-actions">${review.status !== 'PUBLISHED' ? `<button class="button button--small" data-review="${review.id}" data-status="PUBLISHED">Publicar</button>` : ''}${review.status !== 'REJECTED' ? `<button class="button button--small button--ghost" data-review="${review.id}" data-status="REJECTED">Rechazar</button>` : ''}</div></div></article>`).join('') : '<div class="admin-empty"><strong>No hay reseñas en este estado.</strong></div>';
}

async function load() {
  const { data, error } = await supabase.from('product_reviews').select('id,rating,comment,status,created_at,products(name),customer:profiles!product_reviews_customer_id_fkey(full_name)').order('created_at', { ascending: false });
  if (error) throw error;
  reviews = data || [];
  render();
}

list.addEventListener('click', async event => {
  const button = event.target.closest('[data-review]'); if (!button) return;
  button.disabled = true;
  const { error } = await supabase.from('product_reviews').update({ status: button.dataset.status, moderated_at: new Date().toISOString() }).eq('id', button.dataset.review);
  if (error) { alert(error.message); button.disabled = false; return; }
  await load();
});
filter.addEventListener('change', render);
load().catch(error => { list.innerHTML = `<div class="admin-status is-error">${esc(error.message)}</div>`; });
