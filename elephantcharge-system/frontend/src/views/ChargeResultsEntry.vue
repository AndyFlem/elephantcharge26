<script setup>
  import { inject, reactive} from 'vue'
  import EntryResults from './EntryResults.vue'

  const axiosPlain = inject('axiosPlain')
  const format = inject('format')

  const props = defineProps({
    charge: Object,
    entry: Object
  })

  const state = reactive({
    legs: null
  })

  axiosPlain.get(`/entry/${props.entry.entry_id}/legs`)
  .then(rows => {
    state.legs = rows.data
    state.legs.map(l=>{
      l.position = l.leg_position + ' of ' + l.leg_entries
      l.type = l.is_tsetse ? 'tsetse' : (l.is_gauntlet ? 'gauntlet' : '')
    })
  })


const resultTableHeaders = [
    {title: 'No', align: 'middle', sortable: true, key: 'index'},
    {title: 'Start', align: 'start', sortable: true, key: 'start_time'},
    {title: 'End', align: 'start', sortable: true, key: 'end_time'},
    {title: 'Type', align: 'start', sortable: true, key: 'type'},
    {title: 'From', align: 'start', sortable: true, key: 'checkpoint1_name'},
    {title: 'To', align: 'start', sortable: true, key: 'checkpoint2_name'},
    {title: 'Distance', align: 'start', sortable: true, key: 'distance_m'},
    {title: 'Multiple', align: 'start', sortable: false, key: 'distance_multiple'},
    {title: 'Time', align: 'start', sortable: true, key: 'elapsed_s'},
    {title: 'Position on Leg', align: 'end', sortable: true, key: 'position'},
  ]  
  const formatters = [
    {key: 'distance_multiple', formatter: format.multiple},
    {key: 'elapsed_s', formatter: format.secs},
    {key: 'distance_m', formatter: format.distance},
    {key: 'end_time', formatter: format.time},
    {key: 'start_time', formatter: format.time},
  ]
</script>

<template>
  <v-card v-if="props.entry">
    <v-card-title class="text-h5 d-flex">
      <v-chip variant="elevated" style="min-width: 40px;" :color="entry.color">{{ entry.car_no }}</v-chip>
      <span class="pl-5">{{ props.entry.entry_name }}</span>
      <v-spacer/>
      <v-chip :color="format.entryStatusColor(entry)">
        {{ format.entryStatusDescription(entry) }}
      </v-chip>
    </v-card-title>
    <v-card-text>
      
      <entry-results :entry="props.entry" />
    </v-card-text>
    <v-data-table
      :headers="resultTableHeaders"
      :items="state.legs"
      v-if="state.legs"
      item-value="name"
      items-per-page="-1"
      class="elevation-1"
      density="compact"
    >
      <template v-slot:[`item.index`]="{ item, index }">
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