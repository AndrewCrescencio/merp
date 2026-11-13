DROP INDEX "company_cnpj_idx";--> statement-breakpoint
ALTER TABLE "company" DROP COLUMN "cnpj";--> statement-breakpoint
ALTER TABLE "company" DROP COLUMN "razao_social";