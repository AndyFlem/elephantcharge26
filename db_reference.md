# charge23 Database Reference

PostgreSQL 14 on localhost:5432, user=postgres, db=charge23. Owner: elephant_charge.

---

## Table Row Counts

| Table | Rows | Notes |
|---|---|---|
| ar_internal_metadata | 1 | Rails internal |
| award | 11 | Award definitions |
| beneficiaries | 26 | Conservation orgs receiving grants |
| car | 115 | Vehicles used in charges |
| category | 4 | Entry categories |
| charge | 18 | Annual charge events (2008–2025) |
| charge_help_points | 172 | Map help point locations |
| charge_sponsor | 90 | Charge-sponsor linkage |
| checkin | 3,472 | GPS-matched checkpoint visits |
| checkpoint | 178 | Named checkpoints per charge |
| class | 2 | Car vs Bikes |
| distance | 10 | Distance metric definitions |
| entry | 395 | Race entries |
| entry_category | 162 | Entry ↔ category M:M |
| entry_distance | 2,481 | Computed distances per entry |
| entry_geometry | 395 | GPS line geometry per entry |
| entry_leg | 3,097 | Timed leg segments per entry |
| gps_clean | 859,976 | Cleaned GPS points |
| gps_historic | 789,026 | Legacy GPS points (raw lat/lon, charge year as text) |
| gps_raw | 1,924,044 | Raw GPS points |
| gps_stop | 27,679 | Detected stop segments |
| grant | 137 | Grants to beneficiaries |
| leg | 385 | Route legs between checkpoints |
| make | 13 | Car manufacturers |
| photos | 3,043 | Photos (polymorphic: Entry or Charge) |
| schema_migrations | 36 | Rails migrations |
| spatial_ref_sys | 8,500 | PostGIS reference (system) |
| sponsor | 109 | Sponsors of checkpoints/charges |
| team | 99 | Competing teams |

---

## Views

| View | Purpose |
|---|---|
| v_award | Awards joined with class, category, sponsor |
| v_car | Cars with make, entry count, team count, last charge |
| v_charge | Charges with checkpoint count, entry counts, fundraising totals |
| v_checkin | Checkins joined with checkpoint + sponsor name |
| v_checkpoint | Checkpoints with sponsor name, starters/checkins counts, GeoJSON location |
| v_distanceawardresults | Distance award eligibility results (all entries per award) |
| v_entry | Full entry view with team, car, class, charge, distances, categories |
| v_entry_category | entry_category joined with category names |
| v_entry_distance | entry_distance joined with distance names and charge_id |
| v_entry_leg | entry_leg with leg, checkpoint, sponsor names, speed, ranking |
| v_gps_raw | gps_raw with GeoJSON x/y projected coords (no raw geometry blob) |
| v_leg | Legs with checkpoint/sponsor names, entry count, GeoJSON locations |
| v_pledgeawardresults | Pledge award eligibility results (all entries ranked by sponsorship) |
| v_sponsor | Sponsors with checkpoint count, charge count |
| v_team | Teams with entry/completion counts, first/last charge, fundraising |

---

## View Details

> **Note on permissions:** `v_award`, `v_distanceawardresults`, and `v_pledgeawardresults` fail when queried as the `postgres` user because the view owner (`elephant_charge`) lacks SELECT on the `award` table (owned by `postgres`). Query these by reconstructing the join directly, or grant `elephant_charge` SELECT on `award`.

---

### v_charge

**Columns from `charge` plus computed aggregates:**

| Column | Notes |
|---|---|
| charge_id … kml | All base charge columns; map_center as GeoJSON string |
| charge_complete | `true` when charge_date ≤ today |
| checkpoint_count | Number of checkpoints for this charge |
| entry_count | Total entries |
| entry_completed_count | Entries with result_status = 'COMPLETE' |
| entry_completed_pct | completed / total (0–1) |
| raised_local | Sum of entry.raised_local (ZMW) |
| raised_dollars | raised_local / exchange_rate |
| dollars_per_entry | raised_dollars / entry_count |
| new_teams_count | Entries with category NEW |

**Sample rows (selected):**

