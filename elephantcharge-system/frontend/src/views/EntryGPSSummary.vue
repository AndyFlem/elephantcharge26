<script setup>
  import { reactive, inject, watch } from 'vue'

  const axiosPlain = inject('axiosPlain')
  const axiosStatic = inject('axiosStatic')
  const format = inject('format')

  const props = defineProps({
    entry: Object,
    charge: Object
  })

  const state = reactive({
    summary: null,
    downloading: false
  })

  watch(() => props.entry, () => {
    if (props.entry && props.entry.entry_id) { getSummary() }
  },{immediate: true})

  function getSummary() {
    return axiosPlain.get('/entry/' + props.entry.entry_id + '/gps_summary')
      .then(rows => {
        state.summary = rows.data
      })
      .catch(err => { console.log('error', 'Error getting the gps summary', JSON.stringify(err)) })
  }

  function downloadKml() {
    state.downloading = true
    return axiosPlain.get('/entry/' + props.entry.entry_id + '/kml')
      .then(result => {
        const kmlName = result.data.kml
        return axiosStatic.get('/charges/kml/' + kmlName, { responseType: 'blob' })
      })
      .then(response => {
        const blob = new Blob([response.data], { type: 'application/vnd.google-earth.kml+xml' })
        const link = document.createElement('a')
        link.href = URL.createObjectURL(blob)
        link.download = props.entry.car_no + '_' + props.entry.entry_name + '.kml'
        link.click()
        URL.revokeObjectURL(link.href)
      })
      .catch(err => { console.log('error', 'Error generating the gps kml', JSON.stringify(err)) })
      .finally(() => { state.downloading = false })
  }
</script>

<template>
  <v-row>
    <v-col cols="12" sm="6" md="4">
      <v-card v-if="entry">
        <v-card-title class="d-flex align-center">
          GPS Data
          <v-spacer/>
          <v-btn
            v-if="entry.raws_count || entry.cleans_count"
            prepend-icon="mdi-earth"
            density="compact"
            variant="text"
            :loading="state.downloading"
            @click="downloadKml"
          >
            Download KML
          </v-btn>
        </v-card-title>
        <v-card-text>
          <table class="table">
            <tr>
              <td>Source:</td>
              <td>{{ entry.gps_source_ref || '-' }}</td>
            </tr>
            <tr>
              <td>Raw:</td>
              <td>
                {{ entry.raws_count ? format.number(entry.raws_count) + ' points' : '-' }}
                <div v-if="entry.raws_from && entry.raws_to" class="text-caption text-grey">
                  {{ format.dateTime(entry.raws_from) }} &ndash; {{ format.dateTime(entry.raws_to) }}
                </div>
              </td>
            </tr>
            <tr>
              <td>Cleans:</td>
              <td>
                {{ entry.cleans_count ? format.number(entry.cleans_count) + ' points' : '-' }}
                <div v-if="state.summary && state.summary.cleans_from && state.summary.cleans_to" class="text-caption text-grey">
                  {{ format.dateTime(state.summary.cleans_from) }} &ndash; {{ format.dateTime(state.summary.cleans_to) }}
                </div>
              </td>
            </tr>
            <tr>
              <td>Stops:</td>
              <td>{{ entry.stops_count ? format.number(entry.stops_count) : '-' }}</td>
            </tr>
          </table>
        </v-card-text>
      </v-card>
    </v-col>
  </v-row>
</template>
