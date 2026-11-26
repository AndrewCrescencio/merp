CREATE SCHEMA product_insights;
--> statement-breakpoint
REVOKE ALL ON SCHEMA product_insights FROM PUBLIC, merp_app;
--> statement-breakpoint
CREATE TABLE product_insights.daily_event_counts (
  day date NOT NULL,
  event_name text NOT NULL CHECK (
    event_name IN ('signup_completed', 'company_created', 'location_created', 'invite_accepted')
  ),
  acquisition_channel text NOT NULL CHECK (
    acquisition_channel = 'not_reported'
    OR (
      event_name = 'signup_completed'
      AND acquisition_channel IN ('search', 'social', 'referral', 'advertising', 'event', 'other')
    )
  ),
  event_count bigint NOT NULL CHECK (event_count > 0),
  PRIMARY KEY (day, event_name, acquisition_channel)
);
--> statement-breakpoint
REVOKE ALL ON TABLE product_insights.daily_event_counts FROM PUBLIC, merp_app;
--> statement-breakpoint
-- The application may increment fixed counters. Only the operator may read the aggregates.
CREATE FUNCTION public.record_product_milestone(p_event text, p_acquisition_channel text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
SET lock_timeout = '200ms'
AS $$
  INSERT INTO product_insights.daily_event_counts AS counts
    (day, event_name, acquisition_channel, event_count)
  VALUES (
    (statement_timestamp() AT TIME ZONE 'UTC')::date,
    p_event,
    COALESCE(p_acquisition_channel, 'not_reported'),
    1
  )
  ON CONFLICT (day, event_name, acquisition_channel)
  DO UPDATE SET event_count = counts.event_count + 1;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.record_product_milestone(text, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.record_product_milestone(text, text) TO merp_app;