| charge_ref | location | entries | completed | completed_pct | raised_dollars | new_teams |
|---|---|---|---|---|---|---|
| 2008 | Mitaba River | 9 | 7 | 78% | $2,000 | 9 |
| 2016 | Chongwe River | 18 | 7 | 39% | $63,205 | 4 |
| 2019 | Nankanga Hill | 28 | 20 | 71% | $139,193 | 5 |
| 2021 | Matakula | 34 | 22 | 65% | $239,096 | 4 |
| 2023 | Funswer River | 27 | 17 | 63% | $175,415 | 0 |
| 2024 | Lower Mukwisi | 24 | 17 | 71% | $156,168 | 6 |
| 2025 | Chipongwe | 24 | 9 | 38% | $121,038 | 9 |

Trend: entries grew from 9 (2008) to 34 (2021), dollars raised grew from $2k to $239k. Completion rates vary 27–80%.

---

### v_award

Joins `award` with `class`, `category`, and `sponsor`. Used to display the awards list.

| Column | Source |
|---|---|
| award_id, type_ref, distance_ref, name, sort_result_status, ordinal | award |
| class_ref, class_name | class (LEFT JOIN) |
| category_ref, category | category (LEFT JOIN) |
| sponsor_name | sponsor (LEFT JOIN) |

All 11 awards, none have a named sponsor in current data (sponsor_id is null for all). See award table for full data.

> **Query workaround** (postgres user): Run the JOIN directly — `SELECT a.*, cl.class_ref, cat.category_ref, sp.sponsor_name FROM award a LEFT JOIN class cl ... LEFT JOIN category cat ... LEFT JOIN sponsor sp ...`

---

### v_car

Joins `car` with `make` and adds computed counts from `entry`.

| Column | Notes |
|---|---|
| car_id, car_name, model, colour, year, make_id, registration | from car |
| make | from make |
| entry_count | total entries this car has been used in |
| team_count | distinct teams that have used this car |
| last_charge | charge_ref of most recent charge this car entered |

**Most-entered cars (as of 2025):**

| car_name | make | entry_count | team_count | last_charge |
|---|---|---|---|---|
| The Camel | Landrover | 17 | 1 | 2025 |
| Daisy | Toyota | 15 | 2 | 2025 |
| Dave's Jeep | Jeep | 14 | 1 | 2025 |
| Monster Surf | Toyota | 11 | 1 | 2025 |
| Green Mamba | Toyota | 12 | 1 | 2025 |

---

### v_checkin

Joins `checkin` with `checkpoint` and `sponsor` to add human-readable names.

| Column | Notes |
|---|---|
| checkin_id, entry_id, checkpoint_id, gps_clean_id, checkin_number, checkin_timestamp, distance_m | from checkin |
| is_gauntlet | from checkpoint |
| sponsor_name | from sponsor (= checkpoint name) |

**Example — entry 22 (Camel, 2016), 11 checkins:**

| # | sponsor_name | is_gauntlet | timestamp |
|---|---|---|---|
| 1 | South City Church | f | 07:10:36 |
| 2 | Leopards Hill Memorial Park | f | 07:39:55 |
| 3 | Omnia | f | 08:43:45 |
| 6 | NWK | t | 12:07:14 |
| 7 | Maxxis | t | 13:05:14 |
| 8 | Royal Air Charters | t | 13:52:57 |
| 11 | South City Church | f | 14:52:20 |

---

### v_checkpoint

Enriched checkpoint view — the main way to query checkpoints.

| Column | Notes |
|---|---|
| checkpoint_id, is_gauntlet, sponsor_id, charge_id, radius_m, elevation | from checkpoint |
| charge_ref, charge_date | from charge |
| sponsor_name, short_name | from sponsor |
| starters_count | entries that started from this checkpoint |
| checkins_count | total checkins recorded at this checkpoint |
| located | true if location is not null |
| location | GeoJSON Point (WGS84) |
| location_prj | GeoJSON Point (EPSG:3857) |
| location_kml | KML representation |

**2016 checkpoints:**

