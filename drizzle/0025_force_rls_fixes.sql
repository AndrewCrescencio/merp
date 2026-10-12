-- Fix 1: Add FORCE ROW LEVEL SECURITY to all tables that have RLS enabled but lack FORCE
-- Without FORCE, the table owner (migration role) can bypass RLS entirely.
-- This migration must run AFTER 0024_rls_location_scoped.sql which sets up the policies.
-- Tables that already have FORCE (from 0007, 0013): company, company_member, invite, two_factor
-- Re-applying FORCE is idempotent.

-- location
ALTER TABLE "location" FORCE ROW LEVEL SECURITY;
-- party
ALTER TABLE "party" FORCE ROW LEVEL SECURITY;
-- product
ALTER TABLE "product" FORCE ROW LEVEL SECURITY;
-- restaurant_table
ALTER TABLE "restaurant_table" FORCE ROW LEVEL SECURITY;
-- "order"
ALTER TABLE "order" FORCE ROW LEVEL SECURITY;
-- order_item
ALTER TABLE "order_item" FORCE ROW LEVEL SECURITY;
-- order_dine_in
ALTER TABLE "order_dine_in" FORCE ROW LEVEL SECURITY;
-- order_takeout
ALTER TABLE "order_takeout" FORCE ROW LEVEL SECURITY;
-- printer
ALTER TABLE "printer" FORCE ROW LEVEL SECURITY;
-- print_job
ALTER TABLE "print_job" FORCE ROW LEVEL SECURITY;
-- cashier_shift
ALTER TABLE "cashier_shift" FORCE ROW LEVEL SECURITY;
-- kitchen_station
ALTER TABLE "kitchen_station" FORCE ROW LEVEL SECURITY;
-- kitchen_ticket
ALTER TABLE "kitchen_ticket" FORCE ROW LEVEL SECURITY;

-- Fix 2: Restore the normative location-scoped policy pattern from ADR-002
-- The 0024 migration correctly implemented: company_id = get_tenant_id() AND (location_id = get_location_id() OR get_location_id() IS NULL)
-- This allows cross-location access within a company when location_id GUC is not set (fail-open for location context).
-- Fail-closed applies at the TENANT (company) level, not the location level.

-- Update location table policies (location uses id, not location_id)
DROP POLICY IF EXISTS "location_select_policy" ON "location";
CREATE POLICY "location_select_policy" ON "location" FOR SELECT
  USING (company_id = get_tenant_id() AND (id = get_location_id() OR get_location_id() IS NULL));
DROP POLICY IF EXISTS "location_insert_policy" ON "location";
CREATE POLICY "location_insert_policy" ON "location" FOR INSERT
  WITH CHECK (company_id = get_tenant_id() AND (id = get_location_id() OR get_location_id() IS NULL));
DROP POLICY IF EXISTS "location_update_policy" ON "location";
CREATE POLICY "location_update_policy" ON "location" FOR UPDATE
  USING (company_id = get_tenant_id() AND (id = get_location_id() OR get_location_id() IS NULL));
DROP POLICY IF EXISTS "location_delete_policy" ON "location";
CREATE POLICY "location_delete_policy" ON "location" FOR DELETE
  USING (company_id = get_tenant_id() AND (id = get_location_id() OR get_location_id() IS NULL));

-- Update party policies
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

-- Update product policies
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

-- Update restaurant_table policies
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

-- Update order policies
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

-- Update order_item policies
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

-- Update order_dine_in policies (via order)
DROP POLICY IF EXISTS "order_dine_in_select_policy" ON "order_dine_in";
CREATE POLICY "order_dine_in_select_policy" ON "order_dine_in" FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM "order" o
    WHERE o.id = order_dine_in.order_id
      AND o.company_id = get_tenant_id()
      AND (o.location_id = get_location_id() OR get_location_id() IS NULL)
  ));
