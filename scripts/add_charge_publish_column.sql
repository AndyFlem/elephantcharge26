-- Adds a "publish" flag to charge, controlling whether elephantcharge-results
-- (scripts/extract.js) includes that charge in the public results site build.
-- Existing charges are backfilled to true (already public); new charges default
-- to false until an organizer explicitly publishes them via ChargeForm.vue.
-- Also updates v_charge to expose the new column (definition otherwise
-- unchanged from the live view, captured via pg_get_viewdef).
-- Re-run after restoring schema.sql onto a fresh database, since this column/view
-- change is appended to schema.sql manually and may drift — same convention as
-- fix_award_permissions.sql / create_v_beneficiary_view.sql.

ALTER TABLE public.charge ADD COLUMN IF NOT EXISTS publish boolean NOT NULL DEFAULT false;

UPDATE public.charge SET publish = true;

CREATE OR REPLACE VIEW public.v_charge AS
 WITH new_teams_count AS (
         SELECT e.charge_id,
            count(e.entry_id) AS new_teams_count
           FROM public.entry e
             JOIN public.entry_category ec ON e.entry_id = ec.entry_id
             JOIN public.category c_1 ON ec.category_id = c_1.category_id
          WHERE c_1.category_ref::text = 'NEW'::text
          GROUP BY e.charge_id
        ), entry_count AS (
         SELECT e.charge_id,
            count(e.entry_id) AS entry_count
           FROM public.entry e
          GROUP BY e.charge_id
        )
 SELECT c.charge_id,
    c.charge_name,
    c.location,
    c.map_scale,
    public.st_asgeojson(c.map_center) AS map_center,
    c.start_time,
    c.end_time,
    c.charge_date,
    c.charge_ref,
    c.gauntlet_multiplier,
    c.exchange_rate,
    c.m_per_local,
    c.map_file_name,
    c.spirit_entry_id,
    c.spirit_name,
    c.spirit_description,
    c.best_guard_id,
    c.shafted_entry_id,
    c.tsetse1_leg_id,
    c.tsetse2_leg_id,
    c.shafted_description,
    NOT c.charge_date > CURRENT_DATE AS charge_complete,
    ( SELECT count(*) AS count
           FROM public.checkpoint ck
          WHERE ck.charge_id = c.charge_id) AS checkpoint_count,
    etc.entry_count,
    ( SELECT count(e.entry_id) AS count
           FROM public.entry e
          WHERE e.charge_id = c.charge_id AND e.result_status::text = 'COMPLETE'::text) AS entry_completed_count,
    (( SELECT count(e.entry_id) AS count
           FROM public.entry e
          WHERE e.charge_id = c.charge_id AND e.result_status::text = 'COMPLETE'::text))::double precision / etc.entry_count::double precision AS entry_completed_pct,
    ( SELECT sum(e.raised_local) AS sum
           FROM public.entry e
          WHERE e.charge_id = c.charge_id) AS raised_local,
    ( SELECT sum(e.raised_local)::double precision / c.exchange_rate
           FROM public.entry e
          WHERE e.charge_id = c.charge_id) AS raised_dollars,
    ( SELECT sum(e.raised_local)::double precision / c.exchange_rate / etc.entry_count::double precision
           FROM public.entry e
          WHERE e.charge_id = c.charge_id) AS dollars_per_entry,
    COALESCE(ntc.new_teams_count, 0::bigint) AS new_teams_count,
    c.kml,
    c.publish
   FROM public.charge c
     LEFT JOIN new_teams_count ntc ON c.charge_id = ntc.charge_id
     LEFT JOIN entry_count etc ON c.charge_id = etc.charge_id;

ALTER TABLE public.v_charge OWNER TO elephant_charge;
