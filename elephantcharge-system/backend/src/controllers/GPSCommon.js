const Knex = require('../services/db')
const Luxon = require('luxon')
const DateTime = Luxon.DateTime
const Common = require('./CommonDebug')('GPSCommon')
const config = require('../config/config')

module.exports = {
  async importRaw(req, trx, entry_id, rows, offsetDays, offsetMinutes) {
    let cleans_count = 0
    let stops

    Common.debug(null, 'importRaw')

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
        return Knex('v_gps_raw')
          .where({entry_id: entry_id})
          .orderBy('gps_timestamp')
          .select()
          .transacting(trx)
      })
      .then(async rws => {
        raws = rws
        stops = findStops(req, trx, raws)
    
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