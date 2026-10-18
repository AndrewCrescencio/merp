-- Etapa rls_policies_grants da cadeia única (0000 → 0001 → 0002).
--
-- Estado FINAL de RLS/policies/grants consolidado das migrações antigas
-- 0005–0027 (o histórico inteiro está no git: ver main). NÃO é o histórico
-- reaplicado: é o resultado de 0024–0027 (que prevalecem sobre as antigas).
-- Fonte: /tmp/schema-atual.sql e /tmp/schema-privs.txt (pg_dump de um banco
-- construído com db:migrate:full).
--
-- Ordem: funções (policies dependem delas) → ENABLE+FORCE por tabela →
-- policies por tabela → GRANTs/DEFAULT PRIVILEGES por último (ALL TABLES
-- cobre todas as tabelas criadas pelo 0001).

-- ===========================================================================
-- Funções usadas pelos predicados
-- ===========================================================================
-- GUC de tenant+utilizador (`app.tenant_id`, `app.location_id`, `app.user_id`),
-- definida por withTenant(); devolve NULL fora do escopo → toda policy
-- recai no fail-closed (nenhuma linha visível).

CREATE FUNCTION public.get_tenant_id() RETURNS text
    LANGUAGE sql STABLE
    AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '');
$$;
CREATE FUNCTION public.get_user_id() RETURNS text
    LANGUAGE sql STABLE
    AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '');
$$;
CREATE FUNCTION public.get_location_id() RETURNS text
    LANGUAGE sql STABLE
    AS $$
  SELECT NULLIF(current_setting('app.location_id', true), '');
$$;
-- Owner reavaliado NA EXECUÇÃO da query (não cacheado) — fecha o TOCTOU do
-- ciclo owner → não-owner (0009/0010).
CREATE FUNCTION public.is_company_owner(cid text) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM company_member
    WHERE company_id = cid AND user_id = get_user_id() AND role = 'owner'
  );
$$;

-- ===========================================================================
-- RLS por tabela (ENABLE + FORCE + policies)
-- FORCE é obrigatório: sem ele o OWNER contorna as policies (o check
-- scripts/verify-rls.ts falha em qualquer tabela sem FORCE).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- auth_event
-- ---------------------------------------------------------------------------
ALTER TABLE public.auth_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.auth_event FORCE ROW LEVEL SECURITY;
-- auth_event_insert_policy (INSERT): append-only: grava quem tiver user_id próprio OU NULL — UMA condição, senão os eventos pós-logout sem sessão seriam bloqueados (RLS-006, corrigido na 0027).
CREATE POLICY auth_event_insert_policy ON public.auth_event FOR INSERT WITH CHECK (((user_id = public.get_user_id()) OR (user_id IS NULL)));
-- auth_event_select_policy (SELECT): o utilizador lê apenas os próprios eventos de segurança (0005).
CREATE POLICY auth_event_select_policy ON public.auth_event FOR SELECT USING ((user_id = public.get_user_id()));

-- ---------------------------------------------------------------------------
-- cashier_shift
-- ---------------------------------------------------------------------------
ALTER TABLE public.cashier_shift ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.cashier_shift FORCE ROW LEVEL SECURITY;
-- cashier_shift_delete_policy (DELETE): apaga apenas do tenant+location da sessão (ADR-002: company_id = get_tenant_id() E (location_id = get_location_id() OU location_id IS NULL) no alvo).
CREATE POLICY cashier_shift_delete_policy ON public.cashier_shift FOR DELETE USING (((company_id = public.get_tenant_id()) AND ((location_id = public.get_location_id()) OR (public.get_location_id() IS NULL))));
-- cashier_shift_insert_policy (INSERT): escrita exige tenant da sessão e location condicionada (ADR-002: company_id = get_tenant_id() E location_id validada no momento do INSERT (location_id não nula aí)).
CREATE POLICY cashier_shift_insert_policy ON public.cashier_shift FOR INSERT WITH CHECK (((company_id = public.get_tenant_id()) AND ((location_id = public.get_location_id()) OR (public.get_location_id() IS NULL))));
-- cashier_shift_select_policy (SELECT): leitura condicionada ao tenant da sessão (ADR-002: company_id = get_tenant_id() AND (location_id = get_location_id() OR get_location_id() IS NULL)).
CREATE POLICY cashier_shift_select_policy ON public.cashier_shift FOR SELECT USING (((company_id = public.get_tenant_id()) AND ((location_id = public.get_location_id()) OR (public.get_location_id() IS NULL))));
-- cashier_shift_update_policy (UPDATE): escrita condicionada ao alvo E ao novo valor (ADR-002: mesmo predicado do SELECT no alvo + revalidação no novo valor (WITH CHECK)).
CREATE POLICY cashier_shift_update_policy ON public.cashier_shift FOR UPDATE USING (((company_id = public.get_tenant_id()) AND ((location_id = public.get_location_id()) OR (public.get_location_id() IS NULL))));

