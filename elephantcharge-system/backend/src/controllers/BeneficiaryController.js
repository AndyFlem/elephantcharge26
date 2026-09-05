const Knex = require('../services/db')
const path = require('path')
const fs = require('fs')

const Common = require('./CommonDebug')('Beneficiary')

const LOGO_DIR = path.join(__dirname, '../../public/beneficiaries/logos')

module.exports = {
  // =======================
  // READ
  // =======================
  index (req, res) {
    Common.debug(req, 'index')

    Knex('v_beneficiary')
      .select()
      .orderBy('name')
      .then(beneficiaries => res.send(beneficiaries))
      .catch(err => {
        Common.error(req, 'index', err)
        res.status(500).send({ error: 'an error has occured getting the beneficiaries: ' + err })
      })
  },
  show (req, res) {
    Common.debug(req, 'show')

    Knex('v_beneficiary')
      .where('beneficiary_id', req.params.beneficiary_id)
      .select()
      .then(beneficiaries => res.send(beneficiaries[0]))
      .catch(err => {
        Common.error(req, 'show', err)
        res.status(500).send({ error: 'an error has occured getting the beneficiary: ' + err })
      })
  },
  // =======================
  // WRITE
  // =======================
  update (req, res) {
    Common.debug(req, 'update')

    const oUpdate = {
      name: req.body.name,
      short_name: req.body.short_name,
      geography: req.body.geography,
      geography_description: req.body.geography_description,
      description: req.body.description,
      website: req.body.website,
      facebook: req.body.facebook,
      email_admin: req.body.email_admin,
      email_public: req.body.email_public,
      grant_description_default: req.body.grant_description_default
    }

    Knex('beneficiaries')
      .update(oUpdate)
      .where('id', req.params.beneficiary_id)
      .then(() => res.send({ message: 'ok' }))
      .catch(err => {
        Common.error(req, 'update', err)
        res.status(500).send({ error: 'an error has occured updating the beneficiary: ' + err })
      })
  },
  create (req, res) {
    Common.debug(req, 'create')

    const oInsert = {
      name: req.body.name,
      short_name: req.body.short_name,
      geography: req.body.geography,
      geography_description: req.body.geography_description,
      description: req.body.description,
      website: req.body.website,
      facebook: req.body.facebook,
      email_admin: req.body.email_admin,
      email_public: req.body.email_public,
      grant_description_default: req.body.grant_description_default
    }

    Knex('beneficiaries')
      .insert(oInsert)
      .returning('id')
      .then(ids => res.send({ beneficiary_id: ids[0].id }))
      .catch(err => {
        Common.error(req, 'create', err)
        res.status(500).send({ error: 'an error has occured creating the beneficiary: ' + err })
      })
  },
  delete (req, res) {
    Common.debug(req, 'delete')

    Knex('beneficiaries')
      .delete()
      .where('id', req.params.beneficiary_id)
      .then(() => res.send({ message: 'ok' }))
      .catch(err => {
        Common.error(req, 'delete', err)
        res.status(500).send({ error: 'an error has occured deleting the beneficiary: ' + err })
      })
  },
  uploadLogo (req, res) {
    Common.debug(req, 'uploadLogo')

    if (!req.files || !req.files.logo) {
      return res.status(400).send({ error: 'No logo file was uploaded.' })
    }

    const logo = req.files.logo
    const safeName = `${req.params.beneficiary_id}_${logo.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`

    fs.mkdirSync(LOGO_DIR, { recursive: true })

    logo.mv(path.join(LOGO_DIR, safeName), (err) => {
      if (err) {
        Common.error(req, 'uploadLogo', err)
        return res.status(500).send({ error: 'an error has occured saving the logo: ' + err })
      }

      Knex('beneficiaries')
        .update({ logo_file_name: safeName })
        .where('id', req.params.beneficiary_id)
        .then(() => res.send({ logo_file_name: safeName }))
        .catch(err => {
          Common.error(req, 'uploadLogo', err)
          res.status(500).send({ error: 'an error has occured updating the beneficiary: ' + err })
        })
    })
  },
}
