const Knex = require('./db')
const Common = require('../controllers/CommonDebug')('KML')
const fs = require('fs')
const path = require('path')
const { create } = require('xmlbuilder2')

const EntryController = require('../controllers/EntryController')
const ChargeCommon = require('../controllers/ChargeCommon')
const Luxon = require('luxon')
const DateTime = Luxon.DateTime
const Duration = Luxon.Duration

module.exports = {
   chargeKml (req, trx, chargeId, animation) {
    Common.debug(null, 'chargeKml', chargeId)
    let entries
    let charge
    let kml, kmlDocument, kmlEntries
    let kmlName

    return Knex('v_charge')
      .where({'charge_id': chargeId})
      .select()
      .transacting(trx)
      .then(charges=>{
        charge=charges[0]
        
        return Knex('v_entry')
          .where({'charge_id': chargeId})
          .orderBy('car_no')
          .select()
          .transacting(trx)
      })
      .then(ents=>{
        entries = ents

        return module.exports.kmlHeader(req, trx, chargeId)
      })
      .then(ret => {
        kml=ret.kml
        kmlDocument=ret.kmlDocument
        
        kmlEntries = kmlDocument.ele('Folder')
          .ele('name').txt('Entries').up()
          .ele('open').txt('1').up()            

        req.query.geometry='kml'
        return Promise.all(entries.map((entry,i) => {
          if (entry.processing_status=='LEGS'){
            return module.exports.addEntry(req, trx, entry, kmlDocument, kmlEntries, animation, false)
          }
        }))
      })
      .then(() => {

        let out = kml.end({ prettyPrint: true })
        
          // Create the directory if it doesn't exist
          const dirPath = path.join(__dirname, './../../public/charges/kml/')
          console.log('dirPath', dirPath + charge.charge_ref)
          if (!fs.existsSync(dirPath + charge.charge_ref)){
            fs.mkdirSync(dirPath + charge.charge_ref, { recursive: false });
          }

        kmlName = charge.charge_ref + '/EC_' + charge.charge_ref + (animation?'_animation':'') + '.kml'
        fs.writeFileSync(dirPath + '/' + kmlName, out)
        return Knex('charge')
          .where({charge_id: chargeId})
          .update({kml: kmlName})
          .transacting(trx)
      })
      .then(() => {
        return {kml: kmlName}
      })
    },
    entryKml (req, trx, entryId, animation) {
      Common.debug(null, 'entryKml', entryId)
      let entry
      let charge
      let kml, kmlDocument, kmlEntries
      let kmlName

      return Knex('v_entry')
        .where({'entry_id': entryId})
        .select()
        .transacting(trx)
        .then(entries=>{
          entry=entries[0]
          
          return module.exports.kmlHeader(req, trx, entry.charge_id)
        })
        .then(ret => {
          kml=ret.kml
          kmlDocument=ret.kmlDocument
          charge=ret.charge
          
          kmlEntries = kmlDocument.ele('Folder')
            .ele('name').txt('Entries').up()
            .ele('open').txt('1').up()            

          req.query.geometry='kml'
          return module.exports.addEntry(req, trx, entry, kmlDocument, kmlEntries, animation, true)
        })
        .then(() => {

          let out = kml.end({ prettyPrint: true })
          
            // Create the directory if it doesn't exist
            const dirPath = path.join(__dirname, './../../public/charges/kml/')
            console.log('dirPath', dirPath + charge.charge_ref)
            if (!fs.existsSync(dirPath + charge.charge_ref)){
              fs.mkdirSync(dirPath + charge.charge_ref, { recursive: false });
            }

          kmlName =  + charge.charge_ref + '/' + entry.car_no + '_' + entry.entry_name + '.kml'
          fs.writeFileSync(dirPath + '/' + kmlName, out)
          return Knex('entry')
            .where({entry_id: entryId})
            .update({kml: kmlName})
            .transacting(trx)
        })
        .then(() => {
          return {kml: kmlName}
        })
    },
    kmlHeader(req, trx, chargeId) {
      Common.debug(null, 'kmlHeader', chargeId)
 
      let kml, kmlDocument, kmlCheckpoints
      let checkpoints
      let charge

      return Knex('v_charge')
        .where({charge_id: chargeId})
        .transacting(trx)
        .select()
        .then(charges => {
          charge = charges[0]

          return Knex('v_checkpoint')
            .where({charge_id: chargeId})
            .transacting(trx)
            .select()
        })
        .then(checkpts => {
          checkpoints = checkpts
          kml = create({ version: '1.0' })
          .ele('kml')
            .att('xmlns', 'http://www.opengis.net/kml/2.2')
            .att('xmlns:gx', 'http://www.google.com/kml/ext/2.2')
    
          kmlDocument = kml.ele('Document')
            .ele('name').txt(charge.charge_name).up()

          kmlDocument.ele('Style').att('id', 'cab')
            .ele('IconStyle')
              .ele('scale').txt('0.7').up()
              .ele('href').txt('http://maps.google.com/mapfiles/kml/shapes/cabs.png').up().up()
    
          kmlCheckpoints=kmlDocument.ele('Folder')
            .ele('name').txt('Checkpoints').up()
            .ele('open').txt('0').up()
    
          for (const checkpoint of checkpoints) {
            const cpobj = create(checkpoint.location_kml)
    
            kmlCheckpoints.ele('Placemark')
              .ele('name').txt(checkpoint.sponsor_name).up()
              .import(cpobj)
          }

          return { kml, kmlDocument, charge }
        })
    },

    addEntry(req, trx, entry, kmlDocument, kmlEntries, animation, includeTracks) {
      return Promise.all([
          EntryController.doGetLegs(req, trx, entry.entry_id),
          includeTracks
            ? Knex('entry_geometry')
              .where({entry_id: entry.entry_id})
              .select(['clean_line_kml'])
              .transacting(trx)
              .then(rows => rows[0] || {})
            : {},
          includeTracks
            ? Knex.raw(`SELECT gps_stop_id, start_time, end_time, elapsed_s, ST_AsKML(location) AS location_kml
              FROM gps_stop WHERE entry_id = ? ORDER BY start_time`, [entry.entry_id])
              .transacting(trx)
              .then(result => result.rows)
            : [],
          includeTracks
            ? Knex.raw(`SELECT gps_timestamp, ST_X(ST_Transform(location_prj, 4326)) AS lon, ST_Y(ST_Transform(location_prj, 4326)) AS lat
              FROM gps_raw WHERE entry_id = ? AND speed_kmh > 0 ORDER BY gps_timestamp`, [entry.entry_id])
              .transacting(trx)
              .then(result => result.rows)
            : []
        ])
        .then(([legs, geometry, stops, rawPoints]) => {
          let colCode
          if (entry.color){
            colCode = entry.color.slice(5,7)+ entry.color.slice(3,5)+ entry.color.slice(1,3)
          } else {
            colCode = 'FFFFFF'
          }
          kmlDocument.ele('Style').att('id', 'entry_' + entry.entry_id)
            .ele('LineStyle')
              .ele('color').txt('FF' + colCode).up()
              .ele('width').txt('4').up().up()

          if (includeTracks) {
            kmlDocument.ele('Style').att('id', 'entry_raw_' + entry.entry_id)
              .ele('LineStyle')
                .ele('color').txt('FFFFFFFF').up()
                .ele('width').txt('1.5').up().up()

            kmlDocument.ele('Style').att('id', 'entry_clean_' + entry.entry_id)
              .ele('LineStyle')
                .ele('color').txt('FF999999').up()
                .ele('width').txt('1.5').up().up()
          }

          const kmlEntry = kmlEntries.ele('Folder')
            .ele('name').txt(entry.car_no + ' ' + entry.entry_name).up()
            .ele('open').txt('0').up()

          const kmlLegs = kmlEntry.ele('Folder')
            .ele('name').txt('Legs').up()
            .ele('visibility').txt(animation?'0':'1').up()
            .ele('open').txt('0').up()

          for (const leg of legs) {
            const legobj = create(leg.leg_line)
            kmlLegs.ele('Placemark')
              .ele('name').txt(entry.car_no + ' ' + leg.checkpoint1_name + ' to ' + leg.checkpoint2_name).up()
              .ele('styleUrl').txt('#entry_' + entry.entry_id).up()
              .import(legobj)
          }

          if (includeTracks && rawPoints.length) {
            const rawTrack = kmlEntry.ele('Placemark')
              .ele('name').txt(entry.car_no + ' Raw').up()
              .ele('styleUrl').txt('#entry_raw_' + entry.entry_id).up()
              .ele('gx:Track')

            for (const point of rawPoints) {
              rawTrack.ele('when').txt(DateTime.fromJSDate(point.gps_timestamp).toUTC().toISO()).up()
            }
            for (const point of rawPoints) {
              rawTrack.ele('gx:coord').txt(point.lon + ' ' + point.lat + ' 0').up()
            }
          }

          if (includeTracks && geometry.clean_line_kml) {
            kmlEntry.ele('Placemark')
              .ele('name').txt(entry.car_no + ' Clean').up()
              .ele('styleUrl').txt('#entry_clean_' + entry.entry_id).up()
              .ele('LineString')
                .ele('coordinates').txt(geometry.clean_line_kml).up()
          }

          if (includeTracks) {
            const kmlStops = kmlEntry.ele('Folder')
              .ele('name').txt('Stops').up()
              .ele('visibility').txt('0').up()
              .ele('open').txt('0').up()

            for (const stop of stops) {
              const stopobj = create(stop.location_kml)
              kmlStops.ele('Placemark')
                .ele('name').txt(Duration.fromObject({seconds: stop.elapsed_s}).toFormat('hh:mm:ss')).up()
                .import(stopobj)
            }
          }

          if (animation) {
            const kmlAnim = kmlEntry.ele('Folder')
              .ele('name').txt('Animation').up()
              .ele('visibility').txt('0').up()
              .ele('open').txt('0').up()


            return EntryController.doGetLegPoints(req, trx, entry.entry_id)
              .then(points => {
                for (const point of points) {
                  kmlAnim.ele('Placemark')
                    .ele('styleUrl').txt('#cab').up()
                    .ele('Point')
                      .ele('extrude').txt('1').up()
                      .ele('coordinates').txt(point.lon + ',' + point.lat + ',0').up().up()
                    .ele('TimeSpan')
                      .ele('begin').txt(DateTime.fromJSDate(point.gps_timestamp).toISOTime()).up()
                      .ele('end').txt(DateTime.fromJSDate(point.gps_timestamp).plus({seconds:90}).toISOTime()).up()
                }
              })
          }

        })
    }
}
