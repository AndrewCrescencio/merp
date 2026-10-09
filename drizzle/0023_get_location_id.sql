-- Create get_location_id function for location-scoped RLS
-- Returns the location_id GUC set by withTenant, or NULL if not set
CREATE OR REPLACE FUNCTION get_location_id() RETURNS text AS $$
  SELECT NULLIF(current_setting('app.location_id', true), '');
$$ LANGUAGE SQL STABLE;