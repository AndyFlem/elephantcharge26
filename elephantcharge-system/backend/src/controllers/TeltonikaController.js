const Knex = require('../services/db')
const TelKnex = require('../services/teltonika_db')
const config = require('../config/config')
const Common = require('./CommonDebug')('Teltonika')

module.exports = {
  indexIMEIs (req, res) {
    Common.debug(req, 'indexIMEIs')

    TelKnex('imei')
      .select()
      .then(rows => {
        res.send( rows)
      })
      .catch(err => {
        Common.error(req, 'indexIMEIs', err)
        res.status(500).send({ error: 'an error has occured getting the list of devices: ' + err })
      })
  },
  indexEntries (req, res) {
    Common.debug(req, 'indexEntries')

    Knex('v_entry')
      .where({charge_id: req.params.charge_id})
      .whereNotNull('imei')
      .select()
      .then(entries => res.send(entries))
      .catch(err => {
        Common.error(req, 'indexEntries', err)
        res.status(500).send({ error: 'an error has occured getting the entires: ' + err })
      })
  },
  recentTrack (req, res) {
    Common.debug(req, 'recentTrack')

    let hours = req.query.hrs || 24

    TelKnex.raw(`SELECT * FROM ec23_recentpositions(?,?)`,[req.params.imei, hours])
      .then(rows => {
        res.send( rows.rows[0])
      })
      .catch(err => {
        Common.error(req, 'recentTrack', err)
        res.status(500).send({ error: 'an error has occured getting the recent track: ' + err })
      })
  },  
  readBin (req, bin) {
    Common.debug(req, 'readBin')

    let bPoint = 0
    let records = []

    return new Promise((resolve, reject) => {
      try {
        let header = bin.slice(bPoint, bPoint+=2)
        if (header.compare(new Buffer.from([0x00, 0x0F])) !== 0 ) {
          throw new Error('Invalid header')
        }
        let IMEI = String.fromCharCode.apply(null,bin.slice(bPoint, bPoint += 15))
        Common.debug(null, 'readBin', 'IMEI:' + IMEI)
        
        let record
        while (bPoint+24 < bin.length) {
          ({record, bPoint} = readRecord(bin, bPoint))
          //Common.debug(null, 'readBin', 'Record:' +  JSON.stringify(record))
          records.push(record)
          bPoint +=41
        }
        resolve(records)
      } catch (e) {
        reject(e)
      }
    })
  }
}

function readRecord(bin, bPoint) {
  // Common.debug(null, 'readRecord', 'bPoint:' + bPoint)
  let record = {}

  let dateBytes = bin.slice(bPoint, bPoint+=8)

  record.gps_datetime = new Date(bufferToLong(dateBytes))
  record.priority = (bin.slice(bPoint, bPoint+=1)).readUInt8()
  record.lon = (bin.slice(bPoint, bPoint+=4)).readInt32BE()/10000000
  record.lat = (bin.slice(bPoint, bPoint+=4)).readInt32BE()/10000000
  record.alt = (bin.slice(bPoint, bPoint+=2)).readUInt16BE()
  record.angle = (bin.slice(bPoint, bPoint+=2)).readUInt16BE()
  record.sats = (bin.slice(bPoint, bPoint+=1)).readUInt8()
  record.speed = (bin.slice(bPoint, bPoint+=2)).readUInt16BE()
  return {record, bPoint}  
}

function bufferToLong(buffer) {
  var value = 0
  
  let byteArray = [...buffer].reverse() 
  for ( var i = byteArray.length - 1; i >= 0; i--) {
      value = (value * 256) + byteArray[i];
  }
  return value;
}