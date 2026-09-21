-- Fixes existing entry_distance data left over from a bug in doUpdateDistances
-- (elephantcharge-system/backend/src/controllers/EntryController.js): entries were
-- credited with GAUNTLET/GAUNTLET_PENALTIES/GAUNTLET_COMPETITION distance even when
-- they hadn't visited every checkpoint making up the charge's gauntlet (usually 3
-- checkpoints, driven as 2 legs), so a team that only drove part of the gauntlet
-- could still win gauntlet-based awards (e.g. the Bowden Trophy, GAUNTLET_COMPETITION).
-- The application code has been fixed to gate on visiting every gauntlet checkpoint
-- going forward; this script backfills entry_distance rows already computed under
-- the old (buggy) logic.
--
-- Completion is judged by distinct gauntlet checkpoints visited, not by counting
-- rows in the `leg` table: `leg` pre-generates a row for every combination of
-- gauntlet checkpoints (e.g. 3 rows for 3 checkpoints, to allow either travel
-- direction/order), not just the legs actually driven through the gauntlet.
--
-- Scope: only the GAUNTLET-derived rows are touched. TOTAL, NON_GAUNTLET,
-- TSETSE_1, TSETSE_2 and PENALTIES are left exactly as they are. GAUNTLET,
-- GAUNTLET_PENALTIES and GAUNTLET_COMPETITION are removed for affected entries,
-- and TOTAL_COMPETITION/NET (where present) are recalculated since they're
-- derived from GAUNTLET_COMPETITION. Award results (v_distanceawardresults,
-- v_pledgeawardresults, v_award) read entry_distance live, so no separate award
-- recalculation is needed -- fixing entry_distance fixes the awards too.
--
-- Safe to re-run: it only acts on entries that both (a) haven't visited every
-- gauntlet checkpoint for their charge and (b) still have a GAUNTLET/
-- GAUNTLET_PENALTIES/GAUNTLET_COMPETITION row, so it's a no-op once applied.
--
-- Run as the elephant_charge (or postgres) user:
--   psql -U elephant_charge -d charge23 -f scripts/fix_gauntlet_distance_calc.sql

BEGIN;

-- Entries that were credited with gauntlet distance without visiting every
-- gauntlet checkpoint for their charge.
CREATE TEMP TABLE _gauntlet_incomplete_entries AS
WITH gauntlet_checkpoint_totals AS (
  SELECT charge_id, COUNT(*) AS total_gauntlet_checkpoints
  FROM checkpoint
  WHERE is_gauntlet
  GROUP BY charge_id
),
entry_gauntlet_checkpoints_touched AS (
  SELECT el.entry_id, COUNT(DISTINCT chk_pt) AS touched_gauntlet_checkpoints
  FROM entry_leg el
  JOIN leg l ON l.leg_id = el.leg_id
  CROSS JOIN LATERAL (VALUES (l.checkpoint1_id), (l.checkpoint2_id)) AS t(chk_pt)
  WHERE l.is_gauntlet
  GROUP BY el.entry_id
)
SELECT DISTINCT e.entry_id, e.charge_id
FROM entry e
JOIN gauntlet_checkpoint_totals gct ON gct.charge_id = e.charge_id
LEFT JOIN entry_gauntlet_checkpoints_touched egc ON egc.entry_id = e.entry_id
JOIN entry_distance ed ON ed.entry_id = e.entry_id
  AND ed.distance_ref IN ('GAUNTLET', 'GAUNTLET_PENALTIES', 'GAUNTLET_COMPETITION')
WHERE COALESCE(egc.touched_gauntlet_checkpoints, 0) < gct.total_gauntlet_checkpoints;

DO $$
BEGIN
  RAISE NOTICE 'Entries with incorrectly-credited gauntlet distance: %', (SELECT COUNT(*) FROM _gauntlet_incomplete_entries);
END $$;

-- What TOTAL_COMPETITION/NET should become once GAUNTLET_COMPETITION drops to 0
-- for these entries (TOTAL_COMPETITION = NON_GAUNTLET + PENALTIES).
CREATE TEMP TABLE _gauntlet_recalc AS
SELECT
  g.entry_id,
  COALESCE(ng.distance_m, 0) + COALESCE(pen.distance_m, 0) AS new_total_competition,
  c.m_per_local,
  e.raised_local,
  e.result_status
FROM _gauntlet_incomplete_entries g
JOIN entry e ON e.entry_id = g.entry_id
JOIN charge c ON c.charge_id = g.charge_id
LEFT JOIN entry_distance ng ON ng.entry_id = g.entry_id AND ng.distance_ref = 'NON_GAUNTLET'
LEFT JOIN entry_distance pen ON pen.entry_id = g.entry_id AND pen.distance_ref = 'PENALTIES';

-- Remove the incorrectly-awarded gauntlet rows.
DELETE FROM entry_distance
WHERE entry_id IN (SELECT entry_id FROM _gauntlet_incomplete_entries)
  AND distance_ref IN ('GAUNTLET', 'GAUNTLET_PENALTIES', 'GAUNTLET_COMPETITION');

-- TOTAL_COMPETITION no longer includes GAUNTLET_COMPETITION.
UPDATE entry_distance ed
SET distance_m = r.new_total_competition
FROM _gauntlet_recalc r
WHERE ed.entry_id = r.entry_id
  AND ed.distance_ref = 'TOTAL_COMPETITION'
  AND r.new_total_competition > 0;

DELETE FROM entry_distance ed
USING _gauntlet_recalc r
WHERE ed.entry_id = r.entry_id
  AND ed.distance_ref = 'TOTAL_COMPETITION'
  AND r.new_total_competition <= 0;

-- NET only exists for COMPLETE entries, and depends on TOTAL_COMPETITION.
UPDATE entry_distance ed
SET distance_m = FLOOR(r.new_total_competition - r.m_per_local * r.raised_local)
FROM _gauntlet_recalc r
WHERE ed.entry_id = r.entry_id
  AND ed.distance_ref = 'NET'
  AND r.result_status = 'COMPLETE';

DROP TABLE _gauntlet_incomplete_entries;
DROP TABLE _gauntlet_recalc;

COMMIT;
