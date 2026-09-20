const Knex = require('../services/db')
const Luxon = require('luxon')
const DateTime = Luxon.DateTime
const Common = require('./CommonDebug')('GPSCommon')
const config = require('../config/config')

module.exports = {
  async importRaw(req, trx, entry_id, rows, offsetDays, offsetMinutes, sourceKind = 'RAW') {
    let cleans_count = 0
    let stops
    let chargeDate

    Common.debug(null, 'importRaw', sourceKind)

    for await (const row of rows) {
      Knex.raw(`INSERT INTO gps_raw (entry_id, gps_timestamp, location, location_prj) 
        VALUES (
          ${entry_id}, 
          '${row.datetime.plus({days: offsetDays, minutes: offsetMinutes}).toISO()}', 
          ST_Point(${row.lon},${row.lat}, 4326),
          ST_Transform(ST_Point(${row.lon},${row.lat}, 4326),${config.local_crs})
          )`
        )
        .transacting(trx)
        .catch(err => {
          Common.debug(null, 'importRaw ERROR', err)
        })
    }
    
    return Knex.raw(`SELECT ec23_gpsrawsupdatecalcs(${entry_id})`)
      .transacting(trx)
      .then(() => {
        Common.debug(null, 'importRaw', 'Raws create line')
        return Knex.raw(`SELECT ec23_gpsrawscreateline(${entry_id})`)
          .transacting(trx)
      })
      .then(() => {
        return Knex('entry')
          .where({entry_id: entry_id})
          .select(['charge_id'])
          .transacting(trx)
      })
      .then(entries => {
        return Knex('charge')
          .where({charge_id: entries[0].charge_id})
          .select(['charge_date'])
          .transacting(trx)
      })
      .then(charges => {
        chargeDate = DateTime.fromISO(charges[0].charge_date).toISODate()
        return Knex('v_gps_raw')
          .where({entry_id: entry_id})
          .orderBy('gps_timestamp')
          .select()
          .transacting(trx)
      })
      .then(async rws => {
        // gps_raw can hold points from outside the event day (e.g. a logger left
        // running overnight before/after the drive) - only points that fall on
        // the charge's own date are used to build gps_clean/gps_stop, so results
        // can't be skewed by pre/post-event idle time or stray fixes.
        raws = rws.filter(r => DateTime.fromJSDate(r.gps_timestamp).toISODate() === chargeDate)
        stops = sourceKind === 'SMOOTHED' ? findStopsSmoothed(req, trx, raws) : findStops(req, trx, raws)
    
        let stop_i = 0
        let inserts = []
        let raw_i = -1
        for await (const raw of raws) {
          raw_i += 1
    
          if (stop_i < stops.length &&
            raw_i >= stops[stop_i].from_index &&
            raw_i <= stops[stop_i].to_index) { // In a stop
              if (raw_i == stops[stop_i].to_index) { // Last point of the stop                  
                inserts.push(await new Promise( async (resolve, reject) => {
                  let stopId
                  let from = DateTime.fromJSDate(raws[stops[stop_i].from_index].gps_timestamp)
                  let to = DateTime.fromJSDate(raws[raw_i].gps_timestamp)
                  let x = stops[stop_i].x
                  let y = stops[stop_i].y                    
                  let duration = to.diff(from,'seconds').seconds
                  
                  await insertStop(req, trx, entry_id, from, to, x, y, duration)
                    .then(()=>{
                      resolve()
                    })
                    .catch(err => {
                      reject(err)
                    })
                }))
                stop_i += 1
              }
          } else {
            await inserts.push(insertClean(req, trx, entry_id, DateTime.fromJSDate(raws[raw_i].gps_timestamp).toISO(),raws[raw_i].x,raws[raw_i].y,'null'))
            cleans_count += 1
          }
        } 
        Common.debug(null, 'importRaw', 'Inserting cleans')
            
        for await (const insert of inserts) {
          await insert
        }
      })
      .then(() => {
        return Knex.raw(`SELECT ec23_gpscleansupdatecalcs(${entry_id})`)
          .transacting(trx)
      })
      .then(() => {
        return Knex.raw(`SELECT ec23_gpscleanscreateline(${entry_id})`)
          .transacting(trx)
      })    
      .then(() => {
        return {raw_count: rows.length, clean_count: cleans_count, stop_count: stops.length}
      })
      .catch(err => {
        Common.debug(null, 'importRaw ERROR', err)
        throw(err)
      })
  }
}

