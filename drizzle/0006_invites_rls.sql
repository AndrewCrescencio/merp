CREATE OR REPLACE FUNCTION is_company_owner(cid text) RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM company_member
    WHERE company_id = cid AND user_id = get_user_id() AND role = 'owner'
  );
$$ LANGUAGE SQL STABLE;

CREATE TABLE IF NOT EXISTS "invite" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" text NOT NULL,
  "email" text NOT NULL,
  "invited_by" text NOT NULL,
  "accepted_at" timestamp with time zone,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "invite_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "invite_invited_by_user_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "invite_company_email_unique" UNIQUE("company_id", "email")
);
--> statement-breakpoint
CREATE INDEX "invite_pending_email_idx" ON "invite" ("email") WHERE "accepted_at" IS NULL;
--> statement-breakpoint
ALTER TABLE "invite" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "invite_select_policy" ON "invite" FOR SELECT
  USING ("company_id" = get_tenant_id());
--> statement-breakpoint
CREATE POLICY "invite_insert_policy" ON "invite" FOR INSERT
  WITH CHECK (is_company_owner("company_id"));
--> statement-breakpoint
CREATE POLICY "invite_update_policy" ON "invite" FOR UPDATE
  USING ("company_id" = get_tenant_id());
--> statement-breakpoint
CREATE POLICY "invite_delete_policy" ON "invite" FOR DELETE
  USING ("company_id" = get_tenant_id());
