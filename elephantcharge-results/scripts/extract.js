/**
 * extract.js — queries charge23 PostgreSQL DB and writes JSON/GeoJSON files
 * consumed by the Eleventy static site build.
 *
 * Outputs:
 *   site/_data/charges.json        — all charges with entries, checkpoints, legs, awards, grants
 *   site/_data/teams.json          — all teams with per-team entry history
 *   site/_data/cars.json           — all cars with per-car entry history
 *   site/_data/beneficiaries.json  — all NGOs with grants per charge
 *   public/data/tracks/<ref>.geojson — GPS FeatureCollection per charge (2016+)
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'charge23',
  user: 'postgres',
  password: 'extramild20',
});

async function query(sql, params = []) {
  const { rows } = await pool.query(sql, params);
  return rows;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  console.log(`  wrote ${filePath} (${(fs.statSync(filePath).size / 1024).toFixed(1)} KB)`);
}

function groupBy(arr, key) {
  const map = {};
  for (const item of arr) {
    const k = item[key];
    if (!map[k]) map[k] = [];
    map[k].push(item);
  }
  return map;
}

function parseGeoJson(str) {
  if (!str) return null;
  try { return JSON.parse(str); } catch { return null; }
}

// ─── Award winner computation ───────────────────────────────────────────────

function computeAwardWinners(awards, chargeEntries, entryCategories, entryDistances) {
  const catsByEntry = {};
  for (const ec of entryCategories) {
    if (!catsByEntry[ec.entry_id]) catsByEntry[ec.entry_id] = new Set();
    catsByEntry[ec.entry_id].add(Number(ec.category_id));
  }

  const distsByEntry = {};
  for (const ed of entryDistances) {
    if (!distsByEntry[ed.entry_id]) distsByEntry[ed.entry_id] = {};
    distsByEntry[ed.entry_id][ed.distance_ref] = Number(ed.distance_m);
  }

  return awards.map((award) => {
    let eligible = chargeEntries.filter((e) => {
      if (award.sort_result_status === true && e.result_status !== 'COMPLETE') return false;
      if (award.class_id && Number(e.class_id) !== Number(award.class_id)) return false;
      if (award.category_id) {
        const cats = catsByEntry[e.entry_id];
        if (!cats || !cats.has(Number(award.category_id))) return false;
      }
      return true;
    });

    let winner = null;

    if (award.type_ref === 'DISTANCE' && award.distance_ref) {
      eligible = eligible.filter(
        (e) => distsByEntry[e.entry_id]?.[award.distance_ref] != null
      );
      eligible.sort(
        (a, b) =>
          distsByEntry[a.entry_id][award.distance_ref] -
          distsByEntry[b.entry_id][award.distance_ref]
      );
      winner = eligible[0] || null;
    } else if (award.type_ref === 'PLEDGE') {
      eligible.sort((a, b) => (b.raised_dollars || 0) - (a.raised_dollars || 0));
      winner = eligible[0] || null;
    }

    return {
      award_id: Number(award.award_id),
      name: award.name,
      type_ref: award.type_ref,
      distance_ref: award.distance_ref || null,
      class_name: award.class_name || null,
      category: award.category || null,
      ordinal: Number(award.ordinal),
      winner: winner
        ? {
            entry_id: winner.entry_id,
            car_no: winner.car_no,
            entry_name: winner.entry_name,
            result_status: winner.result_status,
            value:
              award.type_ref === 'DISTANCE'
                ? distsByEntry[winner.entry_id][award.distance_ref]
                : winner.raised_dollars,
          }
        : null,
    };
  });
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  ensureDir('site/_data');
  ensureDir('public/data/tracks');

  console.log('Querying database...');

  // ── Charges ────────────────────────────────────────────────────────────────
  const chargeRows = await query(`
    SELECT charge_id, charge_ref, charge_name, location, charge_date,
      start_time, end_time, gauntlet_multiplier, exchange_rate,
      map_file_name, spirit_name, spirit_description, shafted_description,
      kml, charge_complete,
      checkpoint_count, entry_count, entry_completed_count,
      entry_completed_pct, raised_local, raised_dollars, dollars_per_entry,
      new_teams_count, map_center
    FROM v_charge
    ORDER BY charge_date DESC
  `);

  // ── Entries (all charges) ──────────────────────────────────────────────────
  const entryRows = await query(`
    SELECT
      ve.entry_id, ve.charge_id, ve.car_no, ve.entry_name, ve.captain, ve.members,
      ve.class_id, ve.class_name, ve.result_status,
      ve.raised_local, ve.raised_dollars,
      ve.distance_total, ve.distance_total_competition, ve.distance_net,
      ve.categories, ve.category_ids, ve.color,
      ve.team_id, t.team_name, t.team_ref,
      ve.car_id, ve.car_name, ve.make, ve.model, ve.colour AS car_colour, ve.year,
      ve.processing_status, ve.checkins_consistent, ve.leg_count,
      ve.raws_count, ve.cleans_count, ve.gps_source_ref,
      ve.starting_checkpoint_id, ve.kml
    FROM v_entry ve
    JOIN team t ON ve.team_id = t.team_id
    ORDER BY ve.charge_id, ve.distance_net NULLS LAST
  `);

  // ── Entry categories ───────────────────────────────────────────────────────
  const entryCategoryRows = await query(`
    SELECT ec.entry_id, ec.category_id, ca.category_ref, ca.category
    FROM entry_category ec
    JOIN category ca ON ec.category_id = ca.category_id
  `);

  // ── Entry distances (all) ──────────────────────────────────────────────────
  const entryDistanceRows = await query(`
    SELECT ed.entry_id, ed.distance_ref, ed.distance_m, e.charge_id
    FROM entry_distance ed
    JOIN entry e ON ed.entry_id = e.entry_id
  `);

  // ── Checkpoints ────────────────────────────────────────────────────────────
  const checkpointRows = await query(`
    SELECT checkpoint_id, is_gauntlet, charge_id, radius_m, elevation,
      sponsor_name, short_name, starters_count, checkins_count, located,
      location
    FROM v_checkpoint
    ORDER BY charge_id, checkpoint_id
  `);

  // ── Legs ───────────────────────────────────────────────────────────────────
  const legRows = await query(`
    SELECT leg_id, charge_id, checkpoint1_id, checkpoint2_id, distance_m,
      is_gauntlet, is_tsetse, checkpoint1_name, checkpoint2_name, entry_count
    FROM v_leg
    ORDER BY charge_id, leg_id
  `);

  // ── Awards ─────────────────────────────────────────────────────────────────
  const awardRows = await query(`
    SELECT a.award_id, a.type_ref, a.name, a.distance_ref,
      a.class_id, cl.class_ref, cl.class_name,
      a.category_id, ca.category_ref, ca.category,
      a.sort_result_status, a.ordinal
    FROM award a
    LEFT JOIN class cl ON a.class_id = cl.class_id
    LEFT JOIN category ca ON a.category_id = ca.category_id
    ORDER BY a.ordinal
  `);

  // ── Grants ─────────────────────────────────────────────────────────────────
  const grantRows = await query(`
    SELECT g.grant_id, g.charge_id, g.grant_kwacha, g.description,
      b.id AS beneficiary_id, b.name AS beneficiary_name, b.short_name,
      b.geography, b.website
    FROM "grant" g
    JOIN beneficiaries b ON g.beneficiary_id = b.id
    ORDER BY g.charge_id, b.name
  `);

  // ── Beneficiaries ──────────────────────────────────────────────────────────
  const beneficiaryRows = await query(`
    SELECT id, name, short_name, geography, description, website,
      facebook, email_public, geography_description
    FROM beneficiaries
    ORDER BY name
  `);

  // ── Teams ──────────────────────────────────────────────────────────────────
  const teamRows = await query(`
    SELECT team_id, team_name, team_ref, captain, badge_file_name,
      website, email, color,
      entry_count, completed_count, last_charge, first_charge,
      raised_dollars, dollars_per_entry
    FROM v_team
    ORDER BY entry_count DESC, team_name
  `);

  // ── Cars ───────────────────────────────────────────────────────────────────
  const carRows = await query(`
    SELECT car_id, car_name, model, make, colour, year,
      registration, entry_count, team_count, last_charge
    FROM v_car
    ORDER BY last_charge DESC NULLS LAST, entry_count DESC
  `);

  // ── GPS tracks ─────────────────────────────────────────────────────────────
  const trackRows = await query(`
    SELECT
      e.charge_id, e.entry_id, e.car_no, e.entry_name, e.result_status,
      t.color, t.team_name,
      ed_net.distance_m AS distance_net,
      ed_total.distance_m AS distance_total_competition,
      eg.clean_line_json
    FROM entry e
    JOIN team t ON e.team_id = t.team_id
    JOIN entry_geometry eg ON eg.entry_id = e.entry_id
    LEFT JOIN entry_distance ed_net
      ON ed_net.entry_id = e.entry_id AND ed_net.distance_ref = 'NET'
    LEFT JOIN entry_distance ed_total
      ON ed_total.entry_id = e.entry_id AND ed_total.distance_ref = 'TOTAL_COMPETITION'
    WHERE eg.clean_line_json IS NOT NULL
    ORDER BY e.charge_id, e.car_no
  `);

  console.log(
    `  ${chargeRows.length} charges, ${entryRows.length} entries, ` +
    `${checkpointRows.length} checkpoints, ${legRows.length} legs, ` +
    `${trackRows.length} GPS tracks`
  );

  // ── Group data by charge ───────────────────────────────────────────────────
  const entriesByCharge = groupBy(entryRows, 'charge_id');
  const checkpointsByCharge = groupBy(checkpointRows, 'charge_id');
  const legsByCharge = groupBy(legRows, 'charge_id');
  const grantsByCharge = groupBy(grantRows, 'charge_id');
  const tracksByCharge = groupBy(trackRows, 'charge_id');
  const distsByCharge = groupBy(entryDistanceRows, 'charge_id');
  const catsByCharge = groupBy(entryCategoryRows.map(ec => {
    // look up the entry's charge_id via entryRows
    const entry = entryRows.find(e => e.entry_id === ec.entry_id);
    return { ...ec, charge_id: entry?.charge_id };
  }), 'charge_id');

  // ── Build charges.json ────────────────────────────────────────────────────
  console.log('\nBuilding charges.json...');
  const charges = chargeRows.map((c) => {
    const cid = c.charge_id;
    const entries = (entriesByCharge[cid] || []).map((e) => ({
      entry_id: e.entry_id,
      car_no: e.car_no,
      entry_name: e.entry_name,
      captain: e.captain || null,
      class_id: Number(e.class_id),
      class_name: e.class_name,
      result_status: e.result_status || null,
      raised_local: e.raised_local != null ? Number(e.raised_local) : null,
      raised_dollars: e.raised_dollars != null ? Number(e.raised_dollars) : null,
      distance_total: e.distance_total != null ? Number(e.distance_total) : null,
      distance_total_competition: e.distance_total_competition != null ? Number(e.distance_total_competition) : null,
      distance_net: e.distance_net != null ? Number(e.distance_net) : null,
      categories: e.categories || null,
      color: e.color || '#888888',
      team_id: e.team_id,
      team_name: e.team_name,
      team_ref: e.team_ref || `team-${e.team_id}`,
      car_id: e.car_id,
      car_name: e.car_name || null,
      make: e.make || null,
      model: e.model || null,
      leg_count: e.leg_count != null ? Number(e.leg_count) : null,
      raws_count: e.raws_count != null ? Number(e.raws_count) : null,
      processing_status: e.processing_status || null,
    }));

    const checkpoints = (checkpointsByCharge[cid] || []).map((cp) => ({
      checkpoint_id: cp.checkpoint_id,
      sponsor_name: cp.sponsor_name,
      short_name: cp.short_name || null,
      is_gauntlet: cp.is_gauntlet,
      radius_m: cp.radius_m,
      elevation: cp.elevation != null ? Number(cp.elevation) : null,
      starters_count: Number(cp.starters_count),
      checkins_count: Number(cp.checkins_count),
      location: parseGeoJson(cp.location),
    }));

    const legs = (legsByCharge[cid] || []).map((l) => ({
      leg_id: l.leg_id,
      checkpoint1_id: l.checkpoint1_id,
      checkpoint2_id: l.checkpoint2_id,
      checkpoint1_name: l.checkpoint1_name,
      checkpoint2_name: l.checkpoint2_name,
      distance_m: l.distance_m != null ? Number(l.distance_m) : null,
      is_gauntlet: l.is_gauntlet,
      is_tsetse: l.is_tsetse,
      entry_count: Number(l.entry_count),
    }));

    const grants = (grantsByCharge[cid] || []).map((g) => ({
      grant_id: g.grant_id,
      beneficiary_id: g.beneficiary_id,
      beneficiary_name: g.beneficiary_name,
      short_name: g.short_name || null,
      grant_kwacha: Number(g.grant_kwacha),
      description: g.description || null,
    }));

    const chargeDists = distsByCharge[cid] || [];
    const chargeCats = catsByCharge[cid] || [];
    const awardWinners = computeAwardWinners(awardRows, entries, chargeCats, chargeDists);

    const mapCenter = parseGeoJson(c.map_center);
    const center = mapCenter
      ? { lat: mapCenter.coordinates[1], lng: mapCenter.coordinates[0] }
      : null;

    const hasGpsTracks = (tracksByCharge[cid] || []).length > 0;

    return {
      charge_id: cid,
      charge_ref: c.charge_ref,
      charge_name: c.charge_name,
      location: c.location,
      charge_date: c.charge_date,
      start_time: c.start_time,
      end_time: c.end_time,
      gauntlet_multiplier: Number(c.gauntlet_multiplier),
      exchange_rate: c.exchange_rate != null ? Number(c.exchange_rate) : null,
      map_file_name: c.map_file_name || null,
      spirit_name: c.spirit_name || null,
      spirit_description: c.spirit_description || null,
      shafted_description: c.shafted_description || null,
      kml: c.kml || null,
      charge_complete: c.charge_complete,
      checkpoint_count: Number(c.checkpoint_count),
      entry_count: Number(c.entry_count),
      entry_completed_count: Number(c.entry_completed_count),
      entry_completed_pct: c.entry_completed_pct != null ? Number(c.entry_completed_pct) : null,
      raised_local: c.raised_local != null ? Number(c.raised_local) : null,
      raised_dollars: c.raised_dollars != null ? Number(c.raised_dollars) : null,
      dollars_per_entry: c.dollars_per_entry != null ? Number(c.dollars_per_entry) : null,
      new_teams_count: Number(c.new_teams_count),
      map_center: center,
      has_gps_tracks: hasGpsTracks,
      entries,
      checkpoints,
      legs,
      grants,
      award_winners: awardWinners,
    };
  });

  writeJson('site/_data/charges.json', charges);

  // ── Build GPS track GeoJSON files ─────────────────────────────────────────
  console.log('\nBuilding GPS track files...');
  for (const [chargeId, tracks] of Object.entries(tracksByCharge)) {
    const charge = chargeRows.find((c) => c.charge_id == chargeId);
    if (!charge) continue;

    const features = [];
    for (const t of tracks) {
      const geom = parseGeoJson(t.clean_line_json);
      if (!geom) continue;
      features.push({
        type: 'Feature',
        properties: {
          entry_id: t.entry_id,
          car_no: t.car_no,
          entry_name: t.entry_name,
          team_name: t.team_name,
          result_status: t.result_status || null,
          color: t.color || '#888888',
          distance_net: t.distance_net != null ? Number(t.distance_net) : null,
          distance_total_competition: t.distance_total_competition != null ? Number(t.distance_total_competition) : null,
        },
        geometry: geom,
      });
    }

    const geojson = { type: 'FeatureCollection', features };
    const outPath = `public/data/tracks/${charge.charge_ref}.geojson`;
    fs.writeFileSync(outPath, JSON.stringify(geojson));
    console.log(`  wrote ${outPath} (${features.length} tracks, ${(fs.statSync(outPath).size / 1024).toFixed(0)} KB)`);
  }

  // ── Build teams.json ──────────────────────────────────────────────────────
  console.log('\nBuilding teams.json...');
  const entriesByTeam = groupBy(entryRows, 'team_id');
  const teams = teamRows.map((t) => {
    const teamEntries = (entriesByTeam[t.team_id] || []).map((e) => {
      const charge = chargeRows.find((c) => c.charge_id === e.charge_id);
      return {
        charge_id: e.charge_id,
        charge_ref: charge?.charge_ref || null,
        charge_name: charge?.charge_name || null,
        charge_date: charge?.charge_date || null,
        car_no: e.car_no,
        entry_name: e.entry_name,
        result_status: e.result_status || null,
        raised_dollars: e.raised_dollars != null ? Number(e.raised_dollars) : null,
        distance_net: e.distance_net != null ? Number(e.distance_net) : null,
        distance_total_competition: e.distance_total_competition != null ? Number(e.distance_total_competition) : null,
        car_id: e.car_id,
        car_name: e.car_name || null,
        make: e.make || null,
        model: e.model || null,
        class_name: e.class_name,
      };
    });
    teamEntries.sort((a, b) => new Date(b.charge_date) - new Date(a.charge_date));

    const teamRef = t.team_ref || `team-${t.team_id}`;
    return {
      team_id: t.team_id,
      team_name: t.team_name,
      team_ref: teamRef,
      captain: t.captain || null,
      badge_file_name: t.badge_file_name || null,
      website: t.website || null,
      email: t.email || null,
      color: t.color || '#888888',
      entry_count: Number(t.entry_count),
      completed_count: Number(t.completed_count),
      first_charge: t.first_charge,
      last_charge: t.last_charge,
      raised_dollars: t.raised_dollars != null ? Number(t.raised_dollars) : null,
      dollars_per_entry: t.dollars_per_entry != null ? Number(t.dollars_per_entry) : null,
      entries: teamEntries,
    };
  });

  writeJson('site/_data/teams.json', teams);

  // ── Build cars.json ───────────────────────────────────────────────────────
  console.log('\nBuilding cars.json...');
  const entriesByCar = groupBy(entryRows, 'car_id');
  const cars = carRows.map((c) => {
    const carEntries = (entriesByCar[c.car_id] || []).map((e) => {
      const charge = chargeRows.find((ch) => ch.charge_id === e.charge_id);
      return {
        charge_id: e.charge_id,
        charge_ref: charge?.charge_ref || null,
        charge_name: charge?.charge_name || null,
        charge_date: charge?.charge_date || null,
        car_no: e.car_no,
        entry_name: e.entry_name,
        team_id: e.team_id,
        team_name: e.team_name,
        team_ref: e.team_ref || `team-${e.team_id}`,
        result_status: e.result_status || null,
        raised_dollars: e.raised_dollars != null ? Number(e.raised_dollars) : null,
        distance_net: e.distance_net != null ? Number(e.distance_net) : null,
      };
    });
    carEntries.sort((a, b) => new Date(b.charge_date) - new Date(a.charge_date));

    return {
      car_id: c.car_id,
      car_name: c.car_name || null,
      model: c.model || null,
      make: c.make || null,
      colour: c.colour || null,
      year: c.year != null ? Number(c.year) : null,
      registration: c.registration || null,
      entry_count: Number(c.entry_count),
      team_count: Number(c.team_count),
      last_charge: c.last_charge || null,
      entries: carEntries,
    };
  });

  writeJson('site/_data/cars.json', cars);

  // ── Build beneficiaries.json ──────────────────────────────────────────────
  console.log('\nBuilding beneficiaries.json...');
  const grantsByBeneficiary = groupBy(grantRows, 'beneficiary_id');
  const beneficiaries = beneficiaryRows.map((b) => {
    const grants = (grantsByBeneficiary[b.id] || []).map((g) => {
      const charge = chargeRows.find((c) => c.charge_id === g.charge_id);
      return {
        charge_id: g.charge_id,
        charge_ref: charge?.charge_ref || null,
        charge_date: charge?.charge_date || null,
        grant_id: g.grant_id,
        grant_kwacha: Number(g.grant_kwacha),
        description: g.description || null,
      };
    });
    grants.sort((a, b) => new Date(b.charge_date) - new Date(a.charge_date));

    const totalKwacha = grants.reduce((s, g) => s + g.grant_kwacha, 0);

    return {
      id: b.id,
      name: b.name,
      short_name: b.short_name || null,
      geography: b.geography || null,
      geography_description: b.geography_description || null,
      description: b.description || null,
      website: b.website || null,
      facebook: b.facebook || null,
      email_public: b.email_public || null,
      total_kwacha: totalKwacha,
      charge_count: grants.length,
      grants,
    };
  });

  writeJson('site/_data/beneficiaries.json', beneficiaries);

  console.log('\nExtraction complete.');
}

main().catch((err) => { console.error(err); process.exit(1); }).finally(() => pool.end());
