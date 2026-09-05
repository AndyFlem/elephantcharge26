import { format } from 'd3'
import { Duration } from 'luxon'
import { DateTime } from 'luxon'

export default {
  install: (app, options) => {

    app.provide('format', {

      entryStatusColor: (entry) => {
        switch(entry.processing_status) {
          case 'NO_GPS':
            return 'grey'
          case 'CLEAN':
            return 'red'
          case 'CHECKINS':
            return 'red'
          case 'LEGS':
            if (entry.result_status == 'COMPLETE') {
              return 'green'
            } else {
              return 'orange'
            }
          default:
            return '-'
        }
      },
      entryStatusDescription: (entry) => {
        switch(entry.processing_status) {
          case 'NO_GPS':
            return 'No GPS'
          case 'CLEAN':
            return 'Track'
          case 'CHECKINS':
            return 'Checkpoints'
          case 'LEGS':
            return entry.result_status
        }
      },
      distance: (value) => {
        if (!value) {
          return '-'
        } else {
          if (value<1000) {
            return format(',.2r')(value/1000) + ' km'
          }
          return format(',.3r')(value/1000) + ' km'
        }
      },
      currency: (value) => {
        return format(',.0f')(value)
      },
      number: (value) => {
        return format(',.0f')(value)
      },
      multiple: (value) => {
        return format('.1f')(value<1?1:value) + 'x'
      },
      proportion: (value) => {
        return format(',.0%')(value)
      },
      time: (value) => {
        return DateTime.fromISO(value).toFormat('HH:mm')
      },
      date: (value) => {
        return DateTime.fromISO(value).toFormat('ccc dd LLL yyyy')
      },
      dateTime: (value) => {
        return DateTime.fromISO(value).toFormat('ccc dd LLL yyyy HH:mm')
      },
      secs: (value) => {
        let dur = Duration.fromObject({ seconds: value })
        return dur.toFormat('hh:mm:ss')
      },
      speed: (value) => {
        return format('.2r')(value) + ' km/h'
      }

    })
  }
}
