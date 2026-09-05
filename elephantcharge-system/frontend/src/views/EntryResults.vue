<script setup>
  import { reactive, inject, watch } from 'vue'

  const axiosPlain = inject('axiosPlain')
  const format = inject('format')

  const props = defineProps({
    entry: Object,
    charge: Object
  })

  const state = reactive({
    distances: null,
  })  

  watch(() => props.entry, () => { 
    if (props.entry.entry_id) { getDistances() }
  },{immediate: true})

  function getDistances() {
    return axiosPlain.get('/entry/' + props.entry.entry_id + '/distances')
      .then(rows => {
        state.distances = Object.fromEntries(rows.data.map(d => { return [d.distance_ref, d]} ))
        console.log(state.distances)
      })
  }

/*
            'TOTAL': 0,
      'GAUNTLET': 0,
      'NON_GAUNTLET': 0,
      'TSETSE_1': 0,
      'TSETSE_2': 0,
      'GAUNTLET_PENALTIES': 0,
      'PENALTIES': 0,
      'GAUNTLET_COMPETITION': 0,
      'TOTAL_COMPETITION': 0,
      'NET': null
      */
</script>

<template>
    <v-row>
      <v-col cols="12" sm="6" md="4">
        <v-card v-if="state.distances && entry.processing_status=='LEGS'">
        <v-card-text>
          <table class="table">
            <tr><td>Actual Distance: {{ format.distance(state.distances.TOTAL.distance_m) }}</td></tr>
            <tr><td>Competition Distance: {{ format.distance(state.distances.TOTAL_COMPETITION.distance_m) }}</td></tr>
            <tr><td>Net Distance: {{ state.distances.NET ? format.distance(state.distances.NET.distance_m) : 'na'}}</td></tr>
            <tr><td></td></tr>
            <tr v-if="state.distances.GAUNTLET"><td>Gauntlet Actual Distance: {{ format.distance(state.distances.GAUNTLET.distance_m) }}</td></tr>
            <tr v-if="state.distances.GAUNTLET_PENALTIES"><td>Gauntlet penalties: {{  format.distance(state.distances.GAUNTLET_PENALTIES.distance_m) }}</td></tr>
            <tr v-if="state.distances.GAUNTLET_COMPETITION"><td>Gauntlet Competition Distance: {{ format.distance(state.distances.GAUNTLET_COMPETITION.distance_m) }}</td></tr>
          </table>
        </v-card-text>
    </v-card>
      </v-col>
    </v-row>

  
</template>