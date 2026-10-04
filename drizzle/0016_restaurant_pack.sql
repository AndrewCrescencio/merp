-- Custom SQL migration file for Restaurant Pack
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cashier_shift" (
	"id" text DEFAULT gen_random_uuid() NOT NULL,
	"company_id" text NOT NULL,
	"location_id" text NOT NULL,
	"user_id" text NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"opening_float" numeric(12,2) DEFAULT '0' NOT NULL,
	"closing_float" numeric(12,2),
	"expected_amount" numeric(12,2),
	"actual_amount" numeric(12,2),
	"difference" numeric(12,2),
	"status" text DEFAULT 'open' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cashier_shift_pkey" PRIMARY KEY ("id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cashier_shift_company_id_idx" ON "cashier_shift" USING btree ("company_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cashier_shift_location_id_idx" ON "cashier_shift" USING btree ("location_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cashier_shift_user_id_idx" ON "cashier_shift" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cashier_shift_status_idx" ON "cashier_shift" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cashier_shift_opened_at_idx" ON "cashier_shift" USING btree ("opened_at");
--> statement-breakpoint
ALTER TABLE "cashier_shift" ADD CONSTRAINT "cashier_shift_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "cashier_shift" ADD CONSTRAINT "cashier_shift_location_id_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."location"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "cashier_shift" ADD CONSTRAINT "cashier_shift_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;

-- RLS for cashier_shift
ALTER TABLE "cashier_shift" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cashier_shift_select_policy" ON "cashier_shift";
CREATE POLICY "cashier_shift_select_policy" ON "cashier_shift" FOR SELECT
  USING (company_id = get_tenant_id());
DROP POLICY IF EXISTS "cashier_shift_insert_policy" ON "cashier_shift";
CREATE POLICY "cashier_shift_insert_policy" ON "cashier_shift" FOR INSERT
  WITH CHECK (company_id = get_tenant_id());
DROP POLICY IF EXISTS "cashier_shift_update_policy" ON "cashier_shift";
CREATE POLICY "cashier_shift_update_policy" ON "cashier_shift" FOR UPDATE
  USING (company_id = get_tenant_id());
DROP POLICY IF EXISTS "cashier_shift_delete_policy" ON "cashier_shift";
CREATE POLICY "cashier_shift_delete_policy" ON "cashier_shift" FOR DELETE
  USING (company_id = get_tenant_id());