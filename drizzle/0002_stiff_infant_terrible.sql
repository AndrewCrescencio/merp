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
CREATE INDEX "auth_event_user_id_idx" ON "auth_event" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_event_email_idx" ON "auth_event" USING btree ("email");--> statement-breakpoint
CREATE INDEX "auth_event_event_type_idx" ON "auth_event" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "auth_event_created_at_idx" ON "auth_event" USING btree ("created_at");