import { supabase } from '../core/supabase.js';

const shell = document.querySelector('.store-shell');
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[char]));

async function loadProfileEditor() {
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData.session?.user;
  if (!user) return;
  const { data: profile, error } = await supabase.from('profiles')
    .select('full_name,phone,document_number,role').eq('id', user.id).single();
  if (error || profile?.role !== 'CUSTOMER') return;

  const section = document.createElement('section');
  section.className = 'account-profile-section';
  section.innerHTML = `<div class="store-heading"><div><p class="eyebrow">DATOS PERSONALES</p><h2>Mi perfil</h2></div></div>
    <form class="account-profile-form" id="account-profile-form">
      <label>Nombre completo<input name="full_name" required maxlength="160" value="${escapeHtml(profile.full_name)}"></label>
      <label>Teléfono<input name="phone" autocomplete="tel" maxlength="40" value="${escapeHtml(profile.phone || '')}"></label>
      <label>Documento<input name="document_number" maxlength="80" value="${escapeHtml(profile.document_number || '')}"></label>
      <div><button class="button button--primary" type="submit">Guardar cambios</button><p class="auth-status" role="status"></p></div>
    </form>`;
  shell.querySelector('.account-card').after(section);

  section.querySelector('form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button');
    const status = form.querySelector('.auth-status');
    if (!form.reportValidity()) return;
    button.disabled = true;
    const { error: updateError } = await supabase.from('profiles').update({
      full_name: form.full_name.value.trim(),
      phone: form.phone.value.trim() || null,
      document_number: form.document_number.value.trim() || null,
    }).eq('id', user.id);
    if (updateError) {
      status.textContent = updateError.message;
      status.className = 'auth-status is-error';
      button.disabled = false;
      return;
    }
    document.getElementById('account-name').textContent = form.full_name.value.trim();
    status.textContent = 'Tus datos fueron actualizados.';
    status.className = 'auth-status is-success';
    button.disabled = false;
  });
}

loadProfileEditor().catch(error => console.warn('[RM SELECT] account profile error:', error));
