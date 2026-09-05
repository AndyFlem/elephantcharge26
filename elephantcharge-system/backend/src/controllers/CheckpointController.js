const Knex = require('../services/db')
const Luxon = require('luxon')
const DateTime = Luxon.DateTime
const Common = require('./CommonDebug')('Checkpoint')
const config = require('../config/config')

function extractPlacemarksFromKML(kmlString) {
  const xpath = require('xpath')
  const dom = require('@xmldom/xmldom').DOMParser

  const doc = new dom().parseFromString(kmlString, 'text/xml')
  
  const select = xpath.useNamespaces({"kml": "http://www.opengis.net/kml/2.2"})
  const nodes = select('//kml:Placemark', doc)
  return nodes.map(node => {
    const name = select('string(kml:name)', node)
    const coordinates = select('string(kml:Point/kml:coordinates)', node).split(',')
    return {name: name, lat: coordinates[1], lon: coordinates[0]}
  })
}

function streamToString (stream) {
  const chunks = []
  return new Promise((resolve, reject) => {
    stream.on('data', chunk => chunks.push(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
  })
}

async function kmlFromKmz(file){
  const yauzl = require('yauzl-promise')

  const files = []

  const zip = await yauzl.fromBuffer(file.data)

  for await (const entry of zip) {
      if (entry.filename.endsWith('.kml')) {
        const readStream = await entry.openReadStream()
        const kmlString = await streamToString(readStream)
        files.push(kmlString)
      }
  } 
  
  if (files.length === 0) { throw new Error('No KML file found in KMZ') }

  return files[0]
}

module.exports = {
  index (req, res) {
    Common.debug(req, 'index')

    Knex('v_checkpoint')
      .where({charge_id: req.params.charge_id})
      .select()
      .then(checkpoints => res.send(checkpoints))
      .catch(err => {
        Common.error(req, 'index', err)
        res.status(500).send({ error: 'an error has occured getting the checkpoints: ' + err })
      })
  },  
  show (req, res) {
    Common.debug(req, 'show')

    Knex('v_checkpoint')
      .where('checkpoint_id', req.params.checkpoint_id)      
      .select()
      .then(checkpoints => res.send(checkpoints[0]))
      .catch(err => {
        Common.error(req, 'show', err)
        res.status(500).send({ error: 'an error has occured getting the checkpoint: ' + err })
      })
  },  
  create (req, res) {
    Common.debug(req, 'create')

    const oInsert = {charge_id: req.body.charge_id, sponsor_id: req.body.sponsor_id, is_gauntlet: req.body.is_gauntlet, radius_m: req.body.radius_m}

    Knex('checkpoint')
      .insert(oInsert)      
      .returning('checkpoint_id')
      .then(checkpointIds => res.send({ checkpoint_id: checkpointIds[0].checkpoint_id }))
      .catch(err => {
        Common.error(req, 'create', err)
        res.status(500).send({ error: 'an error has occured creating the checkpoint: ' + err })
      })
  },
  async createFromKML (req, res) {
    Common.debug(req, 'createFromKML')

    const missed = []
    const inserted = []
    const updated = []

    if (!req.files) {
      return res.status(400).send("No files were uploaded.");
    }

    if (req.files.file.name.endsWith('.kmz')) {
      kml = await kmlFromKmz(req.files.file)
    } else {
      kml = req.files.file.data.toString('utf8')
    }

    const placemarks = extractPlacemarksFromKML(kml)
    
    let existing = []

    Knex.transaction(function (trx) {
      return Knex('v_checkpoint')
        .where({charge_id: req.params.charge_id})
        .transacting(trx)
        .select()
        .then(exist => {
          existing = exist
          return Promise.all(
            placemarks.map(place => {
                let indx = Math.max(existing.map(v=>v.short_name).indexOf(place.name),existing.map(v=>v.sponsor_name).indexOf(place.name) )
          
                if (indx == -1) {
                  return Knex('sponsor')
                    .where({sponsor_name: place.name})
                    .orWhere({short_name: place.name})
                    .transacting(trx)
                    .select()
                    .then(sponsors => {
                      return new Promise((resolve, reject) => {
                        if (sponsors.length>0) {
                          return Knex.raw(`INSERT INTO checkpoint (charge_id, sponsor_id, radius_m, location) VALUES 
                            (${req.params.charge_id}, ${sponsors[0].sponsor_id}, 30, st_point(${place.lon}, ${place.lat}))`)
                            .transacting(trx)
                            .then(() =>{
                              inserted.push(place.name)
                              resolve()
                            })
                            .catch(err => {
                              reject(err)
                            })
                        } else {
                          missed.push(place.name)
                          resolve()
                        }                  
                      })
                    })
                } else {
                  return Knex.raw(`UPDATE checkpoint SET location=ST_Point(${place.lon},${place.lat}), location_prj=ST_Transform(ST_Point(${place.lon},${place.lat},4326),${config.local_crs}) WHERE checkpoint_id=${existing[indx].checkpoint_id}`)
                    .transacting(trx)
                    .then(()=>{
                      updated.push(place.name)
                    })
                }
            })
          )  
        })
        .then(()=>{
          return Knex.raw(`SELECT ec23_chargecentroidfromcheckpoints(${req.params.charge_id})`)
        })
        .then(trx.commit)
        .catch(trx.rollback)        
      })
      .then(()=>{
        res.send({ message: 'ok', inserted: inserted, missed: missed, updated: updated })
      })
      .catch(err => {
        Common.error(req, '', err)
        res.status(500).send({ error: 'an error has occured importing the checkpoints: ' + err })        
      })
  },
  update (req, res) {
    Common.debug(req, 'update')

    const oUpdate = {sponsor_id: req.body.sponsor_id, is_gauntlet: req.body.is_gauntlet, radius_m: req.body.radius_m}
    let checkpoint

    Knex('checkpoint')
      .where('checkpoint_id', req.params.checkpoint_id)
      .select()     
      .then(checks => {
        checkpoint = checks[0]
        return Knex('checkpoint')
          .update(oUpdate)      
          .where('checkpoint_id', checkpoint.checkpoint_id)  
      })

      .then(()=>{
        if (req.body.lat && req.body.lon) {
          return Knex.raw(`UPDATE checkpoint SET location=ST_Point(${req.body.lon},${req.body.lat},4326), location_prj=ST_Transform(ST_Point(${req.body.lon},${req.body.lat},4326),${config.local_crs}) WHERE checkpoint_id=${checkpoint.checkpoint_id}`)          
        }    
      })
      .then(()=>{
        return Knex.raw(`SELECT ec23_chargecentroidfromcheckpoints(${checkpoint.charge_id})`)
      })
      .then(() => res.send({ message: 'ok' }))
      .catch(err => {
        Common.error(req, 'update', err)
        res.status(500).send({ error: 'an error has occured updating the checkpoint: ' + err })
      })
  },
  delete (req, res) {
    Common.debug(req, 'delete')

    Knex('checkpoint')
      .delete()      
      .where('checkpoint_id', req.params.checkpoint_id)
      .then(() => res.send({ message: 'ok' }))
      .catch(err => {
        Common.error(req, 'delete', err)
        res.status(500).send({ error: 'an error has occured deleting the checkpoint: ' + err })
      })
  }
}