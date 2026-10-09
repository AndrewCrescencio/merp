-- Recreate line_total generated column using round_half_up (created in 0013)
-- Safe to run multiple times
ALTER TABLE order_item DROP COLUMN IF EXISTS line_total;
ALTER TABLE order_item ADD COLUMN line_total numeric(12,2) GENERATED ALWAYS AS (round_half_up(unit_price * quantity - discount_applied)) STORED;