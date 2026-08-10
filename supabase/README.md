# Supabase

RM SELECT uses Supabase Auth + Postgres + RLS. The browser only receives the public anon key; never expose the Supabase `service_role` key in GitHub Pages or browser JavaScript.

## Migration order

Run these migrations in Supabase SQL Editor in this order:

1. `0001_foundation.sql`
2. `0002_security_and_rls.sql`
3. `0003_inventory_functions.sql`
4. `0003_role_guards.sql`
5. `0004_orders_and_reservations.sql`
6. `0005_one_time_super_admin_bootstrap.sql`

`0002_rls.sql` is an older baseline and must **not** be run together with `0002_security_and_rls.sql`.

## One-time SUPER_ADMIN setup

After `0005_one_time_super_admin_bootstrap.sql` is executed, create the private bootstrap secret manually in Supabase SQL Editor. Do not commit the secret to GitHub:

```sql
insert into public.super_admin_bootstrap (secret_hash)
values (encode(digest('REPLACE-WITH-YOUR-PRIVATE-ONE-TIME-SECRET', 'sha256'), 'hex'));
```

Use a long random secret (at least 24 characters). Then open `/setup/` on the deployed site and create the first account. The database function locks the bootstrap row and checks that no `SUPER_ADMIN` exists, so a second visitor cannot claim the role. After successful activation, the bootstrap row is permanently marked as used.

## Authentication

Email confirmation remains enabled. The first account can be created from the setup screen; if confirmation is required, confirm the email before normal sign-in.
