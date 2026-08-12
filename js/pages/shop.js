import { supabase } from '../core/supabase.js';
import { addToCart, getCart, getPublicVariantStock } from '../core/cart.js';

const grid=document.getElementById('shop-products'), category=document.getElementById('category-filter'), search=document.getElementById('product-search');
const money=v=>new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(Number(v||0));
const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));
let products=[];
let availability=new Map();

async function load(){
  grid.innerHTML='<p class="store-loading">Cargando colección…</p>';

  const [{data,error},stockMap]=await Promise.all([
    supabase.from('products').select('id,name,slug,description,base_price,compare_at_price,featured,categories(name),product_variants(id,name,sku,price,is_active),product_images(url,alt_text,sort_order)').eq('status','ACTIVE').order('created_at',{ascending:false}),
    getPublicVariantStock()
  ]);

  if(error)throw error;

  availability=stockMap;
  products=(data||[]).map(p=>({...p,product_variants:(p.product_variants||[]).filter(v=>v.is_active)}));
  render();
}

function availableQuantity(variantId){return availability.get(variantId) ?? 0;}

function cartQuantity(variantId){return Number(getCart().find(item=>item.variant_id===variantId)?.quantity || 0);}

function render(){
  const q=search.value.trim().toLowerCase();
  const cat=category.value;
  const list=products.filter(p=>(!q||`${p.name} ${p.description||''}`.toLowerCase().includes(q))&&(!cat||p.categories?.name===cat));

  if(!list.length){
    grid.innerHTML='<div class="store-empty"><h3>No encontramos productos</h3><p>Prueba otra búsqueda o categoría.</p></div>';
    return;
  }

  grid.innerHTML=list.map(p=>{
    const variants=p.product_variants||[];
    const variant=variants.find(v=>availableQuantity(v.id)>0)||variants[0];
    const image=(p.product_images||[]).sort((a,b)=>a.sort_order-b.sort_order)[0];
    const price=variant?.price??p.base_price;
    const available=variant?availableQuantity(variant.id):0;
    const inCart=variant?cartQuantity(variant.id):0;
    const canAdd=Boolean(variant&&available>inCart);
    const label=available<=0?'Agotado':canAdd?'Agregar al carrito':'Límite en carrito';

    return `<article class="store-product">
      <div class="store-product__image">${image?`<img src="${esc(image.url)}" alt="${esc(image.alt_text||p.name)}" loading="lazy">`:'<span>R&M</span>'}</div>
      <div class="store-product__body">
        <span class="store-product__category">${esc(p.categories?.name||'Colección')}</span>
        <h2>${esc(p.name)}</h2>
        <p>${esc(p.description||'')}</p>
        <strong>${money(price)}</strong>
        ${variants.length>1?`<label class="variant-select">Variante<select data-variant-for="${p.id}">${variants.map(v=>`<option value="${v.id}">${esc(v.name)}${availableQuantity(v.id)<=0?' — Agotada':''}</option>`).join('')}</select></label>`:''}
        <small class="store-stock">${available>0?`${available} disponible${available===1?'':'s'}`:'Sin existencias'}</small>
        <button class="button button--primary add-cart" data-product="${p.id}" data-variant="${variant?.id||''}" ${!canAdd?'disabled':''}>${label}</button>
      </div>
    </article>`;
  }).join('');
}

grid.addEventListener('change',e=>{
  const select=e.target.closest('[data-variant-for]');
  if(!select)return;
  const card=select.closest('.store-product');
  card.querySelector('.add-cart').dataset.variant=select.value;
  const p=products.find(x=>x.id===select.dataset.variantFor);
  const v=p?.product_variants.find(x=>x.id===select.value);
  const available=availableQuantity(v?.id);
  const inCart=cartQuantity(v?.id);
  const canAdd=Boolean(v&&available>inCart);
  card.querySelector('.add-cart').disabled=!canAdd;
  card.querySelector('.add-cart').textContent=available<=0?'Agotado':canAdd?'Agregar al carrito':'Límite en carrito';
  const stockLabel=card.querySelector('.store-stock');
  if(stockLabel)stockLabel.textContent=available>0?`${available} disponible${available===1?'':'s'}`:'Sin existencias';
});

grid.addEventListener('click',async e=>{
  const btn=e.target.closest('.add-cart');
  if(!btn)return;
  const p=products.find(x=>x.id===btn.dataset.product),v=p?.product_variants.find(x=>x.id===btn.dataset.variant);
  if(!v)return;

  btn.disabled=true;
  try{
    availability=await getPublicVariantStock();
    const available=availableQuantity(v.id);
    const inCart=cartQuantity(v.id);
    if(available<=inCart){
      btn.textContent=available<=0?'Agotado':'Límite en carrito';
      return;
    }
    addToCart({variant_id:v.id,product_id:p.id,product_name:p.name,variant_name:v.name,sku:v.sku,price:Number(v.price??p.base_price)});
    btn.textContent='Agregado ✓';
    setTimeout(()=>render(),700);
  }catch(error){
    console.error('[RM SELECT] add to cart stock error:',error);
    btn.disabled=false;
    btn.textContent='Reintentar';
  }
});

search.addEventListener('input',render);
category.addEventListener('change',render);
load().catch(e=>{console.error(e);grid.innerHTML=`<div class="store-empty"><h3>No fue posible cargar la tienda</h3><p>${esc(e.message)}</p></div>`});
