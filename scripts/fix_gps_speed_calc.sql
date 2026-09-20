-- Fixes a regression in the raw/clean GPS speed calculation, introduced sometime
-- between the 2024 and 2025 events: ec23_gpsrawsupdatecalcs and
-- ec23_gpscleansupdatecalcs both hardcode speed_kmh=0 for every point instead of
-- computing it (the real expression is left commented out beside it).
--
-- This silently breaks raw-track KML/geometry export: ec23_gpsrawscreateline only
-- includes points WHERE speed_kmh>0, so once every gps_raw row has speed_kmh=0,
-- entry_geometry.raw_line/raw_line_kml/raw_line_json never get (re)built. Clean
-- tracks aren't affected the same way since ec23_gpscleanscreateline doesn't filter
-- on speed, but ec23_gpscleansupdatecalcs has the identical bug for consistency.
--
-- Run once, as a superuser (e.g. `postgres`), against a database where the bug has
-- already produced entries with raws_count>0 but raw_line IS NULL:
--   psql -U postgres -d charge23 -f scripts/fix_gps_speed_calc.sql
--
-- Safe to re-run: the function bodies are idempotent (CREATE OR REPLACE), and the
-- backfill below only touches entries whose raw_line is still missing, so it's a
-- no-op once everything has been fixed.

CREATE OR REPLACE FUNCTION public.ec23_gpsrawsupdatecalcs(entryid integer) RETURNS void
    LANGUAGE sql
    AS $$

UPDATE gps_raw SET
	elapsed_s=calcs.elapsed_s,
	distance_m=calcs.dist_m,
	speed_kmh=calcs.speed_kmh,
	azimuth_deg=calcs.azimuth_deg
FROM
(
SELECT
	cur.gps_raw_id,
	CAST(EXTRACT(EPOCH FROM cur.gps_timestamp)-EXTRACT(EPOCH FROM prev.gps_timestamp) AS INTEGER) as elapsed_s,
	ST_Distance(prev.location,cur.location, false) as dist_m,
	ST_Distance(prev.location_prj,cur.location_prj)/(EXTRACT(EPOCH FROM cur.gps_timestamp)-EXTRACT(EPOCH FROM prev.gps_timestamp))/1000*60*60 as speed_kmh,
	DEGREES(ST_Azimuth(prev.location_prj,cur.location_prj)) as azimuth_deg
FROM
	gps_raw prev
	INNER JOIN gps_raw cur ON prev.entry_id=cur.entry_id AND prev.gps_raw_id=cur.gps_raw_id - 1
	INNER JOIN entry e on cur.entry_id=e.entry_id
WHERE
	cur.entry_id=entryid
) calcs
WHERE
	gps_raw.gps_raw_id=calcs.gps_raw_id;

UPDATE entry_geometry SET raws_count=c.cnt
FROM ( SELECT entry_id,COUNT(*) as cnt FROM gps_raw WHERE entry_id=entryid GROUP BY entry_id ) c
WHERE entry_geometry.entry_id=c.entry_id;

UPDATE entry_geometry SET raws_from=c.frm
FROM ( SELECT entry_id,MIN(gps_timestamp) as frm FROM gps_raw WHERE entry_id=entryid GROUP BY entry_id ) c
WHERE entry_geometry.entry_id=c.entry_id;

UPDATE entry_geometry SET raws_to=c.tot
FROM ( SELECT entry_id,MAX(gps_timestamp) as tot FROM gps_raw WHERE entry_id=entryid GROUP BY entry_id ) c
WHERE entry_geometry.entry_id=c.entry_id;

$$;


CREATE OR REPLACE FUNCTION public.ec23_gpscleansupdatecalcs(entryid integer) RETURNS void
    LANGUAGE sql
    AS $$

UPDATE gps_clean SET
	elapsed_s=calcs.elapsed_s,
	distance_m=calcs.dist_m,
	speed_kmh=calcs.speed_kmh,
	azimuth_deg=calcs.azimuth_deg
FROM
(
SELECT
	cur.gps_clean_id,
	CAST(EXTRACT(EPOCH FROM cur.gps_timestamp)-EXTRACT(EPOCH FROM prev.gps_timestamp) AS INTEGER) as elapsed_s,
	ST_Distance(prev.location,cur.location, false) as dist_m,
	ST_Distance(prev.location_prj,cur.location_prj)/(EXTRACT(EPOCH FROM cur.gps_timestamp)-EXTRACT(EPOCH FROM prev.gps_timestamp))/1000*60*60 as speed_kmh,
	DEGREES(ST_Azimuth(prev.location_prj,cur.location_prj)) as azimuth_deg
FROM
	gps_clean prev
	INNER JOIN gps_clean cur ON prev.entry_id=cur.entry_id AND prev.gps_clean_id=cur.gps_clean_id-1
	INNER JOIN entry e on cur.entry_id=e.entry_id
WHERE
	cur.entry_id=entryid
) calcs
WHERE
	gps_clean.gps_clean_id=calcs.gps_clean_id;

UPDATE entry_geometry SET cleans_count=c.cnt
FROM ( SELECT entry_id,COUNT(*) as cnt FROM gps_clean WHERE entry_id=entryid GROUP BY entry_id ) c
WHERE entry_geometry.entry_id=c.entry_id;

UPDATE entry_geometry SET stops_count=c.cnt
FROM ( SELECT entry_id,COUNT(*) as cnt FROM gps_stop WHERE entry_id=entryid GROUP BY entry_id ) c
WHERE entry_geometry.entry_id=c.entry_id;

$$;

-- Backfill: recompute speed_kmh and rebuild raw_line for every entry the bug left
-- with raws_count>0 but raw_line IS NULL. Also refreshes their clean-side calcs
-- for consistency (clean_line itself was never affected).
DO $$
DECLARE
  eid integer;
BEGIN
  FOR eid IN
    SELECT e.entry_id
    FROM entry e
    JOIN entry_geometry eg ON eg.entry_id = e.entry_id
    WHERE eg.raw_line IS NULL AND eg.raws_count > 0
  LOOP
    PERFORM ec23_gpsrawsupdatecalcs(eid);
    PERFORM ec23_gpsrawscreateline(eid);
    PERFORM ec23_gpscleansupdatecalcs(eid);
    PERFORM ec23_gpscleanscreateline(eid);
  END LOOP;
END $$;