-- ---------------------------------------------------------------------------
-- company
-- ---------------------------------------------------------------------------
ALTER TABLE public.company ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.company FORCE ROW LEVEL SECURITY;
-- company_delete_policy (DELETE): apenas owner (backstop 0009, owner reavaliado na execução).
CREATE POLICY company_delete_policy ON public.company FOR DELETE USING (((id = public.get_tenant_id()) AND public.is_company_owner(id)));
-- company_insert_policy (INSERT): exige contexto de utilizador (user_id não nulo) — senão qualquer sessão conseguiria criar companies via RLS (RLS-005, corrigido na 0026).
CREATE POLICY company_insert_policy ON public.company FOR INSERT WITH CHECK ((public.get_user_id() IS NOT NULL));
-- company_modify_policy (UPDATE): update condicionado a is_company_owner + TOCTOU fechado no backstop 0009: o owner é reavaliado na própria execução (owner atual, não o do tempo do SELECT).
CREATE POLICY company_modify_policy ON public.company FOR UPDATE USING (((id = public.get_tenant_id()) AND public.is_company_owner(id)));
-- company_select_policy (SELECT): lê a própria company: exige MEMBRO no momento da consulta (membership é o gate, AUD-20).
CREATE POLICY company_select_policy ON public.company FOR SELECT USING (((id = public.get_tenant_id()) OR (EXISTS ( SELECT 1
   FROM public.company_member cm
  WHERE ((cm.company_id = company.id) AND (cm.user_id = public.get_user_id()))))));

-- ---------------------------------------------------------------------------
-- company_member
-- ---------------------------------------------------------------------------
ALTER TABLE public.company_member ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.company_member FORCE ROW LEVEL SECURITY;
-- cm_delete_policy (DELETE): owner apaga membros OU qualquer utilizador apaga a própria membership se NÃO for owner (0009→0010) — senão, sem o 0010, o owner ficaria preso na própria empresa.
CREATE POLICY cm_delete_policy ON public.company_member FOR DELETE USING ((((company_id = public.get_tenant_id()) AND public.is_company_owner(company_id)) OR ((user_id = public.get_user_id()) AND (role <> 'owner'::text))));
-- cm_insert_policy (INSERT): INSERT em company_member tem de ser de empresa (auth_security_state nega em texto plano) — só owner-atual OU bootstrap por role (superuser/org_admin, 0014) OU token de convite já validado (0008→0012→0014).
CREATE POLICY cm_insert_policy ON public.company_member FOR INSERT WITH CHECK ((public.is_company_owner(company_id) OR ((user_id = public.get_user_id()) AND (company_id = public.get_tenant_id()) AND (((current_setting('app.allow_founder_bootstrap'::text, true) = 'true'::text) AND (role = 'owner'::text)) OR ((current_setting('app.allow_member_bootstrap'::text, true) = 'true'::text) AND (role = 'member'::text)) OR ((role = 'member'::text) AND (EXISTS ( SELECT 1
   FROM public.invite
  WHERE ((invite.company_id = public.get_tenant_id()) AND (invite.email = ( SELECT "user".email
           FROM public."user"
          WHERE ("user".id = public.get_user_id()))) AND (invite.token_hash = current_setting('app.invite_token_hash'::text, true)) AND (invite.expires_at > now())))))))));
-- cm_select_policy (SELECT): membros veem a própria company (company_id = get_tenant_id()); usuários ainda sem cadastro/início de sessão (convite por e-mail) não veem — menos restrição que a da linha própria (0005).
CREATE POLICY cm_select_policy ON public.company_member FOR SELECT USING (((company_id = public.get_tenant_id()) OR (user_id = public.get_user_id())));
-- cm_update_policy (UPDATE): update de membership com company_id = get_tenant_id() e WITH CHECK is_company_owner (owner reavaliado na execução).
CREATE POLICY cm_update_policy ON public.company_member FOR UPDATE USING ((company_id = public.get_tenant_id())) WITH CHECK (public.is_company_owner(company_id));

