-- Fix RLS policies to be location-scoped: company_id = get_tenant_id() AND (location_id = get_location_id() OR get_location_id() IS NULL)
-- Applies to all tables that have both company_id and location_id

-- location
DROP POLICY IF EXISTS "location_select_policy" ON "location";
CREATE POLICY "location_select_policy" ON "location" FOR SELECT
  USING (company_id = get_tenant_id() AND (location_id = get_location_id() OR get_location_id() IS NULL));
DROP POLICY IF EXISTS "location_insert_policy" ON "location";
CREATE POLICY "location_insert_policy" ON "location" FOR INSERT
  WITH CHECK (company_id = get_tenant_id() AND (location_id = get_location_id() OR get_location_id() IS NULL));
DROP POLICY IF EXISTS "location_update_policy" ON "location";
CREATE POLICY "location_update_policy" ON "location" FOR UPDATE
  USING (company_id = get_tenant_id() AND (location_id = get_location_id() OR get_location_id() IS NULL));
DROP POLICY IF EXISTS "location_delete_policy" ON "location";
CREATE POLICY "location_delete_policy" ON "location" FOR DELETE
  USING (company_id = get_tenant_id() AND (location_id = get_location_id() OR get_location_id() IS NULL));

-- party
DROP POLICY IF EXISTS "party_select_policy" ON "party";
CREATE POLICY "party_select_policy" ON "party" FOR SELECT
  USING (company_id = get_tenant_id() AND (location_id = get_location_id() OR get_location_id() IS NULL));
DROP POLICY IF EXISTS "party_insert_policy" ON "party";
CREATE POLICY "party_insert_policy" ON "party" FOR INSERT
  WITH CHECK (company_id = get_tenant_id() AND (location_id = get_location_id() OR get_location_id() IS NULL));
DROP POLICY IF EXISTS "party_update_policy" ON "party";
CREATE POLICY "party_update_policy" ON "party" FOR UPDATE
  USING (company_id = get_tenant_id() AND (location_id = get_location_id() OR get_location_id() IS NULL));
DROP POLICY IF EXISTS "party_delete_policy" ON "party";
CREATE POLICY "party_delete_policy" ON "party" FOR DELETE
  USING (company_id = get_tenant_id() AND (location_id = get_location_id() OR get_location_id() IS NULL));

-- product
DROP POLICY IF EXISTS "product_select_policy" ON "product";
CREATE POLICY "product_select_policy" ON "product" FOR SELECT
  USING (company_id = get_tenant_id() AND (location_id = get_location_id() OR get_location_id() IS NULL));
DROP POLICY IF EXISTS "product_insert_policy" ON "product";
CREATE POLICY "product_insert_policy" ON "product" FOR INSERT
  WITH CHECK (company_id = get_tenant_id() AND (location_id = get_location_id() OR get_location_id() IS NULL));
DROP POLICY IF EXISTS "product_update_policy" ON "product";
CREATE POLICY "product_update_policy" ON "product" FOR UPDATE
  USING (company_id = get_tenant_id() AND (location_id = get_location_id() OR get_location_id() IS NULL));
DROP POLICY IF EXISTS "product_delete_policy" ON "product";
CREATE POLICY "product_delete_policy" ON "product" FOR DELETE
  USING (company_id = get_tenant_id() AND (location_id = get_location_id() OR get_location_id() IS NULL));

-- restaurant_table
DROP POLICY IF EXISTS "restaurant_table_select_policy" ON "restaurant_table";
CREATE POLICY "restaurant_table_select_policy" ON "restaurant_table" FOR SELECT
  USING (company_id = get_tenant_id() AND (location_id = get_location_id() OR get_location_id() IS NULL));
DROP POLICY IF EXISTS "restaurant_table_insert_policy" ON "restaurant_table";
CREATE POLICY "restaurant_table_insert_policy" ON "restaurant_table" FOR INSERT
  WITH CHECK (company_id = get_tenant_id() AND (location_id = get_location_id() OR get_location_id() IS NULL));
DROP POLICY IF EXISTS "restaurant_table_update_policy" ON "restaurant_table";
CREATE POLICY "restaurant_table_update_policy" ON "restaurant_table" FOR UPDATE
  USING (company_id = get_tenant_id() AND (location_id = get_location_id() OR get_location_id() IS NULL));
DROP POLICY IF EXISTS "restaurant_table_delete_policy" ON "restaurant_table";
CREATE POLICY "restaurant_table_delete_policy" ON "restaurant_table" FOR DELETE
  USING (company_id = get_tenant_id() AND (location_id = get_location_id() OR get_location_id() IS NULL));

