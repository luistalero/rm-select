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
  if (/already registered/i.test(message)) return 'La cuenta ya existe. Si es tu cuenta, confirma el correo y vuelve a intentar para completar la activación.';
  if (/invalid bootstrap secret/i.test(message)) return 'El código privado de activación no es válido.';
  if (/already used|already exists/i.test(message)) return 'La activación inicial ya fue utilizada. El SUPER_ADMIN ya está configurado.';
  if (/not configured/i.test(message)) return 'La activación inicial todavía no está configurada en Supabase.';
  if (/email.*confirm/i.test(message)) return 'Debes confirmar el correo electrónico antes de completar la activación.';
  return message || 'No fue posible completar la configuración inicial.';
};

async function ensureAccount({ email, password, fullName, phone }) {
  const signUpResult = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        phone: phone || null,
      },
    },
  });

  if (!signUpResult.error) {
    return signUpResult.data;
  }

  if (!/already registered/i.test(signUpResult.error.message)) {
    throw signUpResult.error;
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

async function activateSuperAdmin(userId, secret) {
  const { error } = await supabase.rpc('bootstrap_super_admin', {
    p_user_id: userId,
    p_secret: secret,
  });

  if (error) throw error;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;

  const fullName = document.getElementById('full-name').value.trim();
  const email = document.getElementById('email').value.trim().toLowerCase();
  const phone = document.getElementById('phone').value.trim();
  const password = document.getElementById('password').value;
  const secret = document.getElementById('secret').value;

  button.disabled = true;
  setStatus('Preparando la cuenta segura…');

  try {
    const auth = await ensureAccount({ email, password, fullName, phone });

    if (!auth.session) {
      setStatus('La cuenta fue creada. Revisa tu correo, confirma la dirección y vuelve a pulsar «Crear SUPER_ADMIN» para completar la activación.', 'success');
      return;
    }

    await activateSuperAdmin(auth.user.id, secret);

    setStatus('SUPER_ADMIN creado correctamente. La activación inicial quedó bloqueada y ya no puede utilizarse otra vez.', 'success');
    form.reset();
    button.textContent = 'SUPER_ADMIN configurado';
  } catch (error) {
    console.error('[RM SELECT] bootstrap error:', error);
    setStatus(friendlyError(error), 'error');
  } finally {
    button.disabled = false;
  }
});
