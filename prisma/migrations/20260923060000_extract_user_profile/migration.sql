-- AlterEnum
ALTER TYPE "gender" ADD VALUE 'PREFER_NOT_TO_SAY';

-- CreateTable
CREATE TABLE "user_profiles" (
    "user_id" TEXT NOT NULL,
    "date_of_birth" DATE,
    "gender" "gender",
    "bio" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("user_id")
);

-- AddForeignKey
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: move existing personal details out of `users`, skipping rows that carry none.
INSERT INTO "user_profiles" ("user_id", "date_of_birth", "gender", "updated_at")
SELECT "id", "date_of_birth", "gender", CURRENT_TIMESTAMP
FROM "users"
WHERE "date_of_birth" IS NOT NULL OR "gender" IS NOT NULL;

-- AlterTable
ALTER TABLE "users" DROP COLUMN "date_of_birth",
DROP COLUMN "gender";