-- order
DROP POLICY IF EXISTS "order_select_policy" ON "order";
CREATE POLICY "order_select_policy" ON "order" FOR SELECT
  USING (company_id = get_tenant_id() AND (location_id = get_location_id() OR get_location_id() IS NULL));
DROP POLICY IF EXISTS "order_insert_policy" ON "order";
CREATE POLICY "order_insert_policy" ON "order" FOR INSERT
  WITH CHECK (company_id = get_tenant_id() AND (location_id = get_location_id() OR get_location_id() IS NULL));
DROP POLICY IF EXISTS "order_update_policy" ON "order";
CREATE POLICY "order_update_policy" ON "order" FOR UPDATE
  USING (company_id = get_tenant_id() AND (location_id = get_location_id() OR get_location_id() IS NULL));
DROP POLICY IF EXISTS "order_delete_policy" ON "order";
CREATE POLICY "order_delete_policy" ON "order" FOR DELETE
  USING (company_id = get_tenant_id() AND (location_id = get_location_id() OR get_location_id() IS NULL));

-- order_item
DROP POLICY IF EXISTS "order_item_select_policy" ON "order_item";
CREATE POLICY "order_item_select_policy" ON "order_item" FOR SELECT
  USING (company_id = get_tenant_id() AND (location_id = get_location_id() OR get_location_id() IS NULL));
DROP POLICY IF EXISTS "order_item_insert_policy" ON "order_item";
CREATE POLICY "order_item_insert_policy" ON "order_item" FOR INSERT
  WITH CHECK (company_id = get_tenant_id() AND (location_id = get_location_id() OR get_location_id() IS NULL));
DROP POLICY IF EXISTS "order_item_update_policy" ON "order_item";
CREATE POLICY "order_item_update_policy" ON "order_item" FOR UPDATE
  USING (company_id = get_tenant_id() AND (location_id = get_location_id() OR get_location_id() IS NULL));
DROP POLICY IF EXISTS "order_item_delete_policy" ON "order_item";
CREATE POLICY "order_item_delete_policy" ON "order_item" FOR DELETE
  USING (company_id = get_tenant_id() AND (location_id = get_location_id() OR get_location_id() IS NULL));

-- order_dine_in (via order)
DROP POLICY IF EXISTS "order_dine_in_select_policy" ON "order_dine_in";
CREATE POLICY "order_dine_in_select_policy" ON "order_dine_in" FOR SELECT
  USING (EXISTS (SELECT 1 FROM "order" o WHERE o.id = order_dine_in.order_id AND o.company_id = get_tenant_id() AND (o.location_id = get_location_id() OR get_location_id() IS NULL)));
DROP POLICY IF EXISTS "order_dine_in_insert_policy" ON "order_dine_in";
CREATE POLICY "order_dine_in_insert_policy" ON "order_dine_in" FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM "order" o WHERE o.id = order_dine_in.order_id AND o.company_id = get_tenant_id() AND (o.location_id = get_location_id() OR get_location_id() IS NULL)));
DROP POLICY IF EXISTS "order_dine_in_update_policy" ON "order_dine_in";
CREATE POLICY "order_dine_in_update_policy" ON "order_dine_in" FOR UPDATE
  USING (EXISTS (SELECT 1 FROM "order" o WHERE o.id = order_dine_in.order_id AND o.company_id = get_tenant_id() AND (o.location_id = get_location_id() OR get_location_id() IS NULL)));
DROP POLICY IF EXISTS "order_dine_in_delete_policy" ON "order_dine_in";
CREATE POLICY "order_dine_in_delete_policy" ON "order_dine_in" FOR DELETE
  USING (EXISTS (SELECT 1 FROM "order" o WHERE o.id = order_dine_in.order_id AND o.company_id = get_tenant_id() AND (o.location_id = get_location_id() OR get_location_id() IS NULL)));

-- order_takeout (via order)
DROP POLICY IF EXISTS "order_takeout_select_policy" ON "order_takeout";
CREATE POLICY "order_takeout_select_policy" ON "order_takeout" FOR SELECT
  USING (EXISTS (SELECT 1 FROM "order" o WHERE o.id = order_takeout.order_id AND o.company_id = get_tenant_id() AND (o.location_id = get_location_id() OR get_location_id() IS NULL)));
