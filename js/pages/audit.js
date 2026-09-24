import { supabase } from '../core/supabase.js';

const list = document.getElementById('audit-list');
const filter = document.getElementById('audit-filter');
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[char]));
let events = [];

function render() {
  const value = filter.value;
  const rows = value ? events.filter(event => event.activity_type === value) : events;
  list.innerHTML = rows.length ? rows.map(event => `<article class="audit-row"><div><strong>${esc(event.activity_type.replaceAll('_', ' '))}</strong><span>${esc(event.profiles?.full_name || 'Sistema')}</span></div><code>${esc(JSON.stringify(event.metadata || {}))}</code><time>${new Date(event.created_at).toLocaleString('es-CO')}</time></article>`).join('') : '<div class="admin-empty"><strong>No hay eventos para este filtro.</strong></div>';
}

async function load() {
  const { data, error } = await supabase.from('system_activity').select('activity_type,metadata,created_at,profiles(full_name)').order('created_at', { ascending: false }).limit(100);
  if (error) throw error;
  events = data || [];
  [...new Set(events.map(event => event.activity_type))].sort().forEach(type => { const option = document.createElement('option'); option.value = type; option.textContent = type.replaceAll('_', ' '); filter.appendChild(option); });
  render();
}

filter.addEventListener('change', render);
load().catch(error => { list.innerHTML = `<div class="admin-status is-error">${esc(error.message)}</div>`; });
