import { getCartCount } from '../cart/cart.js';

const intro = document.querySelector('#intro');
const header = document.querySelector('.site-header');

if (intro && sessionStorage.getItem('rm-select-intro-seen')) intro.remove();
else if (intro) sessionStorage.setItem('rm-select-intro-seen', '1');

window.addEventListener('scroll', () => {
  header?.classList.toggle('scrolled', window.scrollY > 20);
}, { passive: true });

document.querySelectorAll('#cart-count, [data-cart-count]').forEach((el) => {
  el.textContent = getCartCount();
});
