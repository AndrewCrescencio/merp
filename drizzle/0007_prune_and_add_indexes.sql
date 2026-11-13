DROP INDEX "auth_event_user_id_idx";--> statement-breakpoint
DROP INDEX "auth_event_email_idx";--> statement-breakpoint
DROP INDEX "auth_event_event_type_idx";--> statement-breakpoint
DROP INDEX "user_is_active_idx";--> statement-breakpoint
DROP INDEX "company_is_deleted_idx";--> statement-breakpoint
DROP INDEX "company_name_idx";--> statement-breakpoint
DROP INDEX "company_member_company_id_idx";--> statement-breakpoint
DROP INDEX "location_is_active_idx";--> statement-breakpoint
CREATE INDEX "auth_event_user_id_created_at_idx" ON "auth_event" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "invite_invited_by_idx" ON "invite" USING btree ("invited_by");