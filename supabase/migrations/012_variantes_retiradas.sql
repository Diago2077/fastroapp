-- ─────────────────────────────────────────────────────────────
-- Variantes retiradas del catalogo sin perder el historial de pedidos.
--
-- Al reimportar productos (o editar uno), los colores/tallas que ya no vienen
-- dejaban de existir; si un pedido los usaba, su linea perdia el producto
-- (order_items.product_variant_id es "on delete set null"). Ahora una variante
-- retirada que algun pedido usa se DESACTIVA (active = false): deja de ofrecerse
-- al vendedor, pero el pedido sigue mostrando su producto, color y talla.
-- Las que ningun pedido usa se siguen borrando.
-- ─────────────────────────────────────────────────────────────

alter table product_variants
  add column if not exists active boolean not null default true;

create or replace function public.retirar_variantes(p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (private.puede('can_create_products') or private.puede('can_edit_products')) then
    raise exception 'sin permiso' using errcode = '42501';
  end if;

  -- Usadas por algun pedido (de cualquier usuario): se conservan, desactivadas
  update product_variants v set active = false
  where v.id = any (p_ids)
    and exists (select 1 from order_items oi where oi.product_variant_id = v.id);

  -- Las demas se borran
  delete from product_variants v
  where v.id = any (p_ids)
    and not exists (select 1 from order_items oi where oi.product_variant_id = v.id);
end;
$$;

revoke execute on function public.retirar_variantes(uuid[]) from public, anon;
grant execute on function public.retirar_variantes(uuid[]) to authenticated;