function insertStop(req, trx, entry_id, from, to, x, y, duration) {
  let stopId
  return insertStopPoint(req, trx, entry_id, from.toISO(), to.toISO(), x, y, duration)
    .then(stpId=> {
      stopId = stpId
      return insertClean(req, trx, entry_id, from.toISO(), x, y, stopId)
    })
    .then(()=>{
      return insertClean(req, trx, entry_id, to.toISO(), x, y, stopId)
    })
    .catch(err=> {
      Common.debug(null, 'insertStop ERROR', err)
      throw err
    })
}

function insertStopPoint(req, trx, entry_id, start_time, end_time, x, y, duration) {
  //Common.debug(null, 'insertStop')
  return Knex.raw(`
    INSERT INTO gps_stop (entry_id, start_time, end_time, location_prj, location, elapsed_s)
    VALUES(
      ${entry_id}, 
      '${start_time}',
      '${end_time}',
      ST_Point(${x}, ${y},${config.local_crs}),
      ST_Transform(ST_Point(${x}, ${y},${config.local_crs}),4326),
      ${duration}
    )
    RETURNING gps_stop_id`)
    .transacting(trx)
    .then(returns=>{
      return returns.rows[0].gps_stop_id
    })
    .catch(err=>{
      Common.debug(null, 'insertStopPoint ERROR: ', err)
      throw err
    })
}

function insertClean(req, trx, entry_id, gps_timestamp, x, y, stop_id) {
  
  return Knex.raw(`INSERT INTO gps_clean (
    entry_id, gps_timestamp, location_prj, location, stop_id)
    VALUES(
      ${entry_id}, 
      '${gps_timestamp}', 
      ST_Point(${x}, ${y},${config.local_crs}), 
      ST_Transform(ST_Point(${x}, ${y},${config.local_crs}),4326), 
      ${stop_id}
    )`)
    .transacting(trx)
    .then(()=>{
      return true
    })
    .catch(err=>{
      Common.debug(null, 'insertStop ERROR: ', err)
      throw err
    })
}

function findStops(req, trx, raws) {
  Common.debug(null, 'findStops')

  let stop_radius = 10 // meters
  let min_stop_points = 6
  let stops = []
  let peek_offset=0
  let sum_x=0
  let sum_y=0

  raws.forEach((raw, i) => {
    if (peek_offset === 0) { // skip already processed
      //peek forward until point is further away than stop_radius
      //if we need to peek more than min_stop_points then its a stop
      //collapse position onto average position of all stop points
      while ((i + peek_offset + 1) < raws.length &&  distance(raw, raws[i + peek_offset]) < stop_radius ) {
        sum_x += raws[i + peek_offset].x
        sum_y += raws[i + peek_offset].y
        peek_offset += 1
      }
      
      if (peek_offset > min_stop_points) {// stop found
        stops.push({
          from_index: i,
          to_index: i + peek_offset,
          x: sum_x / peek_offset,
          y: sum_y / peek_offset
        })
      } else { // no stop
        peek_offset = 0
        sum_x = 0
        sum_y = 0
      }
    } else { //Unwind the previous peek forward
      peek_offset -= 1
      sum_x = 0
      sum_y = 0
    }
  })
  stops = amalgamateStops(stops)
  Common.debug(null, 'findStops', stops.length)
  return stops
}

function amalgamateStops(stops) {
  Common.debug(null, 'amalgamateStops')

  let peek_offset = 0
  let stops_combined = []
  let sum_x=0
  let sum_y=0

  stops.forEach((stop, i) => {
    if (peek_offset === 0) { //skip already processed
      while (
        ((i + peek_offset + 1) < stops.count) && // Still have data
        (stops[i + peek_offset].to_index) == (stops[ i + peek_offset + 1].from_index - 1)) { // Stops are consecutive
          sum_x += stops[i + peek_offset].x
          sum_y += stops[i + peek_offset].y
          peek_offset += 1
      }
      if (peek_offset > 0) {// Amalgamate 
        stops_combined.push({
          from_index: stop.from_index, 
          to_index: stops[i+peek_offset].to_index,
          x: sum_x / peek_offset, 
          y: sum_y / peek_offset
        })
      } else {
        stops_combined.push(stop)
        peek_offset = 0
        sum_x = 0
        sum_y = 0
      }
    } else {
      peek_offset -= 1
      sum_x = 0
      sum_y = 0
    }
  })
  return stops_combined
}

function distance(pnt1, pnt2){
  return Math.sqrt(Math.pow(pnt1.x - pnt2.x, 2) + Math.pow(pnt1.y - pnt2.y, 2))
}

