const config = require('../config/config')
const debug = require('debug')('ec23:teltonika_db')
var pg = require('pg')

pg.types.setTypeParser(20, 'text', parseInt)
pg.types.setTypeParser(1082, (value) => value)

pg.types.setTypeParser(pg.types.builtins.INT8, (value) => {
  return parseInt(value)
})

pg.types.setTypeParser(pg.types.builtins.FLOAT8, (value) => {
  return parseFloat(value)
})

pg.types.setTypeParser(pg.types.builtins.NUMERIC, (value) => {
  return parseFloat(value)
})

const knex = require('knex')({
  client: 'pg',
  version: '10',
  debug: false,//config.development_mode,
  connection: {
    host: '127.0.0.1',
    user: config.teltonika.user,
    password: config.teltonika.password,
    database: config.teltonika.database
  }
})

knex.on( 'query', function( queryData ) {
  //debug( queryData.sql + ': '+  queryData.bindings )
})

module.exports = knex