DROP POLICY IF EXISTS "order_takeout_insert_policy" ON "order_takeout";
CREATE POLICY "order_takeout_insert_policy" ON "order_takeout" FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM "order" o WHERE o.id = order_takeout.order_id AND o.company_id = get_tenant_id() AND (o.location_id = get_location_id() OR get_location_id() IS NULL)));
DROP POLICY IF EXISTS "order_takeout_update_policy" ON "order_takeout";
CREATE POLICY "order_takeout_update_policy" ON "order_takeout" FOR UPDATE
  USING (EXISTS (SELECT 1 FROM "order" o WHERE o.id = order_takeout.order_id AND o.company_id = get_tenant_id() AND (o.location_id = get_location_id() OR get_location_id() IS NULL)));
DROP POLICY IF EXISTS "order_takeout_delete_policy" ON "order_takeout";
CREATE POLICY "order_takeout_delete_policy" ON "order_takeout" FOR DELETE
  USING (EXISTS (SELECT 1 FROM "order" o WHERE o.id = order_takeout.order_id AND o.company_id = get_tenant_id() AND (o.location_id = get_location_id() OR get_location_id() IS NULL)));

-- printer
DROP POLICY IF EXISTS "printer_select_policy" ON "printer";
CREATE POLICY "printer_select_policy" ON "printer" FOR SELECT
  USING (company_id = get_tenant_id() AND (location_id = get_location_id() OR get_location_id() IS NULL));
DROP POLICY IF EXISTS "printer_insert_policy" ON "printer";
CREATE POLICY "printer_insert_policy" ON "printer" FOR INSERT
  WITH CHECK (company_id = get_tenant_id() AND (location_id = get_location_id() OR get_location_id() IS NULL));
DROP POLICY IF EXISTS "printer_update_policy" ON "printer";
CREATE POLICY "printer_update_policy" ON "printer" FOR UPDATE
  USING (company_id = get_tenant_id() AND (location_id = get_location_id() OR get_location_id() IS NULL));
DROP POLICY IF EXISTS "printer_delete_policy" ON "printer";
CREATE POLICY "printer_delete_policy" ON "printer" FOR DELETE
  USING (company_id = get_tenant_id() AND (location_id = get_location_id() OR get_location_id() IS NULL));

-- print_job
DROP POLICY IF EXISTS "print_job_select_policy" ON "print_job";
CREATE POLICY "print_job_select_policy" ON "print_job" FOR SELECT
  USING (company_id = get_tenant_id() AND (location_id = get_location_id() OR get_location_id() IS NULL));
DROP POLICY IF EXISTS "print_job_insert_policy" ON "print_job";
CREATE POLICY "print_job_insert_policy" ON "print_job" FOR INSERT
  WITH CHECK (company_id = get_tenant_id() AND (location_id = get_location_id() OR get_location_id() IS NULL));
DROP POLICY IF EXISTS "print_job_update_policy" ON "print_job";
CREATE POLICY "print_job_update_policy" ON "print_job" FOR UPDATE
  USING (company_id = get_tenant_id() AND (location_id = get_location_id() OR get_location_id() IS NULL));
DROP POLICY IF EXISTS "print_job_delete_policy" ON "print_job";
CREATE POLICY "print_job_delete_policy" ON "print_job" FOR DELETE
  USING (company_id = get_tenant_id() AND (location_id = get_location_id() OR get_location_id() IS NULL));

-- cashier_shift
DROP POLICY IF EXISTS "cashier_shift_select_policy" ON "cashier_shift";
CREATE POLICY "cashier_shift_select_policy" ON "cashier_shift" FOR SELECT
  USING (company_id = get_tenant_id() AND (location_id = get_location_id() OR get_location_id() IS NULL));
DROP POLICY IF EXISTS "cashier_shift_insert_policy" ON "cashier_shift";
CREATE POLICY "cashier_shift_insert_policy" ON "cashier_shift" FOR INSERT
  WITH CHECK (company_id = get_tenant_id() AND (location_id = get_location_id() OR get_location_id() IS NULL));
DROP POLICY IF EXISTS "cashier_shift_update_policy" ON "cashier_shift";
CREATE POLICY "cashier_shift_update_policy" ON "cashier_shift" FOR UPDATE
  USING (company_id = get_tenant_id() AND (location_id = get_location_id() OR get_location_id() IS NULL));
DROP POLICY IF EXISTS "cashier_shift_delete_policy" ON "cashier_shift";
CREATE POLICY "cashier_shift_delete_policy" ON "cashier_shift" FOR DELETE
  USING (company_id = get_tenant_id() AND (location_id = get_location_id() OR get_location_id() IS NULL));