// --- Stop detection for pre-smoothed sources (GPX / Columbus) ---
//
// findStops() above assumes a roughly fixed ~6s Geotab sample interval and uses a
// point-count threshold (min_stop_points) as a proxy for stop duration, anchoring each
// candidate stop window to its first point. GPX/Columbus data is already smoothed on
// the device but sampled at very different, often non-uniform rates (Columbus ~1s fixed,
// GPX anywhere from ~7s to ~30s depending on the device), so a point-count threshold
// stops meaning a fixed duration and ordinary few-metre GPS jitter around a stationary
// vehicle repeatedly breaks the anchor-distance check, fragmenting one real stop into a
// chain of many tiny ones. This variant uses a wall-clock duration threshold, clusters
// around a running centroid instead of a fixed anchor, tolerates a single noisy point
// without closing the window (debounce), and amalgamates nearby-in-time/nearby-in-space
// windows afterwards so a stop interrupted by stray jitter points is recombined.
const SMOOTHED_STOP_PARAMS = {
  stop_radius: 10,        // meters - candidate points must be within this of the running centroid
  min_stop_duration_s: 60,  // seconds - minimum wall-clock dwell time to count as a stop
  max_misses: 1,          // consecutive out-of-radius points tolerated before closing the window
  max_miss_distance: 30,  // meters - beyond this a point is a real departure, not jitter, even within max_misses
  amalgamate_gap_s: 30     // seconds - merge two stop windows this close in time (and within stop_radius) into one
}

function findStopsSmoothed(req, trx, raws) {
  Common.debug(null, 'findStopsSmoothed')

  const params = SMOOTHED_STOP_PARAMS
  const n = raws.length
  let stops = []
  let i = 0

  while (i < n) {
    // Membership is tested against a fixed anchor (this window's first point),
    // not a running centroid: a running centroid re-centers on every accepted
    // point, which lets a cluster drift an unbounded distance over a long dwell
    // (observed up to ~24m of true wander over 30-60+ minute stops in practice)
    // while each single step still looks like it's within stop_radius. That
    // silently collapses real path shape near stops and produces spikes when an
    // outlier briefly pulls the centroid off to one side. Anchoring to a fixed
    // point bounds every stop to stop_radius of where it started, same as the
    // RAW/Geotab algorithm above; the averaged centroid is still reported as the
    // stop's location for stability, it's just not used for the membership test.
    const anchor = raws[i]
    let sum_x = anchor.x
    let sum_y = anchor.y
    let count = 1
    let last_good_index = i
    let misses = 0
    let j = i + 1

    while (j < n) {
      const d = distance(anchor, raws[j])
      if (d <= params.stop_radius) {
        sum_x += raws[j].x
        sum_y += raws[j].y
        count += 1
        last_good_index = j
        misses = 0
        j += 1
      } else if (misses < params.max_misses && d <= params.max_miss_distance) {
        // tolerate a single noisy point without breaking the window; it is not
        // added to the cluster/centroid, just skipped over
        misses += 1
        j += 1
      } else {
        break
      }
    }

    const duration_s = elapsedSeconds(raws[i].gps_timestamp, raws[last_good_index].gps_timestamp)
    if (last_good_index > i && duration_s >= params.min_stop_duration_s) {
      stops.push({
        from_index: i,
        to_index: last_good_index,
        x: sum_x / count,
        y: sum_y / count
      })
      i = last_good_index + 1
    } else {
      i += 1
    }
  }

  stops = amalgamateStopsSmoothed(stops, raws, params)
  Common.debug(null, 'findStopsSmoothed', stops.length)
  return stops
}

function amalgamateStopsSmoothed(stops, raws, params) {
  Common.debug(null, 'amalgamateStopsSmoothed')

  if (stops.length === 0) return stops

  let combined = [stops[0]]

  for (let k = 1; k < stops.length; k++) {
    const prev = combined[combined.length - 1]
    const cur = stops[k]
    const gap_s = elapsedSeconds(raws[prev.to_index].gps_timestamp, raws[cur.from_index].gps_timestamp)
    const centroid_dist = distance(prev, cur)

    if (gap_s <= params.amalgamate_gap_s && centroid_dist <= params.stop_radius) {
      const prev_count = prev.to_index - prev.from_index + 1
      const cur_count = cur.to_index - cur.from_index + 1
      const total_count = prev_count + cur_count
      combined[combined.length - 1] = {
        from_index: prev.from_index,
        to_index: cur.to_index,
        x: (prev.x * prev_count + cur.x * cur_count) / total_count,
        y: (prev.y * prev_count + cur.y * cur_count) / total_count
      }
    } else {
      combined.push(cur)
    }
  }

  return combined
}

function elapsedSeconds(t1, t2) {
  return (new Date(t2).getTime() - new Date(t1).getTime()) / 1000
}
