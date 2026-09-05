const Knex = require('../services/db')
const Luxon = require('luxon')
const DateTime = Luxon.DateTime

const Common = require('./CommonDebug')('ChargeCommon')

module.exports = {
  // =======================
  // READ
  // =======================
  getChargeByRef(req, trx, chargeRef) {
    Common.debug(null, 'getChargeByRef')
    
    return Knex('v_charge')
      .where({charge_ref: chargeRef})
      .select()
      .transacting(trx)
      .then(charges => {
        if (charges.length == 1) { return charges[0]  }
        
      })
  },  
  getChargeById(req, trx, chargeId) {
    Common.debug(null, 'getChargeById', chargeId)
    
    return Knex('v_charge')
      .where({charge_id: chargeId})
      .select()
      .transacting(trx)
      .then(charges => {
        let charge
        if (charges.length == 1) { 
          charge = charges[0]
          Common.debug(null, 'getChargeById', charge.charge_ref)
        } else {
          charge = null
          Common.debug(null, 'Charge not found')
        }
  
        return charge
      })
      .catch(err => {
        Common.debug(null, 'getChargeById error: ', err)
        throw(err)
      })
  }   
}