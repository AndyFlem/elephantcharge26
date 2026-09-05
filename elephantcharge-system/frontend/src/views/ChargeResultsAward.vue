<script setup>
  import { inject, reactive} from 'vue'

  const axiosPlain = inject('axiosPlain')
  const format = inject('format')

  const props = defineProps({
    charge: Object,
    award: Object
  })

  const state = reactive({
    entries: null
  })

  if (props.award.type_ref=='DISTANCE') {
    axiosPlain.get(`/charge/${props.charge.charge_id}/distance_results/${props.award.award_id}`)
    .then(rows => {
      state.entries = rows.data
    })
  } else {
    axiosPlain.get(`/charge/${props.charge.charge_id}/pledge_results/${props.award.award_id}`)
    .then(rows => {
      state.entries = rows.data
    })
  }


const resultTableHeaders = [
    {title: 'No', align: 'start', sortable: true, key: 'index'},
    {title: 'Team', align: 'start', sortable: true, key: 'car_no'},
    {title: '', align: 'start', sortable: true, key: 'entry_name'},
    {title: 'Class', align: 'start', sortable: true, key: 'class_name'},
    {title: 'Categories', align: 'start', sortable: true, key: 'categories'},
    {title: 'Pledge $', align: 'end', sortable: true, key: 'raised_dollars'},
    {title: 'Distance', align: 'end', sortable: true, key: 'distance_m'},
    {title: 'Status', align: 'center', sortable: true, key: 'status'},
  ]  
  const formatters = [
    {key: 'raised_dollars', formatter: format.currency},
    {key: 'distance_m', formatter: format.distance},
  ]
</script>

<template>
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
      <b>{{ index+1 }}</b>
    </template>
    <template 
      v-for="heder in formatters" 
      v-slot:[`item.${heder.key}`]="{ _header, value }"
    >
      {{ heder.formatter(value) }}
    </template>
    <template v-slot:[`item.entry_name`]="{ item }">
      {{ item.entry_name }}
    </template> 

    <template v-slot:[`item.status`]="{ item }">
      <v-chip :color="format.entryStatusColor(item)">
        {{ format.entryStatusDescription(item) }}
      </v-chip>            
    </template>
    <template #bottom></template>      
  </v-data-table>
</template>