-- ---------------------------------------------------------------------------
-- invite
-- ---------------------------------------------------------------------------
ALTER TABLE public.invite ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.invite FORCE ROW LEVEL SECURITY;
-- invite_delete_policy (DELETE): só o owner apaga convites da própria company (0013).
CREATE POLICY invite_delete_policy ON public.invite FOR DELETE USING (public.is_company_owner(company_id));
-- invite_insert_policy (INSERT): só cria convite quem já é membro da company (0006).
CREATE POLICY invite_insert_policy ON public.invite FOR INSERT WITH CHECK (public.is_company_owner(company_id));
-- invite_select_policy (SELECT): membro da company vê os convites dela (0006).
CREATE POLICY invite_select_policy ON public.invite FOR SELECT USING ((company_id = public.get_tenant_id()));
-- invite_token_select_policy (SELECT): leitura pública por coluna token_hash sem predicado de tenant — é o checkout de um convite que ainda não tem sessão (unicidade: token_hash tem índice único) (0013).
CREATE POLICY invite_token_select_policy ON public.invite FOR SELECT USING (((company_id = public.get_tenant_id()) OR (token_hash = current_setting('app.invite_token_hash'::text, true))));
-- invite_update_policy (UPDATE): só aceita convite quem tem o token (`Invite-Token`, coluna token_hash) E cuja company/role batem com o pedido — o token é o gate extra para convite público (0013).
CREATE POLICY invite_update_policy ON public.invite FOR UPDATE USING (((company_id = public.get_tenant_id()) AND (public.is_company_owner(company_id) OR ((email = ( SELECT "user".email
   FROM public."user"
  WHERE ("user".id = public.get_user_id()))) AND (token_hash = current_setting('app.invite_token_hash'::text, true)) AND (accepted_at IS NULL) AND (expires_at > now()))))) WITH CHECK (((company_id = public.get_tenant_id()) AND (public.is_company_owner(company_id) OR ((email = ( SELECT "user".email
   FROM public."user"
  WHERE ("user".id = public.get_user_id()))) AND (token_hash = current_setting('app.invite_token_hash'::text, true)) AND (expires_at > now())))));

-- ---------------------------------------------------------------------------
-- kitchen_station
-- ---------------------------------------------------------------------------
ALTER TABLE public.kitchen_station ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.kitchen_station FORCE ROW LEVEL SECURITY;
-- kitchen_station_delete_policy (DELETE): apaga apenas do tenant+location da sessão (ADR-002: company_id = get_tenant_id() E (location_id = get_location_id() OU location_id IS NULL) no alvo).
CREATE POLICY kitchen_station_delete_policy ON public.kitchen_station FOR DELETE USING (((company_id = public.get_tenant_id()) AND ((location_id = public.get_location_id()) OR (public.get_location_id() IS NULL))));
-- kitchen_station_insert_policy (INSERT): escrita exige tenant da sessão e location condicionada (ADR-002: company_id = get_tenant_id() E location_id validada no momento do INSERT (location_id não nula aí)).
CREATE POLICY kitchen_station_insert_policy ON public.kitchen_station FOR INSERT WITH CHECK (((company_id = public.get_tenant_id()) AND ((location_id = public.get_location_id()) OR (public.get_location_id() IS NULL))));
-- kitchen_station_select_policy (SELECT): leitura condicionada ao tenant da sessão (ADR-002: company_id = get_tenant_id() AND (location_id = get_location_id() OR get_location_id() IS NULL)).
CREATE POLICY kitchen_station_select_policy ON public.kitchen_station FOR SELECT USING (((company_id = public.get_tenant_id()) AND ((location_id = public.get_location_id()) OR (public.get_location_id() IS NULL))));
-- kitchen_station_update_policy (UPDATE): escrita condicionada ao alvo E ao novo valor (ADR-002: mesmo predicado do SELECT no alvo + revalidação no novo valor (WITH CHECK)).
CREATE POLICY kitchen_station_update_policy ON public.kitchen_station FOR UPDATE USING (((company_id = public.get_tenant_id()) AND ((location_id = public.get_location_id()) OR (public.get_location_id() IS NULL))));