| sponsor_name | is_gauntlet | radius_m | elevation | starters | checkins |
|---|---|---|---|---|---|
| AON | f | 30 | 1107 | 3 | 16 |
| Afgri Zambia | f | 30 | 1004 | 6 | 19 |
| South City Church | f | 30 | 975 | 6 | 18 |
| Maxxis | t | 15 | 963 | 0 | 15 |
| NWK | t | 30 | 960 | 0 | 15 |
| Royal Air Charters | t | 15 | 960 | 0 | 15 |

---

### v_entry

The primary view for working with race entries. Joins entry with team, class, charge, car, make, entry_geometry, and sub-selects distances and categories.

**Key computed columns (in addition to all entry columns):**

| Column | Notes |
|---|---|
| charge_name, charge_ref | from charge |
| class_id, class_name | from class |
| raised_dollars | raised_local / exchange_rate |
| distance_total | entry_distance WHERE distance_ref='TOTAL' |
| distance_total_competition | entry_distance WHERE distance_ref='TOTAL_COMPETITION' |
| distance_net | entry_distance WHERE distance_ref='NET' |
| categories | comma-separated category names (e.g. "International, New team") |
| category_ids | comma-separated category IDs |
| raws_count, cleans_count, stops_count, raws_from, raws_to | from entry_geometry |
| leg_count | count of entry_leg rows |
| color | from team |
| car_name, year, model, colour | from car |
| make | from make |

**Example — 2023 leaderboard by net distance (top 5):**

| car_no | entry_name | result_status | distance_net | distance_total_competition | raised_dollars |
|---|---|---|---|---|---|
| 18 | Autoworld | COMPLETE | -214,956 m | 47,417 m | $25,350 |
| 34 | Sky Trails | COMPLETE | -93,610 m | 43,010 m | $13,200 |
| 48 | Team Popcorn 1 | COMPLETE | -55,004 m | 34,213 m | $8,620 |
| 43 | Team Popcorn 3 | COMPLETE | -50,887 m | 38,330 m | $8,620 |
| 33 | Lilayi BSI Steel | COMPLETE | -50,468 m | 53,032 m | $10,000 |

*Negative net distance means total fundraising penalty reduced the effective distance below zero.*

---

### v_entry_category

Simple join of `entry_category` with `category` to add category names.

| Column | Notes |
|---|---|
| entry_id, category_id | from entry_category |
| category_ref, category | from category |

Used to display which categories (International, Ladies, New, Electric) an entry belongs to. An entry can have multiple rows (multiple categories).

---

### v_entry_distance

Joins `entry_distance` with `distance` (for labels) and `entry` (for charge_id).

| Column | Notes |
|---|---|
| entry_id, distance_ref, distance_m | from entry_distance |
| distance_name, is_calculated | from distance |
| charge_id | from entry |

**Example — entry 22 (Camel, 2016):**

| distance_ref | distance_m | distance_name | is_calculated |
|---|---|---|---|
| GAUNTLET | 616 m | Gauntlet measured | false |
| GAUNTLET_COMPETITION | 3,080 m | Gauntlet competition distance | true |
| NET | 17,824 m | Net Distance | true |
| NON_GAUNTLET | 24,744 m | Non-gauntlet measured | false |
| TOTAL | 25,360 m | Total measured | false |
| TOTAL_COMPETITION | 27,824 m | Competition distance | true |
| TSETSE_1 | 5,045 m | Tsetse 1 | false |
| TSETSE_2 | 3,212 m | Tsetse 2 | false |

---

### v_entry_leg

The richest leg view — joins entry_leg with entry, class, leg, both checkins, both checkpoints, both sponsors, and charge. Adds window functions for ranking and speed.

**Key columns beyond entry_leg base:**

| Column | Notes |
|---|---|
| car_no, entry_name | from entry |
| class | from class |
| is_gauntlet, is_tsetse | from leg |
| straight_distance_m | leg.distance_m (straight-line) |
| distance_multiple | actual GPS distance / straight-line distance (>1 = detour) |
| speed | km/h = (distance_m/1000) / (elapsed_s/3600) |
| checkpoint1_name, checkpoint2_name | sponsor names |
| start_time, end_time | checkin timestamps |
| leg_position | RANK() over leg_id ordered by distance_m (1 = shortest = best) |
| leg_entries | total entries that ran this leg |
| charge_id | from charge |