DROP POLICY IF EXISTS "order_dine_in_insert_policy" ON "order_dine_in";
CREATE POLICY "order_dine_in_insert_policy" ON "order_dine_in" FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM "order" o
    WHERE o.id = order_dine_in.order_id
      AND o.company_id = get_tenant_id()
      AND (o.location_id = get_location_id() OR get_location_id() IS NULL)
  ));
DROP POLICY IF EXISTS "order_dine_in_update_policy" ON "order_dine_in";
CREATE POLICY "order_dine_in_update_policy" ON "order_dine_in" FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM "order" o
    WHERE o.id = order_dine_in.order_id
      AND o.company_id = get_tenant_id()
      AND (o.location_id = get_location_id() OR get_location_id() IS NULL)
  ));
DROP POLICY IF EXISTS "order_dine_in_delete_policy" ON "order_dine_in";
CREATE POLICY "order_dine_in_delete_policy" ON "order_dine_in" FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM "order" o
    WHERE o.id = order_dine_in.order_id
      AND o.company_id = get_tenant_id()
      AND (o.location_id = get_location_id() OR get_location_id() IS NULL)
  ));

-- Update order_takeout policies (via order)
DROP POLICY IF EXISTS "order_takeout_select_policy" ON "order_takeout";
CREATE POLICY "order_takeout_select_policy" ON "order_takeout" FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM "order" o
    WHERE o.id = order_takeout.order_id
      AND o.company_id = get_tenant_id()
      AND (o.location_id = get_location_id() OR get_location_id() IS NULL)
  ));
DROP POLICY IF EXISTS "order_takeout_insert_policy" ON "order_takeout";
CREATE POLICY "order_takeout_insert_policy" ON "order_takeout" FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM "order" o
    WHERE o.id = order_takeout.order_id
      AND o.company_id = get_tenant_id()
      AND (o.location_id = get_location_id() OR get_location_id() IS NULL)
  ));
DROP POLICY IF EXISTS "order_takeout_update_policy" ON "order_takeout";
CREATE POLICY "order_takeout_update_policy" ON "order_takeout" FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM "order" o
    WHERE o.id = order_takeout.order_id
      AND o.company_id = get_tenant_id()
      AND (o.location_id = get_location_id() OR get_location_id() IS NULL)
  ));
DROP POLICY IF EXISTS "order_takeout_delete_policy" ON "order_takeout";
CREATE POLICY "order_takeout_delete_policy" ON "order_takeout" FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM "order" o
    WHERE o.id = order_takeout.order_id
      AND o.company_id = get_tenant_id()
      AND (o.location_id = get_location_id() OR get_location_id() IS NULL)
  ));

-- Update printer policies
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

-- Update print_job policies
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

-- Update cashier_shift policies
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

-- Update kitchen_station policies
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

-- Update kitchen_ticket policies
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

-- Rollback for this migration:
-- ALTER TABLE "location" NO FORCE ROW LEVEL SECURITY;
-- ALTER TABLE "party" NO FORCE ROW LEVEL SECURITY;
-- ALTER TABLE "product" NO FORCE ROW LEVEL SECURITY;
-- ALTER TABLE "restaurant_table" NO FORCE ROW LEVEL SECURITY;
-- ALTER TABLE "order" NO FORCE ROW LEVEL SECURITY;
-- ALTER TABLE "order_item" NO FORCE ROW LEVEL SECURITY;
-- ALTER TABLE "order_dine_in" NO FORCE ROW LEVEL SECURITY;
-- ALTER TABLE "order_takeout" NO FORCE ROW LEVEL SECURITY;
-- ALTER TABLE "printer" NO FORCE ROW LEVEL SECURITY;
-- ALTER TABLE "print_job" NO FORCE ROW LEVEL SECURITY;
-- ALTER TABLE "cashier_shift" NO FORCE ROW LEVEL SECURITY;
-- ALTER TABLE "kitchen_station" NO FORCE ROW LEVEL SECURITY;
-- ALTER TABLE "kitchen_ticket" NO FORCE ROW LEVEL SECURITY;
-- 
-- -- Restore old policies from 0024 (with OR get_location_id() IS NULL)
-- -- (repeat for each table with the policy pattern from 0024)