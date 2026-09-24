import { supabase } from '../core/supabase.js';

const form = document.getElementById('settings-form');
const status = document.getElementById('settings-status');
const button = document.getElementById('settings-save');
let canEdit = false;

function message(text, type = '') { status.textContent = text; status.className = `admin-status${type ? ` is-${type}` : ''}`; }

async function load() {
  const { data: session } = await supabase.auth.getSession();
  const { data: profile, error: profileError } = await supabase.from('profiles').select('role').eq('id', session.session.user.id).single();
  if (profileError) throw profileError;
  canEdit = profile.role === 'SUPER_ADMIN';
  const { data, error } = await supabase.from('business_settings').select('business_name,whatsapp_numbers,payment_instructions,shipping_policy').eq('id', true).single();
  if (error) throw error;
  form.business_name.value = data.business_name || '';
  form.whatsapp_numbers.value = (data.whatsapp_numbers || []).join(', ');
  form.payment_instructions.value = data.payment_instructions || '';
  form.shipping_policy.value = data.shipping_policy || '';
  [...form.elements].forEach(element => { if (element.tagName !== 'P') element.disabled = !canEdit; });
  message(canEdit ? 'Configuración lista para editar.' : 'Solo SUPER_ADMIN puede modificar la configuración.', canEdit ? 'success' : '');
}

form.addEventListener('submit', async event => {
  event.preventDefault(); if (!canEdit) return;
  button.disabled = true;
  const payload = { business_name: form.business_name.value.trim(), whatsapp_numbers: form.whatsapp_numbers.value.split(',').map(value => value.trim()).filter(Boolean), payment_instructions: form.payment_instructions.value.trim() || null, shipping_policy: form.shipping_policy.value.trim() || null };
  const { error } = await supabase.from('business_settings').update(payload).eq('id', true);
  button.disabled = false;
  message(error ? error.message : 'Configuración guardada.', error ? 'error' : 'success');
});
load().catch(error => message(error.message, 'error'));
