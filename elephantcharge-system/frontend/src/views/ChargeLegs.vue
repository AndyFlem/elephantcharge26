<script setup>
  import { reactive, inject, watch } from 'vue'
  
  const format = inject('format')
  const axiosPlain = inject('axiosPlain')

  const props = defineProps({
    charge: Object
  })

  const state = reactive({
    legs: null
  })

  watch(()=>props.charge, () => {
    reload()
  }, { immediate: true })
  
  function reload() {
    axiosPlain.get('/charge/' + props.charge.charge_id + '/legs')
        .then(rows => {
          state.legs = rows.data
        })
  }

  function makeTsetseLine(leg) {
    axiosPlain.post(`/charge/${props.charge.charge_id}/tsetse`, {leg_id: leg.leg_id})
        .then(() => {
          reload()
        })
  }

  function deleteTsetseLine(leg) {
    axiosPlain.delete(`/charge/${props.charge.charge_id}/tsetse/${leg.leg_id}`)
        .then(() => {
          reload()
        })
  }

  const legTableHeaders = [
    {title: '', align: 'center', sortable: true, key: 'index'},
    {title: 'From', align: 'start', sortable: true, key: 'checkpoint1_name'},
    {title: 'To', align: 'start', sortable: true, key: 'checkpoint2_name'},
    {title: 'Gauntlet', align: 'center', sortable: true, key: 'is_gauntlet'},
    {title: 'Tsetse Line', align: 'center', sortable: true, key: 'is_tsetse'},
    {title: 'Entries', align: 'center', sortable: true, key: 'entry_count', formatter: format.number},
    {title: '', align: 'center', sortable: true, key: 'actions'},
  ]

</script>

<template>
  <v-row>
    <v-col class="" cols="12" sm="8">
      <v-data-table
        v-if="state.legs"
        :headers="legTableHeaders"
        :items="state.legs"
        item-value="name"
        items-per-page="-1"
        class="elevation-1"
        density="compact"
      >
        <template 
          v-for="heder in legTableHeaders.filter((h) => (h.hasOwnProperty('formatter')))" 
          v-slot:[`item.${heder.key}`]="{ value }"
        >
            {{ heder.hasOwnProperty('formatter') ? heder.formatter(value) : value}}
        </template> 
        <template v-slot:[`item.index`]="{ index }">
          {{ index+1 }}
        </template>
        <template v-slot:[`item.is_gauntlet`]="{ value }">
          {{ value ? 'Yes' : '' }}
        </template>
        <template v-slot:[`item.is_tsetse`]="{ value }">
          {{ value ? 'Yes' : '' }}
        </template>
        <template v-slot:[`item.actions`]="{ item }">
          <v-menu v-if="item.is_tsetse || (!item.is_gauntlet && (!props.charge.tsetse1_leg_id || !props.charge.tsetse2_leg_id))">
              <template v-slot:activator="{ props }">
                <v-btn class="" size="x-small" variant="text" icon="mdi-dots-vertical" v-bind="props"></v-btn>
              </template>
              <v-list density="compact">
                <v-list-item v-if="!item.is_tsetse && (!props.charge.tsetse1_leg_id || !props.charge.tsetse2_leg_id)">
                    <v-btn prepend-icon="mdi-pencil" size="small" variant="text" @click="makeTsetseLine(item)">Make tsetse line</v-btn>
                </v-list-item>
                <v-list-item v-if="item.is_tsetse">
                    <v-btn prepend-icon="mdi-delete" size="small" variant="text" @click="deleteTsetseLine(item)">Delete tsetse line</v-btn>
                </v-list-item>
              </v-list>
            </v-menu>
        </template>          
        <template #bottom></template>      
      </v-data-table>
    </v-col>
  </v-row>
</template>