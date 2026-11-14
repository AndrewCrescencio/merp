-- Migration 0006: search_path de purge_auth_events como atributo da função.
--
-- A 0005 faz `SET search_path` dentro do corpo. Em PL/pgSQL isso é um SET de
-- sessão: depois da chamada, a conexão de merp_app (reaproveitada pelo pool)
-- ficava com `public, pg_temp`. Com o atributo, o PostgreSQL fixa o valor só
-- durante a execução e restaura o do chamador na saída; o SET do corpo passa a
-- valer só dentro da função. `pg_catalog, pg_temp` é o padrão exigido pelo
-- rls-guard (o corpo só usa nomes qualificados). A 0005 não é editada porque
-- já foi aplicada.
ALTER FUNCTION public.purge_auth_events(interval) SET search_path = pg_catalog, pg_temp;
