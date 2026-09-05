--
-- PostgreSQL database dump
--

-- Dumped from database version 14.18 (Ubuntu 14.18-0ubuntu0.22.04.1)
-- Dumped by pg_dump version 14.18 (Ubuntu 14.18-0ubuntu0.22.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: postgis; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA public;


--
-- Name: EXTENSION postgis; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION postgis IS 'PostGIS geometry, geography, and raster spatial types and functions';


--
-- Name: ec23_chargecentroidfromcheckpoints(integer); Type: FUNCTION; Schema: public; Owner: elephant_charge
--

CREATE FUNCTION public.ec23_chargecentroidfromcheckpoints(chargeid integer) RETURNS void
    LANGUAGE sql
    AS $$

UPDATE charge SET map_center = 
	(
		SELECT st_centroid(st_union(ck.location)) FROM checkpoint ck WHERE ck.charge_id=charge.charge_id
	)
WHERE charge.charge_id=chargeid

$$;


ALTER FUNCTION public.ec23_chargecentroidfromcheckpoints(chargeid integer) OWNER TO elephant_charge;

--
-- Name: ec23_entryleg_create_geometry(integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.ec23_entryleg_create_geometry(entrylegid integer) RETURNS void
    LANGUAGE sql
    AS $$

UPDATE entry_leg SET leg_line=ln.line
FROM
(
	SELECT ST_MakeLine(points.loc::geometry) as line FROM
	(SELECT 
		c.location::geometry as loc 
	FROM 
		gps_clean c
	WHERE 	
		c.gps_clean_id >=(SELECT gps_clean_id FROM checkin i INNER JOIN entry_leg el ON i.checkin_id=el.checkin1_id WHERE el.entry_leg_id=entrylegid) AND
		c.gps_clean_id <(SELECT gps_clean_id FROM checkin i1 INNER JOIN entry_leg el ON i1.checkin_id=el.checkin2_id WHERE el.entry_leg_id=entrylegid)
	ORDER BY
		c.gps_timestamp) as points
) ln
WHERE
	entry_leg.entry_leg_id=entrylegid;

UPDATE entry_leg SET leg_line_proj=ST_Transform(leg_line::geometry,3857) WHERE entry_leg_id=entrylegid;

UPDATE entry_leg SET distance_m=ST_Length(leg_line_proj) WHERE entry_leg_id=entrylegid;

--UPDATE entry_leg SET leg_line_kml=trim(trailing '</coordinates></LineString>' from trim(leading '<LineString><coordinates>' from ST_AsKML(leg_line,15))) WHERE entry_leg_id=entrylegid;

UPDATE gps_clean SET entry_leg_id = entrylegid WHERE
	gps_clean_id >=(SELECT gps_clean_id FROM checkin i INNER JOIN entry_leg el ON i.checkin_id=el.checkin1_id WHERE el.entry_leg_id=entrylegid) AND
	gps_clean_id <(SELECT gps_clean_id FROM checkin i INNER JOIN entry_leg el ON i.checkin_id=el.checkin2_id WHERE el.entry_leg_id=entrylegid);
	
$$;


ALTER FUNCTION public.ec23_entryleg_create_geometry(entrylegid integer) OWNER TO postgres;

--
-- Name: ec23_gpscleanscreateline(integer); Type: FUNCTION; Schema: public; Owner: elephant_charge
--

CREATE FUNCTION public.ec23_gpscleanscreateline(entryid integer) RETURNS void
    LANGUAGE sql
    AS $$
UPDATE 
	entry_geometry SET clean_line=ln.line
FROM
	(
	SELECT 
		pnts.entry_id,ST_MakeLine(pnts.location::geometry) as line
	FROM 
		(SELECT entry_id,location FROM gps_clean WHERE entry_id=entryid ORDER BY gps_clean_id) AS pnts 
	GROUP BY 
		pnts.entry_id
	) as ln
WHERE
	entry_geometry.entry_id=entryid;

UPDATE entry_geometry SET clean_line_kml=trim(trailing '</coordinates></LineString>' from trim(leading '<LineString><coordinates>' from ST_AsKML(clean_line,15))) WHERE entry_id=entryid;
UPDATE entry_geometry SET clean_line_json=ST_AsGeoJSON(clean_line,15) WHERE entry_id=entryid;

$$;


ALTER FUNCTION public.ec23_gpscleanscreateline(entryid integer) OWNER TO elephant_charge;

--
-- Name: ec23_gpscleansupdatecalcs(integer); Type: FUNCTION; Schema: public; Owner: elephant_charge
--

CREATE FUNCTION public.ec23_gpscleansupdatecalcs(entryid integer) RETURNS void
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
	0 as speed_kmh,--ST_Distance(prev.location_prj,cur.location_prj)/(EXTRACT(EPOCH FROM cur.gps_timestamp)-EXTRACT(EPOCH FROM prev.gps_timestamp))/1000*60*60 as speed_kmh,
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


ALTER FUNCTION public.ec23_gpscleansupdatecalcs(entryid integer) OWNER TO elephant_charge;

--
-- Name: ec23_gpsrawscreateline(integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.ec23_gpsrawscreateline(entryid integer) RETURNS void
    LANGUAGE sql
    AS $$
UPDATE 
	entry_geometry SET raw_line=ln.line
FROM
	(
	SELECT 
		pnts.entry_id,ST_MakeLine(pnts.location::geometry) as line
	FROM 
		(SELECT entry_id,location FROM gps_raw WHERE entry_id=entryid and speed_kmh>0 ORDER BY gps_raw_id) AS pnts 
	GROUP BY 
		pnts.entry_id
	) as ln
WHERE
	entry_geometry.entry_id=entryid;

UPDATE entry_geometry SET raw_line_kml=trim(trailing '</coordinates></LineString>' from trim(leading '<LineString><coordinates>' from ST_AsKML(raw_line,15))) WHERE entry_id=entryid;
UPDATE entry_geometry SET raw_line_json=ST_AsGeoJSON(raw_line,15) WHERE entry_id=entryid;

$$;


ALTER FUNCTION public.ec23_gpsrawscreateline(entryid integer) OWNER TO postgres;

--
-- Name: ec23_gpsrawsupdatecalcs(integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.ec23_gpsrawsupdatecalcs(entryid integer) RETURNS void
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
	0 as speed_kmh,--ST_Distance(prev.location_prj,cur.location_prj)/(EXTRACT(EPOCH FROM cur.gps_timestamp)-EXTRACT(EPOCH FROM prev.gps_timestamp))/1000*60*60 as speed_kmh,
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


ALTER FUNCTION public.ec23_gpsrawsupdatecalcs(entryid integer) OWNER TO postgres;

--
-- Name: ec23_legdistance(integer); Type: FUNCTION; Schema: public; Owner: elephant_charge
--

CREATE FUNCTION public.ec23_legdistance(legid integer) RETURNS void
    LANGUAGE sql
    AS $$

UPDATE
	leg
SET
	distance_m = ST_Distance(ck1.location_prj, ck2.location_prj)
FROM
	v_checkpoint ck1,
	v_checkpoint ck2
WHERE
	ck1.checkpoint_id=leg.checkpoint1_id AND
	ck2.checkpoint_id=leg.checkpoint2_id AND
	leg.leg_id = legId;


$$;


ALTER FUNCTION public.ec23_legdistance(legid integer) OWNER TO elephant_charge;

--
-- Name: ec23_points_within_checkpoint(integer, timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.ec23_points_within_checkpoint(entryid integer, starttime timestamp with time zone, endtime timestamp with time zone) RETURNS TABLE(checkpoint_id integer, gps_clean_id integer, gps_timestamp timestamp with time zone, distance_m double precision)
    LANGUAGE sql ROWS 5000
    AS $$

SELECT
	g.checkpoint_id,
	gps.gps_clean_id,
	gps.gps_timestamp,
	ST_Distance(gps.location_prj,g.location_prj)
FROM
	gps_clean gps
	INNER JOIN checkpoint g ON ST_DWithin(gps.location_prj,g.location_prj, g.radius_m)
	INNER JOIN entry e ON gps.entry_id=e.entry_id
WHERE	
	gps.entry_id=entryid AND
	gps.gps_timestamp> starttime AND
	gps.gps_timestamp< endtime AND
	g.charge_id = e.charge_id
ORDER BY
	gps.gps_timestamp

$$;


ALTER FUNCTION public.ec23_points_within_checkpoint(entryid integer, starttime timestamp with time zone, endtime timestamp with time zone) OWNER TO postgres;

--
-- Name: ec_entries_update_gps_raws_count(); Type: FUNCTION; Schema: public; Owner: elephant_charge
--

CREATE FUNCTION public.ec_entries_update_gps_raws_count() RETURNS void
    LANGUAGE sql
    AS $$
UPDATE entries e 
SET gps_raws_count=c.count 
FROM (SELECT entry_id,count(*) as count from gps_raws group by entry_id) c
WHERE e.id=c.entry_id
$$;


ALTER FUNCTION public.ec_entries_update_gps_raws_count() OWNER TO elephant_charge;

--
-- Name: ec_gps_raws_import(integer); Type: FUNCTION; Schema: public; Owner: elephant_charge
--

CREATE FUNCTION public.ec_gps_raws_import(charge_id integer) RETURNS void
    LANGUAGE sql
    AS $$
INSERT INTO gps_raws (entry_id,gps_timestamp,location,source_ref)
SELECT
	e.id,
	i.timedate,
	ST_SetSRID(ST_MakePoint(i.lon,i.lat),4326),
	'GEOTAB'
FROM
	entries e 
	INNER JOIN charges c ON e.charge_id=c.id
	INNER JOIN teams t on e.team_id=t.id
	inner join import_2016 i on i.teamid=e.car_no
WHERE
	c.id=charge_id 
$$;


ALTER FUNCTION public.ec_gps_raws_import(charge_id integer) OWNER TO elephant_charge;

--
-- Name: ec_guardcheckinforentry(integer, integer, timestamp without time zone, timestamp without time zone); Type: FUNCTION; Schema: public; Owner: elephant_charge
--

CREATE FUNCTION public.ec_guardcheckinforentry(entryid integer, guardid integer, from_time timestamp without time zone, to_time timestamp without time zone) RETURNS TABLE(guard_id integer, gps_clean_id integer, gps_timestamp timestamp without time zone, dist_m double precision)
    LANGUAGE sql ROWS 1
    AS $$

SELECT
	g.id,
	gps.id,
	gps.gps_timestamp,
	ST_Distance(gps.location_prj,ST_Transform(g.location,3857))
FROM
	gps_cleans gps
	INNER JOIN guards g ON ST_DWithin(gps.location_prj,ST_Transform(g.location,3857),g.radius_m)	
WHERE	
	gps.entry_id=entryid and g.id=guardid and
	gps.gps_timestamp>=from_time and
	gps.gps_timestamp<=to_time
ORDER BY
	ST_Distance(gps.location_prj,ST_Transform(g.location,3857))
LIMIT 1


$$;


ALTER FUNCTION public.ec_guardcheckinforentry(entryid integer, guardid integer, from_time timestamp without time zone, to_time timestamp without time zone) OWNER TO elephant_charge;

--
-- Name: ec_linesforleg(integer); Type: FUNCTION; Schema: public; Owner: elephant_charge
--

CREATE FUNCTION public.ec_linesforleg(legid integer) RETURNS TABLE(json text, entry_id integer)
    LANGUAGE sql
    AS $$
SELECT 
	ST_AsGEOJSON(el.leg_line),
	el.entry_id as entry_id
FROM
	leg l
	INNER JOIN entry_leg el ON l.leg_id=el.leg_id
WHERE
	l.leg_id=legid
	
$$;


ALTER FUNCTION public.ec_linesforleg(legid integer) OWNER TO elephant_charge;

--
-- Name: ec_rawlinesnearguard(integer); Type: FUNCTION; Schema: public; Owner: elephant_charge
--

CREATE FUNCTION public.ec_rawlinesnearguard(guardid integer) RETURNS TABLE(json text, entry_id integer)
    LANGUAGE sql
    AS $$
SELECT 
	ST_AsGEOJSON(ST_Intersection((SELECT ST_Buffer(location,0.001, 'quad_segs=2') FROM guards WHERE Id=guardid),e.raw_line)),
	en.id as entry_id
FROM
	entry_geoms e
	INNER JOIN entries en on e.entry_id=en.id
	INNER JOIN guards g on en.charge_id=g.charge_id
WHERE
	g.id=guardid and e.raw_line IS NOT NULL
	
$$;


ALTER FUNCTION public.ec_rawlinesnearguard(guardid integer) OWNER TO elephant_charge;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: ar_internal_metadata; Type: TABLE; Schema: public; Owner: elephant_charge
--

CREATE TABLE public.ar_internal_metadata (
    key character varying NOT NULL,
    value character varying,
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone NOT NULL
);


ALTER TABLE public.ar_internal_metadata OWNER TO elephant_charge;

--
-- Name: award; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.award (
    award_id bigint NOT NULL,
    type_ref character varying NOT NULL,
    name character varying NOT NULL,
    sponsor_id bigint,
    ordinal bigint NOT NULL,
    category_id bigint,
    class_id bigint,
    distance_ref character varying,
    sort_result_status boolean
);


ALTER TABLE public.award OWNER TO postgres;

--
-- Name: award_award_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.award ALTER COLUMN award_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.award_award_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: beneficiaries; Type: TABLE; Schema: public; Owner: elephant_charge
--

CREATE TABLE public.beneficiaries (
    id integer NOT NULL,
    name character varying,
    short_name character varying,
    geography character varying,
    description character varying,
    logo_file_name character varying,
    logo_content_type character varying,
    logo_file_size integer,
    logo_updated_at timestamp without time zone,
    website character varying,
    facebook character varying,
    email_admin character varying,
    email_public character varying,
    geography_description character varying,
    grant_description_default character varying
);


ALTER TABLE public.beneficiaries OWNER TO elephant_charge;

--
-- Name: beneficeries_id_seq; Type: SEQUENCE; Schema: public; Owner: elephant_charge
--

CREATE SEQUENCE public.beneficeries_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.beneficeries_id_seq OWNER TO elephant_charge;

--
-- Name: beneficeries_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: elephant_charge
--

ALTER SEQUENCE public.beneficeries_id_seq OWNED BY public.beneficiaries.id;


--
-- Name: car; Type: TABLE; Schema: public; Owner: elephant_charge
--

CREATE TABLE public.car (
    car_id integer NOT NULL,
    car_name character varying,
    model character varying,
    colour character varying,
    year integer,
    make_id integer,
    registration character varying,
    country_id integer
);


ALTER TABLE public.car OWNER TO elephant_charge;

--
-- Name: cars_id_seq; Type: SEQUENCE; Schema: public; Owner: elephant_charge
--

CREATE SEQUENCE public.cars_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.cars_id_seq OWNER TO elephant_charge;

--
-- Name: cars_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: elephant_charge
--

ALTER SEQUENCE public.cars_id_seq OWNED BY public.car.car_id;


--
-- Name: category; Type: TABLE; Schema: public; Owner: elephant_charge
--

CREATE TABLE public.category (
    category_id bigint NOT NULL,
    category_ref character varying NOT NULL,
    category character varying NOT NULL
);


ALTER TABLE public.category OWNER TO elephant_charge;

--
-- Name: charge; Type: TABLE; Schema: public; Owner: elephant_charge
--

CREATE TABLE public.charge (
    charge_id integer NOT NULL,
    charge_name character varying NOT NULL,
    location character varying,
    map_scale integer,
    map_center public.geometry(Point,4326),
    start_time time with time zone,
    end_time time with time zone,
    charge_date date NOT NULL,
    charge_ref character varying(25) NOT NULL,
    gauntlet_multiplier integer NOT NULL,
    exchange_rate double precision,
    m_per_local double precision,
    map_file_name character varying,
    spirit_entry_id integer,
    spirit_name character varying,
    spirit_description character varying,
    best_guard_id integer,
    shafted_entry_id integer,
    tsetse1_leg_id integer,
    tsetse2_leg_id integer,
    shafted_description character varying,
    kml character varying
);


ALTER TABLE public.charge OWNER TO elephant_charge;

--
-- Name: charge_help_points; Type: TABLE; Schema: public; Owner: elephant_charge
--

CREATE TABLE public.charge_help_points (
    id integer NOT NULL,
    name character varying,
    charge_id integer,
    location public.geometry(Point,4326)
);


ALTER TABLE public.charge_help_points OWNER TO elephant_charge;

--
-- Name: charge_help_points_id_seq; Type: SEQUENCE; Schema: public; Owner: elephant_charge
--

CREATE SEQUENCE public.charge_help_points_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.charge_help_points_id_seq OWNER TO elephant_charge;

--
-- Name: charge_help_points_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: elephant_charge
--

ALTER SEQUENCE public.charge_help_points_id_seq OWNED BY public.charge_help_points.id;


--
-- Name: charge_sponsor; Type: TABLE; Schema: public; Owner: elephant_charge
--

CREATE TABLE public.charge_sponsor (
    charge_id integer NOT NULL,
    sponsor_id integer NOT NULL,
    type_ref character varying(10),
    sponsorship_type_ref character varying(10),
    sponsorship_description character varying
);


ALTER TABLE public.charge_sponsor OWNER TO elephant_charge;

--
-- Name: charges_id_seq; Type: SEQUENCE; Schema: public; Owner: elephant_charge
--

CREATE SEQUENCE public.charges_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.charges_id_seq OWNER TO elephant_charge;

--
-- Name: charges_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: elephant_charge
--

ALTER SEQUENCE public.charges_id_seq OWNED BY public.charge.charge_id;


--
-- Name: checkin; Type: TABLE; Schema: public; Owner: elephant_charge
--

CREATE TABLE public.checkin (
    checkin_id integer NOT NULL,
    entry_id integer NOT NULL,
    checkpoint_id integer NOT NULL,
    gps_clean_id integer,
    checkin_number integer NOT NULL,
    checkin_timestamp timestamp with time zone NOT NULL,
    distance_m bigint
);


ALTER TABLE public.checkin OWNER TO elephant_charge;

--
-- Name: checkins_id_seq; Type: SEQUENCE; Schema: public; Owner: elephant_charge
--

CREATE SEQUENCE public.checkins_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.checkins_id_seq OWNER TO elephant_charge;

--
-- Name: checkins_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: elephant_charge
--

ALTER SEQUENCE public.checkins_id_seq OWNED BY public.checkin.checkin_id;


--
-- Name: checkpoint; Type: TABLE; Schema: public; Owner: elephant_charge
--

CREATE TABLE public.checkpoint (
    checkpoint_id integer NOT NULL,
    is_gauntlet boolean,
    sponsor_id integer NOT NULL,
    charge_id integer NOT NULL,
    radius_m integer,
    location public.geometry(Point,4326),
    elevation integer,
    location_prj public.geometry(Point,3857)
);


ALTER TABLE public.checkpoint OWNER TO elephant_charge;

--
-- Name: class; Type: TABLE; Schema: public; Owner: elephant_charge
--

CREATE TABLE public.class (
    class_id bigint NOT NULL,
    class_ref character varying NOT NULL,
    class_name character varying NOT NULL
);


ALTER TABLE public.class OWNER TO elephant_charge;

--
-- Name: distance; Type: TABLE; Schema: public; Owner: elephant_charge
--

CREATE TABLE public.distance (
    distance_ref character varying NOT NULL,
    distance_name character varying NOT NULL,
    is_calculated boolean NOT NULL
);


ALTER TABLE public.distance OWNER TO elephant_charge;

--
-- Name: entry; Type: TABLE; Schema: public; Owner: elephant_charge
--

CREATE TABLE public.entry (
    entry_id integer NOT NULL,
    car_no integer NOT NULL,
    raised_local integer,
    charge_id integer NOT NULL,
    team_id integer NOT NULL,
    car_id integer NOT NULL,
    dist_penalty_gauntlet integer,
    dist_penalty_nongauntlet integer,
    dist_best integer,
    late_finish_min integer,
    entry_name character varying,
    captain character varying,
    members character varying,
    class_id bigint NOT NULL,
    gps_offset_days bigint,
    complete_per_card boolean,
    starting_checkpoint_id bigint,
    processing_status character varying,
    checkins_consistent boolean DEFAULT false,
    result_status character varying,
    checkins_inconsistent_message character varying,
    gps_source_ref character varying,
    geotab_device_id bigint,
    imei character varying,
    kml character varying
);


ALTER TABLE public.entry OWNER TO elephant_charge;

--
-- Name: entries_id_seq; Type: SEQUENCE; Schema: public; Owner: elephant_charge
--

CREATE SEQUENCE public.entries_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.entries_id_seq OWNER TO elephant_charge;

--
-- Name: entries_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: elephant_charge
--

ALTER SEQUENCE public.entries_id_seq OWNED BY public.entry.entry_id;


--
-- Name: entry_category; Type: TABLE; Schema: public; Owner: elephant_charge
--

CREATE TABLE public.entry_category (
    entry_id bigint NOT NULL,
    category_id bigint NOT NULL
);


ALTER TABLE public.entry_category OWNER TO elephant_charge;

--
-- Name: entry_distance; Type: TABLE; Schema: public; Owner: elephant_charge
--

CREATE TABLE public.entry_distance (
    entry_id bigint NOT NULL,
    distance_ref character varying NOT NULL,
    distance_m bigint NOT NULL
);


ALTER TABLE public.entry_distance OWNER TO elephant_charge;

--
-- Name: entry_geometry; Type: TABLE; Schema: public; Owner: elephant_charge
--

CREATE TABLE public.entry_geometry (
    entry_id integer NOT NULL,
    raw_line public.geometry(LineString,4326),
    clean_line public.geometry(LineString,4326),
    raw_line_kml text,
    clean_line_kml text,
    raw_line_json text,
    clean_line_json text,
    raws_count integer,
    cleans_count integer,
    stops_count integer,
    raws_from timestamp with time zone,
    raws_to timestamp with time zone
);


ALTER TABLE public.entry_geometry OWNER TO elephant_charge;

--
-- Name: entry_leg; Type: TABLE; Schema: public; Owner: elephant_charge
--

CREATE TABLE public.entry_leg (
    entry_leg_id integer NOT NULL,
    entry_id integer NOT NULL,
    leg_id integer NOT NULL,
    direction_forward boolean,
    distance_m integer,
    elapsed_s integer,
    checkin1_id integer NOT NULL,
    checkin2_id integer NOT NULL,
    leg_line public.geography,
    leg_line_proj public.geometry(LineString,3857),
    leg_no integer
);


ALTER TABLE public.entry_leg OWNER TO elephant_charge;

--
-- Name: entry_legs_id_seq; Type: SEQUENCE; Schema: public; Owner: elephant_charge
--

CREATE SEQUENCE public.entry_legs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.entry_legs_id_seq OWNER TO elephant_charge;

--
-- Name: entry_legs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: elephant_charge
--

ALTER SEQUENCE public.entry_legs_id_seq OWNED BY public.entry_leg.entry_leg_id;


--
-- Name: photos; Type: TABLE; Schema: public; Owner: elephant_charge
--

CREATE TABLE public.photos (
    id integer NOT NULL,
    photo_file_name character varying,
    photo_content_type character varying,
    photo_file_size integer,
    photo_updated_at timestamp without time zone,
    photoable_id integer,
    photoable_type character varying,
    aspect double precision,
    is_car boolean,
    faces integer[],
    faces_count integer DEFAULT 0,
    views integer
);


ALTER TABLE public.photos OWNER TO elephant_charge;

--
-- Name: entry_photos_id_seq; Type: SEQUENCE; Schema: public; Owner: elephant_charge
--

CREATE SEQUENCE public.entry_photos_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.entry_photos_id_seq OWNER TO elephant_charge;

--
-- Name: entry_photos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: elephant_charge
--

ALTER SEQUENCE public.entry_photos_id_seq OWNED BY public.photos.id;


--
-- Name: gps_clean; Type: TABLE; Schema: public; Owner: elephant_charge
--

CREATE TABLE public.gps_clean (
    gps_clean_id integer NOT NULL,
    entry_id integer NOT NULL,
    gps_timestamp timestamp with time zone NOT NULL,
    location public.geography,
    location_prj public.geometry(Point,3857),
    stop_id integer,
    distance_m double precision,
    speed_kmh double precision,
    azimuth_deg double precision,
    elapsed_s integer,
    elevation integer,
    leg_distance_m integer,
    entry_leg_id integer
);


ALTER TABLE public.gps_clean OWNER TO elephant_charge;

--
-- Name: gps_cleans_id_seq; Type: SEQUENCE; Schema: public; Owner: elephant_charge
--

CREATE SEQUENCE public.gps_cleans_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.gps_cleans_id_seq OWNER TO elephant_charge;

--
-- Name: gps_cleans_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: elephant_charge
--

ALTER SEQUENCE public.gps_cleans_id_seq OWNED BY public.gps_clean.gps_clean_id;


--
-- Name: gps_historic; Type: TABLE; Schema: public; Owner: elephant_charge
--

CREATE TABLE public.gps_historic (
    id integer NOT NULL,
    lat double precision,
    lon double precision,
    gps_timestamp timestamp with time zone,
    teamname character varying(50),
    charge integer
);


ALTER TABLE public.gps_historic OWNER TO elephant_charge;

--
-- Name: gps_historic_id_seq; Type: SEQUENCE; Schema: public; Owner: elephant_charge
--

CREATE SEQUENCE public.gps_historic_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.gps_historic_id_seq OWNER TO elephant_charge;

--
-- Name: gps_historic_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: elephant_charge
--

ALTER SEQUENCE public.gps_historic_id_seq OWNED BY public.gps_historic.id;


--
-- Name: gps_raw; Type: TABLE; Schema: public; Owner: elephant_charge
--

CREATE TABLE public.gps_raw (
    gps_raw_id integer NOT NULL,
    entry_id integer NOT NULL,
    gps_timestamp timestamp with time zone NOT NULL,
    location public.geography,
    distance_m double precision,
    speed_kmh double precision,
    azimuth_deg double precision,
    elapsed_s integer,
    location_prj public.geometry(Point,3857)
);


ALTER TABLE public.gps_raw OWNER TO elephant_charge;

--
-- Name: gps_raw_gps_raw_id_seq; Type: SEQUENCE; Schema: public; Owner: elephant_charge
--

ALTER TABLE public.gps_raw ALTER COLUMN gps_raw_id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.gps_raw_gps_raw_id_seq
    START WITH 3000000
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: gps_stop; Type: TABLE; Schema: public; Owner: elephant_charge
--

CREATE TABLE public.gps_stop (
    gps_stop_id integer NOT NULL,
    entry_id integer NOT NULL,
    start_time timestamp with time zone NOT NULL,
    end_time timestamp with time zone NOT NULL,
    location public.geometry(Point,4326),
    location_prj public.geometry(Point,3857),
    elapsed_s integer
);


ALTER TABLE public.gps_stop OWNER TO elephant_charge;

--
-- Name: gps_stops_id_seq; Type: SEQUENCE; Schema: public; Owner: elephant_charge
--

CREATE SEQUENCE public.gps_stops_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.gps_stops_id_seq OWNER TO elephant_charge;

--
-- Name: gps_stops_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: elephant_charge
--

ALTER SEQUENCE public.gps_stops_id_seq OWNED BY public.gps_stop.gps_stop_id;


--
-- Name: grant; Type: TABLE; Schema: public; Owner: elephant_charge
--

CREATE TABLE public."grant" (
    grant_id integer NOT NULL,
    charge_id integer,
    beneficiary_id integer,
    grant_kwacha integer,
    description character varying
);


ALTER TABLE public."grant" OWNER TO elephant_charge;

--
-- Name: grants_id_seq; Type: SEQUENCE; Schema: public; Owner: elephant_charge
--

CREATE SEQUENCE public.grants_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.grants_id_seq OWNER TO elephant_charge;

--
-- Name: grants_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: elephant_charge
--

ALTER SEQUENCE public.grants_id_seq OWNED BY public."grant".grant_id;


--
-- Name: sponsor; Type: TABLE; Schema: public; Owner: elephant_charge
--

CREATE TABLE public.sponsor (
    sponsor_id integer NOT NULL,
    sponsor_name character varying,
    short_name character varying,
    website character varying,
    logo_file_name character varying,
    email character varying,
    sponsor_ref character varying(25)
);


ALTER TABLE public.sponsor OWNER TO elephant_charge;

--
-- Name: guard_sponsors_id_seq; Type: SEQUENCE; Schema: public; Owner: elephant_charge
--

CREATE SEQUENCE public.guard_sponsors_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.guard_sponsors_id_seq OWNER TO elephant_charge;

--
-- Name: guard_sponsors_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: elephant_charge
--

ALTER SEQUENCE public.guard_sponsors_id_seq OWNED BY public.sponsor.sponsor_id;


--
-- Name: guards_id_seq; Type: SEQUENCE; Schema: public; Owner: elephant_charge
--

CREATE SEQUENCE public.guards_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.guards_id_seq OWNER TO elephant_charge;

--
-- Name: guards_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: elephant_charge
--

ALTER SEQUENCE public.guards_id_seq OWNED BY public.checkpoint.checkpoint_id;


--
-- Name: leg; Type: TABLE; Schema: public; Owner: elephant_charge
--

CREATE TABLE public.leg (
    leg_id integer NOT NULL,
    checkpoint1_id integer NOT NULL,
    checkpoint2_id integer NOT NULL,
    distance_m integer,
    is_gauntlet boolean DEFAULT false,
    is_tsetse boolean DEFAULT false
);


ALTER TABLE public.leg OWNER TO elephant_charge;

--
-- Name: legs_id_seq; Type: SEQUENCE; Schema: public; Owner: elephant_charge
--

CREATE SEQUENCE public.legs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.legs_id_seq OWNER TO elephant_charge;

--
-- Name: legs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: elephant_charge
--

ALTER SEQUENCE public.legs_id_seq OWNED BY public.leg.leg_id;


--
-- Name: make; Type: TABLE; Schema: public; Owner: elephant_charge
--

CREATE TABLE public.make (
    make_id integer NOT NULL,
    make character varying,
    make_ref character varying
);


ALTER TABLE public.make OWNER TO elephant_charge;

--
-- Name: makes_id_seq; Type: SEQUENCE; Schema: public; Owner: elephant_charge
--

CREATE SEQUENCE public.makes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.makes_id_seq OWNER TO elephant_charge;

--
-- Name: makes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: elephant_charge
--

ALTER SEQUENCE public.makes_id_seq OWNED BY public.make.make_id;


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: elephant_charge
--

CREATE TABLE public.schema_migrations (
    version character varying NOT NULL
);


ALTER TABLE public.schema_migrations OWNER TO elephant_charge;

--
-- Name: team; Type: TABLE; Schema: public; Owner: elephant_charge
--

CREATE TABLE public.team (
    team_id integer NOT NULL,
    team_name character varying,
    captain character varying,
    badge_file_name character varying,
    team_ref character varying(25),
    website character varying,
    email character varying,
    color character(7)
);


ALTER TABLE public.team OWNER TO elephant_charge;

--
-- Name: teams_id_seq; Type: SEQUENCE; Schema: public; Owner: elephant_charge
--

CREATE SEQUENCE public.teams_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.teams_id_seq OWNER TO elephant_charge;

--
-- Name: teams_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: elephant_charge
--

ALTER SEQUENCE public.teams_id_seq OWNED BY public.team.team_id;


--
-- Name: v_award; Type: VIEW; Schema: public; Owner: elephant_charge
--

CREATE VIEW public.v_award AS
 SELECT a.award_id,
    a.type_ref,
    a.distance_ref,
    cl.class_ref,
    cl.class_name,
    cat.category_ref,
    cat.category,
    a.name,
    sp.sponsor_name,
    a.sort_result_status,
    a.ordinal
   FROM (((public.award a
     LEFT JOIN public.class cl ON ((a.class_id = cl.class_id)))
     LEFT JOIN public.category cat ON ((a.category_id = cat.category_id)))
     LEFT JOIN public.sponsor sp ON ((a.sponsor_id = sp.sponsor_id)))
  ORDER BY a.ordinal;


ALTER TABLE public.v_award OWNER TO elephant_charge;

--
-- Name: v_car; Type: VIEW; Schema: public; Owner: elephant_charge
--

CREATE VIEW public.v_car AS
 SELECT c.car_id,
    c.car_name,
    c.model,
    c.colour,
    c.year,
    c.make_id,
    c.registration,
    m.make,
    ( SELECT count(*) AS count
           FROM public.entry
          WHERE (entry.car_id = c.car_id)) AS entry_count,
    ( SELECT count(*) AS count
           FROM ( SELECT DISTINCT entry.team_id
                   FROM public.entry
                  WHERE (entry.car_id = c.car_id)) tms) AS team_count,
    ( SELECT DISTINCT ON (e.car_id) ch.charge_ref
           FROM (public.entry e
             JOIN public.charge ch ON ((e.charge_id = ch.charge_id)))
          WHERE (e.car_id = c.car_id)
          ORDER BY e.car_id, ch.charge_date DESC) AS last_charge
   FROM (public.car c
     LEFT JOIN public.make m ON ((c.make_id = m.make_id)));


ALTER TABLE public.v_car OWNER TO elephant_charge;

--
-- Name: v_charge; Type: VIEW; Schema: public; Owner: elephant_charge
--

CREATE VIEW public.v_charge AS
 WITH new_teams_count AS (
         SELECT e.charge_id,
            count(e.entry_id) AS new_teams_count
           FROM ((public.entry e
             JOIN public.entry_category ec ON ((e.entry_id = ec.entry_id)))
             JOIN public.category c_1 ON ((ec.category_id = c_1.category_id)))
          WHERE ((c_1.category_ref)::text = 'NEW'::text)
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
    (NOT (c.charge_date > CURRENT_DATE)) AS charge_complete,
    ( SELECT count(*) AS count
           FROM public.checkpoint ck
          WHERE (ck.charge_id = c.charge_id)) AS checkpoint_count,
    etc.entry_count,
    ( SELECT count(e.entry_id) AS count
           FROM public.entry e
          WHERE ((e.charge_id = c.charge_id) AND ((e.result_status)::text = 'COMPLETE'::text))) AS entry_completed_count,
    ((( SELECT count(e.entry_id) AS count
           FROM public.entry e
          WHERE ((e.charge_id = c.charge_id) AND ((e.result_status)::text = 'COMPLETE'::text))))::double precision / (etc.entry_count)::double precision) AS entry_completed_pct,
    ( SELECT sum(e.raised_local) AS sum
           FROM public.entry e
          WHERE (e.charge_id = c.charge_id)) AS raised_local,
    ( SELECT ((sum(e.raised_local))::double precision / c.exchange_rate)
           FROM public.entry e
          WHERE (e.charge_id = c.charge_id)) AS raised_dollars,
    ( SELECT (((sum(e.raised_local))::double precision / c.exchange_rate) / (etc.entry_count)::double precision)
           FROM public.entry e
          WHERE (e.charge_id = c.charge_id)) AS dollars_per_entry,
    COALESCE(ntc.new_teams_count, (0)::bigint) AS new_teams_count,
    c.kml
   FROM ((public.charge c
     LEFT JOIN new_teams_count ntc ON ((c.charge_id = ntc.charge_id)))
     LEFT JOIN entry_count etc ON ((c.charge_id = etc.charge_id)));


ALTER TABLE public.v_charge OWNER TO elephant_charge;

--
-- Name: v_checkin; Type: VIEW; Schema: public; Owner: elephant_charge
--

CREATE VIEW public.v_checkin AS
 SELECT ck.checkin_id,
    ck.entry_id,
    ck.checkpoint_id,
    ck.gps_clean_id,
    ck.checkin_number,
    ck.checkin_timestamp,
    ck.distance_m,
    cp.is_gauntlet,
    sp.sponsor_name
   FROM ((public.checkin ck
     JOIN public.checkpoint cp ON ((ck.checkpoint_id = cp.checkpoint_id)))
     JOIN public.sponsor sp ON ((cp.sponsor_id = sp.sponsor_id)));


ALTER TABLE public.v_checkin OWNER TO elephant_charge;

--
-- Name: v_checkpoint; Type: VIEW; Schema: public; Owner: elephant_charge
--

CREATE VIEW public.v_checkpoint AS
 SELECT c.checkpoint_id,
    c.is_gauntlet,
    c.sponsor_id,
    c.charge_id,
    cg.charge_ref,
    cg.charge_date,
    c.radius_m,
    c.elevation,
    s.sponsor_name,
    s.short_name,
    ( SELECT count(*) AS count
           FROM public.entry e
          WHERE (e.starting_checkpoint_id = c.checkpoint_id)) AS starters_count,
    ( SELECT count(*) AS count
           FROM public.checkin ck
          WHERE (c.checkpoint_id = ck.checkpoint_id)) AS checkins_count,
        CASE
            WHEN (c.location IS NULL) THEN false
            ELSE true
        END AS located,
    public.st_asgeojson(c.location) AS location,
    public.st_asgeojson(c.location_prj) AS location_prj,
    public.st_askml(c.location) AS location_kml
   FROM ((public.checkpoint c
     JOIN public.charge cg ON ((c.charge_id = cg.charge_id)))
     JOIN public.sponsor s ON ((c.sponsor_id = s.sponsor_id)));


ALTER TABLE public.v_checkpoint OWNER TO elephant_charge;

--
-- Name: v_entry; Type: VIEW; Schema: public; Owner: elephant_charge
--

CREATE VIEW public.v_entry AS
 SELECT e.entry_id,
    e.charge_id,
    ch.charge_name,
    ch.charge_ref,
    e.team_id,
    e.car_id,
    e.car_no,
    e.entry_name,
    e.captain,
    e.members,
    c.class_id,
    c.class_name,
    e.raised_local,
    ((e.raised_local)::double precision / ch.exchange_rate) AS raised_dollars,
    e.dist_penalty_gauntlet,
    e.dist_penalty_nongauntlet,
    e.dist_best,
    e.late_finish_min,
    e.gps_offset_days,
    e.complete_per_card,
    e.starting_checkpoint_id,
    e.processing_status,
    e.checkins_consistent,
    e.checkins_inconsistent_message,
    e.result_status,
    e.imei,
    ( SELECT ed.distance_m
           FROM public.entry_distance ed
          WHERE ((ed.entry_id = e.entry_id) AND ((ed.distance_ref)::text = 'TOTAL'::text))) AS distance_total,
    ( SELECT ed.distance_m
           FROM public.entry_distance ed
          WHERE ((ed.entry_id = e.entry_id) AND ((ed.distance_ref)::text = 'TOTAL_COMPETITION'::text))) AS distance_total_competition,
    ( SELECT ed.distance_m
           FROM public.entry_distance ed
          WHERE ((ed.entry_id = e.entry_id) AND ((ed.distance_ref)::text = 'NET'::text))) AS distance_net,
    ( SELECT string_agg((cat.category)::text, ', '::text) AS string_agg
           FROM (public.category cat
             JOIN public.entry_category entcat ON ((entcat.category_id = cat.category_id)))
          WHERE (entcat.entry_id = e.entry_id)) AS categories,
    ( SELECT string_agg((cat.category_id)::text, ', '::text) AS string_agg
           FROM (public.category cat
             JOIN public.entry_category entcat ON ((entcat.category_id = cat.category_id)))
          WHERE (entcat.entry_id = e.entry_id)) AS category_ids,
    eg.raws_count,
    eg.cleans_count,
    eg.stops_count,
    eg.raws_from,
    eg.raws_to,
    e.gps_source_ref,
    e.geotab_device_id,
    ( SELECT count(*) AS count
           FROM public.entry_leg el
          WHERE (el.entry_id = e.entry_id)) AS leg_count,
    t.color,
    car.car_name,
    car.year,
    car.model,
    car.colour,
    mk.make,
    e.kml
   FROM ((((((public.entry e
     LEFT JOIN public.entry_geometry eg ON ((eg.entry_id = e.entry_id)))
     JOIN public.team t ON ((e.team_id = t.team_id)))
     JOIN public.class c ON ((e.class_id = c.class_id)))
     JOIN public.charge ch ON ((e.charge_id = ch.charge_id)))
     JOIN public.car ON ((e.car_id = car.car_id)))
     LEFT JOIN public.make mk ON ((car.make_id = mk.make_id)));


ALTER TABLE public.v_entry OWNER TO elephant_charge;

--
-- Name: v_distanceawardresults; Type: VIEW; Schema: public; Owner: elephant_charge
--

CREATE VIEW public.v_distanceawardresults AS
 SELECT aw.award_id,
    e.charge_id,
    e.entry_id,
    e.car_no,
    e.entry_name,
    e.result_status,
    e.raised_dollars,
    e.categories,
    e.distance_total,
    e.distance_total_competition,
    e.distance_net,
    e.processing_status,
    ed.distance_ref,
    cl.class_ref,
    cl.class_name,
    cat.category_ref,
    cat.category,
    e.leg_count,
    ed.distance_m
   FROM (((((public.award aw
     LEFT JOIN public.entry_category ecat ON ((aw.category_id = ecat.category_id)))
     LEFT JOIN public.category cat ON ((aw.category_id = cat.category_id)))
     JOIN public.v_entry e ON ((((aw.class_id = e.class_id) OR (aw.class_id IS NULL)) AND ((e.entry_id = ecat.entry_id) OR (aw.category_id IS NULL)))))
     JOIN public.entry_distance ed ON (((e.entry_id = ed.entry_id) AND ((ed.distance_ref)::text = (aw.distance_ref)::text))))
     LEFT JOIN public.class cl ON ((aw.class_id = cl.class_id)))
  WHERE ((aw.type_ref)::text = 'DISTANCE'::text);


ALTER TABLE public.v_distanceawardresults OWNER TO elephant_charge;

--
-- Name: v_entry_category; Type: VIEW; Schema: public; Owner: elephant_charge
--

CREATE VIEW public.v_entry_category AS
 SELECT ec.entry_id,
    ec.category_id,
    ca.category_ref,
    ca.category
   FROM (public.entry_category ec
     JOIN public.category ca ON ((ec.category_id = ca.category_id)));


ALTER TABLE public.v_entry_category OWNER TO elephant_charge;

--
-- Name: v_entry_distance; Type: VIEW; Schema: public; Owner: elephant_charge
--

CREATE VIEW public.v_entry_distance AS
 SELECT ed.entry_id,
    ed.distance_ref,
    ed.distance_m,
    d.distance_name,
    d.is_calculated,
    e.charge_id
   FROM ((public.entry_distance ed
     JOIN public.distance d ON (((ed.distance_ref)::text = (d.distance_ref)::text)))
     JOIN public.entry e ON ((ed.entry_id = e.entry_id)));


ALTER TABLE public.v_entry_distance OWNER TO elephant_charge;

--
-- Name: v_entry_leg; Type: VIEW; Schema: public; Owner: elephant_charge
--

CREATE VIEW public.v_entry_leg AS
 SELECT el.entry_leg_id,
    el.entry_id,
    e.car_no,
    e.entry_name,
    c.class_name AS class,
    el.leg_id,
    el.direction_forward,
    el.distance_m,
    el.elapsed_s,
    el.checkin1_id,
    el.checkin2_id,
    el.leg_no,
    ck1.checkpoint_id AS checkpoint1_id,
    ck2.checkpoint_id AS checkpoint2_id,
    l.is_gauntlet,
    l.is_tsetse,
    l.distance_m AS straight_distance_m,
    ((el.distance_m)::double precision / (NULLIF(l.distance_m, 0))::double precision) AS distance_multiple,
    (((el.distance_m)::double precision / (1000)::double precision) / (((el.elapsed_s)::double precision / (60)::double precision) / (60)::double precision)) AS speed,
    sp1.sponsor_name AS checkpoint1_name,
    sp2.sponsor_name AS checkpoint2_name,
    ck1.checkin_timestamp AS start_time,
    ck2.checkin_timestamp AS end_time,
    rank() OVER (PARTITION BY l.leg_id ORDER BY el.distance_m) AS leg_position,
    count(*) OVER (PARTITION BY l.leg_id) AS leg_entries,
    chr.charge_id
   FROM ((((((((((public.entry_leg el
     JOIN public.entry e ON ((el.entry_id = e.entry_id)))
     JOIN public.class c ON ((e.class_id = c.class_id)))
     JOIN public.leg l ON ((el.leg_id = l.leg_id)))
     JOIN public.checkin ck1 ON ((ck1.checkin_id = el.checkin1_id)))
     JOIN public.checkin ck2 ON ((ck2.checkin_id = el.checkin2_id)))
     JOIN public.checkpoint cp1 ON ((ck1.checkpoint_id = cp1.checkpoint_id)))
     JOIN public.checkpoint cp2 ON ((ck2.checkpoint_id = cp2.checkpoint_id)))
     JOIN public.sponsor sp1 ON ((cp1.sponsor_id = sp1.sponsor_id)))
     JOIN public.sponsor sp2 ON ((cp2.sponsor_id = sp2.sponsor_id)))
     JOIN public.charge chr ON ((e.charge_id = chr.charge_id)));


ALTER TABLE public.v_entry_leg OWNER TO elephant_charge;

--
-- Name: v_gps_raw; Type: VIEW; Schema: public; Owner: elephant_charge
--

CREATE VIEW public.v_gps_raw AS
 SELECT gps_raw.gps_raw_id,
    gps_raw.entry_id,
    gps_raw.gps_timestamp,
    gps_raw.distance_m,
    gps_raw.speed_kmh,
    gps_raw.azimuth_deg,
    gps_raw.elapsed_s,
    public.st_asgeojson(gps_raw.location_prj) AS location,
    public.st_x(gps_raw.location_prj) AS x,
    public.st_y(gps_raw.location_prj) AS y
   FROM public.gps_raw;


ALTER TABLE public.v_gps_raw OWNER TO elephant_charge;

--
-- Name: v_leg; Type: VIEW; Schema: public; Owner: elephant_charge
--

CREATE VIEW public.v_leg AS
 SELECT l.leg_id,
    l.checkpoint1_id,
    l.checkpoint2_id,
    l.distance_m,
    l.is_gauntlet,
    l.is_tsetse,
    c1.charge_id,
    s1.sponsor_name AS checkpoint1_name,
    s2.sponsor_name AS checkpoint2_name,
    ( SELECT count(*) AS count
           FROM public.entry_leg el
          WHERE (el.leg_id = l.leg_id)) AS entry_count,
    public.st_asgeojson(c1.location) AS checkpoint1_location,
    public.st_asgeojson(c2.location) AS checkpoint2_location
   FROM ((((public.leg l
     JOIN public.checkpoint c1 ON ((l.checkpoint1_id = c1.checkpoint_id)))
     JOIN public.checkpoint c2 ON ((l.checkpoint2_id = c2.checkpoint_id)))
     JOIN public.sponsor s1 ON ((c1.sponsor_id = s1.sponsor_id)))
     JOIN public.sponsor s2 ON ((c2.sponsor_id = s2.sponsor_id)));


ALTER TABLE public.v_leg OWNER TO elephant_charge;

--
-- Name: v_pledgeawardresults; Type: VIEW; Schema: public; Owner: elephant_charge
--

CREATE VIEW public.v_pledgeawardresults AS
 SELECT aw.award_id,
    e.charge_id,
    e.entry_id,
    e.car_no,
    e.entry_name,
    e.result_status,
    e.raised_dollars,
    e.categories,
    e.distance_total,
    e.distance_total_competition,
    e.distance_net,
    e.processing_status,
    cl.class_ref,
    cl.class_name,
    cat.category_ref,
    cat.category,
    e.leg_count
   FROM ((((public.award aw
     LEFT JOIN public.entry_category ecat ON ((aw.category_id = ecat.category_id)))
     LEFT JOIN public.category cat ON ((aw.category_id = cat.category_id)))
     JOIN public.v_entry e ON ((((aw.class_id = e.class_id) OR (aw.class_id IS NULL)) AND ((e.entry_id = ecat.entry_id) OR (aw.category_id IS NULL)))))
     LEFT JOIN public.class cl ON ((aw.class_id = cl.class_id)))
  WHERE ((aw.type_ref)::text = 'PLEDGE'::text);


ALTER TABLE public.v_pledgeawardresults OWNER TO elephant_charge;

--
-- Name: v_sponsor; Type: VIEW; Schema: public; Owner: elephant_charge
--

CREATE VIEW public.v_sponsor AS
 SELECT s.sponsor_id,
    s.sponsor_name,
    s.sponsor_ref,
    s.short_name,
    s.website,
    s.logo_file_name,
    s.email,
    ( SELECT count(*) AS count
           FROM public.checkpoint c
          WHERE (c.sponsor_id = s.sponsor_id)) AS checkpoint_count,
    ( SELECT count(*) AS count
           FROM public.charge_sponsor cs
          WHERE (cs.sponsor_id = s.sponsor_id)) AS charge_count
   FROM public.sponsor s;


ALTER TABLE public.v_sponsor OWNER TO elephant_charge;

--
-- Name: v_team; Type: VIEW; Schema: public; Owner: elephant_charge
--

CREATE VIEW public.v_team AS
 WITH entryraised AS (
         SELECT e.entry_id,
            e.team_id,
            ((e.raised_local)::double precision / c.exchange_rate) AS raised_dollars
           FROM (public.entry e
             JOIN public.charge c ON ((e.charge_id = c.charge_id)))
        )
 SELECT t.team_id,
    t.team_name,
    t.captain,
    t.badge_file_name,
    t.team_ref,
    t.website,
    t.email,
    t.color,
    ( SELECT count(*) AS count
           FROM public.entry e
          WHERE (e.team_id = t.team_id)) AS entry_count,
    ( SELECT count(*) AS count
           FROM public.entry e
          WHERE ((e.team_id = t.team_id) AND ((e.result_status)::text = 'COMPLETE'::text))) AS completed_count,
    ( SELECT c.charge_ref
           FROM (public.entry e
             JOIN public.charge c ON ((e.charge_id = c.charge_id)))
          WHERE (e.team_id = t.team_id)
          ORDER BY c.charge_date DESC
         LIMIT 1) AS last_charge,
    ( SELECT c.charge_ref
           FROM (public.entry e
             JOIN public.charge c ON ((e.charge_id = c.charge_id)))
          WHERE (e.team_id = t.team_id)
          ORDER BY c.charge_date
         LIMIT 1) AS first_charge,
    ( SELECT sum(e.raised_dollars) AS sum
           FROM entryraised e
          WHERE (e.team_id = t.team_id)) AS raised_dollars,
    (( SELECT sum(e.raised_dollars) AS sum
           FROM entryraised e
          WHERE (e.team_id = t.team_id)) / (( SELECT count(*) AS count
           FROM public.entry e
          WHERE (e.team_id = t.team_id)))::double precision) AS dollars_per_entry
   FROM public.team t;


ALTER TABLE public.v_team OWNER TO elephant_charge;

--
-- Name: beneficiaries id; Type: DEFAULT; Schema: public; Owner: elephant_charge
--

ALTER TABLE ONLY public.beneficiaries ALTER COLUMN id SET DEFAULT nextval('public.beneficeries_id_seq'::regclass);


--
-- Name: car car_id; Type: DEFAULT; Schema: public; Owner: elephant_charge
--

ALTER TABLE ONLY public.car ALTER COLUMN car_id SET DEFAULT nextval('public.cars_id_seq'::regclass);


--
-- Name: charge charge_id; Type: DEFAULT; Schema: public; Owner: elephant_charge
--

ALTER TABLE ONLY public.charge ALTER COLUMN charge_id SET DEFAULT nextval('public.charges_id_seq'::regclass);


--
-- Name: charge_help_points id; Type: DEFAULT; Schema: public; Owner: elephant_charge
--

ALTER TABLE ONLY public.charge_help_points ALTER COLUMN id SET DEFAULT nextval('public.charge_help_points_id_seq'::regclass);


--
-- Name: checkin checkin_id; Type: DEFAULT; Schema: public; Owner: elephant_charge
--

ALTER TABLE ONLY public.checkin ALTER COLUMN checkin_id SET DEFAULT nextval('public.checkins_id_seq'::regclass);


--
-- Name: checkpoint checkpoint_id; Type: DEFAULT; Schema: public; Owner: elephant_charge
--

ALTER TABLE ONLY public.checkpoint ALTER COLUMN checkpoint_id SET DEFAULT nextval('public.guards_id_seq'::regclass);


--
-- Name: entry entry_id; Type: DEFAULT; Schema: public; Owner: elephant_charge
--

ALTER TABLE ONLY public.entry ALTER COLUMN entry_id SET DEFAULT nextval('public.entries_id_seq'::regclass);


--
-- Name: entry_leg entry_leg_id; Type: DEFAULT; Schema: public; Owner: elephant_charge
--

ALTER TABLE ONLY public.entry_leg ALTER COLUMN entry_leg_id SET DEFAULT nextval('public.entry_legs_id_seq'::regclass);


--
-- Name: gps_clean gps_clean_id; Type: DEFAULT; Schema: public; Owner: elephant_charge
--

ALTER TABLE ONLY public.gps_clean ALTER COLUMN gps_clean_id SET DEFAULT nextval('public.gps_cleans_id_seq'::regclass);


--
-- Name: gps_historic id; Type: DEFAULT; Schema: public; Owner: elephant_charge
--

ALTER TABLE ONLY public.gps_historic ALTER COLUMN id SET DEFAULT nextval('public.gps_historic_id_seq'::regclass);


--
-- Name: gps_stop gps_stop_id; Type: DEFAULT; Schema: public; Owner: elephant_charge
--

ALTER TABLE ONLY public.gps_stop ALTER COLUMN gps_stop_id SET DEFAULT nextval('public.gps_stops_id_seq'::regclass);


--
-- Name: grant grant_id; Type: DEFAULT; Schema: public; Owner: elephant_charge
--

ALTER TABLE ONLY public."grant" ALTER COLUMN grant_id SET DEFAULT nextval('public.grants_id_seq'::regclass);


--
-- Name: leg leg_id; Type: DEFAULT; Schema: public; Owner: elephant_charge
--

ALTER TABLE ONLY public.leg ALTER COLUMN leg_id SET DEFAULT nextval('public.legs_id_seq'::regclass);


--
-- Name: make make_id; Type: DEFAULT; Schema: public; Owner: elephant_charge
--

ALTER TABLE ONLY public.make ALTER COLUMN make_id SET DEFAULT nextval('public.makes_id_seq'::regclass);


--
-- Name: photos id; Type: DEFAULT; Schema: public; Owner: elephant_charge
--

ALTER TABLE ONLY public.photos ALTER COLUMN id SET DEFAULT nextval('public.entry_photos_id_seq'::regclass);


--
-- Name: sponsor sponsor_id; Type: DEFAULT; Schema: public; Owner: elephant_charge
--

ALTER TABLE ONLY public.sponsor ALTER COLUMN sponsor_id SET DEFAULT nextval('public.guard_sponsors_id_seq'::regclass);


--
-- Name: team team_id; Type: DEFAULT; Schema: public; Owner: elephant_charge
--

ALTER TABLE ONLY public.team ALTER COLUMN team_id SET DEFAULT nextval('public.teams_id_seq'::regclass);


--
-- Name: ar_internal_metadata ar_internal_metadata_pkey; Type: CONSTRAINT; Schema: public; Owner: elephant_charge
--

ALTER TABLE ONLY public.ar_internal_metadata
    ADD CONSTRAINT ar_internal_metadata_pkey PRIMARY KEY (key);


--
-- Name: award award_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.award
    ADD CONSTRAINT award_pkey PRIMARY KEY (award_id);


--
-- Name: car cars_pkey; Type: CONSTRAINT; Schema: public; Owner: elephant_charge
--

ALTER TABLE ONLY public.car
    ADD CONSTRAINT cars_pkey PRIMARY KEY (car_id);


--
-- Name: category category_pkey; Type: CONSTRAINT; Schema: public; Owner: elephant_charge
--

ALTER TABLE ONLY public.category
    ADD CONSTRAINT category_pkey PRIMARY KEY (category_id);


--
-- Name: charge_help_points charge_help_points_pkey; Type: CONSTRAINT; Schema: public; Owner: elephant_charge
--

ALTER TABLE ONLY public.charge_help_points
    ADD CONSTRAINT charge_help_points_pkey PRIMARY KEY (id);


--
-- Name: charge_sponsor charge_sponsor_pkey; Type: CONSTRAINT; Schema: public; Owner: elephant_charge
--

ALTER TABLE ONLY public.charge_sponsor
    ADD CONSTRAINT charge_sponsor_pkey PRIMARY KEY (charge_id, sponsor_id);


--
-- Name: charge charges_pkey; Type: CONSTRAINT; Schema: public; Owner: elephant_charge
--

ALTER TABLE ONLY public.charge
    ADD CONSTRAINT charges_pkey PRIMARY KEY (charge_id);


--
-- Name: class class_pkey; Type: CONSTRAINT; Schema: public; Owner: elephant_charge
--

ALTER TABLE ONLY public.class
    ADD CONSTRAINT class_pkey PRIMARY KEY (class_id);


--
-- Name: distance distance_pkey; Type: CONSTRAINT; Schema: public; Owner: elephant_charge
--

ALTER TABLE ONLY public.distance
    ADD CONSTRAINT distance_pkey PRIMARY KEY (distance_ref);


--
-- Name: entry entries_pkey; Type: CONSTRAINT; Schema: public; Owner: elephant_charge
--

ALTER TABLE ONLY public.entry
    ADD CONSTRAINT entries_pkey PRIMARY KEY (entry_id);


--
-- Name: entry_category entry_category_pkey; Type: CONSTRAINT; Schema: public; Owner: elephant_charge
--

ALTER TABLE ONLY public.entry_category
    ADD CONSTRAINT entry_category_pkey PRIMARY KEY (entry_id, category_id);


--
-- Name: entry_distance entry_distance_pkey; Type: CONSTRAINT; Schema: public; Owner: elephant_charge
--

ALTER TABLE ONLY public.entry_distance
    ADD CONSTRAINT entry_distance_pkey PRIMARY KEY (entry_id, distance_ref);


--
-- Name: entry_geometry entry_geometry_pkey; Type: CONSTRAINT; Schema: public; Owner: elephant_charge
--

ALTER TABLE ONLY public.entry_geometry
    ADD CONSTRAINT entry_geometry_pkey PRIMARY KEY (entry_id);


--
-- Name: sponsor guard_sponsors_pkey; Type: CONSTRAINT; Schema: public; Owner: elephant_charge
--

ALTER TABLE ONLY public.sponsor
    ADD CONSTRAINT guard_sponsors_pkey PRIMARY KEY (sponsor_id);


--
-- Name: checkpoint guards_pkey; Type: CONSTRAINT; Schema: public; Owner: elephant_charge
--

ALTER TABLE ONLY public.checkpoint
    ADD CONSTRAINT guards_pkey PRIMARY KEY (checkpoint_id);


--
-- Name: beneficiaries pk_beneficeries; Type: CONSTRAINT; Schema: public; Owner: elephant_charge
--

ALTER TABLE ONLY public.beneficiaries
    ADD CONSTRAINT pk_beneficeries PRIMARY KEY (id);


--
-- Name: checkin pk_checkins; Type: CONSTRAINT; Schema: public; Owner: elephant_charge
--

ALTER TABLE ONLY public.checkin
    ADD CONSTRAINT pk_checkins PRIMARY KEY (checkin_id);


--
-- Name: entry_leg pk_entry_legs; Type: CONSTRAINT; Schema: public; Owner: elephant_charge
--

ALTER TABLE ONLY public.entry_leg
    ADD CONSTRAINT pk_entry_legs PRIMARY KEY (entry_leg_id);


--
-- Name: photos pk_entry_photos; Type: CONSTRAINT; Schema: public; Owner: elephant_charge
--

ALTER TABLE ONLY public.photos
    ADD CONSTRAINT pk_entry_photos PRIMARY KEY (id);


--
-- Name: gps_clean pk_gps_cleans; Type: CONSTRAINT; Schema: public; Owner: elephant_charge
--

ALTER TABLE ONLY public.gps_clean
    ADD CONSTRAINT pk_gps_cleans PRIMARY KEY (gps_clean_id);


--
-- Name: gps_historic pk_gps_histroic; Type: CONSTRAINT; Schema: public; Owner: elephant_charge
--

ALTER TABLE ONLY public.gps_historic
    ADD CONSTRAINT pk_gps_histroic PRIMARY KEY (id);


--
-- Name: gps_raw pk_gps_raws2; Type: CONSTRAINT; Schema: public; Owner: elephant_charge
--

ALTER TABLE ONLY public.gps_raw
    ADD CONSTRAINT pk_gps_raws2 PRIMARY KEY (gps_raw_id);


--
-- Name: gps_stop pk_gps_stops; Type: CONSTRAINT; Schema: public; Owner: elephant_charge
--

ALTER TABLE ONLY public.gps_stop
    ADD CONSTRAINT pk_gps_stops PRIMARY KEY (gps_stop_id);


--
-- Name: grant pk_grants; Type: CONSTRAINT; Schema: public; Owner: elephant_charge
--

ALTER TABLE ONLY public."grant"
    ADD CONSTRAINT pk_grants PRIMARY KEY (grant_id);


--
-- Name: leg pk_legs; Type: CONSTRAINT; Schema: public; Owner: elephant_charge
--

ALTER TABLE ONLY public.leg
    ADD CONSTRAINT pk_legs PRIMARY KEY (leg_id);


--
-- Name: make pk_makes; Type: CONSTRAINT; Schema: public; Owner: elephant_charge
--

ALTER TABLE ONLY public.make
    ADD CONSTRAINT pk_makes PRIMARY KEY (make_id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: elephant_charge
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: team teams_pkey; Type: CONSTRAINT; Schema: public; Owner: elephant_charge
--

ALTER TABLE ONLY public.team
    ADD CONSTRAINT teams_pkey PRIMARY KEY (team_id);


--
-- Name: gps_raw_geom_idx; Type: INDEX; Schema: public; Owner: elephant_charge
--

CREATE INDEX gps_raw_geom_idx ON public.gps_raw USING gist (location);


--
-- Name: gps_stop_entry; Type: INDEX; Schema: public; Owner: elephant_charge
--

CREATE INDEX gps_stop_entry ON public.gps_stop USING btree (entry_id) WITH (deduplicate_items='true');


--
-- Name: index_charge_help_points_on_charge_id; Type: INDEX; Schema: public; Owner: elephant_charge
--

CREATE INDEX index_charge_help_points_on_charge_id ON public.charge_help_points USING btree (charge_id);


--
-- Name: index_entries_on_car_id; Type: INDEX; Schema: public; Owner: elephant_charge
--

CREATE INDEX index_entries_on_car_id ON public.entry USING btree (car_id);


--
-- Name: index_entries_on_charge_id; Type: INDEX; Schema: public; Owner: elephant_charge
--

CREATE INDEX index_entries_on_charge_id ON public.entry USING btree (charge_id);


--
-- Name: index_entries_on_team_id; Type: INDEX; Schema: public; Owner: elephant_charge
--

CREATE INDEX index_entries_on_team_id ON public.entry USING btree (team_id);


--
-- Name: index_guards_on_charge_id; Type: INDEX; Schema: public; Owner: elephant_charge
--

CREATE INDEX index_guards_on_charge_id ON public.checkpoint USING btree (charge_id);


--
-- Name: index_guards_on_guard_sponsor_id; Type: INDEX; Schema: public; Owner: elephant_charge
--

CREATE INDEX index_guards_on_guard_sponsor_id ON public.checkpoint USING btree (sponsor_id);


--
-- Name: indx_checkin_checkpoint_id; Type: INDEX; Schema: public; Owner: elephant_charge
--

CREATE INDEX indx_checkin_checkpoint_id ON public.checkin USING btree (checkpoint_id);


--
-- Name: indx_checkin_entry_id; Type: INDEX; Schema: public; Owner: elephant_charge
--

CREATE INDEX indx_checkin_entry_id ON public.checkin USING btree (entry_id);


--
-- Name: indx_entry_distance_entry_id; Type: INDEX; Schema: public; Owner: elephant_charge
--

CREATE INDEX indx_entry_distance_entry_id ON public.entry_distance USING btree (entry_id);


--
-- Name: indx_entry_leg_entry_id; Type: INDEX; Schema: public; Owner: elephant_charge
--

CREATE INDEX indx_entry_leg_entry_id ON public.entry_leg USING btree (entry_id);


--
-- Name: indx_entry_leg_leg_id; Type: INDEX; Schema: public; Owner: elephant_charge
--

CREATE INDEX indx_entry_leg_leg_id ON public.entry_leg USING btree (leg_id);


--
-- Name: indx_gps_clean_stop_id; Type: INDEX; Schema: public; Owner: elephant_charge
--

CREATE INDEX indx_gps_clean_stop_id ON public.gps_clean USING btree (stop_id) WITH (deduplicate_items='true');


--
-- Name: indx_gps_cleans_entry_id; Type: INDEX; Schema: public; Owner: elephant_charge
--

CREATE INDEX indx_gps_cleans_entry_id ON public.gps_clean USING btree (entry_id);


--
-- Name: indx_gps_raws_entry_id; Type: INDEX; Schema: public; Owner: elephant_charge
--

CREATE INDEX indx_gps_raws_entry_id ON public.gps_raw USING btree (entry_id);


--
-- Name: car fk_cars_makes; Type: FK CONSTRAINT; Schema: public; Owner: elephant_charge
--

ALTER TABLE ONLY public.car
    ADD CONSTRAINT fk_cars_makes FOREIGN KEY (make_id) REFERENCES public.make(make_id);


--
-- Name: charge fk_charge_bestguard; Type: FK CONSTRAINT; Schema: public; Owner: elephant_charge
--

ALTER TABLE ONLY public.charge
    ADD CONSTRAINT fk_charge_bestguard FOREIGN KEY (best_guard_id) REFERENCES public.checkpoint(checkpoint_id);


--
-- Name: charge_sponsor fk_charge_sponsors_charge; Type: FK CONSTRAINT; Schema: public; Owner: elephant_charge
--

ALTER TABLE ONLY public.charge_sponsor
    ADD CONSTRAINT fk_charge_sponsors_charge FOREIGN KEY (charge_id) REFERENCES public.charge(charge_id);


--
-- Name: charge_sponsor fk_charge_sponsors_sponsors; Type: FK CONSTRAINT; Schema: public; Owner: elephant_charge
--

ALTER TABLE ONLY public.charge_sponsor
    ADD CONSTRAINT fk_charge_sponsors_sponsors FOREIGN KEY (sponsor_id) REFERENCES public.sponsor(sponsor_id);


--
-- Name: charge fk_charges_shaftedentry; Type: FK CONSTRAINT; Schema: public; Owner: elephant_charge
--

ALTER TABLE ONLY public.charge
    ADD CONSTRAINT fk_charges_shaftedentry FOREIGN KEY (shafted_entry_id) REFERENCES public.entry(entry_id);


--
-- Name: charge fk_charges_tsetse1; Type: FK CONSTRAINT; Schema: public; Owner: elephant_charge
--

ALTER TABLE ONLY public.charge
    ADD CONSTRAINT fk_charges_tsetse1 FOREIGN KEY (tsetse1_leg_id) REFERENCES public.leg(leg_id);


--
-- Name: charge fk_charges_tsetse2; Type: FK CONSTRAINT; Schema: public; Owner: elephant_charge
--

ALTER TABLE ONLY public.charge
    ADD CONSTRAINT fk_charges_tsetse2 FOREIGN KEY (tsetse2_leg_id) REFERENCES public.leg(leg_id);


--
-- Name: checkin fk_checkin_entry; Type: FK CONSTRAINT; Schema: public; Owner: elephant_charge
--

ALTER TABLE ONLY public.checkin
    ADD CONSTRAINT fk_checkin_entry FOREIGN KEY (entry_id) REFERENCES public.entry(entry_id);


--
-- Name: checkin fk_checkin_gps_cleans; Type: FK CONSTRAINT; Schema: public; Owner: elephant_charge
--

ALTER TABLE ONLY public.checkin
    ADD CONSTRAINT fk_checkin_gps_cleans FOREIGN KEY (gps_clean_id) REFERENCES public.gps_clean(gps_clean_id);


--
-- Name: checkin fk_checkin_guard; Type: FK CONSTRAINT; Schema: public; Owner: elephant_charge
--

ALTER TABLE ONLY public.checkin
    ADD CONSTRAINT fk_checkin_guard FOREIGN KEY (checkpoint_id) REFERENCES public.checkpoint(checkpoint_id);


--
-- Name: entry fk_entry_class; Type: FK CONSTRAINT; Schema: public; Owner: elephant_charge
--

ALTER TABLE ONLY public.entry
    ADD CONSTRAINT fk_entry_class FOREIGN KEY (class_id) REFERENCES public.class(class_id) NOT VALID;


--
-- Name: entry_geometry fk_entry_geometry_entry; Type: FK CONSTRAINT; Schema: public; Owner: elephant_charge
--

ALTER TABLE ONLY public.entry_geometry
    ADD CONSTRAINT fk_entry_geometry_entry FOREIGN KEY (entry_id) REFERENCES public.entry(entry_id);


--
-- Name: entry_leg fk_entry_leg_checkin1; Type: FK CONSTRAINT; Schema: public; Owner: elephant_charge
--

ALTER TABLE ONLY public.entry_leg
    ADD CONSTRAINT fk_entry_leg_checkin1 FOREIGN KEY (checkin1_id) REFERENCES public.checkin(checkin_id);


--
-- Name: entry_leg fk_entry_leg_checkin2; Type: FK CONSTRAINT; Schema: public; Owner: elephant_charge
--

ALTER TABLE ONLY public.entry_leg
    ADD CONSTRAINT fk_entry_leg_checkin2 FOREIGN KEY (checkin2_id) REFERENCES public.checkin(checkin_id);


--
-- Name: entry_leg fk_entry_legs_entry; Type: FK CONSTRAINT; Schema: public; Owner: elephant_charge
--

ALTER TABLE ONLY public.entry_leg
    ADD CONSTRAINT fk_entry_legs_entry FOREIGN KEY (entry_id) REFERENCES public.entry(entry_id);


--
-- Name: entry_leg fk_entry_legs_leg; Type: FK CONSTRAINT; Schema: public; Owner: elephant_charge
--

ALTER TABLE ONLY public.entry_leg
    ADD CONSTRAINT fk_entry_legs_leg FOREIGN KEY (leg_id) REFERENCES public.leg(leg_id);


--
-- Name: entry fk_entry_start_cp_id; Type: FK CONSTRAINT; Schema: public; Owner: elephant_charge
--

ALTER TABLE ONLY public.entry
    ADD CONSTRAINT fk_entry_start_cp_id FOREIGN KEY (starting_checkpoint_id) REFERENCES public.checkpoint(checkpoint_id) NOT VALID;


--
-- Name: gps_clean fk_gps_cleans_entries; Type: FK CONSTRAINT; Schema: public; Owner: elephant_charge
--

ALTER TABLE ONLY public.gps_clean
    ADD CONSTRAINT fk_gps_cleans_entries FOREIGN KEY (entry_id) REFERENCES public.entry(entry_id);


--
-- Name: gps_clean fk_gps_cleans_entry_leg; Type: FK CONSTRAINT; Schema: public; Owner: elephant_charge
--

ALTER TABLE ONLY public.gps_clean
    ADD CONSTRAINT fk_gps_cleans_entry_leg FOREIGN KEY (entry_leg_id) REFERENCES public.entry_leg(entry_leg_id);


--
-- Name: gps_clean fk_gps_cleans_gps_stops; Type: FK CONSTRAINT; Schema: public; Owner: elephant_charge
--

ALTER TABLE ONLY public.gps_clean
    ADD CONSTRAINT fk_gps_cleans_gps_stops FOREIGN KEY (stop_id) REFERENCES public.gps_stop(gps_stop_id);


--
-- Name: gps_raw fk_gps_raws_entries2; Type: FK CONSTRAINT; Schema: public; Owner: elephant_charge
--

ALTER TABLE ONLY public.gps_raw
    ADD CONSTRAINT fk_gps_raws_entries2 FOREIGN KEY (entry_id) REFERENCES public.entry(entry_id);


--
-- Name: gps_stop fk_gps_stops_entries; Type: FK CONSTRAINT; Schema: public; Owner: elephant_charge
--

ALTER TABLE ONLY public.gps_stop
    ADD CONSTRAINT fk_gps_stops_entries FOREIGN KEY (entry_id) REFERENCES public.entry(entry_id);


--
-- Name: grant fk_grants_beneficeries; Type: FK CONSTRAINT; Schema: public; Owner: elephant_charge
--

ALTER TABLE ONLY public."grant"
    ADD CONSTRAINT fk_grants_beneficeries FOREIGN KEY (beneficiary_id) REFERENCES public.beneficiaries(id);


--
-- Name: grant fk_grants_charges; Type: FK CONSTRAINT; Schema: public; Owner: elephant_charge
--

ALTER TABLE ONLY public."grant"
    ADD CONSTRAINT fk_grants_charges FOREIGN KEY (charge_id) REFERENCES public.charge(charge_id);


--
-- Name: leg fk_legs_guards1; Type: FK CONSTRAINT; Schema: public; Owner: elephant_charge
--

ALTER TABLE ONLY public.leg
    ADD CONSTRAINT fk_legs_guards1 FOREIGN KEY (checkpoint1_id) REFERENCES public.checkpoint(checkpoint_id);


--
-- Name: leg fk_legs_guards2; Type: FK CONSTRAINT; Schema: public; Owner: elephant_charge
--

ALTER TABLE ONLY public.leg
    ADD CONSTRAINT fk_legs_guards2 FOREIGN KEY (checkpoint2_id) REFERENCES public.checkpoint(checkpoint_id);


--
-- Name: checkpoint fk_rails_41012a5173; Type: FK CONSTRAINT; Schema: public; Owner: elephant_charge
--

ALTER TABLE ONLY public.checkpoint
    ADD CONSTRAINT fk_rails_41012a5173 FOREIGN KEY (sponsor_id) REFERENCES public.sponsor(sponsor_id);


--
-- Name: entry fk_rails_8069469873; Type: FK CONSTRAINT; Schema: public; Owner: elephant_charge
--

ALTER TABLE ONLY public.entry
    ADD CONSTRAINT fk_rails_8069469873 FOREIGN KEY (car_id) REFERENCES public.car(car_id);


--
-- Name: checkpoint fk_rails_867149c68d; Type: FK CONSTRAINT; Schema: public; Owner: elephant_charge
--

ALTER TABLE ONLY public.checkpoint
    ADD CONSTRAINT fk_rails_867149c68d FOREIGN KEY (charge_id) REFERENCES public.charge(charge_id);


--
-- Name: entry fk_rails_9e5fcf2529; Type: FK CONSTRAINT; Schema: public; Owner: elephant_charge
--

ALTER TABLE ONLY public.entry
    ADD CONSTRAINT fk_rails_9e5fcf2529 FOREIGN KEY (charge_id) REFERENCES public.charge(charge_id);


--
-- Name: charge_help_points fk_rails_c72e667370; Type: FK CONSTRAINT; Schema: public; Owner: elephant_charge
--

ALTER TABLE ONLY public.charge_help_points
    ADD CONSTRAINT fk_rails_c72e667370 FOREIGN KEY (charge_id) REFERENCES public.charge(charge_id);


--
-- Name: entry fk_rails_f0fbcbbb17; Type: FK CONSTRAINT; Schema: public; Owner: elephant_charge
--

ALTER TABLE ONLY public.entry
    ADD CONSTRAINT fk_rails_f0fbcbbb17 FOREIGN KEY (team_id) REFERENCES public.team(team_id);


--
-- PostgreSQL database dump complete
--

