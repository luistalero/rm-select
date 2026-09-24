// Runtime configuration for the static GitHub Pages build.
// Production values are injected by GitHub Actions from repository variables.
// Do not place service-role keys, API secrets, or database passwords here.

const runtime = globalThis.RM_SELECT_CONFIG ?? {};

export const config = Object.freeze({
  supabaseUrl: runtime.supabaseUrl ?? 'https://YOUR_PROJECT.supabase.co',
  supabaseAnonKey: runtime.supabaseAnonKey ?? 'YOUR_SUPABASE_ANON_KEY',
  cloudinaryCloudName: runtime.cloudinaryCloudName ?? 'YOUR_CLOUD_NAME',
  cloudinaryUploadPreset: runtime.cloudinaryUploadPreset ?? 'rm_select_products',
  // Keep the legacy single-number variable working while allowing a production
  // build to provide one or more support numbers.
  whatsappNumbers: runtime.whatsappNumbers
    ?? (runtime.whatsappNumber ? [runtime.whatsappNumber] : ['573138371374', '573213622136']),
});
