-- El service_role (funciones /api y scripts de migracion) tiene que poder
-- resolver el esquema `private`: lo usan el default de orders.order_number y
-- los triggers de pedidos. Sin esto: "permission denied for schema private".
grant usage on schema private to service_role;
grant execute on all functions in schema private to service_role;
