CREATE TABLE "account" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"id_token" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_event" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"email" text NOT NULL,
	"event_type" text NOT NULL,
	"ip_address" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"remember_me" boolean DEFAULT false NOT NULL,
	"active_company_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"consent_terms_version" text,
	"consent_terms_accepted_at" timestamp with time zone,
	"consent_withdrawn_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"cnpj" text,
	"razao_social" text,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_member" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"default_location_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invite" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" text NOT NULL,
	"email" text NOT NULL,
	"invited_by" text NOT NULL,
	"token_hash" text,
	"accepted_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_security_state" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"reset_at" timestamp with time zone,
	"window" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" text NOT NULL,
	"location_id" text NOT NULL,
	"order_type" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"customer_id" text,
	"party_id" text,
	"total_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"created_by" text NOT NULL,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "order_item" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" text NOT NULL,
	"location_id" text NOT NULL,
	"order_id" text NOT NULL,
	"product_id" text,
	"product_name" text NOT NULL,
	"unit_price" numeric(12, 2) NOT NULL,
	"quantity" numeric(10, 3) DEFAULT '1' NOT NULL,
	"tax_snapshot" text NOT NULL,
	"bom_snapshot" text NOT NULL,
	"discount_applied" numeric(12, 2) DEFAULT '0' NOT NULL,
	"line_total" numeric(12, 2) GENERATED ALWAYS AS (round_half_up(unit_price * quantity - discount_applied)) STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_dine_in" (
	"order_id" text PRIMARY KEY NOT NULL,
	"table_id" text NOT NULL,
	"cover_count" integer DEFAULT 1 NOT NULL,
	"waiter_id" text,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_takeout" (
	"order_id" text PRIMARY KEY NOT NULL,
	"pickup_at" timestamp with time zone,
	"pickup_name" text,
	"pickup_phone" text
);
--> statement-breakpoint
CREATE TABLE "printer" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
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
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "print_job" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" text NOT NULL,
	"location_id" text NOT NULL,
	"printer_id" text NOT NULL,
	"order_id" text NOT NULL,
	"template" text NOT NULL,
	"payload" text NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"last_error" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "restaurant_table" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" text NOT NULL,
	"location_id" text NOT NULL,
	"number" integer NOT NULL,
	"name" text,
	"capacity" integer DEFAULT 4 NOT NULL,
	"status" text DEFAULT 'available' NOT NULL,
	"current_order_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kitchen_ticket" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" text NOT NULL,
	"location_id" text NOT NULL,
	"order_id" text NOT NULL,
	"order_item_id" text NOT NULL,
	"station_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kitchen_station" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" text NOT NULL,
	"location_id" text NOT NULL,
	"name" text NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cashier_shift" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" text NOT NULL,
	"location_id" text NOT NULL,
	"user_id" text NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"opening_float" numeric(12, 2) DEFAULT '0' NOT NULL,
	"closing_float" numeric(12, 2),
	"expected_amount" numeric(12, 2),
	"actual_amount" numeric(12, 2),
	"difference" numeric(12, 2),
	"status" text DEFAULT 'open' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "location" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" text NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "party" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" text NOT NULL,
	"location_id" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"document" text,
	"email" text,
	"phone" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" text NOT NULL,
	"location_id" text NOT NULL,
	"name" text NOT NULL,
	"sku" text,
	"unit_price" numeric(12, 2) DEFAULT '0' NOT NULL,
	"tax_rule_id" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_member" ADD CONSTRAINT "company_member_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_member" ADD CONSTRAINT "company_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_member" ADD CONSTRAINT "company_member_default_location_id_location_id_fk" FOREIGN KEY ("default_location_id") REFERENCES "public"."location"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite" ADD CONSTRAINT "invite_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite" ADD CONSTRAINT "invite_invited_by_user_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_location_id_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."location"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_customer_id_party_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."party"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_party_id_party_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."party"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_location_id_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."location"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_dine_in" ADD CONSTRAINT "order_dine_in_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_dine_in" ADD CONSTRAINT "order_dine_in_table_id_restaurant_table_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."restaurant_table"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_takeout" ADD CONSTRAINT "order_takeout_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "printer" ADD CONSTRAINT "printer_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "printer" ADD CONSTRAINT "printer_location_id_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."location"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_job" ADD CONSTRAINT "print_job_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_job" ADD CONSTRAINT "print_job_location_id_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."location"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_job" ADD CONSTRAINT "print_job_printer_id_printer_id_fk" FOREIGN KEY ("printer_id") REFERENCES "public"."printer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_job" ADD CONSTRAINT "print_job_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restaurant_table" ADD CONSTRAINT "restaurant_table_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restaurant_table" ADD CONSTRAINT "restaurant_table_location_id_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."location"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kitchen_ticket" ADD CONSTRAINT "kitchen_ticket_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kitchen_ticket" ADD CONSTRAINT "kitchen_ticket_location_id_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."location"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kitchen_ticket" ADD CONSTRAINT "kitchen_ticket_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kitchen_ticket" ADD CONSTRAINT "kitchen_ticket_order_item_id_order_item_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kitchen_ticket" ADD CONSTRAINT "kitchen_ticket_station_id_kitchen_station_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."kitchen_station"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kitchen_station" ADD CONSTRAINT "kitchen_station_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kitchen_station" ADD CONSTRAINT "kitchen_station_location_id_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."location"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cashier_shift" ADD CONSTRAINT "cashier_shift_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cashier_shift" ADD CONSTRAINT "cashier_shift_location_id_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."location"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cashier_shift" ADD CONSTRAINT "cashier_shift_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location" ADD CONSTRAINT "location_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "party" ADD CONSTRAINT "party_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "party" ADD CONSTRAINT "party_location_id_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."location"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product" ADD CONSTRAINT "product_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product" ADD CONSTRAINT "product_location_id_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."location"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_event_user_id_idx" ON "auth_event" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_event_email_idx" ON "auth_event" USING btree ("email");--> statement-breakpoint
