-- Creates the v_beneficiary view used by elephantcharge-system's BeneficiaryController.
-- Re-run after restoring schema.sql onto a fresh database, since this view is appended
-- to schema.sql manually and may drift — same convention as fix_award_permissions.sql.

CREATE OR REPLACE VIEW public.v_beneficiary AS
 SELECT b.id AS beneficiary_id,
    b.name,
    b.short_name,
    b.geography,
    b.geography_description,
    b.description,
    b.logo_file_name,
    b.website,
    b.facebook,
    b.email_admin,
    b.email_public,
    b.grant_description_default,
    ( SELECT count(*) AS count FROM public."grant" g WHERE g.beneficiary_id = b.id) AS grant_count,
    ( SELECT COALESCE(sum(g.grant_kwacha), 0) AS sum FROM public."grant" g WHERE g.beneficiary_id = b.id) AS total_kwacha
   FROM public.beneficiaries b;

ALTER TABLE public.v_beneficiary OWNER TO elephant_charge;
