-- Create round_half_up function for half-up rounding (banker's rounding alternative)
-- Must exist BEFORE 0014_add_order_tables.sql which uses it in generated column
CREATE OR REPLACE FUNCTION round_half_up(v numeric) RETURNS numeric(12,2) LANGUAGE sql IMMUTABLE AS $$
  SELECT floor(v * 100 + 0.5) / 100.0;
$$;