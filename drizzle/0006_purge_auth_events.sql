-- Migration 0006: função de purge de auth_event com retenção mínima imposta no banco.
--
-- merp_app so pode apagar auth_event atraves desta funcao SECURITY DEFINER
-- (que roda com o privilégio do dono da funcao). DELETE direto na tabela
-- continua negado pelo RLS (auth_event so tem policies de INSERT e SELECT).
--
-- A funcao apaga so linhas mais velhas que GREATEST(retention, 30 days):
-- o piso de 30 dias e imposto no banco, independentemente do valor passado
-- pelo chamador (ou da variavel AUTH_EVENT_RETENTION_DAYS).

CREATE OR REPLACE FUNCTION purge_auth_events(retention interval)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  effective_retention interval;
  deleted_count integer;
BEGIN
  -- Piso de 30 dias imposto no banco.
  effective_retention := GREATEST(retention, interval '30 days');

  DELETE FROM public.auth_event
  WHERE created_at < now() - effective_retention;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- Revoca execucao do publico; so merp_app pode executar.
REVOKE ALL ON FUNCTION purge_auth_events(interval) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION purge_auth_events(interval) TO merp_app;
