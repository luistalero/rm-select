import { supabase } from '../core/supabase.js';

const form = document.getElementById('register-form');
const status = document.getElementById('auth-status');
const button = document.getElementById('submit-button');
const setStatus = (message, type = '') => { status.textContent = message; status.className = `auth-status${type ? ` is-${type}` : ''}`; };

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  const fullName = document.getElementById('full-name').value.trim();
  const email = document.getElementById('email').value.trim().toLowerCase();
  const phone = document.getElementById('phone').value.trim();
  const password = document.getElementById('password').value;
  const confirmation = document.getElementById('password-confirm').value;
  if (password !== confirmation) { setStatus('Las contraseñas no coinciden.', 'error'); return; }
  button.disabled = true; setStatus('Creando tu cuenta…');
  try {
    const redirectTo = `${window.location.origin}/pages/account.html`;
    const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo, data: { full_name: fullName, phone } } });
    if (error) throw error;
    if (data.session) window.location.href = 'account.html';
    else setStatus('Cuenta creada. Revisa tu correo para confirmar la dirección antes de iniciar sesión.', 'success');
  } catch (error) {
    console.error('[RM SELECT] register error:', error);
    setStatus(error?.message || 'No fue posible crear la cuenta.', 'error');
  } finally { button.disabled = false; }
});
