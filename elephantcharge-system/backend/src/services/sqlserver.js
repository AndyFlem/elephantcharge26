var Connection = require('tedious').Connection
var Request = require('tedious').Request
const config = require('../config/config')
const debug = require('debug')('ec23:sqlserver')

let connection = null

connect()
function connect() {
  if (config.geotab.server) {
    connection = new Connection(config.geotab)
  
    connection.connect((err) => {
      debug('Connecting to SQL Server')
      if (err) {
        debug('Connection failed: ' + err)
      } else {
        debug('Connected')
      }
    })
    connection.on('error', err=> {
      connection = null 
      debug('Connection error: ', err)
      setTimeout(connect, 10000) 
    })
  }  
}

function exec(sql) {

  return new Promise((resolve, reject) => {
    if (!connection) {
      reject()
    }
    let columns
    const rows=[]
  
    const request = new Request(sql, statementComplete)
    request.on('columnMetadata', columnMetadata)
    request.on('row', row)

    connection.execSql(request)
         
    function statementComplete(err, rowCount) {
      if (err) {
        debug('Statement failed: ' + err)
        connection = null
        setTimeout(connect, 10000)
        reject(err)
      } else {
        debug('Statement complete, ' + rowCount + ' rows returned')
        resolve(rows)
      }
    }
    
    function columnMetadata(columnsMetadata) {
      columns=columnsMetadata.map(v=>v.colName)
    }
    
    function row(data) {
      rows.push(Object.fromEntries(data.map((val, i)=>{
        return [columns[i], val.value]
      }))) 
    }
  })
}

module.exports = exec