CREATE INDEX "auth_event_event_type_idx" ON "auth_event" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "auth_event_created_at_idx" ON "auth_event" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "session_token_idx" ON "session" USING btree ("token");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_expires_at_idx" ON "session" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "user_email_idx" ON "user" USING btree ("email");--> statement-breakpoint
CREATE INDEX "user_is_active_idx" ON "user" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "company_cnpj_idx" ON "company" USING btree ("cnpj");--> statement-breakpoint
CREATE INDEX "company_is_deleted_idx" ON "company" USING btree ("is_deleted");--> statement-breakpoint
CREATE INDEX "company_name_idx" ON "company" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "company_member_company_user_idx" ON "company_member" USING btree ("company_id","user_id");--> statement-breakpoint
CREATE INDEX "company_member_user_id_idx" ON "company_member" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "company_member_company_id_idx" ON "company_member" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "company_member_default_location_id_idx" ON "company_member" USING btree ("default_location_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invite_company_email_idx" ON "invite" USING btree ("company_id","email");--> statement-breakpoint
CREATE INDEX "invite_pending_email_idx" ON "invite" USING btree ("email") WHERE "invite"."accepted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "invite_pending_token_hash_idx" ON "invite" USING btree ("token_hash") WHERE "invite"."accepted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "auth_security_state_reset_at_idx" ON "auth_security_state" USING btree ("reset_at");--> statement-breakpoint
CREATE INDEX "order_company_id_idx" ON "order" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "order_location_id_idx" ON "order" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "order_status_idx" ON "order" USING btree ("status");--> statement-breakpoint
CREATE INDEX "order_created_by_idx" ON "order" USING btree ("created_by");--> statement-breakpoint
CREATE UNIQUE INDEX "order_company_idempotency_key_idx" ON "order" USING btree ("company_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "order_item_company_id_idx" ON "order_item" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "order_item_location_id_idx" ON "order_item" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "order_item_order_id_idx" ON "order_item" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_item_product_id_idx" ON "order_item" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "order_dine_in_table_id_idx" ON "order_dine_in" USING btree ("table_id");--> statement-breakpoint
CREATE INDEX "order_dine_in_waiter_id_idx" ON "order_dine_in" USING btree ("waiter_id");--> statement-breakpoint
CREATE INDEX "order_takeout_pickup_at_idx" ON "order_takeout" USING btree ("pickup_at");--> statement-breakpoint
CREATE INDEX "printer_company_id_idx" ON "printer" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "printer_location_id_idx" ON "printer" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "printer_type_idx" ON "printer" USING btree ("type");--> statement-breakpoint
CREATE INDEX "printer_status_idx" ON "printer" USING btree ("status");--> statement-breakpoint
CREATE INDEX "print_job_company_id_idx" ON "print_job" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "print_job_location_id_idx" ON "print_job" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "print_job_printer_id_idx" ON "print_job" USING btree ("printer_id");--> statement-breakpoint
CREATE INDEX "print_job_order_id_idx" ON "print_job" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "print_job_status_idx" ON "print_job" USING btree ("status");--> statement-breakpoint
CREATE INDEX "print_job_priority_created_idx" ON "print_job" USING btree ("priority","created_at");--> statement-breakpoint
CREATE INDEX "restaurant_table_company_id_idx" ON "restaurant_table" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "restaurant_table_location_id_idx" ON "restaurant_table" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "restaurant_table_status_idx" ON "restaurant_table" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "restaurant_table_company_number_idx" ON "restaurant_table" USING btree ("company_id","number");--> statement-breakpoint
CREATE INDEX "kitchen_ticket_company_id_idx" ON "kitchen_ticket" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "kitchen_ticket_location_id_idx" ON "kitchen_ticket" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "kitchen_ticket_order_id_idx" ON "kitchen_ticket" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "kitchen_ticket_station_id_idx" ON "kitchen_ticket" USING btree ("station_id");--> statement-breakpoint
CREATE INDEX "kitchen_ticket_status_idx" ON "kitchen_ticket" USING btree ("status");--> statement-breakpoint
CREATE INDEX "kitchen_station_company_id_idx" ON "kitchen_station" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "kitchen_station_location_id_idx" ON "kitchen_station" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "kitchen_station_is_active_idx" ON "kitchen_station" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "cashier_shift_company_id_idx" ON "cashier_shift" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "cashier_shift_location_id_idx" ON "cashier_shift" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "cashier_shift_user_id_idx" ON "cashier_shift" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "cashier_shift_status_idx" ON "cashier_shift" USING btree ("status");--> statement-breakpoint
CREATE INDEX "cashier_shift_opened_at_idx" ON "cashier_shift" USING btree ("opened_at");--> statement-breakpoint
CREATE INDEX "location_company_id_idx" ON "location" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "location_is_active_idx" ON "location" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "party_company_id_idx" ON "party" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "party_location_id_idx" ON "party" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "party_type_idx" ON "party" USING btree ("type");--> statement-breakpoint
CREATE UNIQUE INDEX "party_company_document_idx" ON "party" USING btree ("company_id","document");--> statement-breakpoint
CREATE INDEX "party_is_active_idx" ON "party" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "product_company_id_idx" ON "product" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "product_location_id_idx" ON "product" USING btree ("location_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_company_sku_idx" ON "product" USING btree ("company_id","sku");--> statement-breakpoint
CREATE INDEX "product_is_active_idx" ON "product" USING btree ("is_active");