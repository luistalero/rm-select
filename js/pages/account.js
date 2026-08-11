import { supabase } from '../core/supabase.js';
const nameEl=document.getElementById('account-name'), emailEl=document.getElementById('account-email'), ordersEl=document.getElementById('account-orders');
const money=v=>new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(Number(v||0));
const labels={PENDING_PAYMENT:'Pendiente de pago',PAYMENT_REVIEW:'Revisión de pago',CONFIRMED:'Confirmado',PREPARING:'Preparando',SHIPPED:'Enviado',DELIVERED:'Entregado',CANCELLED:'Cancelado',EXPIRED:'Expirado'};
const escapeHtml=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));
const {data,error}=await supabase.auth.getSession();
if(error||!data.session){location.href='login.html';throw new Error('No session');}
const user=data.session.user;
const {data:profile,error:profileError}=await supabase.from('profiles').select('full_name,role,phone').eq('id',user.id).single();
if(profileError) console.error(profileError);
if(profile?.role!=='CUSTOMER'){location.href='admin/index.html';throw new Error('Staff account');}
nameEl.textContent=profile?.full_name||user.user_metadata?.full_name||'Cliente'; emailEl.textContent=user.email||'';
const {data:orders,error:ordersError}=await supabase.from('orders').select('id,order_number,order_status,payment_status,total,created_at').eq('customer_id',user.id).order('created_at',{ascending:false});
if(ordersError){ordersEl.innerHTML='<p class="store-empty">No fue posible cargar tus pedidos.</p>';}
else if(!orders?.length){ordersEl.innerHTML='<div class="store-empty"><h3>Aún no tienes pedidos</h3><p>Cuando realices tu primera compra aparecerá aquí.</p></div>';}
else ordersEl.innerHTML=orders.map(o=>`<article class="order-card"><div><strong>Pedido #${escapeHtml(o.order_number)}</strong><small>${new Date(o.created_at).toLocaleString('es-CO')}</small></div><span class="status-pill">${escapeHtml(labels[o.order_status]||o.order_status)}</span><strong>${money(o.total)}</strong></article>`).join('');
document.getElementById('logout-button').addEventListener('click',async()=>{await supabase.auth.signOut();location.href='../index.html';});
