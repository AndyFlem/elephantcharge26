const Knex = require('../services/db')
const config = require('../config/config')

const SqlServer = require('../services/sqlserver')

const Luxon = require('luxon')
const DateTime = Luxon.DateTime
const Common = require('./CommonDebug')('Geotab')
const GPSCommon = require('./GPSCommon')

module.exports = {
  // =======================
  // READ
  // =======================
  indexDevices (req, res) {
      Common.debug(req, 'indexDevices')
  
      SqlServer('SELECT iID, sDescription,sVIN FROM Vehicle ORDER BY sDescription')
        .then(rows => {
          res.send( rows)
        })
        .catch(err => {
          Common.error(req, 'create', err)
          res.status(500).send({ error: 'an error has occured getting the list of geotab devices: ' + err })
        })
  },
  deviceInfo (req, res) {
    Common.debug(req, 'deviceInfo')

    SqlServer(`
      SELECT TOP 10 
        CONVERT(date,dtDateTime) as date,
        count(*) as points
      FROM GPSData WHERE iVehicleID = ${req.params.device_id} 
      GROUP BY 
        CONVERT(date,dtDateTime)
      ORDER BY 
        CONVERT(date,dtDateTime) desc;`)
      .then(rows => {
        res.send( rows)
      })
      .catch(err => {
        Common.error(req, 'create', err)
        res.status(500).send({ error: 'an error has occured getting geotab device info: ' + err })
      })
  },

  // Import raw data from the Geotab SQL Server
  // Clean the raw data and produce clean data and stops
  // Prepare geometry for the raw and clean data
  importRaw (req, entry_id, device_id, date, offsetMinutes) {
    Common.debug(null, 'importRaw')

    let charge
    let add
    
    let counts
    return Knex.transaction(function (trx) {
      Knex('entry')
        .where({entry_id: entry_id})
        .select(['charge_id'])
        .transacting(trx)
      .then(chrgids=>{
        return Knex('charge')
          .where({charge_id: chrgids[0].charge_id})
          .select()
          .transacting(trx)
      })
      .then(chrgs=>{
        charge=chrgs[0]

        add = DateTime.fromISO(charge.charge_date).diff(DateTime.fromISO(date),'days').days
    
        return SqlServer(`SELECT * FROM GPSData WHERE iVehicleID = ${device_id} AND 
          CONVERT(date,dtDateTime) = '${date}' ORDER BY dtDateTime`)
        })
        .then(rows=>{
          return GPSCommon.importRaw(req, trx, entry_id, rows.map(v=>{return {datetime: DateTime.fromJSDate(v.dtDateTime), lat: v.fLatitude, lon: v.fLongitude}}), add, offsetMinutes)
        })
        .then(cnts => {
          counts = cnts
          return Knex('entry')
            .update({
              processing_status: counts.clean_count > 0 ? 'CLEAN' : 'NO_GPS', 
              gps_source_ref: counts.clean_count > 0 ? 'GEOTAB' : null,
              geotab_device_id: counts.clean_count > 0 ? device_id : null,
              gps_offset_days: counts.clean_count > 0 ? add : null
            })
            .where({entry_id: entry_id})
            .transacting(trx)    
        })       
        .then(trx.commit)
        .catch(trx.rollback)
    })
    .then(() => {
      Common.debug(null, 'importRaw', JSON.stringify(counts))
      return(counts)
    })
    .catch(err => {
      Common.debug(null, 'importRaw ERROR: ' + err)
      throw err
    })
  }
}
