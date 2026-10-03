-- ═══════════════════════════════════════════════════════════════════════════
-- 007_push.sql — Suscripciones de notificaciones push (Web Push)
--
-- Una fila por dispositivo/navegador. La Edge Function `send-push` las lee con
-- la service role (que ignora RLS); cada usuario da de alta y de baja solo las
-- suyas desde la app.
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references usuarios (id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on push_subscriptions (user_id);

alter table push_subscriptions enable row level security;

drop policy if exists "Mis dispositivos" on push_subscriptions;
create policy "Mis dispositivos" on push_subscriptions for all to authenticated
  using (private.esta_activo() and user_id = (select auth.uid()))
  with check (private.esta_activo() and user_id = (select auth.uid()));

revoke all on table push_subscriptions from anon, authenticated;
grant select, insert, update, delete on table push_subscriptions to authenticated;