-- ---------------------------------------------------------------------------
-- kitchen_ticket
-- ---------------------------------------------------------------------------
ALTER TABLE public.kitchen_ticket ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.kitchen_ticket FORCE ROW LEVEL SECURITY;
-- kitchen_ticket_delete_policy (DELETE): apaga apenas do tenant+location da sessão (ADR-002: company_id = get_tenant_id() E (location_id = get_location_id() OU location_id IS NULL) no alvo).
CREATE POLICY kitchen_ticket_delete_policy ON public.kitchen_ticket FOR DELETE USING (((company_id = public.get_tenant_id()) AND ((location_id = public.get_location_id()) OR (public.get_location_id() IS NULL))));
-- kitchen_ticket_insert_policy (INSERT): escrita exige tenant da sessão e location condicionada (ADR-002: company_id = get_tenant_id() E location_id validada no momento do INSERT (location_id não nula aí)).
CREATE POLICY kitchen_ticket_insert_policy ON public.kitchen_ticket FOR INSERT WITH CHECK (((company_id = public.get_tenant_id()) AND ((location_id = public.get_location_id()) OR (public.get_location_id() IS NULL))));
-- kitchen_ticket_select_policy (SELECT): leitura condicionada ao tenant da sessão (ADR-002: company_id = get_tenant_id() AND (location_id = get_location_id() OR get_location_id() IS NULL)).
CREATE POLICY kitchen_ticket_select_policy ON public.kitchen_ticket FOR SELECT USING (((company_id = public.get_tenant_id()) AND ((location_id = public.get_location_id()) OR (public.get_location_id() IS NULL))));
-- kitchen_ticket_update_policy (UPDATE): escrita condicionada ao alvo E ao novo valor (ADR-002: mesmo predicado do SELECT no alvo + revalidação no novo valor (WITH CHECK)).
CREATE POLICY kitchen_ticket_update_policy ON public.kitchen_ticket FOR UPDATE USING (((company_id = public.get_tenant_id()) AND ((location_id = public.get_location_id()) OR (public.get_location_id() IS NULL))));

-- ---------------------------------------------------------------------------
-- location
-- ---------------------------------------------------------------------------
ALTER TABLE public.location ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.location FORCE ROW LEVEL SECURITY;
-- location_delete_policy (DELETE): padrão da própria tabela: a linha da location é o escopo (id = get_location_id()), porque location.location_id não existe — mesma semântica de ADR-002.
CREATE POLICY location_delete_policy ON public.location FOR DELETE USING (((company_id = public.get_tenant_id()) AND ((id = public.get_location_id()) OR (public.get_location_id() IS NULL))));
-- location_insert_policy (INSERT): padrão da própria tabela: a linha da location é o escopo (id = get_location_id()), porque location.location_id não existe — mesma semântica de ADR-002.
CREATE POLICY location_insert_policy ON public.location FOR INSERT WITH CHECK (((company_id = public.get_tenant_id()) AND ((id = public.get_location_id()) OR (public.get_location_id() IS NULL))));
-- location_select_policy (SELECT): padrão da própria tabela: a linha da location é o escopo (id = get_location_id()), porque location.location_id não existe — mesma semântica de ADR-002.
CREATE POLICY location_select_policy ON public.location FOR SELECT USING (((company_id = public.get_tenant_id()) AND ((id = public.get_location_id()) OR (public.get_location_id() IS NULL))));
-- location_update_policy (UPDATE): padrão da própria tabela: a linha da location é o escopo (id = get_location_id()), porque location.location_id não existe — mesma semântica de ADR-002.
CREATE POLICY location_update_policy ON public.location FOR UPDATE USING (((company_id = public.get_tenant_id()) AND ((id = public.get_location_id()) OR (public.get_location_id() IS NULL))));

