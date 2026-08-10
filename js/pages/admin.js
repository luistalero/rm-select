import { supabase } from '../../js/core/supabase.js';

const status = document.getElementById('dashboard-status');
const userName = document.getElementById('user-name');
const userRole = document.getElementById('user-role');
const metricRole = document.getElementById('metric-role');
const logoutButton = document.getElementById('logout-button');
const adminsLink = document.getElementById('admins-link');
const sidebar = document.getElementById('admin-sidebar');
const sidebarToggle = document.getElementById('sidebar-toggle');

const showError = (message) => {
  status.textContent = message;
  status.className = 'admin-status is-error';
};

async function loadAdmin() {
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

  userName.textContent = profile.full_name || user.email || 'Usuario';
  userRole.textContent = profile.role;
  metricRole.textContent = profile.role;
  adminsLink.hidden = profile.role !== 'SUPER_ADMIN';
  status.textContent = `Sesión activa como ${profile.role}.`;
  status.className = 'admin-status is-success';
}

logoutButton.addEventListener('click', async () => {
  logoutButton.disabled = true;
  await supabase.auth.signOut();
  window.location.href = '../login.html';
});

sidebarToggle.addEventListener('click', () => {
  sidebar.classList.toggle('is-open');
});

try {
  await loadAdmin();
} catch (error) {
  console.error('[RM SELECT] admin auth error:', error);
  showError(error?.message ?? 'No fue posible verificar los permisos administrativos.');
}
