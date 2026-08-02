-- Force RLS: policies passam a valer também para o owner da tabela
ALTER TABLE company FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE company_member FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE invite FORCE ROW LEVEL SECURITY;
