-- GATE C: ALTER DEFAULT PRIVILEGES for merp_app
-- Ensures all FUTURE tables/sequences in public schema get grants automatically
-- without requiring manual GRANT per migration.

-- Tables: SELECT, INSERT, UPDATE, DELETE
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO merp_app;

-- Sequences: USAGE, SELECT (needed for serial/identity columns)
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO merp_app;

-- Note: EXECUTE on functions is NOT granted by default.
-- If a function needs to be callable by merp_app, add explicit GRANT in
-- the migration that creates the function, with ADR justification.