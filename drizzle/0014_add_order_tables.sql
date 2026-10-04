-- Custom SQL migration file, put your code below! --
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "location" (
	"id" text DEFAULT gen_random_uuid() NOT NULL,
	"company_id" text NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "location_pkey" PRIMARY KEY ("id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "party" (
	"id" text DEFAULT gen_random_uuid() NOT NULL,
	"company_id" text NOT NULL,
	"location_id" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"document" text,
	"email" text,
	"phone" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "party_pkey" PRIMARY KEY ("id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "location_company_id_idx" ON "location" USING btree ("company_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "location_is_active_idx" ON "location" USING btree ("is_active");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "party_company_id_idx" ON "party" USING btree ("company_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "party_location_id_idx" ON "party" USING btree ("location_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "party_type_idx" ON "party" USING btree ("type");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "party_company_document_idx" ON "party" USING btree ("company_id", "document");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "party_is_active_idx" ON "party" USING btree ("is_active");
--> statement-breakpoint
ALTER TABLE "location" ADD CONSTRAINT "location_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "party" ADD CONSTRAINT "party_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "party" ADD CONSTRAINT "party_location_id_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."location"("id") ON DELETE cascade ON UPDATE no action;

-- RLS for location
ALTER TABLE "location" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "location_select_policy" ON "location";
CREATE POLICY "location_select_policy" ON "location" FOR SELECT
  USING (company_id = get_tenant_id());
DROP POLICY IF EXISTS "location_insert_policy" ON "location";
CREATE POLICY "location_insert_policy" ON "location" FOR INSERT
  WITH CHECK (company_id = get_tenant_id());
DROP POLICY IF EXISTS "location_update_policy" ON "location";
CREATE POLICY "location_update_policy" ON "location" FOR UPDATE
  USING (company_id = get_tenant_id());
DROP POLICY IF EXISTS "location_delete_policy" ON "location";
CREATE POLICY "location_delete_policy" ON "location" FOR DELETE
  USING (company_id = get_tenant_id());

-- RLS for party
ALTER TABLE "party" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "party_select_policy" ON "party";
CREATE POLICY "party_select_policy" ON "party" FOR SELECT
  USING (company_id = get_tenant_id());
DROP POLICY IF EXISTS "party_insert_policy" ON "party";
CREATE POLICY "party_insert_policy" ON "party" FOR INSERT
  WITH CHECK (company_id = get_tenant_id());
DROP POLICY IF EXISTS "party_update_policy" ON "party";
CREATE POLICY "party_update_policy" ON "party" FOR UPDATE
  USING (company_id = get_tenant_id());
DROP POLICY IF EXISTS "party_delete_policy" ON "party";
CREATE POLICY "party_delete_policy" ON "party" FOR DELETE
  USING (company_id = get_tenant_id());

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "product" (
	"id" text DEFAULT gen_random_uuid() NOT NULL,
	"company_id" text NOT NULL,
	"location_id" text NOT NULL,
	"name" text NOT NULL,
	"sku" text,
	"unit_price" numeric(12,2) DEFAULT '0' NOT NULL,
	"tax_rule_id" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_pkey" PRIMARY KEY ("id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "restaurant_table" (
	"id" text DEFAULT gen_random_uuid() NOT NULL,
	"company_id" text NOT NULL,
	"location_id" text NOT NULL,
	"number" integer NOT NULL,
	"name" text,
	"capacity" integer DEFAULT 4 NOT NULL,
	"status" text DEFAULT 'available' NOT NULL,
	"current_order_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "restaurant_table_pkey" PRIMARY KEY ("id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_company_id_idx" ON "product" USING btree ("company_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_location_id_idx" ON "product" USING btree ("location_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "product_company_sku_idx" ON "product" USING btree ("company_id", "sku");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_is_active_idx" ON "product" USING btree ("is_active");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "restaurant_table_company_id_idx" ON "restaurant_table" USING btree ("company_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "restaurant_table_location_id_idx" ON "restaurant_table" USING btree ("location_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "restaurant_table_status_idx" ON "restaurant_table" USING btree ("status");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "restaurant_table_company_number_idx" ON "restaurant_table" USING btree ("company_id", "number");
--> statement-breakpoint
ALTER TABLE "product" ADD CONSTRAINT "product_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "product" ADD CONSTRAINT "product_location_id_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."location"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "restaurant_table" ADD CONSTRAINT "restaurant_table_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "restaurant_table" ADD CONSTRAINT "restaurant_table_location_id_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."location"("id") ON DELETE cascade ON UPDATE no action;

-- RLS for product
ALTER TABLE "product" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "product_select_policy" ON "product";
CREATE POLICY "product_select_policy" ON "product" FOR SELECT
  USING (company_id = get_tenant_id());
DROP POLICY IF EXISTS "product_insert_policy" ON "product";
CREATE POLICY "product_insert_policy" ON "product" FOR INSERT
  WITH CHECK (company_id = get_tenant_id());
DROP POLICY IF EXISTS "product_update_policy" ON "product";
CREATE POLICY "product_update_policy" ON "product" FOR UPDATE
  USING (company_id = get_tenant_id());
DROP POLICY IF EXISTS "product_delete_policy" ON "product";
CREATE POLICY "product_delete_policy" ON "product" FOR DELETE
  USING (company_id = get_tenant_id());

-- RLS for restaurant_table
ALTER TABLE "restaurant_table" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "restaurant_table_select_policy" ON "restaurant_table";
CREATE POLICY "restaurant_table_select_policy" ON "restaurant_table" FOR SELECT
  USING (company_id = get_tenant_id());
DROP POLICY IF EXISTS "restaurant_table_insert_policy" ON "restaurant_table";
CREATE POLICY "restaurant_table_insert_policy" ON "restaurant_table" FOR INSERT
  WITH CHECK (company_id = get_tenant_id());
DROP POLICY IF EXISTS "restaurant_table_update_policy" ON "restaurant_table";
CREATE POLICY "restaurant_table_update_policy" ON "restaurant_table" FOR UPDATE
  USING (company_id = get_tenant_id());
DROP POLICY IF EXISTS "restaurant_table_delete_policy" ON "restaurant_table";
CREATE POLICY "restaurant_table_delete_policy" ON "restaurant_table" FOR DELETE
  USING (company_id = get_tenant_id());

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "order" (
	"id" text DEFAULT gen_random_uuid() NOT NULL,
	"company_id" text NOT NULL,
	"location_id" text NOT NULL,
	"order_type" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"customer_id" text,
	"party_id" text,
	"total_amount" numeric(12,2) DEFAULT '0' NOT NULL,
	"created_by" text NOT NULL,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "order_pkey" PRIMARY KEY ("id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "order_item" (
	"id" text DEFAULT gen_random_uuid() NOT NULL,
	"company_id" text NOT NULL,
	"location_id" text NOT NULL,
	"order_id" text NOT NULL,
	"product_id" text,
	"product_name" text NOT NULL,
	"unit_price" numeric(12,2) NOT NULL,
	"quantity" numeric(10,3) DEFAULT '1' NOT NULL,
	"tax_snapshot" text NOT NULL,
	"bom_snapshot" text NOT NULL,
	"discount_applied" numeric(12,2) DEFAULT '0' NOT NULL,
	"line_total" numeric(12,2) GENERATED ALWAYS AS (round_half_up(unit_price * quantity - discount_applied)) STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_item_pkey" PRIMARY KEY ("id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "order_dine_in" (
	"order_id" text NOT NULL,
	"table_id" text NOT NULL,
	"cover_count" integer DEFAULT 1 NOT NULL,
	"waiter_id" text,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_dine_in_pkey" PRIMARY KEY ("order_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "order_takeout" (
	"order_id" text NOT NULL,
	"pickup_at" timestamp with time zone,
	"pickup_name" text,
	"pickup_phone" text,
	CONSTRAINT "order_takeout_pkey" PRIMARY KEY ("order_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "order_company_id_idx" ON "order" USING btree ("company_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "order_location_id_idx" ON "order" USING btree ("location_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "order_status_idx" ON "order" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "order_created_by_idx" ON "order" USING btree ("created_by");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "order_company_idempotency_key_idx" ON "order" USING btree ("company_id", "idempotency_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "order_item_company_id_idx" ON "order_item" USING btree ("company_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "order_item_location_id_idx" ON "order_item" USING btree ("location_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "order_item_order_id_idx" ON "order_item" USING btree ("order_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "order_item_product_id_idx" ON "order_item" USING btree ("product_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "order_dine_in_table_id_idx" ON "order_dine_in" USING btree ("table_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "order_dine_in_waiter_id_idx" ON "order_dine_in" USING btree ("waiter_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "order_takeout_pickup_at_idx" ON "order_takeout" USING btree ("pickup_at");
--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_location_id_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."location"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_customer_id_party_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."party"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_party_id_party_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."party"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_location_id_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."location"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "order_dine_in" ADD CONSTRAINT "order_dine_in_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "order_dine_in" ADD CONSTRAINT "order_dine_in_table_id_restaurant_table_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."restaurant_table"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "order_takeout" ADD CONSTRAINT "order_takeout_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE cascade ON UPDATE no action;

-- RLS for order
ALTER TABLE "order" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "order_select_policy" ON "order";
CREATE POLICY "order_select_policy" ON "order" FOR SELECT
  USING (company_id = get_tenant_id());
DROP POLICY IF EXISTS "order_insert_policy" ON "order";
CREATE POLICY "order_insert_policy" ON "order" FOR INSERT
  WITH CHECK (company_id = get_tenant_id());
DROP POLICY IF EXISTS "order_update_policy" ON "order";
CREATE POLICY "order_update_policy" ON "order" FOR UPDATE
  USING (company_id = get_tenant_id());
DROP POLICY IF EXISTS "order_delete_policy" ON "order";
CREATE POLICY "order_delete_policy" ON "order" FOR DELETE
  USING (company_id = get_tenant_id());

-- RLS for order_item
ALTER TABLE "order_item" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "order_item_select_policy" ON "order_item";
CREATE POLICY "order_item_select_policy" ON "order_item" FOR SELECT
  USING (company_id = get_tenant_id());
DROP POLICY IF EXISTS "order_item_insert_policy" ON "order_item";
CREATE POLICY "order_item_insert_policy" ON "order_item" FOR INSERT
  WITH CHECK (company_id = get_tenant_id());
DROP POLICY IF EXISTS "order_item_update_policy" ON "order_item";
CREATE POLICY "order_item_update_policy" ON "order_item" FOR UPDATE
  USING (company_id = get_tenant_id());
DROP POLICY IF EXISTS "order_item_delete_policy" ON "order_item";
CREATE POLICY "order_item_delete_policy" ON "order_item" FOR DELETE
  USING (company_id = get_tenant_id());

-- RLS for order_dine_in
ALTER TABLE "order_dine_in" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "order_dine_in_select_policy" ON "order_dine_in";
CREATE POLICY "order_dine_in_select_policy" ON "order_dine_in" FOR SELECT
  USING (EXISTS (SELECT 1 FROM "order" o WHERE o.id = order_dine_in.order_id AND o.company_id = get_tenant_id()));
DROP POLICY IF EXISTS "order_dine_in_insert_policy" ON "order_dine_in";
CREATE POLICY "order_dine_in_insert_policy" ON "order_dine_in" FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM "order" o WHERE o.id = order_dine_in.order_id AND o.company_id = get_tenant_id()));
DROP POLICY IF EXISTS "order_dine_in_update_policy" ON "order_dine_in";
CREATE POLICY "order_dine_in_update_policy" ON "order_dine_in" FOR UPDATE
  USING (EXISTS (SELECT 1 FROM "order" o WHERE o.id = order_dine_in.order_id AND o.company_id = get_tenant_id()));
DROP POLICY IF EXISTS "order_dine_in_delete_policy" ON "order_dine_in";
CREATE POLICY "order_dine_in_delete_policy" ON "order_dine_in" FOR DELETE
  USING (EXISTS (SELECT 1 FROM "order" o WHERE o.id = order_dine_in.order_id AND o.company_id = get_tenant_id()));

-- RLS for order_takeout
ALTER TABLE "order_takeout" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "order_takeout_select_policy" ON "order_takeout";
CREATE POLICY "order_takeout_select_policy" ON "order_takeout" FOR SELECT
  USING (EXISTS (SELECT 1 FROM "order" o WHERE o.id = order_takeout.order_id AND o.company_id = get_tenant_id()));
DROP POLICY IF EXISTS "order_takeout_insert_policy" ON "order_takeout";
CREATE POLICY "order_takeout_insert_policy" ON "order_takeout" FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM "order" o WHERE o.id = order_takeout.order_id AND o.company_id = get_tenant_id()));
DROP POLICY IF EXISTS "order_takeout_update_policy" ON "order_takeout";
CREATE POLICY "order_takeout_update_policy" ON "order_takeout" FOR UPDATE
  USING (EXISTS (SELECT 1 FROM "order" o WHERE o.id = order_takeout.order_id AND o.company_id = get_tenant_id()));
DROP POLICY IF EXISTS "order_takeout_delete_policy" ON "order_takeout";
CREATE POLICY "order_takeout_delete_policy" ON "order_takeout" FOR DELETE
  USING (EXISTS (SELECT 1 FROM "order" o WHERE o.id = order_takeout.order_id AND o.company_id = get_tenant_id()));