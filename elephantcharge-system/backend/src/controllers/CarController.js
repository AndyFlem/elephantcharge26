const Knex = require('../services/db')
const Luxon = require('luxon')
const DateTime = Luxon.DateTime

const Common = require('./CommonDebug')('Car')

module.exports = {
  // =======================
  // READ
  // =======================
  index (req, res) {
    Common.debug(req, 'index')

    Knex('v_car')      
      .select()
      .then(cars => {
        cars=cars.map(c=>{
          c.car_description=c.car_name + ' - ' + (c.colour?(' ' + c.colour):'') + (c.year?(' ' + c.year):'')  + (c.make?(' ' + c.make):'')  + (c.model?(' ' + c.model):'') + (c.registration?(' ' + c.registration):'') + ', last charge: ' + c.last_charge
          return c
        })
        res.send(cars)
      })
      .catch(err => {
        Common.error(req, 'index', err)
        res.status(500).send({ error: 'an error has occured getting the cars: ' + err })
      })
  },
  indexAvailableForCharge(req, res) {
    Common.debug(req, 'indexAvailableForCharge')

    req.query.include=req.query.include || -1

    Knex.raw(`SELECT * FROM v_car cr
              WHERE cr.car_id NOT IN 
	            (SELECT car.car_id FROM car INNER JOIN entry e ON car.car_id=e.car_id WHERE e.charge_id=? AND e.entry_id!=?)`, [req.params.charge_id, req.query.include])
      .then(cars => {
        cars=cars.rows.map(c=>{
          c.car_description=c.car_name + ' - ' + (c.colour?(' ' + c.colour):'') + (c.year?(' ' + c.year):'')  + (c.make?(' ' + c.make):'')  + (c.model?(' ' + c.model):'') + (c.registration?(' ' + c.registration):'') + ', last charge: ' + c.last_charge
          return c
        })
        res.send(cars)
      })
      .catch(err => {
        Common.error(req, 'indexAvailableForCharge', err)
        res.status(500).send({ error: 'an error has occured getting the cars: ' + err })
      })
  },
  indexMakes (req, res) {
    Common.debug(req, 'indexMakes')

    Knex('make')      
      .select()
      .then(makes => res.send(makes))
      .catch(err => {
        Common.error(req, 'indexMakes', err)
        res.status(500).send({ error: 'an error has occured getting the makes: ' + err })
      })
  },
  show (req, res) {
    Common.debug(req, 'show')

    Knex('v_car')
      .where('car_id', req.params.car_id)      
      .select()
      .then(cars => res.send(cars[0]))
      .catch(err => {
        Common.error(req, 'show', err)
        res.status(500).send({ error: 'an error has occured getting the car: ' + err })
      })
  },
  update (req, res) {
    Common.debug(req, 'update')

    const oUpdate = {car_name: req.body.car_name, make_id: req.body.make_id, model: req.body.model, year: req.body.year, colour: req.body.colour, registration: req.body.registration}

    Knex('car')
      .update(oUpdate)      
      .where('car_id', req.params.car_id)
      .then(() => res.send({ message: 'ok' }))
      .catch(err => {
        Common.error(req, 'update', err)
        res.status(500).send({ error: 'an error has occured updating the car: ' + err })
      })
  },
  create (req, res) {
    Common.debug(req, 'create')

    const oInsert = {car_name: req.body.car_name, make_id: req.body.make_id, model: req.body.model, year: req.body.year, colour: req.body.colour, registration: req.body.registration}

    Knex('car')
      .insert(oInsert)      
      .returning('car_id')
      .then(carIds => res.send({ car_id: carIds[0].car_id }))
      .catch(err => {
        Common.error(req, 'create', err)
        res.status(500).send({ error: 'an error has occured creating the car: ' + err })
      })
  },
  delete (req, res) {
    Common.debug(req, 'delete')

    Knex('car')
      .delete()      
      .where('car_id', req.params.car_id)
      .then(() => res.send({ message: 'ok' }))
      .catch(err => {
        Common.error(req, 'delete', err)
        res.status(500).send({ error: 'an error has occured deleting the car: ' + err })
      })
  },  
}