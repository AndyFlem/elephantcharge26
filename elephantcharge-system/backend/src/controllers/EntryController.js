const Knex = require('../services/db')
const TelKnex = require('../services/teltonika_db')

const Luxon = require('luxon')
const DateTime = Luxon.DateTime
const Common = require('./CommonDebug')('Entry')
const ChargeCommon = require('./ChargeCommon')
const GeotabController = require('./GeotabController')
const GPSCommon = require('./GPSCommon')
const fs = require('fs')
const path = require('path')
const config = require('../config/config')
const TeltonikaController = require('./TeltonikaController')

//NO_GPS
//CLEAN
//CHECKINS
//LEGS

function extractGPX(gpxString) {
  Common.debug(null, 'extractGPX')
  const xpath = require('xpath')
  const dom = require('@xmldom/xmldom').DOMParser

  const doc = new dom().parseFromString(gpxString, 'text/xml')

  //const select = xpath.useNamespaces({"kml": "http://www.opengis.net/kml/2.2"})
  const nodes = xpath.select(`//*[local-name()='trkpt']`, doc)
  
  return nodes.map(node => {
    const datetime = DateTime.fromISO(xpath.select(`string(*[local-name()='time'])`, node))
    const lat = xpath.select('string(@lat)', node)
    const lon = xpath.select('string(@lon)', node)
    return {lat: lat, lon: lon, datetime: datetime}
  })
}

