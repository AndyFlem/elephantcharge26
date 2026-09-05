<script setup>
  import { inject, reactive} from 'vue'
  //import { DateTime } from 'luxon'
  //import router from '@/router'

  const axiosPlain = inject('axiosPlain')

  const state = reactive({
    trackers: [],
    response: null
  })

  axiosPlain.get('/trackers')
    .then(rows => {
      state.trackers = rows.data
    })

  async function dowloadTracker(unit_id) {
    const tracker = state.trackers.find(t => t.unit_id === unit_id)
    const response = await axiosPlain.get(`/tracker/${unit_id}/download`)
    tracker.response = response.data
    console.log(response.data)
  }

</script>

<template>
  <v-container fluid>
    <template v-if="state.trackers">
      <v-row v-for="tracker in state.trackers" :key="tracker.unit_id">
        <v-col class="" cols="12">
          <v-card class="mx-auto">
            <v-card-title>
              {{ tracker.unit_id }} ({{ tracker.ip }})
            </v-card-title>
            <v-card-text>
              <div>Last Registered: {{ tracker.last_seen }}</div>
            </v-card-text>
            <v-card-text>
              <div>Status: {{ tracker.status }}</div>
            </v-card-text>
            <v-card-text>
              {{ tracker.response }}
            </v-card-text>
          </v-card>
          <v-card-actions>
            <v-btn @click="dowloadTracker(tracker.unit_id)" color="primary" text>
              Download Config
            </v-btn>
          </v-card-actions>
        </v-col>
      </v-row>
    </template>
  </v-container>
</template>
