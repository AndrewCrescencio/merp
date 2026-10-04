-- Create round_half_up function for half-up rounding (banker's rounding alternative)
-- Rounds to 2 decimal places: 10.005 -> 10.01, 10.004 -> 10.00
-- Must drop generated column first, then function, then recreate both
ALTER TABLE order_item DROP COLUMN IF EXISTS line_total;
DROP FUNCTION IF EXISTS round_half_up(numeric);
CREATE OR REPLACE FUNCTION round_half_up(v numeric) RETURNS numeric(12,2) LANGUAGE sql IMMUTABLE AS $$
  SELECT floor(v * 100 + 0.5) / 100.0;
$$;
ALTER TABLE order_item ADD COLUMN line_total numeric(12,2) GENERATED ALWAYS AS (round_half_up(unit_price * quantity - discount_applied)) STORED;