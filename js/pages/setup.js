import { supabase } from '../core/supabase.js';

const form = document.getElementById('bootstrap-form');
const status = document.getElementById('setup-status');
const button = document.getElementById('submit-button');

const setStatus = (message, type = '') => {
  status.textContent = message;
  status.className = `setup-status${type ? ` is-${type}` : ''}`;
};

const friendlyError = (error) => {
  const message = error?.message ?? '';
  if (/invalid login credentials/i.test(message)) return 'Correo o contraseña incorrectos.';
  if (/email.*confirm|email.*not confirmed/i.test(message)) return 'El correo todavía no está confirmado.';
  if (/invalid bootstrap secret/i.test(message)) return 'El código privado de activación no es válido.';
  if (/already used|already exists/i.test(message)) return 'La activación inicial ya fue utilizada. El SUPER_ADMIN ya está configurado.';
  if (/not configured/i.test(message)) return 'La activación inicial todavía no está configurada en Supabase.';
  return message || 'No fue posible completar la configuración inicial.';
};

async function getSetupSession(email, password) {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (sessionData.session) return sessionData.session;

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  if (!data.session) throw new Error('Supabase no devolvió una sesión válida.');
  return data.session;
}

async function activateSuperAdmin(userId, secret) {
  const { data, error } = await supabase.rpc('bootstrap_super_admin', {
    p_user_id: userId,
    p_secret: secret,
  });
  if (error) throw error;
  return data;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;

  const fullName = document.getElementById('full-name').value.trim();
  const email = document.getElementById('email').value.trim().toLowerCase();
  const phone = document.getElementById('phone').value.trim();
  const password = document.getElementById('password').value;
  const secret = document.getElementById('secret').value;

  // fullName and phone are intentionally read here so the form remains compatible
  // with the existing setup UI. SUPER_ADMIN promotion is based on the authenticated user.
  void fullName;
  void phone;

  button.disabled = true;
  setStatus('Iniciando sesión con la cuenta existente…');

  try {
    const session = await getSetupSession(email, password);
    setStatus('Sesión confirmada. Ejecutando activación segura…');

    await activateSuperAdmin(session.user.id, secret);

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .single();

    if (profileError) throw profileError;
    if (profile.role !== 'SUPER_ADMIN') {
      throw new Error(`La activación no terminó correctamente. El rol actual es ${profile.role}.`);
    }

    setStatus('SUPER_ADMIN creado correctamente. La activación inicial quedó bloqueada.', 'success');
    form.reset();
    button.textContent = 'SUPER_ADMIN configurado';
  } catch (error) {
    console.error('[RM SELECT] setup error:', error);
    setStatus(friendlyError(error), 'error');
  } finally {
    button.disabled = false;
  }
});
