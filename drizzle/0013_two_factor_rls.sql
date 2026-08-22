ALTER TABLE "two_factor" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "two_factor" FORCE ROW LEVEL SECURITY;

CREATE POLICY "two_factor_select_policy" ON "two_factor" FOR SELECT
  USING ("user_id" = get_user_id());

CREATE POLICY "two_factor_insert_policy" ON "two_factor" FOR INSERT
  WITH CHECK ("user_id" = get_user_id());

CREATE POLICY "two_factor_update_policy" ON "two_factor" FOR UPDATE
  USING ("user_id" = get_user_id())
  WITH CHECK ("user_id" = get_user_id());

CREATE POLICY "two_factor_delete_policy" ON "two_factor" FOR DELETE
  USING ("user_id" = get_user_id());