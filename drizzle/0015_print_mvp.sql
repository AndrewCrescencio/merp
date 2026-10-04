-- Custom SQL migration file for Print MVP
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "printer" (
	"id" text DEFAULT gen_random_uuid() NOT NULL,
	"company_id" text NOT NULL,
	"location_id" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"connection_type" text NOT NULL,
	"connection_config" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'online' NOT NULL,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "printer_pkey" PRIMARY KEY ("id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "print_job" (
	"id" text DEFAULT gen_random_uuid() NOT NULL,
	"company_id" text NOT NULL,
	"location_id" text NOT NULL,
	"printer_id" text NOT NULL,
	"order_id" text NOT NULL,
	"template" text NOT NULL,
	"payload" jsonb NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"last_error" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "print_job_pkey" PRIMARY KEY ("id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "printer_company_id_idx" ON "printer" USING btree ("company_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "printer_location_id_idx" ON "printer" USING btree ("location_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "printer_type_idx" ON "printer" USING btree ("type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "printer_status_idx" ON "printer" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "print_job_company_id_idx" ON "print_job" USING btree ("company_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "print_job_location_id_idx" ON "print_job" USING btree ("location_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "print_job_printer_id_idx" ON "print_job" USING btree ("printer_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "print_job_order_id_idx" ON "print_job" USING btree ("order_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "print_job_status_idx" ON "print_job" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "print_job_priority_created_idx" ON "print_job" USING btree ("priority" DESC, "created_at");
--> statement-breakpoint
ALTER TABLE "printer" ADD CONSTRAINT "printer_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "printer" ADD CONSTRAINT "printer_location_id_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."location"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "print_job" ADD CONSTRAINT "print_job_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "print_job" ADD CONSTRAINT "print_job_location_id_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."location"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "print_job" ADD CONSTRAINT "print_job_printer_id_printer_id_fk" FOREIGN KEY ("printer_id") REFERENCES "public"."printer"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "print_job" ADD CONSTRAINT "print_job_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE cascade ON UPDATE no action;

-- RLS for printer
ALTER TABLE "printer" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "printer_select_policy" ON "printer";
CREATE POLICY "printer_select_policy" ON "printer" FOR SELECT
  USING (company_id = get_tenant_id());
DROP POLICY IF EXISTS "printer_insert_policy" ON "printer";
CREATE POLICY "printer_insert_policy" ON "printer" FOR INSERT
  WITH CHECK (company_id = get_tenant_id());
DROP POLICY IF EXISTS "printer_update_policy" ON "printer";
CREATE POLICY "printer_update_policy" ON "printer" FOR UPDATE
  USING (company_id = get_tenant_id());
DROP POLICY IF EXISTS "printer_delete_policy" ON "printer";
CREATE POLICY "printer_delete_policy" ON "printer" FOR DELETE
  USING (company_id = get_tenant_id());

-- RLS for print_job
ALTER TABLE "print_job" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "print_job_select_policy" ON "print_job";
CREATE POLICY "print_job_select_policy" ON "print_job" FOR SELECT
  USING (company_id = get_tenant_id());
DROP POLICY IF EXISTS "print_job_insert_policy" ON "print_job";
CREATE POLICY "print_job_insert_policy" ON "print_job" FOR INSERT
  WITH CHECK (company_id = get_tenant_id());
DROP POLICY IF EXISTS "print_job_update_policy" ON "print_job";
CREATE POLICY "print_job_update_policy" ON "print_job" FOR UPDATE
  USING (company_id = get_tenant_id());
DROP POLICY IF EXISTS "print_job_delete_policy" ON "print_job";
CREATE POLICY "print_job_delete_policy" ON "print_job" FOR DELETE
  USING (company_id = get_tenant_id());