**Example — entry 22 (Camel) legs for 2016:**

| leg_no | checkpoint1→2 | dist_m | elapsed_s | is_gauntlet | is_tsetse | distance_multiple |
|---|---|---|---|---|---|---|
| 1 | South City → LHMP | 2,855 | 1,759 s | f | f | 1.10× |
| 2 | LHMP → Omnia | 3,212 | 3,830 s | f | t | 1.12× |
| 6 | NWK → Maxxis | 260 | 3,480 s | t | f | 1.33× |
| 9 | Kwik Fit → Afgri | 5,045 | 1,247 s | f | t | 1.74× |

---

### v_leg

Joins `leg` with both checkpoints and their sponsors. Adds GeoJSON geometry for both endpoints and entry count.

| Column | Notes |
|---|---|
| leg_id, checkpoint1_id, checkpoint2_id, distance_m, is_gauntlet, is_tsetse | from leg |
| charge_id | from checkpoint1 |
| checkpoint1_name, checkpoint2_name | sponsor names |
| entry_count | how many entry_legs use this leg |
| checkpoint1_location, checkpoint2_location | GeoJSON Points |

**2016 legs (most used):**

| checkpoint1_name | checkpoint2_name | dist_m | is_gauntlet | is_tsetse | entries |
|---|---|---|---|---|---|
| South City Church | LHMP | 2,600 | f | f | 14 |
| AON | National Milling | 2,508 | f | f | 14 |
| Afgri Zambia | Kwik Fit | 2,898 | f | t | 14 |
| Leopards Hill → Omnia | — | 2,867 | f | t | 13 |
| Maxxis | Royal Air Charters | 217 | t | f | 12 |

---

### v_sponsor

Enriches `sponsor` with computed counts from checkpoint and charge_sponsor.

| Column | Notes |
|---|---|
| sponsor_id, sponsor_name, sponsor_ref, short_name, website, logo_file_name, email | from sponsor |
| checkpoint_count | number of checkpoints this sponsor has had |
| charge_count | number of charges this sponsor appears in charge_sponsor |

**Most-checkpointed sponsors:**

| sponsor_name | checkpoint_count | charge_count |
|---|---|---|
| National Milling (NMC) | 13 | 0 |
| Leopards Hill Memorial Park | 11 | 0 |
| Omnia | 11 | 0 |
| Country Choice Chicken | 6 | 0 |
| Maxxis | 6 | 1 |
| NWK | 6 | 0 |

---

### v_team

Computes team statistics across all charges.

| Column | Notes |
|---|---|
| team_id, team_name, captain, badge_file_name, team_ref, website, email, color | from team |
| entry_count | total entries across all charges |
| completed_count | entries with result_status = 'COMPLETE' |
| last_charge / first_charge | charge_ref of most recent / earliest entry |
| raised_dollars | total USD raised across all entries |
| dollars_per_entry | raised_dollars / entry_count |

**Most experienced teams:**

| team_name | entries | completed | first → last | raised_dollars |
|---|---|---|---|---|
| Camel | 17 | 15 | 2008 → 2025 | $41,524 |
| Autoworld | 16 | 10 | 2010 → 2025 | $328,505 |
| Sausage Tree | 15 | 9 | 2009 → 2025 | $59,610 |
| Mudhogs | 15 | 11 | 2009 → 2023 | $41,463 |
| Khal Amazi | 14 | 9 | 2008 → 2021 | $239,383 |

---

### v_gps_raw

Replaces the raw PostGIS geometry columns with GeoJSON and x/y coordinate floats, making it easier to consume without PostGIS client support.

| Column | Notes |
|---|---|
| gps_raw_id, entry_id, gps_timestamp, distance_m, speed_kmh, azimuth_deg, elapsed_s | from gps_raw (same) |
| location | ST_AsGeoJSON(location_prj) — EPSG:3857 as GeoJSON string |
| x | ST_X(location_prj) — easting in metres |
| y | ST_Y(location_prj) — northing in metres |

The raw geography column (`location` in gps_raw, WGS84) and the original `location_prj` geometry are not exposed — only the projected GeoJSON and x/y scalars. Coordinates are EPSG:3857 (Web Mercator), not WGS84 lat/lon.