-- ---------------------------------------------------------------------------
-- "order"
-- ---------------------------------------------------------------------------
ALTER TABLE public."order" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."order" FORCE ROW LEVEL SECURITY;
-- order_delete_policy (DELETE): apaga apenas do tenant+location da sessão (ADR-002: company_id = get_tenant_id() E (location_id = get_location_id() OU location_id IS NULL) no alvo).
CREATE POLICY order_delete_policy ON public."order" FOR DELETE USING (((company_id = public.get_tenant_id()) AND ((location_id = public.get_location_id()) OR (public.get_location_id() IS NULL))));
-- order_insert_policy (INSERT): escrita exige tenant da sessão e location condicionada (ADR-002: company_id = get_tenant_id() E location_id validada no momento do INSERT (location_id não nula aí)).
CREATE POLICY order_insert_policy ON public."order" FOR INSERT WITH CHECK (((company_id = public.get_tenant_id()) AND ((location_id = public.get_location_id()) OR (public.get_location_id() IS NULL))));
-- order_select_policy (SELECT): leitura condicionada ao tenant da sessão (ADR-002: company_id = get_tenant_id() AND (location_id = get_location_id() OR get_location_id() IS NULL)).
CREATE POLICY order_select_policy ON public."order" FOR SELECT USING (((company_id = public.get_tenant_id()) AND ((location_id = public.get_location_id()) OR (public.get_location_id() IS NULL))));
-- order_update_policy (UPDATE): escrita condicionada ao alvo E ao novo valor (ADR-002: mesmo predicado do SELECT no alvo + revalidação no novo valor (WITH CHECK)).
CREATE POLICY order_update_policy ON public."order" FOR UPDATE USING (((company_id = public.get_tenant_id()) AND ((location_id = public.get_location_id()) OR (public.get_location_id() IS NULL))));

-- ---------------------------------------------------------------------------
-- order_dine_in
-- ---------------------------------------------------------------------------
ALTER TABLE public.order_dine_in ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.order_dine_in FORCE ROW LEVEL SECURITY;
-- order_dine_in_delete_policy (DELETE): localização herdada da order-pai: o predicado navega por EXISTS na "order" (order_dine_in/order_takeout não têm location_id próprio) — mesma semântica de ADR-002.
CREATE POLICY order_dine_in_delete_policy ON public.order_dine_in FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public."order" o
  WHERE ((o.id = order_dine_in.order_id) AND (o.company_id = public.get_tenant_id()) AND ((o.location_id = public.get_location_id()) OR (public.get_location_id() IS NULL))))));
-- order_dine_in_insert_policy (INSERT): localização herdada da order-pai: o predicado navega por EXISTS na "order" (order_dine_in/order_takeout não têm location_id próprio) — mesma semântica de ADR-002.
CREATE POLICY order_dine_in_insert_policy ON public.order_dine_in FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public."order" o
  WHERE ((o.id = order_dine_in.order_id) AND (o.company_id = public.get_tenant_id()) AND ((o.location_id = public.get_location_id()) OR (public.get_location_id() IS NULL))))));
-- order_dine_in_select_policy (SELECT): localização herdada da order-pai: o predicado navega por EXISTS na "order" (order_dine_in/order_takeout não têm location_id próprio) — mesma semântica de ADR-002.
CREATE POLICY order_dine_in_select_policy ON public.order_dine_in FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public."order" o
  WHERE ((o.id = order_dine_in.order_id) AND (o.company_id = public.get_tenant_id()) AND ((o.location_id = public.get_location_id()) OR (public.get_location_id() IS NULL))))));
-- order_dine_in_update_policy (UPDATE): localização herdada da order-pai: o predicado navega por EXISTS na "order" (order_dine_in/order_takeout não têm location_id próprio) — mesma semântica de ADR-002.
CREATE POLICY order_dine_in_update_policy ON public.order_dine_in FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public."order" o
  WHERE ((o.id = order_dine_in.order_id) AND (o.company_id = public.get_tenant_id()) AND ((o.location_id = public.get_location_id()) OR (public.get_location_id() IS NULL))))));

-- ---------------------------------------------------------------------------
-- order_item
-- ---------------------------------------------------------------------------
ALTER TABLE public.order_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.order_item FORCE ROW LEVEL SECURITY;
-- order_item_delete_policy (DELETE): apaga apenas do tenant+location da sessão (ADR-002: company_id = get_tenant_id() E (location_id = get_location_id() OU location_id IS NULL) no alvo).
CREATE POLICY order_item_delete_policy ON public.order_item FOR DELETE USING (((company_id = public.get_tenant_id()) AND ((location_id = public.get_location_id()) OR (public.get_location_id() IS NULL))));
-- order_item_insert_policy (INSERT): escrita exige tenant da sessão e location condicionada (ADR-002: company_id = get_tenant_id() E location_id validada no momento do INSERT (location_id não nula aí)).
CREATE POLICY order_item_insert_policy ON public.order_item FOR INSERT WITH CHECK (((company_id = public.get_tenant_id()) AND ((location_id = public.get_location_id()) OR (public.get_location_id() IS NULL))));
-- order_item_select_policy (SELECT): leitura condicionada ao tenant da sessão (ADR-002: company_id = get_tenant_id() AND (location_id = get_location_id() OR get_location_id() IS NULL)).
CREATE POLICY order_item_select_policy ON public.order_item FOR SELECT USING (((company_id = public.get_tenant_id()) AND ((location_id = public.get_location_id()) OR (public.get_location_id() IS NULL))));
-- order_item_update_policy (UPDATE): escrita condicionada ao alvo E ao novo valor (ADR-002: mesmo predicado do SELECT no alvo + revalidação no novo valor (WITH CHECK)).
CREATE POLICY order_item_update_policy ON public.order_item FOR UPDATE USING (((company_id = public.get_tenant_id()) AND ((location_id = public.get_location_id()) OR (public.get_location_id() IS NULL))));

