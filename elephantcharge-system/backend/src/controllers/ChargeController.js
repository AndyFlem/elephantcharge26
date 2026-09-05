const Knex = require('../services/db')
const Luxon = require('luxon')
const DateTime = Luxon.DateTime

const Common = require('./CommonDebug')('Charge')

const ChargeCommon = require('./ChargeCommon')
const EntryController = require('./EntryController')

module.exports = {
  // =======================
  // READ
  // =======================
  index (req, res) {
    Common.debug(req, 'index')

    Knex('v_charge')
      .select()
      .then(charges => res.send(charges))
      .catch(err => {
        Common.error(req, 'index', err)
        res.status(500).send({ error: 'an error has occured getting the charges: ' + err })
      })
  },
  show (req, res) {
    Common.debug(req, 'show')

    let charge

    Knex.transaction(function (trx) {
      return ChargeCommon.getChargeByRef(req, trx, req.params.charge_id)
        .then(chge => {
          if (chge) {
            charge = chge
          } else {
            return ChargeCommon.getChargeById(req, trx, req.params.charge_id)
            .then(chge => {
              charge = chge
            })    
          }          
        })      
        .then(trx.commit)
        .catch(trx.rollback)
      })
      .then(() => {
        res.send(charge)
      })
      .catch(err => {
        Common.error(req, 'index', err)
        res.status(500).send({ error: 'an error has occured getting the charge: ' + err })
      })
  }, 
  carNosAvailable(req, res) {
    Common.debug(req, 'entryNosAvailable')

    Knex.raw('SELECT car_no FROM generate_series(1, 99) car_no where car_no not in (SELECT e.car_no from entry e inner join charge c on e.charge_id=c.charge_id where c.charge_id=?)', [req.params.charge_id])
      .then(carNos => res.send(carNos.rows))
      .catch(err => {
        Common.error(req, 'carNosAvailable', err)
        res.status(500).send({ error: 'an error has occured getting the car numbers: ' + err })
      })
  },
  kml(req, res) {
    Common.debug(req, 'kml')

    const kml = require('../services/kml')
    let response

    Knex.transaction(function (trx) {
      return kml.chargeKml(req, trx, req.params.charge_id, req.query.animation?true:false)  
        .then(resp => {
          response = resp
        })
        .then(trx.commit)
        .catch(trx.rollback)
    })
    .then(() => {
      res.send(response)
    })
    .catch(err => {
      Common.error(req, 'kml', err)
      res.status(500).send({ error: 'An error has occured trying fetch the kml for the charge: ' + err })
    })
  },  
  awards(req, res) {
    Common.debug(req, 'awards')

    let awards

    Knex.transaction(function (trx) {
      return Knex('v_award')
        .select()
        .transacting(trx) 
        .then(awds=>{
          awards = awds
        })
        .then(trx.commit)
        .catch(trx.rollback)
      })
      .then(() => {
        res.send(awards)
      })
      .catch(err => {
        Common.error(req, 'awards', err)
        res.status(500).send({ error: 'an error has occured getting the awards: ' + err })
      })
  },
  distanceAwardResults(req, res) {
    Common.debug(req, 'distanceAwardResults')


    let award
    let results

    Knex.transaction(function (trx) {
      return Knex('award')
        .where({award_id: req.params.award_id})
        .transacting(trx)
        .then(awds=>{
          award = awds[0]

          const qry = Knex('v_distanceawardresults')
            .where({charge_id: req.params.charge_id, award_id: req.params.award_id})
          
          if (award.sort_result_status) {
            qry.orderBy('leg_count', 'desc')
          }
          qry.orderBy('distance_m', 'asc')
          return qry
            .select()
            .transacting(trx)
        })
        .then(rests=>{
          results = rests
        })
        .then(trx.commit)
        .catch(trx.rollback)
      })
      .then(() => {
        res.send(results)
      })
      .catch(err => {
        Common.error(req, 'distanceAwardResults', err)
        res.status(500).send({ error: 'an error has occured getting the distance award results: ' + err })
      })
  },
  pledgeAwardResults(req, res) {
    Common.debug(req, 'pledgeAwardResults')


    let award
    let results

    Knex.transaction(function (trx) {
      return Knex('award')
        .where({award_id: req.params.award_id})
        .transacting(trx)
        .then(awds=>{
          award = awds[0]

          const qry = Knex('v_pledgeawardresults')
            .where({charge_id: req.params.charge_id, award_id: req.params.award_id})
            .whereNotNull('raised_dollars')
          
          qry.orderBy('raised_dollars', 'desc')
          return qry
            .select()
            .transacting(trx)
        })
        .then(rests=>{
          results = rests
        })
        .then(trx.commit)
        .catch(trx.rollback)
      })
      .then(() => {
        res.send(results)
      })
      .catch(err => {
        Common.error(req, 'pledgeAwardResults', err)
        res.status(500).send({ error: 'an error has occured getting the pledge award results: ' + err })
      })
  },
  awardResults(req, res) {
    Common.debug(req, 'awardResults')

    let awards
    let results=[]

    Knex.transaction(function (trx) {
      return Knex('v_award')
        .orderBy('ordinal')
        .transacting(trx)
        .then(awds=>{
          awards = awds

          return Promise.all(awards.map(award=>{
            const qry = Knex(award.type_ref=='DISTANCE' ? 'v_distanceawardresults' : 'v_pledgeawardresults')
              .where({charge_id: req.params.charge_id, award_id: award.award_id})
          
            if (award.sort_result_status) {
              qry.orderBy('leg_count', 'desc')
            }
            if (award.type_ref=='DISTANCE') {
              qry.orderBy('distance_m', 'asc')
            } else {
              qry.orderBy('raised_dollars', 'desc')
            }
            return qry
              .select()
              .transacting(trx)
              .then(rests=>{
                award.results = rests.slice(0,3)
                results.push(award)
              }) 
          }))
        })
        .then(trx.commit)
        .catch(trx.rollback)
      })    
    .then(() => {
      res.send(results)
    })
    .catch(err => {
      Common.error(req, 'awardResults', err)
      res.status(500).send({ error: 'an error has occured getting the award results: ' + err })
    })
  },
  legs(req, res) {
    Common.debug(req, 'legs')

    let legs

    Knex.transaction(function (trx) {
      return Knex('v_leg')
        .where({charge_id: req.params.charge_id})
        .orderBy('is_gauntlet','desc')
        .orderBy('is_tsetse','desc')
        .select()
        .transacting(trx) 
        .then(lgs=>{
          legs = lgs
        })
        .then(trx.commit)
        .catch(trx.rollback)
      })
      .then(() => {
        res.send(legs)
      })
      .catch(err => {
        Common.error(req, 'legs', err)
        res.status(500).send({ error: 'an error has occured getting the legs: ' + err })
      })
  },

  // =======================
  // WRITE
  // =======================
  updateDistances (req, res) {
    Common.debug(req, 'updateDistances')

    let charge

    Knex.transaction(function (trx) {
      return ChargeCommon.getChargeByRef(req, trx, req.params.charge_ref)
        .then(chge => {
          charge = chge
          return EntryController.entriesForCharge(req, trx, charge.charge_id)
        })      
        .then(entries => {
          return Promise.all(entries.map(entry=>{
            return EntryController.doUpdateDistances(req, trx, entry.entry_id)
          }))
        })
        .then(trx.commit)
        .catch(trx.rollback)
      })
      .then(() => {
        res.send({result:'ok'})
      })
      .catch(err => {
        Common.error(req, 'index', err)
        res.status(500).send({ error: 'an error has occured updating distances for all entries: ' + err })
      })
  }, 
  create (req, res) {
    Common.debug(req, 'create')

    const oInsert = {map_scale:12, charge_name: req.body.charge_name, charge_ref: req.body.charge_ref, location: req.body.location, charge_date: req.body.charge_date, start_time: req.body.start_time, end_time: req.body.end_time, m_per_local: req.body.m_per_local, exchange_rate: req.body.exchange_rate, gauntlet_multiplier: req.body.gauntlet_multiplier}

    Knex('charge')
      .insert(oInsert)      
      .returning('charge_id')
      .then(chargeIds => res.send({ charge_id: chargeIds[0].charge_id }))
      .catch(err => {
        Common.error(req, 'create', err)
        res.status(500).send({ error: 'an error has occured creating the charge: ' + err })
      })
  },
  update (req, res) {
    Common.debug(req, 'update')

    const oUpdate = {charge_name: req.body.charge_name, charge_ref: req.body.charge_ref, location: req.body.location, charge_date: req.body.charge_date, start_time: req.body.start_time, end_time: req.body.end_time, m_per_local: req.body.m_per_local, exchange_rate: req.body.exchange_rate, gauntlet_multiplier: req.body.gauntlet_multiplier}

    Knex('charge')
      .update(oUpdate)      
      .where('charge_id', req.params.charge_id)
      .then(() => res.send({ message: 'ok' }))
      .catch(err => {
        Common.error(req, 'update', err)
        res.status(500).send({ error: 'an error has occured updating the charge: ' + err })
      })
  },
  delete (req, res) {
    Common.debug(req, 'delete')

    Knex('charge')
      .delete()      
      .where('charge_id', req.params.charge_id)
      .then(() => res.send({ message: 'ok' }))
      .catch(err => {
        Common.error(req, 'delete', err)
        res.status(500).send({ error: 'an error has occured deleting the charge: ' + err })
      })
  },
  createTsetse (req, res) {
    Common.debug(req, 'createTsetse')

    let charge
    let tsetse_no

    Knex.transaction(function (trx) {
      return ChargeCommon.getChargeById(req, trx, req.params.charge_id)
        .then(chge => {
          charge = chge
          let qry = Knex('charge')
            .where({charge_id: charge.charge_id})
          
          console.log('tsl1', charge.tsetse1_leg_id)
          console.log('tsl2', charge.tsetse2_leg_id)

          if (!charge.tsetse1_leg_id) {
            qry.update({tsetse1_leg_id: req.body.leg_id})
            tsetse_no = 1
          } else {
            if (!charge.tsetse2_leg_id) {
              qry.update({tsetse2_leg_id: req.body.leg_id})
              tsetse_no = 2
            }  
          }
          
          return qry
            .transacting(trx)
        })
        .then(() => {
          return Knex('leg')
            .update({is_tsetse: true})
            .where({leg_id: req.body.leg_id})
            .transacting(trx)
        })
        .then(() => {
          return Knex('entry_leg')
            .where({leg_id: req.body.leg_id})

            .select(['entry_id', 'leg_id', 'distance_m'])
            .transacting(trx)
        })
        .then(eLegs => {
          return Promise.all(eLegs.map(eLeg=>{
            console.log('Create ', eLeg, tsetse_no)
            return Knex('entry_distance')
              .insert({entry_id: eLeg.entry_id, distance_ref: 'TSETSE_' + tsetse_no, distance_m: eLeg.distance_m})
              .transacting(trx)
          }))
        })
        .then(trx.commit)
        .catch(trx.rollback)
    })
    .then(() => {
      res.send({result:'ok'})
    })
    .catch(err => {
      Common.error(req, 'createTsetse', err)
      res.status(500).send({ error: 'an error has occured creating the tsetse: ' + err })
    })    
  },
  deleteTsetse (req, res) {
    Common.debug(req, 'deleteTsetse')
    
    let charge
    let tsetse_no

    Knex.transaction(function (trx) {
      return ChargeCommon.getChargeById(req, trx, req.params.charge_id)
        .then(chge => {
          charge = chge
          let qry = Knex('charge')
            .where({charge_id: charge.charge_id})
    
          if (charge.tsetse1_leg_id == req.params.leg_id) {
            qry.update({tsetse1_leg_id: null})
            tsetse_no = 1
          } 
          if (charge.tsetse2_leg_id == req.params.leg_id) {
            qry.update({tsetse2_leg_id: null})
            tsetse_no = 2
          }
          
          return qry
            .transacting(trx)
        })
        .then(() => {
          return Knex('leg')
            .update({is_tsetse: false})
            .where({leg_id: req.params.leg_id})
            .transacting(trx)
        })
        .then(() => {
          return Knex('entry_leg')
            .where({leg_id: req.params.leg_id})
            .select(['entry_id', 'leg_id'])
            .transacting(trx)
        })
        .then(eLegs => {
          return Promise.all(eLegs.map(eLeg=>{
            console.log('Delete eLeg', eLeg, tsetse_no)
            return Knex('entry_distance')
              .where({entry_id: eLeg.entry_id, distance_ref: 'TSETSE_' + tsetse_no})
              .delete()
              .transacting(trx)
          }))
        })        
        .then(trx.commit)
        .catch(trx.rollback)
    })
    .then(() => {
      res.send({result:'ok'})
    })
    .catch(err => {
      Common.error(req, 'deleteTsetse', err)
      res.status(500).send({ error: 'an error has occured deleting the tsetse: ' + err })
    })
  }  
}