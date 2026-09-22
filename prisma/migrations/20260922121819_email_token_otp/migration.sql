-- Clean cutover to OTP-based email tokens: no in-flight tokens are worth preserving.
TRUNCATE TABLE "email_tokens";

-- DropIndex
DROP INDEX IF EXISTS "email_tokens_token_hash_key";
DROP INDEX IF EXISTS "email_tokens_user_id_type_idx";

-- AlterTable
ALTER TABLE "email_tokens" RENAME COLUMN "token_hash" TO "code_hash";
ALTER TABLE "email_tokens" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "email_tokens_user_id_type_key" ON "email_tokens"("user_id", "type");
