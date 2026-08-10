import { supabase } from '../core/supabase.js';

const form = document.getElementById('login-form');
const status = document.getElementById('auth-status');
const button = document.getElementById('submit-button');

const setStatus = (message, type = '') => {
  status.textContent = message;
  status.className = `auth-status${type ? ` is-${type}` : ''}`;
};

const redirectByRole = (role) => {
  if (role === 'SUPER_ADMIN' || role === 'ADMIN') {
    window.location.href = './admin/index.html';
    return;
  }
  window.location.href = './account.html';
};

async function getRole(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single();
  if (error) throw error;
  return data.role;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;

  button.disabled = true;
  setStatus('Iniciando sesión…');

  try {
    const email = document.getElementById('email').value.trim().toLowerCase();
    const password = document.getElementById('password').value;

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    const role = await getRole(data.user.id);
    redirectByRole(role);
  } catch (error) {
    console.error('[RM SELECT] login error:', error);
    const message = /invalid login credentials/i.test(error?.message ?? '')
      ? 'Correo o contraseña incorrectos.'
      : error?.message ?? 'No fue posible iniciar sesión.';
    setStatus(message, 'error');
  } finally {
    button.disabled = false;
  }
});

const { data: sessionData } = await supabase.auth.getSession();
if (sessionData.session) {
  try {
    redirectByRole(await getRole(sessionData.session.user.id));
  } catch (error) {
    console.error('[RM SELECT] session role error:', error);
  }
}
