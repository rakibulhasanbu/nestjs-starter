-- CreateIndex
-- One identity per provider per user: a second Google account sharing the same
-- email used to attach a duplicate row that no endpoint could remove.
CREATE UNIQUE INDEX "social_identities_user_id_provider_key" ON "social_identities"("user_id", "provider");
