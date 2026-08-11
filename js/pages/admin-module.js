import { supabase } from '../core/supabase.js';

const status = document.getElementById('module-status');
const role = document.getElementById('module-role');
const name = document.getElementById('module-user');
const logout = document.getElementById('logout-button');

async function guard() {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session) {
    window.location.href = '../login.html';
    return;
  }

  const user = sessionData.session.user;
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('full_name, role')
    .eq('id', user.id)
    .single();

  if (error) throw error;
  if (!['ADMIN', 'SUPER_ADMIN'].includes(profile.role)) {
    await supabase.auth.signOut();
    window.location.href = '../login.html';
    return;
  }

  name.textContent = profile.full_name || user.email || 'Usuario';
  role.textContent = profile.role;
  status.textContent = `Sesión activa como ${profile.role}.`;
  status.className = 'admin-status is-success';
}

logout?.addEventListener('click', async () => {
  logout.disabled = true;
  await supabase.auth.signOut();
  window.location.href = '../login.html';
});

try {
  await guard();
} catch (error) {
  console.error('[RM SELECT] admin module auth error:', error);
  status.textContent = error?.message ?? 'No fue posible verificar los permisos administrativos.';
  status.className = 'admin-status is-error';
}
