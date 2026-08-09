# Supabase

Apply migrations in order.

## Initial setup

1. Create the Supabase project.
2. Run `migrations/0001_foundation.sql`.
3. Create the first Auth user manually.
4. Promote only that account to `SUPER_ADMIN` through a controlled SQL operation.
5. RLS and transactional inventory functions must be reviewed and enabled before production use.

Never expose the Supabase `service_role` key in GitHub Pages or browser JavaScript.
