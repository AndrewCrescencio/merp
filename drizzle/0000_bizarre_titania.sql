CREATE TABLE "account" (
	"id" text DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"id_token" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"remember_me" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"consent_terms_version" text,
	"consent_terms_accepted_at" timestamp with time zone,
	"consent_withdrawn_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);
--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "session_expires_at_idx" ON "session" USING btree ("expires_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "session_token_idx" ON "session" USING btree ("token");
--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "user_email_idx" ON "user" USING btree ("email");
--> statement-breakpoint
CREATE INDEX "user_is_active_idx" ON "user" USING btree ("is_active");
--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
