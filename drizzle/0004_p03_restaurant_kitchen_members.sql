-- P0.3: Restaurant table CRUD + kitchen station CRUD + member roles expansion
-- 
-- 1. Change restaurant_table unique constraint from (company_id, number) to (company_id, location_id, number)
-- 2. Add FK current_order_id -> order.id (will be NULL until P0.5)
-- 3. Update company_member.role to accept: owner, manager, waiter, cashier, kitchen

-- Drop old unique constraint
ALTER TABLE restaurant_table DROP CONSTRAINT IF EXISTS restaurant_table_company_number_idx;

-- Add new unique constraint (company_id, location_id, number)
ALTER TABLE restaurant_table 
ADD CONSTRAINT restaurant_table_company_location_number_idx 
UNIQUE (company_id, location_id, number);

-- Add FK for current_order_id if not exists
ALTER TABLE restaurant_table 
ADD CONSTRAINT restaurant_table_current_order_id_fkey 
FOREIGN KEY (current_order_id) REFERENCES "order"(id) ON DELETE SET NULL;

-- Update company_member role to accept expanded set
ALTER TABLE company_member 
DROP CONSTRAINT IF EXISTS company_member_role_check;

ALTER TABLE company_member 
ADD CONSTRAINT company_member_role_check 
CHECK (role IN ('owner', 'manager', 'waiter', 'cashier', 'kitchen'));
