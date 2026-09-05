const config = require('./config/config')
const debug = require('debug')('ec23:app')

process.env.NODE_ENV = config.development_mode ? 'development' : 'production'

const express = require('express')
const app = express()

const http = require('http').Server(app)
const bodyParser = require('body-parser')
const cors = require('cors')
const path = require('path')
const fileUpload = require("express-fileupload")

const corsOptions = {
  origin: config.cors_origin,
  optionsSuccessStatus: 200 // some legacy browsers (IE11, various SmartTVs) choke on 204
}

debug('Starting ec23 api server.')

//app.set('trust proxy', true)
app.use(bodyParser.json())
app.use(fileUpload())
app.use(cors(corsOptions))
//app.options('*', cors())

//app.use('/static', cors(corsOptions), express.static(path.join(__dirname, '/../static')))
app.use(express.static('public'))

app.use((req, res, next) => {
  if (req.query.source) {
    req.source = req.query.source
    delete req.query.source
  }
  if (req.body.source) {
    req.source = req.body.source
    delete req.body.source
  }
  let dString = req.method + ' ' + req.baseUrl + req.path
  if (req.query) {
    dString += ' Qry: ' + JSON.stringify(req.query)
  }
  if (req.form) {
    dString += ' Frm: ' + JSON.stringify(req.form)
  }  
  debug(dString)

  next()
})


require('./routes')(app)

app.listen(config.port,'0.0.0.0', () => {
  console.log(`Server listening on http://0.0.0.0:${config.port}`);
});

