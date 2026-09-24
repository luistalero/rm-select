import '../core/ui.js';
import { getFeaturedProducts } from '../services/catalog.js';

const root = document.getElementById('featured-products');
const money = value => new Intl.NumberFormat('es-CO', {
  style: 'currency', currency: 'COP', maximumFractionDigits: 0,
}).format(Number(value || 0));
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
}[char]));

async function loadFeaturedProducts() {
  if (!root) return;
  root.innerHTML = '<div class="product-skeleton"></div><div class="product-skeleton"></div><div class="product-skeleton"></div>';
  try {
    const products = await getFeaturedProducts(3);
    if (!products.length) {
      root.innerHTML = '<p class="featured-empty">Muy pronto encontrarás piezas destacadas aquí.</p>';
      return;
    }
    root.innerHTML = products.map(product => {
      const image = [...(product.product_images || [])].sort((a, b) => a.sort_order - b.sort_order)[0];
      const variant = (product.product_variants || []).find(item => item.is_active);
      const price = variant?.price ?? product.base_price;
      return `<article class="featured-product">
        <div class="featured-product__image">${image
          ? `<img src="${escapeHtml(image.url)}" alt="${escapeHtml(image.alt_text || product.name)}" loading="lazy">`
          : '<span>R&M</span>'}</div>
        <div><p class="eyebrow">${escapeHtml(product.categories?.name || 'Colección')}</p><h3>${escapeHtml(product.name)}</h3><strong>${money(price)}</strong></div>
        <a class="text-link" href="pages/shop.html">Ver en tienda</a>
      </article>`;
    }).join('');
  } catch (error) {
    console.error('[RM SELECT] featured products error:', error);
    root.innerHTML = '<p class="featured-empty">No fue posible cargar los productos destacados.</p>';
  }
}

loadFeaturedProducts();
