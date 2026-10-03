-- Tallas distintas del catalogo, para ordenarlas en Configuracion.
-- Antes la pantalla bajaba las 16 mil variantes (17 requests) solo para
-- sacar unas 50 tallas. Es security invoker: aplica la RLS de quien llama.
create or replace function public.tallas_existentes()
returns setof text
language sql stable
set search_path = public
as $$
  select distinct size from product_variants
$$;

revoke execute on function public.tallas_existentes() from public, anon;
grant execute on function public.tallas_existentes() to authenticated;
