-- ADR-002, §Consequências: "`company_member` ganha `default_location_id` (nullable)".
--
-- Fecha o H07. Até aqui os handlers de restaurant/print/order forjavam a fonte de
-- location com `''`: no GUC isso vira NULL (RLS cai no escopo company, correto),
-- mas nos `eq(col, locationId)` do repositório é um valor concreto — e como
-- `location_id` guarda UUID, `WHERE location_id = ''` não casa com nada. Reads
-- voltavam vazios e writes violavam a FK. Não existia fonte nenhuma de location.
--
-- Nullable de propósito: NULL = "membro sem location definido" → o chamador opera
-- em escopo company, que a RLS já permite via `OR get_location_id() IS NULL`.
-- ON DELETE SET NULL porque `location` não tem soft-delete (só `is_active`), então
-- um DELETE real deixaria o membro apontando para um id órfão.
ALTER TABLE "company_member" ADD COLUMN IF NOT EXISTS "default_location_id" text;
--> statement-breakpoint
ALTER TABLE "company_member" ADD CONSTRAINT "company_member_default_location_id_location_id_fk" FOREIGN KEY ("default_location_id") REFERENCES "public"."location"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "company_member_default_location_id_idx" ON "company_member"("default_location_id");
