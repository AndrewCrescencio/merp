DROP INDEX "restaurant_table_company_number_idx";--> statement-breakpoint
ALTER TABLE "product" ADD COLUMN "kitchen_station_id" text;--> statement-breakpoint
ALTER TABLE "restaurant_table" ADD CONSTRAINT "restaurant_table_current_order_id_order_id_fk" FOREIGN KEY ("current_order_id") REFERENCES "public"."order"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product" ADD CONSTRAINT "product_kitchen_station_id_kitchen_station_id_fk" FOREIGN KEY ("kitchen_station_id") REFERENCES "public"."kitchen_station"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "restaurant_table_company_location_number_idx" ON "restaurant_table" USING btree ("company_id","location_id","number");--> statement-breakpoint
CREATE INDEX "product_kitchen_station_id_idx" ON "product" USING btree ("kitchen_station_id");