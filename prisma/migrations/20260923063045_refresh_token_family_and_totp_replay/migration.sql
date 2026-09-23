-- AlterTable: refresh tokens gain a rotation family.
-- Added in three steps because the table is not empty: every existing token is
-- its own family root, which is exactly right — nothing rotated from anything.
ALTER TABLE "refresh_tokens" ADD COLUMN "family_id" TEXT;
UPDATE "refresh_tokens" SET "family_id" = "id" WHERE "family_id" IS NULL;
ALTER TABLE "refresh_tokens" ALTER COLUMN "family_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "two_factor_last_used_step" INTEGER;

-- CreateIndex
CREATE INDEX "email_tokens_expires_at_idx" ON "email_tokens"("expires_at");

-- CreateIndex
CREATE INDEX "refresh_tokens_family_id_idx" ON "refresh_tokens"("family_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_expires_at_idx" ON "refresh_tokens"("expires_at");