---

### v_distanceawardresults

Returns all entry-award pairs for DISTANCE-type awards. One row per eligible entry per award — all entries are included, not just the winner. Sort by `distance_m ASC` to find the winner (shortest distance wins).

| Column | Notes |
|---|---|
| award_id | which award |
| charge_id, entry_id, car_no, entry_name, result_status | entry details |
| raised_dollars, categories | from v_entry |
| distance_total, distance_total_competition, distance_net | distances from v_entry |
| processing_status, leg_count | from v_entry |
| ed.distance_ref, ed.distance_m | the specific distance this award judges |
| class_ref, class_name | from class (NULL if award applies to all classes) |
| category_ref, category | from category (NULL if award applies to all categories) |

Eligible entries match award's class_id (or NULL = all classes) AND category (or NULL = all categories). Filter to a specific charge by joining through entry.

> **Query workaround**: Reconstruct the JOIN manually, filtering `aw.type_ref='DISTANCE'` and `e.charge_id=N`.

---

### v_pledgeawardresults

Equivalent to v_distanceawardresults but for PLEDGE-type awards (fundraising). Sort by `raised_dollars DESC` to find winner. Columns are the same except no `distance_ref`/`distance_m` columns.

| Column | Notes |
|---|---|
| award_id, charge_id, entry_id, car_no, entry_name, result_status | entry details |
| raised_dollars, categories | key fields |
| distance_total, distance_total_competition, distance_net, processing_status, leg_count | context |
| class_ref, class_name, category_ref, category | award filter dimensions |

**Example — 2023 pledge rankings (top 3):**

| entry_name | result_status | raised_dollars |
|---|---|---|
| Autoworld | COMPLETE | $25,350 |
| Sky Trails | COMPLETE | $13,200 |
| Almost There | DNF 5 | $11,500 |

---

## Domain Overview

The Elephant Charge is an annual off-road charity fundraising event in Zambia. Teams drive 4x4s or bikes through bush to visit checkpoints in any order, minimising distance travelled. Proceeds go to conservation NGOs.

**Core flow:** `charge` → `checkpoint` → `leg` (between checkpoints) → `entry` → `checkin` (GPS-matched checkpoint visits) → `entry_leg` (timed segment between two consecutive checkins)

**GPS pipeline:** GPS device → `gps_raw` → cleaned → `gps_clean` → stops detected → `gps_stop` → checkins computed → `checkin` → legs computed → `entry_leg` → distances → `entry_distance`

---

## Key Tables

### charge (18 rows — 2008 to 2025)

Each row is one annual Elephant Charge event.

| Column | Type | Notes |
|---|---|---|
| charge_id | int PK | |
| charge_ref | varchar(25) | Year string e.g. "2024" |
| charge_name | varchar | Full name including sponsors |
| charge_date | date | Race day |
| location | varchar | Geographical location name |
| gauntlet_multiplier | int | Penalty multiplier for gauntlet checkpoints (usually 3, 5 for 2016) |
| exchange_rate | float | ZMW per USD at time of event |
| m_per_local | float | Metres per local currency unit (for legacy distance calc) |
| map_center | geometry(Point,4326) | Map centre point |
| start_time / end_time | timetz | Official start/end times |
| spirit_entry_id | int → entry | Spirit of the Charge award |
| spirit_name / spirit_description | varchar | Spirit award details |
| best_guard_id | int → checkpoint | Best checkpoint award |
| shafted_entry_id | int → entry | "Shafted" award |
| shafted_description | varchar | Why shafted |
| tsetse1_leg_id / tsetse2_leg_id | int → leg | Special tsetse fly legs |
| kml | varchar | KML file path |

**Sample charges:**

| charge_ref | charge_name | location | entries | exchange_rate |
|---|---|---|---|---|
| 2008 | Elephant Charge 2008 | Mitaba River | — | 4.5 |
| 2016 | K2 & Lendor Burton Elephant Charge 2016 | Chongwe River | ~18 | 10 |
| 2019 | Fuchs Elephant Charge 2019 | Nankanga Hill | — | 13.18 |
| 2023 | Fuchs Elephant Charge 2023 | Funswer River | — | 20.7 |
| 2024 | Fuchs Elephant Charge 2024 | Lower Mukwisi | — | 26 |
| 2025 | Elephant Charge 2025 | Chipongwe | — | 23.5 |

