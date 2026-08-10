import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const config = globalThis.RM_SELECT_CONFIG ?? {};
const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const form = document.querySelector('#setup-form');
const status = document.querySelector('#status');
const submitButton = document.querySelector('#submit-button');

function setStatus(message, type = '') {
  status.textContent = message;
  status.className = `status ${type}`.trim();
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const fullName = document.querySelector('#full-name').value.trim();
  const email = document.querySelector('#email').value.trim().toLowerCase();
  const password = document.querySelector('#password').value;
  const secret = document.querySelector('#secret').value;

  if (!form.reportValidity()) return;

  submitButton.disabled = true;
  setStatus('Creando la cuenta inicial…');

  try {
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });

    if (signUpError) throw signUpError;
    if (!data.user?.id) throw new Error('Supabase no devolvió el usuario creado.');

    setStatus('Cuenta creada. Activando SUPER_ADMIN…');

    const { error: bootstrapError } = await supabase.rpc('bootstrap_super_admin', {
      p_user_id: data.user.id,
      p_secret: secret,
    });

    if (bootstrapError) {
      // Do not leak the private secret or database internals to the user.
      throw new Error(
        bootstrapError.message?.includes('Invalid bootstrap secret')
          ? 'El código privado de activación no es correcto.'
          : 'No fue posible completar la activación. Revisa la configuración de Supabase.'
      );
    }

    setStatus(
      data.session
        ? 'SUPER_ADMIN creado correctamente. Ya puedes entrar al panel.'
        : 'SUPER_ADMIN creado correctamente. Confirma tu correo y luego inicia sesión.',
      'success'
    );
    form.reset();
    submitButton.textContent = 'Activación completada';
  } catch (error) {
    console.error('[RM SELECT setup]', error);
    setStatus(error.message || 'No fue posible completar la activación.', 'error');
    submitButton.disabled = false;
  }
});
