const Knex = require('../services/db')
const Luxon = require('luxon')
const DateTime = Luxon.DateTime

const Common = require('./CommonDebug')('Sponsor')

module.exports = {
  // =======================
  // READ
  // =======================
  index (req, res) {
    Common.debug(req, 'index')

    Knex('v_sponsor')      
      .select()
      .then(sponsors => res.send(sponsors))
      .catch(err => {
        Common.error(req, 'index', err)
        res.status(500).send({ error: 'an error has occured getting the sponsors: ' + err })
      })
  },
  indexAvailableForCharge(req, res) {
    Common.debug(req, 'indexAvailableForCharge')

    req.query.include=req.query.include || -1

    Knex.raw(`SELECT * FROM v_sponsor sp
              WHERE sp.sponsor_id NOT IN 
	            (SELECT cp.sponsor_id FROM checkpoint cp WHERE cp.charge_id=? AND cp.checkpoint_id!=?)`, [req.params.charge_id, req.query.include])
      .then(sponsors => {
        res.send(sponsors.rows)
      })
      .catch(err => {
        Common.error(req, 'indexAvailableForCharge', err)
        res.status(500).send({ error: 'an error has occured getting the sponsors: ' + err })
      })
  },
  show (req, res) {
    Common.debug(req, 'show')

    Knex('v_sponsor')
      .where('sponsor_id', req.params.sponsor_id)      
      .select()
      .then(sponsors => res.send(sponsors[0]))
      .catch(err => {
        Common.error(req, 'show', err)
        res.status(500).send({ error: 'an error has occured getting the sponsor: ' + err })
      })
  },
  update (req, res) {
    Common.debug(req, 'update')

    const oUpdate = {sponsor_name: req.body.sponsor_name, sponsor_ref: req.body.sponsor_ref, short_name: req.body.short_name, website: req.body.website, email: req.body.email}

    Knex('sponsor')
      .update(oUpdate)      
      .where('sponsor_id', req.params.sponsor_id)
      .then(() => res.send({ message: 'ok' }))
      .catch(err => {
        Common.error(req, 'update', err)
        res.status(500).send({ error: 'an error has occured updating the sponsor: ' + err })
      })
  },
  create (req, res) {
    Common.debug(req, 'create')

    const oInsert = {sponsor_name: req.body.sponsor_name, sponsor_ref: req.body.sponsor_ref, short_name: req.body.short_name, website: req.body.website, email: req.body.email}

    Knex('sponsor')
      .insert(oInsert)      
      .returning('sponsor_id')
      .then(sponsorIds => res.send({ sponsor_id: sponsorIds[0].sponsor_id }))
      .catch(err => {
        Common.error(req, 'create', err)
        res.status(500).send({ error: 'an error has occured creating the sponsor: ' + err })
      })
  },
  delete (req, res) {
    Common.debug(req, 'delete')

    Knex('sponsor')
      .delete()      
      .where('sponsor_id', req.params.sponsor_id)
      .then(() => res.send({ message: 'ok' }))
      .catch(err => {
        Common.error(req, 'delete', err)
        res.status(500).send({ error: 'an error has occured deleting the sponsor: ' + err })
      })
  },  
}