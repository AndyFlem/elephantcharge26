-- Fixes the "permissions quirk" documented in CLAUDE.md / db_reference.md:
--
--   v_award, v_distanceawardresults, and v_pledgeawardresults fail when
--   queried as the `postgres` user, because those views are owned by
--   `elephant_charge` but join the `award` table, which is owned by
--   `postgres`. Postgres checks a view's underlying-table privileges
--   against the VIEW OWNER, not the querying user -- and `elephant_charge`
--   was never granted SELECT on `award`.
--
-- Run once, as a superuser (e.g. `postgres`):
--   psql -U postgres -d charge23 -f scripts/fix_award_permissions.sql

GRANT SELECT ON public.award TO elephant_charge;
