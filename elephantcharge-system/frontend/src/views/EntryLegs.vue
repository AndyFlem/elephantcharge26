<script setup>
import { reactive, inject, watch, computed } from 'vue'

const axiosPlain = inject('axiosPlain')
const format = inject('format')

const props = defineProps({
  entry: Object,
  charge: Object
})

const state = reactive({
  legs: null,
})  

watch(() => props.entry, () => { 
  if (props.entry.entry_id) { getLegs() }
},{immediate: true})

function getLegs() {
  return axiosPlain.get('/entry/' + props.entry.entry_id + '/legs')
    .then(rows => state.legs = rows.data)
}
const formatPosition = (value) => {
    return value.position + ' of ' + value.of
  }
  const legsTableHeaders = [
    {title: 'No', align: 'start', sortable: false, key: 'leg_no'},
    {title: 'From', align: 'start', sortable: false, key: 'checkpoint1_name'},
    {title: 'To', align: 'start', sortable: false, key: 'checkpoint2_name'},
    {title: 'From', align: 'start', sortable: false, key: 'start_time', formatter: format.time},
    {title: 'Checkin', align: 'start', sortable: false, key: 'end_time', formatter: format.time},
    {title: 'Type', align: 'start', sortable: false, key: 'type'},
    {title: 'Time', align: 'start', sortable: false, key: 'time', formatter: format.secs},
    {title: 'Distance', align: 'start', sortable: false, key: 'distance', formatter: format.distance},
    {title: 'Multiple', align: 'start', sortable: false, key: 'distance_multiple', formatter: format.multiple},
    {title: 'Speed', align: 'start', sortable: false, key: 'speed', formatter: format.speed},
    {title: 'Position', align: 'start', sortable: false, key: 'position', formatter: formatPosition},
  ]  
const legs = computed(() => {
    return state.legs.map(t => {
      return {
        leg_no: t.leg_no,
        checkpoint1_name: t.checkpoint1_name,
        checkpoint2_name: t.checkpoint2_name,
        start_time: t.start_time,
        end_time: t.end_time,
        type: t.is_tsetse ? 'tsetse' : (t.is_gauntlet ? 'gauntlet' : ''),
        time: t.elapsed_s/60,
        distance: t.distance_m,
        distance_multiple: t.distance_multiple,
        position:{position: t.leg_position, of: t.leg_entries},
        speed: t.speed
      }
    })
  })

</script>
<template>
  <v-col cols="12" class="pt-1">
    <v-data-table
      v-if="state.legs"
      :headers="legsTableHeaders"
      :items="legs"
      item-value="name"
      items-per-page="-1"
      class="elevation-1"
      density="compact">
    <template 
      v-for="heder in legsTableHeaders.filter((h) => (h.hasOwnProperty('formatter')))" 
      v-slot:[`item.${heder.key}`]="{ _header, value }"
    >
        {{ heder.hasOwnProperty('formatter') ? heder.formatter(value) : value}}
    </template>
    <template #bottom></template>
    </v-data-table> 

  </v-col>
</template>