# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Keep this file up to date.** When you make structural changes to either project (new services, schema changes, new apps, changed build tooling), update the relevant section here as part of that change.

## Overview

This repo holds two related projects, sharing one PostgreSQL database, that together run the "Elephant Charge" — an annual off-road rally competition in Zambia where teams are scored on **shortest distance travelled** (not shortest time) between checkpoints, tracked via GPS. They were previously separate repos (`elephantcharge23` and `elephantcharge-results`) and have since been merged into this one; each keeps its own `package.json`/lockfile(s) and is built/run independently from its own subdirectory — there is no root `package.json` tying them together.

| Project | Directory | Role |
|---|---|---|
| **elephantcharge-system** | `elephantcharge-system/` (`backend/` + `frontend/`) | Year-round operational system: team/car/sponsor registration, GPS tracker data ingestion, distance/results/award calculation. Used by event organizers. |
| **elephantcharge-results** | `elephantcharge-results/` | Static site generator, run **once per year after the event**, that reads the database and publishes a public results website (history, teams, cars, awards, beneficiaries, GPS tracks). |

elephantcharge-results only *reads* from the database (via `scripts/extract.js`); all data entry, GPS import, and results/award computation happens in elephantcharge-system.

## Dev servers

The following are typically already running in the background during development — check before starting new ones:

- elephantcharge-system backend: `http://0.0.0.0:4001`
- elephantcharge-system frontend: `http://localhost:4000/`
- elephantcharge-results (Eleventy serve): `http://localhost:8080/`

## Database (shared: `charge23`)

- PostgreSQL 14 with **PostGIS**, database `charge23`, host `localhost`.
- Connection details are already checked into each project's own config (existing convention — don't add new hardcoded credentials elsewhere):
  - `elephantcharge-results/scripts/extract.js` connects as user `postgres` / password `extramild20`.
  - `elephantcharge-system/backend/src/config/config.js` connects as user `elephant_charge` / password `extramild20` (also holds the separate `teltonika` and `geotab` service credentials used by the tracker integrations).
  - The two projects deliberately use different DB users — see the permissions quirk below.
- Full schema dump: [schema.sql](schema.sql). Human-readable reference (table row counts, views, sample data, useful queries): [db_reference.md](db_reference.md) — **read this before writing new queries**, it documents a permissions quirk (`v_award`, `v_distanceawardresults`, `v_pledgeawardresults` used to fail as the `postgres` user because `elephant_charge` lacked SELECT on the `award` table; fixed via [scripts/fix_award_permissions.sql](scripts/fix_award_permissions.sql) — re-run it after restoring `schema.sql` onto a fresh database, since the grant isn't part of the dump). The same one-off-script convention was used to add the `v_beneficiary` view ([scripts/create_v_beneficiary_view.sql](scripts/create_v_beneficiary_view.sql), also re-run after restoring `schema.sql`) and to migrate legacy beneficiary logo filenames ([scripts/migrate_beneficiary_logos.sql](scripts/migrate_beneficiary_logos.sql), a one-time data fix — do not re-run against a database where it's already applied).
- 29 tables, 19 views. Core domain: `charge` (one row per annual event) → `checkpoint`/`leg` (route) → `team`/`car`/`entry` (who competed) → `gps_raw`/`gps_clean`/`gps_stop` (tracked positions) → `checkin`/`entry_leg`/`entry_distance` (computed results) → `award`/`beneficiaries`/`grant` (outcomes/fundraising).
- A meaningful amount of business logic lives in **PostgreSQL functions**, not application code — e.g. `ec23_gpsrawsupdatecalcs`, `ec23_gpscleanscreateline`, `ec23_points_within_checkpoint`, `ec23_legdistance`, `ec23_entryleg_create_geometry` (all in `schema.sql`). These do the PostGIS geometry work (stop detection, checkpoint-crossing detection, leg distance) that the backend orchestrates. When debugging results/distance issues, check these functions, not just JS.
- Almost all read paths go through the `v_*` views (e.g. `v_entry`, `v_charge`, `v_entry_leg`), which pre-join human-readable names and computed aggregates — prefer querying the view over the base table.

## elephantcharge-system/

Two sub-apps, no shared root package.json — each has its own `package.json`/lockfile.

