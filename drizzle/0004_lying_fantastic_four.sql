-- Migracao de dados legados: papel 'manager' (ou qualquer valor fora do
-- conjunto valido) vira 'member' para nao violar o CHECK abaixo. O papel
-- 'manager' nunca existiu no journal aplicado; este UPDATE e idempotente.
UPDATE "company_member" SET role = 'member' WHERE role NOT IN ('owner', 'member');--> statement-breakpoint
ALTER TABLE "company_member" ADD CONSTRAINT "company_member_role_check" CHECK ("company_member"."role" IN ('owner', 'member'));