---

### class (2 rows)

| class_id | class_ref | class_name |
|---|---|---|
| 1 | UNMODIFIED | Car |
| 2 | BIKES | Bikes |

---

### category (4 rows)

| category_id | category_ref | category |
|---|---|---|
| 1 | INTERNATIONAL | International |
| 2 | LADIES | Ladies |
| 3 | NEW | New team |
| 4 | ELECTRIC | Electric car |

---

### distance (10 rows)

| distance_ref | distance_name | is_calculated |
|---|---|---|
| TOTAL | Total measured | false |
| GAUNTLET | Gauntlet measured | false |
| NON_GAUNTLET | Non-gauntlet measured | false |
| TSETSE_1 | Tsetse 1 | false |
| TSETSE_2 | Tsetse 2 | false |
| GAUNTLET_PENALTIES | Gauntlet penalties | true |
| PENALTIES | Penalties | true |
| GAUNTLET_COMPETITION | Gauntlet competition distance | true |
| TOTAL_COMPETITION | Competition distance | true |
| NET | Net Distance | true |

**Competition distance** = non-gauntlet + (gauntlet × gauntlet_multiplier)
**Net distance** = competition distance minus penalties

---

### entry (395 rows)

One row per team per charge.

| Column | Type | Notes |
|---|---|---|
| entry_id | int PK | |
| car_no | int | Race number for that charge |
| charge_id | int → charge | |
| team_id | int → team | |
| car_id | int → car | |
| class_id | int → class | |
| entry_name | varchar | Name used for this entry |
| captain | varchar | Captain name |
| members | varchar | Crew list |
| raised_local | int | Sponsorship in ZMW |
| dist_best | int | Best distance (metres) — legacy field |
| dist_penalty_gauntlet | int | Gauntlet distance penalty (m) |
| dist_penalty_nongauntlet | int | Non-gauntlet distance penalty (m) |
| result_status | varchar | COMPLETE / DNF N (N = checkpoints reached) |
| processing_status | varchar | GPS processing state |
| checkins_consistent | bool | Whether GPS checkins are self-consistent |
| gps_source_ref | varchar | GPS device type |
| geotab_device_id | bigint | GeoTab device ID |
| imei | varchar | Device IMEI |
| starting_checkpoint_id | int → checkpoint | Starting point |
| gps_offset_days | bigint | Correction offset for GPS clock |
| complete_per_card | bool | Whether manually marked complete via card |
| kml | varchar | KML path |

**result_status** examples: `COMPLETE`, `DNF 9`, `DNF 5`, `DNF 1`

---

### checkpoint (178 rows)

Named waypoints for a given charge, sponsored by a company.

| Column | Type | Notes |
|---|---|---|
| checkpoint_id | int PK | |
| charge_id | int → charge | |
| sponsor_id | int → sponsor | Sponsor name = checkpoint name |
| is_gauntlet | bool | Gauntlet checkpoints carry distance penalties |
| radius_m | int | Detection radius (typically 15–30m) |
| elevation | int | Metres above sea level |
| location | geometry(Point,4326) | WGS84 position |
| location_prj | geometry(Point,3857) | Web Mercator projected |

---

### leg (385 rows)

Straight-line route segment between two checkpoints.

| Column | Type | Notes |
|---|---|---|
| leg_id | int PK | |
| checkpoint1_id | int → checkpoint | |
| checkpoint2_id | int → checkpoint | |
| distance_m | int | Straight-line distance |
| is_gauntlet | bool | Both endpoints are gauntlet? |
| is_tsetse | bool | Tsetse fly special leg |

---

### checkin (3,472 rows)

GPS-matched record of an entry visiting a checkpoint.

| Column | Type | Notes |
|---|---|---|
| checkin_id | int PK | |
| entry_id | int → entry | |
| checkpoint_id | int → checkpoint | |
| checkin_number | int | Sequence within entry |
| checkin_timestamp | timestamptz | When they arrived |
| gps_clean_id | int → gps_clean | GPS point that triggered checkin |
| distance_m | bigint | Distance from GPS point to checkpoint centre |

