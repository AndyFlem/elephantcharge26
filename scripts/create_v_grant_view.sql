-- Creates the v_grant view used by elephantcharge-system's GrantController, for
-- the new Grants table on ChargeDetails.vue.
-- grant_dollars converts grant_kwacha to USD using the exchange_rate of the
-- charge the grant belongs to (same convention as v_charge/v_entry's
-- raised_dollars = raised_local / exchange_rate).
-- Re-run after restoring schema.sql onto a fresh database, since this view is
-- appended to schema.sql manually and may drift — same convention as
-- fix_award_permissions.sql / create_v_beneficiary_view.sql.

CREATE OR REPLACE VIEW public.v_grant AS
 SELECT g.grant_id,
    g.charge_id,
    g.beneficiary_id,
    g.grant_kwacha,
    g.description,
    b.name AS beneficiary_name,
    b.short_name AS beneficiary_short_name,
    (g.grant_kwacha::double precision / c.exchange_rate) AS grant_dollars
   FROM (public."grant" g
     JOIN public.beneficiaries b ON b.id = g.beneficiary_id)
     JOIN public.charge c ON c.charge_id = g.charge_id;

ALTER TABLE public.v_grant OWNER TO elephant_charge;
