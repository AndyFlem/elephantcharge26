<script setup>
  import { inject, reactive} from 'vue'
  import EntryResults from './EntryResults.vue'

  const axiosPlain = inject('axiosPlain')
  const format = inject('format')

  const props = defineProps({
    charge: Object,
    leg: Object
  })

  const state = reactive({
    entries: null
  })

  axiosPlain.get(`/leg/${props.leg.leg_id}/entries`)
  .then(rows => {
    state.entries = rows.data
      
  })


const resultTableHeaders = [
    {title: '', align: 'start', sortable: true, key: 'index'},
    {title: 'No', align: 'start', sortable: true, key: 'car_no'},
    {title: 'Team', align: 'start', sortable: true, key: 'entry_name'},
    {title: 'Distance', align: 'start', sortable: true, key: 'distance_m'},
    {title: 'Multiple', align: 'start', sortable: false, key: 'distance_multiple'},
    {title: 'Start', align: 'start', sortable: true, key: 'start_time'},
    {title: 'End', align: 'start', sortable: true, key: 'end_time'},
    {title: 'Time', align: 'start', sortable: true, key: 'elapsed_s'},
  ]   
  const formatters = [
    {key: 'elapsed_s', formatter: format.secs},
    {key: 'distance_m', formatter: format.distance},
    {key: 'end_time', formatter: format.time},
    {key: 'start_time', formatter: format.time},
    {key: 'distance_multiple', formatter: format.multiple},
  ]
</script>

<template>
  <v-card v-if="props.leg">
    <v-card-title class="text-h5 d-flex">
      <span v-if="props.leg.is_gauntlet">Gauntlet -&nbsp;</span>
      <span v-if="props.leg.is_tsetse">Tsetse Line -&nbsp;</span>
      <span class="">{{ props.leg.checkpoint1_name }} - {{ props.leg.checkpoint2_name }}</span>
      <v-spacer/><span>{{ format.distance(props.leg.distance_m) }}</span>
    </v-card-title>
    <v-data-table
      :headers="resultTableHeaders"
      :items="state.entries"
      v-if="state.entries"
      item-value="name"
      items-per-page="-1"
      class="elevation-1"
      density="compact"
    >
      <template v-slot:[`item.index`]="{ index }">
        {{ index+1 }}
      </template>
      <template 
        v-for="heder in formatters" 
        v-slot:[`item.${heder.key}`]="{ _header, value }"
      >
        {{ heder.formatter(value) }}
      </template>
      <template #bottom></template>      
    </v-data-table>
  </v-card>
</template>