const Knex = require('../services/db')
const config = require('../config/config')
const Common = require('./CommonDebug')('Tracker')
const axios = require('axios')

let trackers = {'0001':{"ip":"192.168.1.48","unit_id":"0001","last_seen":"2025-11-19T15:47:11.203Z"}}

module.exports = {
  register (req, res) {
    Common.debug(req, 'register')
    const tracker = req.body
    if (!trackers[tracker.unit_id]) {
      trackers[tracker.unit_id] = tracker
    }
    trackers[tracker.unit_id].ip = tracker.ip
    trackers[tracker.unit_id].last_seen = new Date()
    
    Common.debug(null, 'register', `Registered tracker ${JSON.stringify(trackers[tracker.unit_id])}`)

    res.send({ status: 'ok' })


    // module.exports.do_tracker_download(req, tracker)
    //   .then(() => {
    //     Common.debug(null, 'register', `All files processed for tracker ${tracker.unit_id}`)
    //     res.send({ status: 'ok' })
    //   })
    //   .catch(error => {
    //     Common.debug(null, 'register', `Error processing files for tracker ${tracker.unit_id}: ${error.message}`)
    //     res.status(500).send({ error: error.message })
    //   })
  },

  download (req, res) {
    Common.debug(req, 'download')

    const tracker = trackers[req.params.unit_id]
    if (!tracker) {
      Common.debug(null, 'download', `Tracker ${req.params.unit_id} not found`)
      return res.status(404).send({ error: 'Tracker not found' })
    }

    module.exports.do_tracker_download(req, tracker)
      .then(() => {
        Common.debug(null, 'register', `All files processed for tracker ${tracker.unit_id}`)
        res.send({ status: 'ok' })
      })
      .catch(error => {
        Common.debug(null, 'register', `Error processing files for tracker ${tracker.unit_id}: ${error.message}`)
        res.status(500).send({ error: error.message })
      })    
  },

  do_tracker_download(req, tracker) {
    Common.debug(req, 'do_tracker_download', `Processing downloads for tracker ${tracker.unit_id}`)

    if (!tracker.status || !tracker.status.track_files || !Array.isArray(tracker.status.track_files) || tracker.status.track_files.length === 0) {
      Common.debug(null, 'do_tracker_download', `No track files to download for tracker ${tracker.unit_id}`)
      return Promise.resolve()
    }

    // Create the folder /public/tracker_dowloads/year/unit_id if it doesn't exist
    const fs = require('fs')
    const path = require('path')
    const year = new Date().getFullYear()
    const dir = path.join(__dirname, '../../public/tracker_downloads', year.toString(), tracker.unit_id)
    if (!fs.existsSync(dir)){
      fs.mkdirSync(dir, { recursive: true })
      Common.debug(null, 'do_tracker_download', `Created directory ${dir} for tracker downloads`)
    }

    return new Promise(async (resolve, reject) => {
      // For each file in tracker.track_files, check if it exists in the folder and its size matches, if not download it
      try {
        for (const file of tracker.status.track_files) {
          const filePath = path.join(dir, file[0])
          if (fs.existsSync(filePath)) {
            Common.debug(null, 'do_tracker_download', `File ${filePath} exists with size ${fs.statSync(filePath).size}, expected size ${file[1]}`)
          }
          if (!fs.existsSync(filePath) || fs.statSync(filePath).size !== file[1]) {
            const fileUrl = `http://${tracker.ip}/trackfile/${file[0]}`
            Common.debug(null, 'do_tracker_download', `Downloading file ${fileUrl} to ${filePath}`)
            try {
              const response = await axios({method: 'get', url: fileUrl, responseType: 'stream'})
              await new Promise((resolveDownload, rejectDownload) => {
                const writer = fs.createWriteStream(filePath)
                response.data.pipe(writer)
                writer.on('finish', resolveDownload)
                writer.on('error', rejectDownload)
              })
            } catch (error) {
              Common.debug(null, 'do_tracker_download', `Error downloading file ${fileUrl}: ${error.message}`)
            }
          }
        }
        resolve()
      } catch (error) {
        reject(error)
      }
    }).then(() => {
      return new Promise(async (resolve, reject) => {
        // After downloading, check for files older than 2 hours and delete them from the tracker
        try {
          Common.debug(null, 'do_tracker_download', `Checking for old files to delete from tracker ${tracker.unit_id}`)
          for (const file of tracker.status.track_files) {
            const filePath = path.join(dir, file[0])
            if (fs.existsSync(filePath) && fs.statSync(filePath).size == file[1]) {
              Common.debug(null, 'do_tracker_download', `File ${file[0]} exists and size matches expected size ${file[1]}`)
              // Check if file is more than 2 hours old and delete from tracker
              const match = file[0].match(/^\d{4}_(\d{10})\.csv$/)
              if (match) {
                const fileTimestamp = match[1]
                const fileDate = new Date(
                parseInt(fileTimestamp.substring(0, 4)),
                parseInt(fileTimestamp.substring(4, 6)) - 1,
                parseInt(fileTimestamp.substring(6, 8)),
                parseInt(fileTimestamp.substring(8, 10))
                )
                const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)
                Common.debug(null, 'do_tracker_download', `File ${file[0]} date is ${fileDate}, two hours ago is ${twoHoursAgo}`)
                if (fileDate < twoHoursAgo) {
                  const deleteUrl = `http://${tracker.ip}/trackfile/${file[0]}`
                  Common.debug(null, 'do_tracker_download', `Deleting old file ${file[0]} from tracker`)
                  try {
                    await axios.delete(deleteUrl)
                    Common.debug(null, 'do_tracker_download', `Successfully deleted ${file[0]} from tracker`)
                  } catch (deleteError) {
                    Common.debug(null, 'do_tracker_download', `Error deleting file ${file[0]}: ${deleteError.message}`)
                  }
                } else {
                  Common.debug(null, 'do_tracker_download', `File ${file[0]} is not old enough to delete`)
                }
              }
            }
          }
          resolve()
        } catch (error) {
          reject(error)
        }
      })
    })
  },
  

  index (req, res) {
    //console.log(trackers)
    // Get the first 3 parts of the req IP address to scan the local network
    const promises = Object.values(trackers).map(tracker => {
      const url = `http://${tracker.ip}/status`
      return axios.get(url)
        .then(response => {
          Common.debug(null, 'index', `Successfully contacted tracker ${tracker.unit_id} at ${url}`)
          
          trackers[tracker.unit_id].last_seen = new Date()
          trackers[tracker.unit_id].status = response.data
          console.log(tracker.unit_id,trackers[tracker.unit_id])
          return { ...tracker, status: response.data, success: true }
        })
        .catch(error => {
          Common.debug(req, 'index', `Error contacting tracker ${tracker.unit_id} at ${url}: ${error.message}`)
          delete trackers[tracker.unit_id]
          return { ...tracker, status: { error: error.message }, success: false }
        })
      })
    
    Promise.all(promises)
      .then(results => {
        res.send(Object.values(trackers))
      })
      .catch(error => {
        res.status(500).send({ error: error.message })
      })
  }
}