-- ---------------------------------------------------------------------------
-- order_takeout
-- ---------------------------------------------------------------------------
ALTER TABLE public.order_takeout ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.order_takeout FORCE ROW LEVEL SECURITY;
-- order_takeout_delete_policy (DELETE): localização herdada da order-pai: o predicado navega por EXISTS na "order" (order_dine_in/order_takeout não têm location_id próprio) — mesma semântica de ADR-002.
CREATE POLICY order_takeout_delete_policy ON public.order_takeout FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public."order" o
  WHERE ((o.id = order_takeout.order_id) AND (o.company_id = public.get_tenant_id()) AND ((o.location_id = public.get_location_id()) OR (public.get_location_id() IS NULL))))));
-- order_takeout_insert_policy (INSERT): localização herdada da order-pai: o predicado navega por EXISTS na "order" (order_dine_in/order_takeout não têm location_id próprio) — mesma semântica de ADR-002.
CREATE POLICY order_takeout_insert_policy ON public.order_takeout FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public."order" o
  WHERE ((o.id = order_takeout.order_id) AND (o.company_id = public.get_tenant_id()) AND ((o.location_id = public.get_location_id()) OR (public.get_location_id() IS NULL))))));
-- order_takeout_select_policy (SELECT): localização herdada da order-pai: o predicado navega por EXISTS na "order" (order_dine_in/order_takeout não têm location_id próprio) — mesma semântica de ADR-002.
CREATE POLICY order_takeout_select_policy ON public.order_takeout FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public."order" o
  WHERE ((o.id = order_takeout.order_id) AND (o.company_id = public.get_tenant_id()) AND ((o.location_id = public.get_location_id()) OR (public.get_location_id() IS NULL))))));
-- order_takeout_update_policy (UPDATE): localização herdada da order-pai: o predicado navega por EXISTS na "order" (order_dine_in/order_takeout não têm location_id próprio) — mesma semântica de ADR-002.
CREATE POLICY order_takeout_update_policy ON public.order_takeout FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public."order" o
  WHERE ((o.id = order_takeout.order_id) AND (o.company_id = public.get_tenant_id()) AND ((o.location_id = public.get_location_id()) OR (public.get_location_id() IS NULL))))));

-- ---------------------------------------------------------------------------
-- party
-- ---------------------------------------------------------------------------
ALTER TABLE public.party ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.party FORCE ROW LEVEL SECURITY;
-- party_delete_policy (DELETE): apaga apenas do tenant+location da sessão (ADR-002: company_id = get_tenant_id() E (location_id = get_location_id() OU location_id IS NULL) no alvo).
CREATE POLICY party_delete_policy ON public.party FOR DELETE USING (((company_id = public.get_tenant_id()) AND ((location_id = public.get_location_id()) OR (public.get_location_id() IS NULL))));
-- party_insert_policy (INSERT): escrita exige tenant da sessão e location condicionada (ADR-002: company_id = get_tenant_id() E location_id validada no momento do INSERT (location_id não nula aí)).
CREATE POLICY party_insert_policy ON public.party FOR INSERT WITH CHECK (((company_id = public.get_tenant_id()) AND ((location_id = public.get_location_id()) OR (public.get_location_id() IS NULL))));
-- party_select_policy (SELECT): leitura condicionada ao tenant da sessão (ADR-002: company_id = get_tenant_id() AND (location_id = get_location_id() OR get_location_id() IS NULL)).
CREATE POLICY party_select_policy ON public.party FOR SELECT USING (((company_id = public.get_tenant_id()) AND ((location_id = public.get_location_id()) OR (public.get_location_id() IS NULL))));
-- party_update_policy (UPDATE): escrita condicionada ao alvo E ao novo valor (ADR-002: mesmo predicado do SELECT no alvo + revalidação no novo valor (WITH CHECK)).
CREATE POLICY party_update_policy ON public.party FOR UPDATE USING (((company_id = public.get_tenant_id()) AND ((location_id = public.get_location_id()) OR (public.get_location_id() IS NULL))));