module.exports = {
  // =======================
  // READ
  // =======================
  index (req, res) {
    Common.debug(req, 'index')

    Knex('v_entry')
      .where({charge_id: req.params.charge_id})
      .select()
      .orderBy('car_no')
      .then(entries => res.send(entries))
      .catch(err => {
        Common.error(req, 'index', err)
        res.status(500).send({ error: 'an error has occured getting the entires: ' + err })
      })
  },
  show (req, res) {
    Common.debug(req, 'show')

    let entry

    Knex.transaction(function (trx) {
      return module.exports.getEntry(req, trx, req.params.entry_id)  
        .then(ent => {
          entry = ent
        })
        .then(trx.commit)
        .catch(trx.rollback)
    })
    .then(() => {
      res.send(entry)
    })
    .catch(err => {
      Common.error(req, 'show', err)
      res.status(500).send({ error: 'An error has occured trying fetch the entry: ' + err })
    })
  },
  showGeometry (req, res) {
    Common.debug(req, 'showGeometry')

    Knex('entry_geometry')
      .where({entry_id: req.params.entry_id})
      .select(['entry_id', 'raw_line_json', 'clean_line_json', 'raws_count', 'cleans_count'])
    .then(entry => {
      res.send(entry)
    })
    .catch(err => {
      Common.error(req, 'showGeometry', err)
      res.status(500).send({ error: 'An error has occured trying fetch the entry: ' + err })
    })
  },   
  entriesForCharge (req, trx, chargeId) {
    Common.debug(req, 'entriesForCharge', 'ChargeId: ' + chargeId )

    return Knex('v_entry')
      .where({charge_id: chargeId})
      .orderBy('car_no')
      .select()
      .transacting(trx)
  },
  indexForLeg (req, res) {
    Common.debug(req, 'indexForLeg')

    Knex('v_entry')
      .join('v_entry_leg', 'v_entry.entry_id', 'v_entry_leg.entry_id')
      .where({leg_id: req.params.leg_id})
      .orderBy('v_entry_leg.leg_position')
      .select()
      .then(entries => res.send(entries))
      .catch(err => {
        Common.error(req, 'indexForLeg', err)
        res.status(500).send({ error: 'an error has occured getting the entries: ' + err })
      })
  },
  indexClasses (req, res) {
    Common.debug(req, 'indexClasses')

    Knex('class')
      .select()
      .then(classes => res.send(classes))
      .catch(err => {
        Common.error(req, 'indexClasses', err)
        res.status(500).send({ error: 'an error has occured getting the classes: ' + err })
      })
  },
  indexCategories (req, res) {
    Common.debug(req, 'indexCategories')

    Knex('category')
      .select()
      .then(categories => res.send(categories))
      .catch(err => {
        Common.error(req, 'indexCategories', err)
        res.status(500).send({ error: 'an error has occured getting the categories: ' + err })
      })
  },
  legs(req, res) {
    Common.debug(req, 'legs')

    let legs

    Knex.transaction(function (trx) {
      return module.exports.getEntry(req, trx, req.params.entry_id)  
        .then(ent => {
          return module.exports.doGetLegs(req,trx, ent.entry_id)
        })
        .then(lgs => {
          legs=lgs
        })
        .then(trx.commit)
        .catch(trx.rollback)
    })
    .then(() => {
      res.send(legs)
    })
    .catch(err => {
      Common.error(req, 'legs', err)
      res.status(500).send({ error: 'An error has occured trying fetch the legs for the entry: ' + err })
    })
  },
  kml(req, res) {
    Common.debug(req, 'kml')

    const kml = require('../services/kml')
    const fs = require('fs');
    const path = require('path');
    let kmlString

    Knex.transaction(function (trx) {
      return kml.entryKml(req, trx, req.params.entry_id)  
        .then(kmlStr => {
          kmlString = kmlStr
        })
        .then(trx.commit)
        .catch(trx.rollback)
    })
    .then(() => {
      res.send(kmlString)
    })
    .catch(err => {
      Common.error(req, 'kml', err)
      res.status(500).send({ error: 'An error has occured trying fetch the kml for the entry: ' + err })
    })
  },  
  doGetLegs (req, trx, entryId) {
    Common.debug(req, 'doGetLegs')
    
    let qry
    if (req.query.geometry=='geojson') {
      qry = Knex.raw(`SELECT vel.*, st_asgeojson(entry_leg.leg_line) AS leg_line
        FROM v_entry_leg vel INNER JOIN entry_leg ON vel.entry_leg_id = entry_leg.entry_leg_id
        WHERE vel.entry_id = ? ORDER BY vel.leg_no`, [entryId])
    } else {
      if (req.query.geometry=='kml') {
        qry = Knex.raw(`SELECT vel.*, st_askml(entry_leg.leg_line) AS leg_line
          FROM v_entry_leg vel INNER JOIN entry_leg ON vel.entry_leg_id = entry_leg.entry_leg_id
          WHERE vel.entry_id = ? ORDER BY vel.leg_no`, [entryId])  
      } else {
        qry = Knex.raw(`SELECT vel.*
          FROM v_entry_leg vel 
          WHERE vel.entry_id = ? ORDER BY vel.leg_no`, [entryId])
      }
     }
    return qry
      .transacting(trx)
      .then(dat=>{
        return dat.rows
      })
      .catch(err=>{
        Common.debug(null, 'doGetLegs', 'ERROR: ' + err)
      })
  },
  checkins(req, res) {
    Common.debug(req, 'checkins')
    let checkins

    Knex.transaction(function (trx) {
      return module.exports.getEntry(req, trx, req.params.entry_id)  
        .then(ent => {
          return module.exports.doGetCheckins(req,trx, ent.entry_id)
        })
        .then(cks => {
          checkins=cks
        })
        .then(trx.commit)
        .catch(trx.rollback)
    })
    .then(() => {
      res.send(checkins)
    })
    .catch(err => {
      Common.error(req, 'checkins', err)
      res.status(500).send({ error: 'An error has occured trying fetch the checkins for the entry: ' + err })
    })
  },
  doGetCheckins (req, trx, entryId) {
    Common.debug(null, 'doGetCheckins')

    return Knex('v_checkin')
      .where({entry_id: entryId})
      .orderBy('checkin_number')
      .transacting(trx)
      .select()
  },
  getEntry(req, trx, entryId) {
    Common.debug(null, 'getEntry')
    
    return Knex('v_entry')
      .where({entry_id: entryId})
      .select()
      .transacting(trx)
      .then(entries => {
        Common.debug(null, 'getEntry', entries[0].entry_id)
        return entries[0]
      })

  },
  getEntryByCar(req, trx, chargeRef, carNo) {
    Common.debug(req, 'getEntryByCar')
    return Knex('v_entry')
      .where({charge_ref: chargeRef, car_no: carNo})
      .transacting(trx)
      .select()
      .then(entries => {
        return entries[0]
      })
  },
  distances(req, res) {
    Common.debug(req, 'distances')

    let distances

    Knex.transaction(function (trx) {
      return Knex('v_entry_distance')
        .where({entry_id: req.params.entry_id}) 
        .then(dists => {
          distances=dists
        })
        .then(trx.commit)
        .catch(trx.rollback)
    })
    .then(() => {
      res.send(distances)
    })
    .catch(err => {
      Common.error(req, 'distances', err)
      res.status(500).send({ error: 'An error has occured trying fetch the distances for the entry: ' + err })
    })
  },
  doGetLegPoints(req, trx, entryId) {
    Common.debug(null, 'doGetLegPoints')
    
    return Knex.raw('SELECT gps_timestamp, st_x(ST_Transform(location_prj, 4326)) as lon, st_y(ST_Transform(location_prj, 4326)) as lat from gps_clean WHERE entry_id = ? ORDER BY gps_timestamp', [entryId])
      .transacting(trx)
      .then(points => {
        //console.log('points', points.rows)
        return points.rows
      })
  },

  // =======================
  // IMPORTERS
  // =======================

  doImportTeltonikaDB (req, trx, entry_id, imei) {
    Common.debug(null, 'doImportTeltonikaDB')

    let entry
    let charge
    let raws
    let count = 0

    return module.exports.doClearResult(req, trx, entry_id)
    .then(() => {
      return module.exports.getEntry(req, trx, entry_id)
    })
    .then(ent => {
      entry = ent

      return Knex('v_charge')
        .where({charge_id: entry.charge_id})
        .transacting(trx)
        .select()
    })
    .then(charges => {
      charge = charges[0]
      return TelKnex.raw('SELECT * FROM gps_raw WHERE imei=? AND gps_datetime::date = ? order by gps_datetime',[imei, charge.charge_date])
    })
    .then(dat => {
      raws = dat.rows

      return Promise.all(raws.map(row => {
        return Knex.raw(`INSERT INTO gps_clean (entry_id, gps_timestamp, location, location_prj) 
          VALUES (?, ?, ST_Point(?,?,4326), ST_Transform(ST_Point(?,?,4326),?) )
          `,[entry_id, row.gps_datetime, row.lon, row.lat, row.lon, row.lat, 'EPSG:' + config.local_crs])
          .transacting(trx)
      }))
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
      //return {raw_count: 0, clean_count: , stop_count: 0}
      if (raws.length > 0) {
        return module.exports.doCalculateCheckins(req, trx, entry_id)
      }
    })
    .then(() => {
      return raws.length
    })
  },
  importTeltonikaDB (req, res) {
    Common.debug(req, 'importTeltonikaDB')

    const entry_id = req.params.entry_id
    const imei = req.body.imei

    Knex.transaction(function (trx) {
      return module.exports.doImportTeltonikaDB(req, trx, entry_id, imei)
        .then(trx.commit)
        .catch(trx.rollback)
    })
    .then(count => {
      res.send({ok: count})
    })
    .catch(err => {
      Common.error(req, 'importTeltonikaDB', err)
      res.status(500).send({ error: 'an error has occured importing the Teltonika DB data: ' + err })
    })
  },
  importTeltonikaBin (req, res) {
    Common.debug(req, 'importTeltonikaBin')

    const entry_id = req.params.entry_id
    const imei = req.body.imei
    let counts

    if (!req.files) {
      return res.status(400).send("No files were uploaded.");
    }

    TeltonikaController.readBin(req, req.files.file.data)
      .then(raws => {
        return Promise.all(raws.map((row,i) => {
          row.imei = imei
          row.received = DateTime.now().toISO()
          row.record_no = i
          row.source='bin'
          return new Promise((resolve, reject) => {
            TelKnex('gps_raw')
              .insert(row)
              .then(resolve)
              .catch(err=>{
                console.log(`Could not insert record ${row.gps_datetime}`)
                resolve()
              })
          })
        }))
      })
      .then(()=>{
        Knex.transaction(function (trx) {
          return module.exports.doImportTeltonikaDB(req, trx, entry_id, imei)
            .then(trx.commit)
            .catch(trx.rollback)
        })
      })
      .then(() => {
        Common.debug(null, 'importTeltonikaBin', JSON.stringify(importCounts))
        res.send( {ok: counts} )
      })
      .catch(err => {
        Common.error(req, 'importTeltonikaBin', err)
        res.status(500).send({ error: 'an error has occured importing the Teltonika Bin data: ' + err })
      })

  },
  importGeotab (req, res) {
    Common.debug(req, 'importGeotab')

    const entry_id = req.params.entry_id
    const device_id = req.body.device_id
    const date = req.body.date
    const offsetMinutes = req.body.offsetMinutes
    let importCounts

    Knex.transaction(function (trx) {
      return module.exports.doClearResult(req, trx, entry_id)
        .then(trx.commit)
        .catch(trx.rollback)
    })
    .then(() => {
      return GeotabController.importRaw(req, entry_id, device_id, date, offsetMinutes)
    })
    .then(cnts => {
      importCounts = cnts
      if (importCounts.clean_count > 0) {
        return Knex.transaction(function (trx) {
          module.exports.doCalculateCheckins(req, trx, entry_id)
            .then(trx.commit)
            .catch(trx.rollback)
        })
      }
    })
    .then(() => {
      Common.debug(null, 'importGeotab', JSON.stringify(importCounts))
      res.send(importCounts)
    })
    .catch(err => {
      Common.error(req, 'importGeotab', err)
      res.status(500).send({ error: 'an error has occured importing the geotab raw gps data: ' + err })
    })
  },
  importGpx (req, res) {
    Common.debug(req, 'importGpx')

    const entry_id = req.params.entry_id

    let counts
    let entry
    let charge
    let unfiltered 

    if (!req.files) {
      return res.status(400).send("No files were uploaded.");
    }
    
    return Knex.transaction(function (trx) {
      module.exports.getEntry(req, trx, entry_id)
        .then(ent => {
          entry = ent
          return ChargeCommon.getChargeById(req, trx, entry.charge_id)
        })
        .then(chrg => {
          charge = chrg
          return module.exports.doClearResult(req, trx, entry_id)
        })
        .then(() => {
          let gpx = req.files.file.data.toString('utf8')
          unfiltered = extractGPX(gpx)
          let rows = unfiltered.filter(v=>v.datetime.diff(DateTime.fromISO(charge.charge_date),'days').days<1)
          return GPSCommon.importRaw(req, trx, entry_id, rows, 0, 0)
        })
        .then(cnts => {
          counts = cnts

          return Knex('entry')
            .update({
              processing_status: counts.clean_count > 0 ? 'CLEAN':'NO_GPS', 
              gps_source_ref: counts.clean_count > 0 ? 'GPX' : null,
              geotab_device_id: null
            })
            .where({entry_id: entry_id})
            .transacting(trx)    
        })
        .then(() => {
          if (counts.clean_count > 0 ) {
            return module.exports.doCalculateCheckins(req, trx, entry_id)
          }
        })  
        .then(trx.commit)
        .catch(trx.rollback)
      })
      .then(() => {
        Common.debug(null, 'importGpx', JSON.stringify(counts))
        res.send(counts)
      })
      .catch(err => {
        Common.error(req, 'importGpx', err)
        res.status(500).send({ error: 'an error has occured importing the raw gps data: ' + err })
      })

  },


  // =======================
  // WRITE
  // =======================
  create (req, res) {
    Common.debug(req, 'create')

    const oInsert = {charge_id: req.body.charge_id, class_id: req.body.class_id, car_id: req.body.car_id, team_id: req.body.team_id, entry_name: req.body.entry_name, car_no: req.body.car_no, processing_status:'NO_GPS', captain: req.body.captain, members: req.body.members, raised_local: req.body.raised_local, imei: req.body.imei}
    let entryId

    if (!req.body.category_ids) { req.body.category_ids=[] }

    Knex.transaction(function (trx) {
      return Knex('entry')
        .insert(oInsert)      
        .returning('entry_id')
        .transacting(trx)
        .then(entryIds => {
          entryId = entryIds[0].entry_id
        })
        .then(() => {
          return Promise.all(req.body.category_ids.map(cat => {
            return Knex('entry_category')
              .insert({entry_id: entryId, category_id: cat})
              .transacting(trx)
          }))
        })
        .then(() => {
          return Knex('entry_geometry')
            .insert({entry_id: entryId})
            .transacting(trx)
        })
        .then(trx.commit)
        .catch(trx.rollback)
      })
      .then(() => {
        res.send({ entry_id: entryId })
      })
      .catch(err => {
        Common.error(req, 'create', err)
        res.status(500).send({ error: 'an error has occured creating the entry: ' + err })
      })
  },
  update (req, res) {
    Common.debug(req, 'update')

    let category_ids
    if (req.body.category_ids) {
      if (req.body.category_ids[0] === null) {
        category_ids = []
      } else {
        category_ids = req.body.category_ids
      }
    } else {
      category_ids = []
    }
    
    const oUpdate = {
      class_id: req.body.class_id, 
      car_id: req.body.car_id, 
      team_id: req.body.team_id, 
      entry_name: req.body.entry_name, 
      car_no: req.body.car_no, 
      captain: req.body.captain, 
      members: req.body.members, 
      raised_local: req.body.raised_local, 
      imei: req.body.imei,
      dist_penalty_gauntlet: req.body.dist_penalty_gauntlet
    }

    let entry
    let charge
    let net

    Knex.transaction(function (trx) {
      return module.exports.getEntry(req, trx, req.params.entry_id)
        .then(ent => {
          entry = ent
          return Knex('charge')
            .where({charge_id: entry.charge_id})
            .transacting(trx)
        })
        .then(charges => {
          charge = charges[0]

          return Knex('entry')
            .update(oUpdate)
            .where({entry_id: req.params.entry_id})
            .transacting(trx)
        })
        .then(()=>{
          return Knex('entry_category')
            .transacting(trx)
            .where({entry_id: req.params.entry_id})
            .delete()
        })
        .then(() => {
          return Promise.all(category_ids.map(cat => {
            return Knex('entry_category')
              .insert({entry_id: req.params.entry_id, category_id: cat})
              .transacting(trx)
          }))
        })
        .then(() => {
          if (entry.dist_penalty_gauntlet != req.body.dist_penalty_gauntlet || entry.dist_penalty_nongauntlet != req.body.dist_penalty_nongauntlet || entry.raised_local != req.body.raised_local) {
            return module.exports.doUpdateDistances(req, trx, req.params.entry_id)            
          }    
        })        
        .then(trx.commit)
        .catch(trx.rollback)
    })
    .then(() => {
      res.send({'update': 'ok'})
    })
    .catch(err => {
      Common.error(req, 'update', err)
      res.status(500).send({ error: 'An error has occured trying update the entry: ' + err })
    })    
  },
  delete (req, res) {
    Common.debug(req, 'delete')

    Knex.transaction(function (trx) {
      return Knex('entry_geometry')  
        .where('entry_id', req.params.entry_id)
        .transacting(trx)
        .delete()
        .then(() => {
          return Knex('entry_category')
            .where('entry_id', req.params.entry_id)
            .transacting(trx)
            .delete()
        })
        .then(() =>{
          return Knex('entry')
            .where('entry_id', req.params.entry_id)
            .transacting(trx)
            .delete()
        })
        .then(trx.commit)
        .catch(trx.rollback)
    })
      .then(() => res.send({ message: 'ok' }))
      .catch(err => {
        Common.error(req, 'delete', err)
        res.status(500).send({ error: 'an error has occured deleting the entry: ' + err })
      })
  },
  deleteCheckin (req, res) {
    Common.debug(req, 'delete')
    Knex.transaction(function (trx) {
      Knex('checkin')
        .where({checkin_id: req.params.checkin_id})
        .delete()
        .transacting(trx)
        .then(trx.commit)
        .catch(trx.rollback)
    })
    .then(()=>{
      return module.exports.doProcessLegs(req, req.params.entry_id)
    })
    .then(() => res.send({ message: 'ok' }))
    .catch(err => {
      Common.error(req, 'delete', err)
      res.status(500).send({ error: 'an error has occured deleting the checkin: ' + err })
    })      
  },

  updateCheckpointCard (req, res) {
    Common.debug(req, 'updateCheckpointCard')

    const oUpdate = {starting_checkpoint_id: req.body.starting_checkpoint_id, complete_per_card: req.body.complete_per_card}

    Knex.transaction(function (trx) {
      return Knex('entry')
        .update(oUpdate)
        .where({entry_id: req.params.entry_id})
        .then(trx.commit)
        .catch(trx.rollback)
    })
    .then(() => {
      res.send({'update': 'ok'})
    })
    .catch(err => {
      Common.error(req, 'updateCheckpointCard', err)
      res.status(500).send({ error: 'An error has occured trying update the entry: ' + err })
    })
  },

  clearResult(req, res) {
    Common.debug(req, 'clearResult')

    Knex.transaction(function (trx) {
      return module.exports.doClearResult(req, trx, req.params.entry_id)
        .then(trx.commit)
        .catch(trx.rollback)
    })
    .then(() => {
      res.send({result: 'ok'})
    })
    .catch(err => {
      Common.error(req, 'clearResult', err)
      res.status(500).send({ error: 'An error has occured trying to clear the result for the entry: ' + err })
    })    
  },
  doClearResult(req, trx, entryId) {
    Common.debug(null, 'doClearResult')

    return module.exports.doDeleteDistances(req, trx, entryId)
      .then(() => {
        return module.exports.doDeleteLegs(req, trx, entryId)
      })
      .then(() => {
        return module.exports.doDeleteCheckins(req, trx, entryId)
      })
      .then(()=>{
        Common.debug(null, 'Delete gps_cleans')
        return Knex('gps_clean')
          .where({entry_id: entryId})
          .delete()
          .transacting(trx)
      })
      .then(()=>{
        Common.debug(null, 'Delete gps_stops')
        return Knex('gps_stop')
          .where({entry_id: entryId})
          .delete()
          .transacting(trx)  
      })
      .then(()=>{
        Common.debug(null, 'Delete gps_raw')
        return Knex('gps_raw')
          .where({entry_id: entryId})
          .delete()
          .transacting(trx)  
      })       
      .then(()=>{
        Common.debug(null, 'Reset entry_geometry')
        return Knex('entry_geometry')
          .where({entry_id: entryId})
          .update({raw_line: null, clean_line: null, raw_line_kml: null, clean_line_kml: null, raw_line_json: null, clean_line_json: null, raws_count: null, cleans_count: null, stops_count: null, raws_from: null, raws_to: null})
          .transacting(trx)
      })
      .then(() => {
        Common.debug(null, 'Update entry')
        return Knex('entry')
          .update({
            processing_status: 'NO_GPS', 
            gps_source_ref: null,
            geotab_device_id: null,
            result_status: null
          })
          .where({entry_id: entryId})
          .transacting(trx)
        })
        .then(()=>{
          Common.debug(null, 'doClearResult', 'Result Cleared')
        })
        .catch(err => {
          Common.debug(null, 'doClearResult ERROR: ', err)
          throw err
        })
  },
  doDeleteDistances(req, trx, entryId) {
    Common.debug(req, 'doDeleteDistances')

    return Knex('entry_distance')
      .where({entry_id: entryId})
      .delete()
      .transacting(trx)

  },
  doDeleteCheckins(req, trx, entryId) {
    Common.debug(null, 'doDeleteCheckins')

    return Knex('checkin')
      .where({entry_id: entryId})
      .delete()
      .transacting(trx)
      .then(()=>{
        return Knex('entry')
          .update({checkins_consistent: false, checkins_inconsistent_message: ''})
          .where({entry_id: entryId})
          .transacting(trx)
      })
      
  }, 
  doDeleteLegs(req, trx, entryId) {
    Common.debug(req, 'doDeleteLegs')

    let entry

    return Knex('entry')
      .where({entry_id: entryId})
      .transacting(trx)
      .then(ents => {
        entry = ents[0]
        // if file exists on disk, delete it
        const dirPath = path.join(__dirname, './../../public/charges/kml/')
        console.log('dirPath', dirPath)

        if (fs.existsSync(dirPath + entry.kml)) {
          fs.unlinkSync(dirPath + entry.kml)
        }

        return Knex('entry')
          .update({kml: null})
          .where({entry_id: entryId})
          .transacting(trx)
      })
      .then(() => {
        return Knex('gps_clean')
          .update({entry_leg_id: null})
          .where({entry_id: entryId})
          .transacting(trx)  
      })
      .then(() => {
        return Knex('entry_leg')
          .where({entry_id: entryId})
          .delete()
          .transacting(trx)  
      })
      .then(()=>{

        return Knex('v_leg')
          .where({charge_id: entry.charge_id, entry_count: 0})
          .transacting(trx)
      })
      .then(legs => {
        return Promise.all(legs.map(leg => {
          return Knex('leg')
            .where({leg_id: leg.leg_id})
            .delete()
            .transacting(trx)
        }))
      })
  }, 

  updateDistances (req, res) {
    Common.debug(req, 'updateDistances')

    let entry
    let distances

    Knex.transaction(function (trx) {
      return module.exports.getEntryByCar(req, trx, req.params.charge_ref, req.params.car_no)
        .then(ent => {
          entry = ent
          return module.exports.doUpdateDistances(req, trx, entry.entry_id)
        })
        .then(dists => {
          distances = dists
        })
        .then(trx.commit)
        .catch(trx.rollback)
    })
    .then(() => {
      res.send(distances)
    })
    .catch(err => {
      Common.error(req, 'updateDistances', err)
      res.status(500).send({ error: 'An error has occured trying update the distances for the entry: ' + err })
    })      
  },
  doUpdateDistances (req, trx, entryId) {
    Common.debug(null, 'doUpdateDistances', entryId)

    let entry 
    let charge

    let distances={ 
      'TOTAL': 0,
      'GAUNTLET': 0,
      'NON_GAUNTLET': 0,
      'TSETSE_1': 0,
      'TSETSE_2': 0,
      'GAUNTLET_PENALTIES': 0,
      'PENALTIES': 0,
      'GAUNTLET_COMPETITION': 0,
      'TOTAL_COMPETITION': 0,
      'NET': null
    }
    Common.debug(null, 'doUpdateDistances', 'Delete existing distances')
    return Knex('entry_distance')
      .where({entry_id: entryId})
      .delete()
      .transacting(trx)
      .then(() =>{
        Common.debug(null, 'doUpdateDistances', 'Getting entry')
        return module.exports.getEntry(req, trx, entryId)
      })
      .then(ent => {
        entry = ent
        Common.debug(null, 'doUpdateDistances', 'Getting charge')
        return ChargeCommon.getChargeById(req, trx, entry.charge_id)
      })
      .then(chg => {
        charge = chg
        Common.debug(null, 'doUpdateDistances', 'Getting legs')
        return module.exports.doGetLegs(req, trx, entryId)
      })
      .then(legs => {
        Common.debug(null, 'doUpdateDistances', 'Got legs:' + legs.length)
        for (const leg of legs) {
          distances.TOTAL += leg.distance_m
          if (leg.is_gauntlet) {
            distances.GAUNTLET += leg.distance_m
          } else {
            distances.NON_GAUNTLET += leg.distance_m
          }
          if (leg.leg_id == charge.tsetse1_leg_id) {
            distances.TSETSE_1 += leg.distance_m
          }
          if (leg.leg_id == charge.tsetse2_leg_id) {
            distances.TSETSE_2 += leg.distance_m
          }
        }

        distances.GAUNTLET_PENALTIES = entry.dist_penalty_gauntlet
        distances.PENALTIES = entry.dist_penalty_nongauntlet

        distances.GAUNTLET_COMPETITION = charge.gauntlet_multiplier * (distances.GAUNTLET + distances.GAUNTLET_PENALTIES)
        distances.TOTAL_COMPETITION = distances.GAUNTLET_COMPETITION + distances.PENALTIES + distances.NON_GAUNTLET
        
        if (entry.result_status == 'COMPLETE') {
          distances.NET = distances.TOTAL_COMPETITION - (charge.m_per_local * entry.raised_local)
        }

        let distInserts = Object.keys(distances).filter(distKey=>distances[distKey]).map(distKey=>{ 
          return Knex('entry_distance')
            .insert({
              'entry_id': entryId,
              'distance_ref': distKey,
              'distance_m': Math.floor(distances[distKey])
            })
            .transacting(trx)
        })
        Common.debug(null, 'doUpdateDistances', 'Updating distances')
        return Promise.all(distInserts)
      })
      .then(() => {
        return distances
      })
      .catch(err => {
        Common.debug(null, 'doUpdateDistances ERROR: ', err)
        throw(err)
      })
  },
  calculateCheckins(req,res) {
    Common.debug(req, 'calculateCheckins')

    let checkins

    Knex.transaction(function (trx) {
      return module.exports.doDeleteCheckins(req, trx, req.params.entry_id)
        .then(() => {
          return module.exports.doCalculateCheckins(req, trx, req.params.entry_id)
        })
        .then(chcks => {
          checkins = chcks
        })
        .then(trx.commit)
        .catch(trx.rollback)
    })
    .then(() => {
      Common.debug(null, 'calculateCheckins', `Got ${checkins.length} checkins`)
      res.send(checkins)
    })
    .catch(err => {
      Common.error(req, 'calculateCheckins', err)
      res.status(500).send({ error: 'An error has occured trying to calculate checkins for the entry: ' + err })
    })    
  },
  //Gets the ordered list of checkins (checkpoint stops) for the entry
  doCalculateCheckins(req, trx, entryId) {
    Common.debug(null, 'doCalculateCheckins', entryId)
    let charge
    let entry
    let points

    let startTime
    let endTime

    let checkin
    let checkinNumber = 0
    let checkins = []
    let last_checkpoint_id
    let last_gps_clean_id

    return module.exports.getEntry(req,trx,entryId)
      .then(ent=>{
        entry = ent
        return ChargeCommon.getChargeById(req, trx, entry.charge_id)
      })
      .then(chrg=>{
        charge = chrg

        startTime = DateTime.fromISO(charge.charge_date + 'T' + charge.start_time)
        endTime = DateTime.fromISO(charge.charge_date + 'T' + charge.end_time)
        if (entry.late_finish_min>0) {
          endTime = endTime.plus({minutes: entry.late_finish_min})
        }

        // Get all gps clean points inside a checkpoint radius
        Common.debug(null, 'doCalculateCheckins','Getting points in checkpoint radius')
        return Knex.raw(`SELECT * FROM ec23_points_within_checkpoint(${entryId}, '${startTime.toISO()}', '${endTime.toISO()}') ORDER BY gps_timestamp`)
          .transacting(trx)
      })
      .then(pnts => {
        points = pnts.rows

        //Iterate cthrough the gps points
        Common.debug(null, 'doCalculateCheckins','Iterate points')
        points.forEach((point, indx) => {
          //Test to see if the current checkin should be processed:
          //1) Last point in the set
          //2) New checkpoint_id
          //3) Same checkpoint_id but gap of 15 gps points (leave and return)
          if (indx == points.length-1 || last_checkpoint_id != point.checkpoint_id || point.gps_clean_id > (last_gps_clean_id+15)) {
            
            if (checkin) { // Previous checkin
              checkin.points.forEach(v => {
                if (v.distance_m < checkin.distance_m) {
                  checkin.checkin_number = checkinNumber
                  checkin.distance_m = Math.round(v.distance_m)
                  checkin.checkin_timestamp = v.gps_timestamp
                  checkin.gps_clean_id = v.gps_clean_id
                } 
              })
              checkin.points = []
              
              checkins.push(checkin)
            }
            checkinNumber+=1
            checkin = {
              checkpoint_id: point.checkpoint_id, 
              distance_m: 10000, 
              points: []
            }
          }
          checkin.points.push(point)
          last_checkpoint_id = point.checkpoint_id
          last_gps_clean_id = point.gps_clean_id
        })
        //Persist
        Common.debug(null, 'doCalculateCheckins','Persist')
        return Promise.all(checkins.map(ck => {
          return Knex('checkin')
            .insert({
              entry_id: entryId, 
              checkpoint_id: ck.checkpoint_id, 
              gps_clean_id: ck.gps_clean_id, 
              checkin_number: ck.checkin_number, 
              checkin_timestamp: ck.checkin_timestamp, 
              distance_m: ck.distance_m
            })
            .transacting(trx)
        }))
      })
      .then(() => {
        Common.debug(null, 'doCalculateCheckins','Update entry status')
        if (checkins.length > 0) {
          return Knex('entry')
            .update({processing_status: 'CHECKINS'})
            .where({entry_id: entryId})
            .transacting(trx)  
        }
      })
      .then(() => {
        return checkins
      })
  },

  processLegs(req, res) {
    Common.debug(req, 'processLegs')

    module.exports.doProcessLegs(req, req.params.entry_id)
      .then(result => {
        res.send({result: result})
      })
      .catch(err => {
        Common.error(req, 'processLegs', err)
        res.status(500).send({ error: 'An error has occured trying to process the legs for the entry: ' + err })
      })   

  },

  doProcessLegs(req, entryId) {
    Common.debug(null, 'doProcessLegs', entryId)

    let entry
    let charge
    let checkins
    let legs = []
    let msgs = []
    let checkpoints
    let checkpointDict = {}
    let result

    return Knex.transaction(function (trx) {
      Knex('v_entry')
        .where({entry_id: entryId})
        .select()
        .transacting(trx)
        .then(entries => {
          entry = entries[0]
          return Knex('v_checkpoint')
            .select()
            .transacting(trx)
        })
        .then(chks => {
          checkpoints = chks
          return ChargeCommon.getChargeById(req, trx, entry.charge_id)
        })
        .then(chrg => {
          charge = chrg
          if (!entry.processing_status == 'CHECKINS') { throw new Error('NO checkins, cant process legs') }
          if (!entry.starting_checkpoint_id || entry.complete_per_card == null) { throw new Error('No checkpoint card, cant process legs') }

          return module.exports.doDeleteLegs(req, trx, entryId)
        })
        .then(() => {
          return module.exports.doGetCheckins(req, trx, entryId)
        })
        .then(chks => {
          checkins = chks
          console.log("Checkins: ", checkins.length)
          if (checkins[0].checkpoint_id != entry.starting_checkpoint_id) { 
            msgs.push('Unexpected starting checkpoint: ' + checkins[0].sponsor_name)
          }

          for (let indx = 0; indx <= checkins.length - 2; indx ++) {
            if (checkpointDict[checkins[indx].checkpoint_id]) {
              msgs.push('Duplicate checkpoint: ' + checkins[indx].sponsor_name)
            }
            if (checkins[indx].checkpoint_id == checkins[indx+1].checkpoint_id) {
              msgs.push('Duplicate checkpoint: ' + checkins[indx].sponsor_name)
            }

            legs.push({
              leg_no: indx + 1,
              checkin1: checkins[indx],
              checkin2: checkins[indx+1],
            })
          }
          if (legs.length > charge.checkpoint_count) {
            msgs.push('Too many legs.')
          }
          if (legs.length < charge.checkpoint_count && entry.complete_per_card) {
            msgs.push('Checkpoint card result (complete) and track result (DNF) dont match.')
          }
          if (entry.complete_per_card && (legs[legs.length-1].checkin2.checkpoint_id != legs[0].checkin1.checkpoint_id)) {
            msgs.push(`Starting  and ending checkpoint dont match.`)
          }          

          return new Promise((resolve, reject) => {  
            let oEntry = {}
            if (msgs.length==0) {
              doAddLegs(req, trx, entry, checkpoints, legs)
                .then(() => {
                  oEntry.checkins_consistent = true    
                  oEntry.processing_status = 'LEGS'
                  oEntry.checkins_inconsistent_message = ''
                  oEntry.result_status = legs.length == charge.checkpoint_count ? 'COMPLETE':'DNF ' + legs.length
                  
                  resolve(oEntry)
                })
                .catch(err => {
                  reject(err)
                })
            } else {
              oEntry.checkins_inconsistent_message = msgs.join('\n')
              oEntry.checkins_consistent = false
              resolve(oEntry)
            }  
          })
        })
        .then(ent => {
          result=ent
          Common.debug(null, 'doProcessLegs', 'Result: ' + JSON.stringify(ent))
          return Knex('entry')
            .update(ent)
            .where({entry_id: entryId})
            .transacting(trx)         
        })
        .then(() => {
          if (result.processing_status && result.processing_status == 'LEGS') {
            return module.exports.doUpdateDistances(req, trx, entryId)
          }
        })
        .then(() => {
          if (result.processing_status && result.processing_status == 'LEGS') {
            const kml = require('../services/kml')
            return kml.entryKml(req, trx, entryId)
          }
        })
        .then(trx.commit)
        .catch(trx.rollback)            
    })
    .then(() => {
      return({result: result})
    })
    .catch(err => {
      Common.debug(null, 'doProcessLegs', err)
      throw(err)     
    })   

  }
}
async function doAddLegs(req, trx, entry, checkpoints, entryLegs) {
  Common.debug(req, 'doAddLegs')

  let legProcs = []
  let legNo = 1
  for await (const entryLeg of entryLegs) {
    legProcs.push(await new Promise( async (resolve1, reject1) => {
      let checkpoint1 = checkpoints.find(v=>v.checkpoint_id==entryLeg.checkin1.checkpoint_id)
      let checkpoint2 = checkpoints.find(v=>v.checkpoint_id==entryLeg.checkin2.checkpoint_id) 
      let oLeg
      let entryLegId

      return Knex('leg')
        .where({checkpoint1_id: entryLeg.checkin1.checkpoint_id, checkpoint2_id: entryLeg.checkin2.checkpoint_id})
        .orWhere({checkpoint1_id: entryLeg.checkin2.checkpoint_id, checkpoint2_id: entryLeg.checkin1.checkpoint_id})
        .select()
        .transacting(trx)
        .then(legs => {
          return new Promise((resolve, reject) => {
            if (legs.length>0) {
              Common.debug(null, 'doAddLegs', 'Found existing leg', legs[0])
              resolve(legs[0])
            } else {
              Common.debug(null, 'doAddLegs', 'Creating new leg')
              let oInsert = {
                checkpoint1_id: checkpoint1.checkpoint_id,
                checkpoint2_id: checkpoint2.checkpoint_id,
                is_gauntlet: (checkpoint1.is_gauntlet && checkpoint2.is_gauntlet)?true:false
              }
              Knex('leg')
                .insert(oInsert)
                .returning('leg_id')
                .transacting(trx)
                .then(ret=>{
                  oInsert.leg_id = ret[0].leg_id
                  return Knex.raw(`SELECT ec23_legdistance(${oInsert.leg_id})`)
                    .transacting(trx)
                })
                .then(()=>{
                  resolve(oInsert)
                })
                .catch(err => {
                  reject(err)
                })
            }
          })
        })
        .then(lg => {
          oLeg = lg
          Common.debug(null, 'doAddLegs', 'Adding entry_leg:' + JSON.stringify(oLeg))
          const elapsed_s = Math.floor((entryLeg.checkin2.checkin_timestamp - entryLeg.checkin1.checkin_timestamp) / 1000)
          return Knex('entry_leg')
            .insert({
              entry_id: entry.entry_id, 
              leg_id: oLeg.leg_id,
              leg_no: legNo,
              elapsed_s: elapsed_s,
              checkin1_id: entryLeg.checkin1.checkin_id,
              checkin2_id: entryLeg.checkin2.checkin_id,
              direction_forward: (entryLeg.checkin1.checkpoint_id == oLeg.checkpoint1_id)
              })
            .returning('entry_leg_id')
            .transacting(trx)
        })
        .then(elid =>{
          entryLegId = elid[0].entry_leg_id
          Common.debug(null, 'doAddLegs', 'Adding entry_leg_geometry:' + entryLegId)
          return Knex.raw(`SELECT ec23_entryleg_create_geometry(${entryLegId})`)
            .transacting(trx)
        })
        .then(()=>{
          resolve1()
        })
        .catch(err => {
          Common.debug(null, 'doAddLegs Error: ', err)
          reject1(err)
        })
    }))
    legNo+=1
  }

  for await (const proc of legProcs) {
    await proc
  }

}