---

### entry_leg (3,097 rows)

Timed segment between two consecutive checkins for an entry.

| Column | Type | Notes |
|---|---|---|
| entry_leg_id | int PK | |
| entry_id | int → entry | |
| leg_id | int → leg | Route leg travelled |
| checkin1_id | int → checkin | Start checkin |
| checkin2_id | int → checkin | End checkin |
| leg_no | int | Sequence number |
| direction_forward | bool | True = checkpoint1→checkpoint2 |
| distance_m | int | GPS-measured distance (metres) |
| elapsed_s | int | Time taken (seconds) |
| leg_line | geography | GPS track line |
| leg_line_proj | geometry(LineString,3857) | Projected track |

---

### entry_distance (2,481 rows)

Computed distance totals per entry per distance type.

| Column | Type | Notes |
|---|---|---|
| entry_id | int → entry | |
| distance_ref | varchar → distance | |
| distance_m | bigint | Distance in metres |

---

### entry_geometry (395 rows)

Full GPS track geometry per entry.

| Column | Type | Notes |
|---|---|---|
| entry_id | int PK → entry | |
| raw_line | geometry(LineString,4326) | Full raw GPS track |
| clean_line | geometry(LineString,4326) | Cleaned GPS track |
| raw_line_kml / raw_line_json | text | Serialised geometry |
| clean_line_kml / clean_line_json | text | Serialised geometry |
| raws_count | int | GPS raw point count |
| cleans_count | int | GPS clean point count |
| stops_count | int | Stop count |
| raws_from / raws_to | timestamptz | GPS time range |

---

### team (99 rows)

| Column | Notes |
|---|---|
| team_id | PK |
| team_name | Display name |
| team_ref | Short slug |
| captain | Current captain |
| color | Hex colour for map display |
| badge_file_name | Logo image |
| website / email | Contact |

---

### car (115 rows)

| Column | Notes |
|---|---|
| car_id | PK |
| car_name | Nickname |
| model | Model string |
| make_id → make | |
| colour | |
| year | Build year |
| registration | Plate |

---

### make (13 rows)

Isuzu, Diahatsu, Jeep, Mercedes, Bikes, Range Rover, Landrover, Toyota, Nissan, Honda, Mitsubishi, Pinzgaur, Custom

---

### sponsor (109 rows)

Sponsors own checkpoints. Key columns: sponsor_id, sponsor_name, short_name, sponsor_ref, website, logo_file_name, email.

---

### award (11 rows)

| award_id | type_ref | name | distance_ref | class_ref | category_ref | ordinal |
|---|---|---|---|---|---|---|
| 5 | DISTANCE | Autoworld Trophy - Shortest Net Distance | NET | — | — | 1 |
| 8 | PLEDGE | Sausage Tree Trophy - Most Sponsorship Raised | — | — | — | 2 |
| 1 | DISTANCE | Castle Fleming Trophy - Shortrest Distance by a Car Team | TOTAL_COMPETITION | UNMODIFIED | — | 3 |
| 3 | DISTANCE | Silky Cup - Shortrest Distance by a Ladies Team | TOTAL_COMPETITION | UNMODIFIED | LADIES | 4 |
| 9 | DISTANCE | Brynn Morgan Trophy - Shortest Distance by an International Team | TOTAL_COMPETITION | — | INTERNATIONAL | 5 |
| 10 | DISTANCE | Shortest Distance by a New Team | TOTAL_COMPETITION | — | NEW | 6 |
| 11 | DISTANCE | Shortest Distance by an Electric Vehicle | TOTAL_COMPETITION | — | ELECTRIC | 7 |
| 2 | DISTANCE | Dean Cup - Shortrest Distance by a Bike Team | TOTAL_COMPETITION | BIKES | — | 7 |
| 4 | DISTANCE | Bowden Trophy - Shortest Gauntlet Distance | GAUNTLET_COMPETITION | UNMODIFIED | — | 8 |
| 6 | DISTANCE | Sancturary Trophy - Shortest Distance on Tsetse Line 1 | TSETSE_1 | UNMODIFIED | — | 9 |
| 7 | DISTANCE | Khal Amzi Trophy - Shortest Distance on Tsetse Line 2 | TSETSE_2 | UNMODIFIED | — | 10 |