-- ---------------------------------------------------------------------------
-- print_job
-- ---------------------------------------------------------------------------
ALTER TABLE public.print_job ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.print_job FORCE ROW LEVEL SECURITY;
-- print_job_delete_policy (DELETE): apaga apenas do tenant+location da sessão (ADR-002: company_id = get_tenant_id() E (location_id = get_location_id() OU location_id IS NULL) no alvo).
CREATE POLICY print_job_delete_policy ON public.print_job FOR DELETE USING (((company_id = public.get_tenant_id()) AND ((location_id = public.get_location_id()) OR (public.get_location_id() IS NULL))));
-- print_job_insert_policy (INSERT): escrita exige tenant da sessão e location condicionada (ADR-002: company_id = get_tenant_id() E location_id validada no momento do INSERT (location_id não nula aí)).
CREATE POLICY print_job_insert_policy ON public.print_job FOR INSERT WITH CHECK (((company_id = public.get_tenant_id()) AND ((location_id = public.get_location_id()) OR (public.get_location_id() IS NULL))));
-- print_job_select_policy (SELECT): leitura condicionada ao tenant da sessão (ADR-002: company_id = get_tenant_id() AND (location_id = get_location_id() OR get_location_id() IS NULL)).
CREATE POLICY print_job_select_policy ON public.print_job FOR SELECT USING (((company_id = public.get_tenant_id()) AND ((location_id = public.get_location_id()) OR (public.get_location_id() IS NULL))));
-- print_job_update_policy (UPDATE): escrita condicionada ao alvo E ao novo valor (ADR-002: mesmo predicado do SELECT no alvo + revalidação no novo valor (WITH CHECK)).
CREATE POLICY print_job_update_policy ON public.print_job FOR UPDATE USING (((company_id = public.get_tenant_id()) AND ((location_id = public.get_location_id()) OR (public.get_location_id() IS NULL))));

-- ---------------------------------------------------------------------------
-- printer
-- ---------------------------------------------------------------------------
ALTER TABLE public.printer ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.printer FORCE ROW LEVEL SECURITY;
-- printer_delete_policy (DELETE): apaga apenas do tenant+location da sessão (ADR-002: company_id = get_tenant_id() E (location_id = get_location_id() OU location_id IS NULL) no alvo).
CREATE POLICY printer_delete_policy ON public.printer FOR DELETE USING (((company_id = public.get_tenant_id()) AND ((location_id = public.get_location_id()) OR (public.get_location_id() IS NULL))));
-- printer_insert_policy (INSERT): escrita exige tenant da sessão e location condicionada (ADR-002: company_id = get_tenant_id() E location_id validada no momento do INSERT (location_id não nula aí)).
CREATE POLICY printer_insert_policy ON public.printer FOR INSERT WITH CHECK (((company_id = public.get_tenant_id()) AND ((location_id = public.get_location_id()) OR (public.get_location_id() IS NULL))));
-- printer_select_policy (SELECT): leitura condicionada ao tenant da sessão (ADR-002: company_id = get_tenant_id() AND (location_id = get_location_id() OR get_location_id() IS NULL)).
CREATE POLICY printer_select_policy ON public.printer FOR SELECT USING (((company_id = public.get_tenant_id()) AND ((location_id = public.get_location_id()) OR (public.get_location_id() IS NULL))));
-- printer_update_policy (UPDATE): escrita condicionada ao alvo E ao novo valor (ADR-002: mesmo predicado do SELECT no alvo + revalidação no novo valor (WITH CHECK)).
CREATE POLICY printer_update_policy ON public.printer FOR UPDATE USING (((company_id = public.get_tenant_id()) AND ((location_id = public.get_location_id()) OR (public.get_location_id() IS NULL))));

