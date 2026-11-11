-- Migration 0006: função de purge de auth_event com retenção mínima imposta no banco.
--
-- merp_app so pode apagar auth_event atraves desta funcao SECURITY DEFINER
-- (que roda com o privilégio do dono da funcao). DELETE direto na tabela
-- continua negado pelo RLS (auth_event so tem policies de INSERT e SELECT).
--
-- A funcao apaga so linhas mais velhas que GREATEST(retention, 30 days):
-- o piso de 30 dias e imposto no banco, independentemente do valor passado
-- pelo chamador (ou da variavel AUTH_EVENT_RETENTION_DAYS).
--
-- Nota de seguranca (Neon e ambientes sem superuser):
-- o dono da funcao pode nao ter BYPASSRLS, e auth_event tem FORCE RLS, então
-- um DELETE dentro da SECURITY DEFINER seria filtrado a zero linhas pelo RLS.
-- Solucao de menor privilegio: a funcao passa a ser propriedade da role
-- dedicada `merp_purge` (NOLOGIN, sem BYPASSRLS), a qual tem policies de
-- SELECT e DELETE *so* em auth_event. merp_app NUNCA entra nestas policies,
-- então DELETE direto de merp_app continua negado. A role nao pode logar e so
-- e alcançavel atraves desta funcao SECURITY DEFINER.
-- O SELECT e preciso para o DELETE enxergar as linhas da clausula WHERE;
-- ambas as policies abrangem todas as linhas (purge global, nao restrita ao
-- chamador). `SET search_path` evita sequestro de search_path.

CREATE OR REPLACE FUNCTION purge_auth_events(retention interval)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  effective_retention interval;
  deleted_count integer;
BEGIN
  -- Evita sequestro de search_path: funcoes internas resolvem em public primeiro.
  SET search_path = public, pg_temp;

  -- Piso de 30 dias imposto no banco.
  effective_retention := GREATEST(retention, interval '30 days');

  DELETE FROM public.auth_event
  WHERE created_at < now() - effective_retention;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;--> statement-breakpoint

-- Role dedicada ao purge: nao faz login, sem BYPASSRLS, apenas DELETE em auth_event.
-- `EXECUTE` porque comandos utilitarios (CREATE ROLE) nao sao permitidos direto em PL/pgSQL.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'merp_purge') THEN
    EXECUTE 'CREATE ROLE merp_purge NOLOGIN';
  END IF;
END $$;--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO merp_purge;--> statement-breakpoint
-- SELECT e necessario para ler as colunas da clausula WHERE do DELETE; o DELETE
-- e regido pela policy auth_event_purge_delete_policy (USING true), que abrange
-- todas as linhas (purge global, nao restrita ao chamador).
GRANT SELECT, DELETE ON public.auth_event TO merp_purge;--> statement-breakpoint
DROP POLICY IF EXISTS auth_event_purge_delete_policy ON public.auth_event;--> statement-breakpoint
CREATE POLICY auth_event_purge_delete_policy
  ON public.auth_event
  FOR DELETE TO merp_purge
  USING (true);--> statement-breakpoint
DROP POLICY IF EXISTS auth_event_purge_select_policy ON public.auth_event;--> statement-breakpoint
CREATE POLICY auth_event_purge_select_policy
  ON public.auth_event
  FOR SELECT TO merp_purge
  USING (true);--> statement-breakpoint

-- A funcao roda com o privilégio de merp_purge, que consegue ler e deletar
-- pelas policies acima mesmo sem BYPASSRLS (criterio em Neon).
ALTER FUNCTION public.purge_auth_events(interval) OWNER TO merp_purge;--> statement-breakpoint

-- Revoca execucao do publico; so merp_app pode executar.
REVOKE ALL ON FUNCTION purge_auth_events(interval) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION purge_auth_events(interval) TO merp_app;
