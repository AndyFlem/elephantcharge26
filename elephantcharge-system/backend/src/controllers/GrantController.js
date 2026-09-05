const Knex = require('../services/db')

const Common = require('./CommonDebug')('Grant')

module.exports = {
  // =======================
  // READ
  // =======================
  index (req, res) {
    Common.debug(req, 'index')

    Knex('v_grant')
      .where({charge_id: req.params.charge_id})
      .select()
      .orderBy('beneficiary_name')
      .then(grants => res.send(grants))
      .catch(err => {
        Common.error(req, 'index', err)
        res.status(500).send({ error: 'an error has occured getting the grants: ' + err })
      })
  },
  show (req, res) {
    Common.debug(req, 'show')

    Knex('v_grant')
      .where('grant_id', req.params.grant_id)
      .select()
      .then(grants => res.send(grants[0]))
      .catch(err => {
        Common.error(req, 'show', err)
        res.status(500).send({ error: 'an error has occured getting the grant: ' + err })
      })
  },
  // =======================
  // WRITE
  // =======================
  create (req, res) {
    Common.debug(req, 'create')

    const oInsert = {charge_id: req.body.charge_id, beneficiary_id: req.body.beneficiary_id, grant_kwacha: req.body.grant_kwacha, description: req.body.description}

    Knex('grant')
      .insert(oInsert)
      .returning('grant_id')
      .then(grantIds => res.send({ grant_id: grantIds[0].grant_id }))
      .catch(err => {
        Common.error(req, 'create', err)
        res.status(500).send({ error: 'an error has occured creating the grant: ' + err })
      })
  },
  update (req, res) {
    Common.debug(req, 'update')

    const oUpdate = {beneficiary_id: req.body.beneficiary_id, grant_kwacha: req.body.grant_kwacha, description: req.body.description}

    Knex('grant')
      .update(oUpdate)
      .where('grant_id', req.params.grant_id)
      .then(() => res.send({ message: 'ok' }))
      .catch(err => {
        Common.error(req, 'update', err)
        res.status(500).send({ error: 'an error has occured updating the grant: ' + err })
      })
  },
  delete (req, res) {
    Common.debug(req, 'delete')

    Knex('grant')
      .delete()
      .where('grant_id', req.params.grant_id)
      .then(() => res.send({ message: 'ok' }))
      .catch(err => {
        Common.error(req, 'delete', err)
        res.status(500).send({ error: 'an error has occured deleting the grant: ' + err })
      })
  },
}