-- kitchen_station (create table + RLS if not exists)
CREATE TABLE IF NOT EXISTS "kitchen_station" (
  "id" text DEFAULT gen_random_uuid() NOT NULL,
  "company_id" text NOT NULL,
  "location_id" text NOT NULL,
  "name" text NOT NULL,
  "display_order" integer DEFAULT 0 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "kitchen_station_pkey" PRIMARY KEY ("id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "kitchen_station_company_id_idx" ON "kitchen_station" USING btree ("company_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "kitchen_station_location_id_idx" ON "kitchen_station" USING btree ("location_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "kitchen_station_is_active_idx" ON "kitchen_station" USING btree ("is_active");
--> statement-breakpoint
ALTER TABLE "kitchen_station" ADD CONSTRAINT "kitchen_station_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "kitchen_station" ADD CONSTRAINT "kitchen_station_location_id_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."location"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "kitchen_station" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "kitchen_station_select_policy" ON "kitchen_station";
CREATE POLICY "kitchen_station_select_policy" ON "kitchen_station" FOR SELECT
  USING (company_id = get_tenant_id() AND (location_id = get_location_id() OR get_location_id() IS NULL));
DROP POLICY IF EXISTS "kitchen_station_insert_policy" ON "kitchen_station";
CREATE POLICY "kitchen_station_insert_policy" ON "kitchen_station" FOR INSERT
  WITH CHECK (company_id = get_tenant_id() AND (location_id = get_location_id() OR get_location_id() IS NULL));
DROP POLICY IF EXISTS "kitchen_station_update_policy" ON "kitchen_station";
CREATE POLICY "kitchen_station_update_policy" ON "kitchen_station" FOR UPDATE
  USING (company_id = get_tenant_id() AND (location_id = get_location_id() OR get_location_id() IS NULL));
DROP POLICY IF EXISTS "kitchen_station_delete_policy" ON "kitchen_station";
CREATE POLICY "kitchen_station_delete_policy" ON "kitchen_station" FOR DELETE
  USING (company_id = get_tenant_id() AND (location_id = get_location_id() OR get_location_id() IS NULL));

-- kitchen_ticket (create table + RLS if not exists)
CREATE TABLE IF NOT EXISTS "kitchen_ticket" (
  "id" text DEFAULT gen_random_uuid() NOT NULL,
  "company_id" text NOT NULL,
  "location_id" text NOT NULL,
  "order_id" text NOT NULL,
  "order_item_id" text NOT NULL,
  "station_id" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "priority" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "kitchen_ticket_pkey" PRIMARY KEY ("id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "kitchen_ticket_company_id_idx" ON "kitchen_ticket" USING btree ("company_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "kitchen_ticket_location_id_idx" ON "kitchen_ticket" USING btree ("location_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "kitchen_ticket_order_id_idx" ON "kitchen_ticket" USING btree ("order_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "kitchen_ticket_station_id_idx" ON "kitchen_ticket" USING btree ("station_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "kitchen_ticket_status_idx" ON "kitchen_ticket" USING btree ("status");
--> statement-breakpoint
ALTER TABLE "kitchen_ticket" ADD CONSTRAINT "kitchen_ticket_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "kitchen_ticket" ADD CONSTRAINT "kitchen_ticket_location_id_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."location"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "kitchen_ticket" ADD CONSTRAINT "kitchen_ticket_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "kitchen_ticket" ADD CONSTRAINT "kitchen_ticket_order_item_id_order_item_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_item"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "kitchen_ticket" ADD CONSTRAINT "kitchen_ticket_station_id_kitchen_station_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."kitchen_station"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "kitchen_ticket" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "kitchen_ticket_select_policy" ON "kitchen_ticket";
CREATE POLICY "kitchen_ticket_select_policy" ON "kitchen_ticket" FOR SELECT
  USING (company_id = get_tenant_id() AND (location_id = get_location_id() OR get_location_id() IS NULL));
DROP POLICY IF EXISTS "kitchen_ticket_insert_policy" ON "kitchen_ticket";
CREATE POLICY "kitchen_ticket_insert_policy" ON "kitchen_ticket" FOR INSERT
  WITH CHECK (company_id = get_tenant_id() AND (location_id = get_location_id() OR get_location_id() IS NULL));
DROP POLICY IF EXISTS "kitchen_ticket_update_policy" ON "kitchen_ticket";
CREATE POLICY "kitchen_ticket_update_policy" ON "kitchen_ticket" FOR UPDATE
  USING (company_id = get_tenant_id() AND (location_id = get_location_id() OR get_location_id() IS NULL));
DROP POLICY IF EXISTS "kitchen_ticket_delete_policy" ON "kitchen_ticket";
CREATE POLICY "kitchen_ticket_delete_policy" ON "kitchen_ticket" FOR DELETE
  USING (company_id = get_tenant_id() AND (location_id = get_location_id() OR get_location_id() IS NULL));