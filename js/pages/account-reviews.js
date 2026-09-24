import { supabase } from '../core/supabase.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[char]));

async function loadReviews() {
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) return;
  const { data: orders, error: ordersError } = await supabase.from('orders').select('id,order_number').eq('customer_id', session.session.user.id).eq('order_status', 'DELIVERED');
  if (ordersError || !orders?.length) return;
  const orderIds = orders.map(order => order.id);
  const [{ data: items, error: itemsError }, { data: reviews, error: reviewsError }] = await Promise.all([
    supabase.from('order_items').select('order_id,product_variants(product_id,products(name))').in('order_id', orderIds),
    supabase.from('product_reviews').select('order_id,product_id').eq('customer_id', session.session.user.id).in('order_id', orderIds),
  ]);
  if (itemsError || reviewsError) return;
  const reviewed = new Set((reviews || []).map(review => `${review.order_id}:${review.product_id}`));
  const pending = (items || []).filter(item => item.product_variants?.product_id && !reviewed.has(`${item.order_id}:${item.product_variants.product_id}`));
  if (!pending.length) return;
  const section = document.createElement('section');
  section.className = 'account-reviews';
  section.innerHTML = `<div class="store-heading"><div><p class="eyebrow">TU EXPERIENCIA</p><h2>Reseñas verificadas</h2></div></div><div class="orders-list">${pending.map(item => `<form class="review-form order-card" data-order="${item.order_id}" data-product="${item.product_variants.product_id}"><div><strong>${esc(item.product_variants.products?.name || 'Producto')}</strong><small>Comparte tu experiencia con esta compra.</small></div><label>Calificación<select name="rating" required><option value="5">5 · Excelente</option><option value="4">4 · Muy buena</option><option value="3">3 · Buena</option><option value="2">2 · Regular</option><option value="1">1 · Mala</option></select></label><label>Comentario<textarea name="comment" required minlength="10" maxlength="1000" placeholder="Cuéntanos qué te pareció"></textarea></label><button class="button button--primary" type="submit">Enviar reseña</button><p class="auth-status" role="status"></p></form>`).join('')}</div>`;
  document.querySelector('.store-shell').appendChild(section);
  section.addEventListener('submit', async event => {
    const form = event.target.closest('.review-form'); if (!form) return; event.preventDefault();
    const button = form.querySelector('button'); const status = form.querySelector('.auth-status'); button.disabled = true;
    const { error } = await supabase.from('product_reviews').insert({ order_id: form.dataset.order, product_id: form.dataset.product, customer_id: session.session.user.id, rating: Number(form.rating.value), comment: form.comment.value.trim() });
    if (error) { status.textContent = error.message; status.className = 'auth-status is-error'; button.disabled = false; return; }
    status.textContent = 'Gracias. Tu reseña será revisada antes de publicarse.'; status.className = 'auth-status is-success'; form.reset(); button.disabled = true;
  });
}

loadReviews().catch(error => console.warn('[RM SELECT] reviews module error:', error));