### backend/ — Node/Express API
- Express 4 + Knex (query builder) + `pg`, on port `4001`, CORS-restricted to `http://localhost:4000` (see `src/config/config.js`).
- Entry point: `src/app.js`. Routes: `src/routes.js` → `/api/v1/...`. Run: `npm start` (nodemon, `DEBUG=ec23:*`). Lint: `npm run lint`.
- `src/controllers/` — one controller per resource (Charge, Entry, Team, Car, Sponsor, Beneficiary, Grant, Checkpoint, Tracker). `GrantController.js` manages the `grant` table (charge-scoped: `GET /charge/:id/grants`), backing the Grants table on `ChargeDetails.vue` (`views/ChargeGrants.vue` + `views/GrantForm.vue`). `BeneficiaryController.js` also handles logo image upload (`POST /beneficiary/:id/logo`, via `express-fileupload`), saving into `public/beneficiaries/logos/` (served by the `express.static('public')` middleware in `app.js`) and updating `beneficiaries.logo_file_name`. `EntryController.js` is the largest (~1300 lines) and owns the results pipeline: import GPS → clean/detect stops → calculate checkins against checkpoints → process legs → update distances → clear/recompute results.
- `src/controllers/GPSCommon.js` — shared GPS-import logic (raw point insert, stop detection via a peek-forward radius algorithm, calls into the PostGIS SQL functions above).
- `src/controllers/GeotabController.js` / `TeltonikaController.js` — integrations with two GPS tracker hardware/telemetry platforms (Geotab uses MS SQL via `tedious`/`src/services/sqlserver.js`; Teltonika has its own Postgres db, `src/services/teltonika_db.js`). `TrackerController.js` handles generic tracker registration/download.
- `src/services/kml.js` — KML import/export (checkpoints, entry tracks) using `xmldom`/`xmlbuilder2`/`xpath`.
- `src/services/db.js` — the shared Knex instance; sets custom `pg` type parsers (ints/floats/numerics returned as JS numbers rather than strings) — reuse this instance rather than creating new Knex connections.
- `db/001_updates.sql` — ad hoc migration/patch applied on top of `schema.sql`.

### frontend/ — Vue 3 admin UI (active)
- Vue 3 + Vuetify 3 + Vite + vue-router, plus `ol` (OpenLayers) for maps and `d3` for charts. Dev: `npm run dev`. Build: `npm run build`. Lint: `npm run lint`.
- Talks to the backend API at `http://localhost:4001/api/v1/` (`src/config/index.js`).
- `src/views/` — one view per admin screen, mirroring backend resources (Charge*, Entry*, Team*, Car*, Sponsor*, Beneficiary*, Tracker*), plus results/award views (`ChargeResults*.vue`) and a live map (`layouts/default/LiveMap.vue`, `views/MapPanel.vue`).
- This is the primary tool organizers use to run an event: register entries, import/manage GPS tracks, trigger distance/results recalculation, and manage awards.

## elephantcharge-results/

Static site generator using **Eleventy (11ty) v3** + **Nunjucks**, run once per year to publish results.

- `npm run build` — runs `scripts/extract.js` then `npx @11ty/eleventy` (full rebuild: DB → JSON → static site in `_site/`).
- `npm run extract` — just re-run the DB extraction step (`scripts/extract.js`) without rebuilding the site.
- `npm start` — `eleventy --serve --incremental`, for local preview while iterating on templates.
- Eleventy config: [.eleventy.js](elephantcharge-results/.eleventy.js) — input `site/`, output `_site/`, includes/data under `site/_includes` / `site/_data`; custom Nunjucks filters for km/dollars/percent/number/date formatting.
- `scripts/extract.js` — connects directly to `charge23` via `pg`, queries the DB, and writes static data files consumed by the Eleventy build:
  - `site/_data/{charges,teams,cars,beneficiaries}.json`
  - `public/data/tracks/<charge_ref>.geojson` (GPS tracks per charge, 2016+)
  - Also computes award winners client-side in `extract.js` (`computeAwardWinners`) from raw award/entry/category/distance data rather than relying solely on the DB views.
- `site/` — Eleventy source: `_includes/base.njk` (layout), and one directory per page type (`charge/`, `car/`, `cars/`, `team/`, `teams/`, `beneficiaries/`, plus `index.njk`). Templates read from the JSON in `site/_data/` (11ty's global data mechanism), not live from the DB.
- `public/` — static passthrough assets (CSS, JS, logo, and the generated `data/tracks/*.geojson`) copied verbatim into `_site/`.
- `_site/` is the build output — gitignored (not committed); regenerate it locally with `npm run build` or `npx eleventy`, don't hand-edit it.
- Node version pinned via `.nvmrc` (22).
