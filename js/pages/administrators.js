import { supabase } from '../core/supabase.js';

const status = document.getElementById('admins-status');
const list = document.getElementById('admins-list');
const limit = document.getElementById('admin-limit');

const setStatus = (message, type = '') => {
  status.textContent = message;
  status.className = `admin-status${type ? ` is-${type}` : ''}`;
};

const escapeText = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));

async function loadAdministrators() {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session) {
    window.location.href = '../login.html';
    return;
  }

  const user = sessionData.session.user;
  const { data: me, error: meError } = await supabase
    .from('profiles')
    .select('full_name, role')
    .eq('id', user.id)
    .single();

  if (meError) throw meError;
  if (me.role !== 'SUPER_ADMIN') {
    window.location.href = './index.html';
    return;
  }

  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, full_name, role, created_at, updated_at')
    .in('role', ['ADMIN', 'SUPER_ADMIN'])
    .order('role', { ascending: false })
    .order('created_at', { ascending: true });

  if (error) throw error;

  const admins = profiles ?? [];
  const activeAdmins = admins.filter((profile) => profile.role === 'ADMIN').length;
  limit.textContent = `${activeAdmins} / 3 ADMIN activos`;

  list.innerHTML = admins.map((profile) => {
    const isSuper = profile.role === 'SUPER_ADMIN';
    const created = profile.created_at ? new Date(profile.created_at).toLocaleDateString('es-CO') : '—';
    return `<article class="admin-person-card">
      <div class="admin-person-avatar">${escapeText((profile.full_name || '?').trim().slice(0, 1).toUpperCase())}</div>
      <div class="admin-person-main">
        <strong>${escapeText(profile.full_name || 'Sin nombre')}</strong>
        <span>${escapeText(profile.role)}</span>
      </div>
      <div class="admin-person-meta">
        <small>Creado</small><strong>${created}</strong>
      </div>
      <div class="admin-person-state ${isSuper ? 'is-protected' : ''}">${isSuper ? 'Protegido' : 'ADMIN'}</div>
    </article>`;
  }).join('');

  if (!admins.length) {
    list.innerHTML = '<p class="admin-status">No hay perfiles administrativos.</p>';
  }

  setStatus('Acceso autorizado. La lista se obtiene directamente de Supabase y respeta RLS.', 'success');
}

try {
  await loadAdministrators();
} catch (error) {
  console.error('[R&M SELECT] administrators error:', error);
  setStatus(error?.message ?? 'No fue posible cargar los administradores.', 'error');
}
