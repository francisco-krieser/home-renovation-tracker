-- AlterTable: make address non-nullable (set placeholder for any existing NULLs first)
UPDATE "jobs" SET "address" = '' WHERE "address" IS NULL;
ALTER TABLE "jobs" ALTER COLUMN "address" SET NOT NULL;