-- ---------------------------------------------------------------------------
-- product
-- ---------------------------------------------------------------------------
ALTER TABLE public.product ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.product FORCE ROW LEVEL SECURITY;
-- product_delete_policy (DELETE): apaga apenas do tenant+location da sessão (ADR-002: company_id = get_tenant_id() E (location_id = get_location_id() OU location_id IS NULL) no alvo).
CREATE POLICY product_delete_policy ON public.product FOR DELETE USING (((company_id = public.get_tenant_id()) AND ((location_id = public.get_location_id()) OR (public.get_location_id() IS NULL))));
-- product_insert_policy (INSERT): escrita exige tenant da sessão e location condicionada (ADR-002: company_id = get_tenant_id() E location_id validada no momento do INSERT (location_id não nula aí)).
CREATE POLICY product_insert_policy ON public.product FOR INSERT WITH CHECK (((company_id = public.get_tenant_id()) AND ((location_id = public.get_location_id()) OR (public.get_location_id() IS NULL))));
-- product_select_policy (SELECT): leitura condicionada ao tenant da sessão (ADR-002: company_id = get_tenant_id() AND (location_id = get_location_id() OR get_location_id() IS NULL)).
CREATE POLICY product_select_policy ON public.product FOR SELECT USING (((company_id = public.get_tenant_id()) AND ((location_id = public.get_location_id()) OR (public.get_location_id() IS NULL))));
-- product_update_policy (UPDATE): escrita condicionada ao alvo E ao novo valor (ADR-002: mesmo predicado do SELECT no alvo + revalidação no novo valor (WITH CHECK)).
CREATE POLICY product_update_policy ON public.product FOR UPDATE USING (((company_id = public.get_tenant_id()) AND ((location_id = public.get_location_id()) OR (public.get_location_id() IS NULL))));

-- ---------------------------------------------------------------------------
-- restaurant_table
-- ---------------------------------------------------------------------------
ALTER TABLE public.restaurant_table ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.restaurant_table FORCE ROW LEVEL SECURITY;
-- restaurant_table_delete_policy (DELETE): apaga apenas do tenant+location da sessão (ADR-002: company_id = get_tenant_id() E (location_id = get_location_id() OU location_id IS NULL) no alvo).
CREATE POLICY restaurant_table_delete_policy ON public.restaurant_table FOR DELETE USING (((company_id = public.get_tenant_id()) AND ((location_id = public.get_location_id()) OR (public.get_location_id() IS NULL))));
-- restaurant_table_insert_policy (INSERT): escrita exige tenant da sessão e location condicionada (ADR-002: company_id = get_tenant_id() E location_id validada no momento do INSERT (location_id não nula aí)).
CREATE POLICY restaurant_table_insert_policy ON public.restaurant_table FOR INSERT WITH CHECK (((company_id = public.get_tenant_id()) AND ((location_id = public.get_location_id()) OR (public.get_location_id() IS NULL))));
-- restaurant_table_select_policy (SELECT): leitura condicionada ao tenant da sessão (ADR-002: company_id = get_tenant_id() AND (location_id = get_location_id() OR get_location_id() IS NULL)).
CREATE POLICY restaurant_table_select_policy ON public.restaurant_table FOR SELECT USING (((company_id = public.get_tenant_id()) AND ((location_id = public.get_location_id()) OR (public.get_location_id() IS NULL))));
-- restaurant_table_update_policy (UPDATE): escrita condicionada ao alvo E ao novo valor (ADR-002: mesmo predicado do SELECT no alvo + revalidação no novo valor (WITH CHECK)).
CREATE POLICY restaurant_table_update_policy ON public.restaurant_table FOR UPDATE USING (((company_id = public.get_tenant_id()) AND ((location_id = public.get_location_id()) OR (public.get_location_id() IS NULL))));

-- ===========================================================================
-- Grants da aplicação (merp_app) — estado final de 0017 + 0020
-- ===========================================================================
-- Toda sessão da app entra como merp_app (nunca como owner) — é o que torna
-- RLS efetivo em vez de teórico (AUD-19).
GRANT USAGE ON SCHEMA public TO merp_app;
-- Mesmos bits do estado final (SELECT,INSERT,UPDATE,DELETE = arwd): ALL
-- PRIVILEGES daria TRUNCATE/REFERENCES/TRIGGER a mais, que não existiam.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO merp_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO merp_app;
-- DEFAULT PRIVILEGES: tabelas novas (drizzle-kit generate) já saem legíveis
-- pela app, sem GRANT manual por migração (0020 + grants-parity.test.ts).
ALTER DEFAULT PRIVILEGES FOR ROLE merp IN SCHEMA public GRANT SELECT,INSERT,DELETE,UPDATE ON TABLES TO merp_app;
ALTER DEFAULT PRIVILEGES FOR ROLE merp IN SCHEMA public GRANT SELECT,USAGE ON SEQUENCES TO merp_app;