Award winner = entry with shortest `distance_m` (for DISTANCE type) or highest `raised_local` (for PLEDGE type) within the applicable class/category filter.

---

### beneficiaries (26 rows)

Conservation NGOs that receive grants. Key fields: id, name, short_name, geography (region code), website, description.

Sample: Conservation Lower Zambezi (clz), WECSZ (wecsz), Game Rangers International (gri), Children in the Wilderness (citw), Zambian Carnivore Programme (zcp).

---

### grant (137 rows)

| Column | Notes |
|---|---|
| grant_id | PK |
| charge_id → charge | Which event funded this grant |
| beneficiary_id → beneficiaries | Recipient NGO |
| grant_kwacha | Amount in ZMW |
| description | What the money supports |

Total grants by charge (ZMW): 2016=654k, 2015=658k, 2021=3.9M, 2022=3.56M. Ranges from 9k (2008) to 3.9M (2021).

---

### photos (3,043 rows)

Polymorphic — attached to either `Entry` or `Charge`.

| Column | Notes |
|---|---|
| id | PK |
| photoable_type | 'Entry' or 'Charge' |
| photoable_id | FK to entry.entry_id or charge.charge_id |
| photo_file_name | filename |
| is_car | bool — car photo flag |
| views | view count |
| faces | int[] — detected face regions |
| aspect | float — image aspect ratio |

---

### GPS Tables

**gps_raw** (1.9M rows) — raw GPS readings from devices
- entry_id, gps_timestamp, location (geography), location_prj (3857), distance_m, speed_kmh, azimuth_deg, elapsed_s
- ID sequence starts at 3,000,000

**gps_clean** (860k rows) — filtered/cleaned GPS points
- Same columns as gps_raw, plus: stop_id, entry_leg_id, elevation, leg_distance_m

**gps_stop** (27k rows) — detected stop events
- entry_id, start_time, end_time, elapsed_s, location, location_prj

**gps_historic** (789k rows) — legacy GPS data (pre-2016)
- id, lat, lon, gps_timestamp, teamname (varchar), charge (int = year, not FK)

---

## Key Relationships

```
charge
  ├── checkpoint (charge_id)
  │     └── leg (checkpoint1_id, checkpoint2_id)
  ├── entry (charge_id)
  │     ├── entry_category (entry_id)
  │     ├── entry_distance (entry_id)
  │     ├── entry_geometry (entry_id)
  │     ├── checkin (entry_id)
  │     │     └── entry_leg (checkin1_id, checkin2_id)
  │     ├── gps_raw (entry_id)
  │     ├── gps_clean (entry_id)
  │     └── gps_stop (entry_id)
  ├── charge_sponsor (charge_id)
  └── grant (charge_id)

entry
  ├── team (team_id)
  ├── car → make (make_id)
  └── class (class_id)

checkpoint
  └── sponsor (sponsor_id)

beneficiaries ← grant
award → class, category, sponsor
photos → entry | charge (polymorphic)
```

---

## Useful Queries

```sql
-- All charges with entry counts and fundraising
SELECT charge_ref, charge_name, entry_count, raised_dollars FROM v_charge ORDER BY charge_date;

-- Leaderboard for a charge (net distance)
SELECT car_no, entry_name, result_status, distance_net, raised_dollars
FROM v_entry WHERE charge_id = 17 ORDER BY distance_net NULLS LAST;

-- Checkpoints for a charge
SELECT checkpoint_id, sponsor_name, is_gauntlet, radius_m, elevation
FROM v_checkpoint WHERE charge_id = 17 ORDER BY checkpoint_id;

-- Entry GPS track extent
SELECT entry_id, raws_count, raws_from, raws_to FROM entry_geometry WHERE entry_id = 22;

-- Grants per charge
SELECT c.charge_ref, SUM(g.grant_kwacha) FROM "grant" g JOIN charge c USING (charge_id) GROUP BY c.charge_ref ORDER BY c.charge_ref;
```
