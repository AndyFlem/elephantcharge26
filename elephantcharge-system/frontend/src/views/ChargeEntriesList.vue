<script setup>
  import { reactive, inject, watch } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import { DateTime } from 'luxon'

  
  const axiosPlain = inject('axiosPlain')
  const route = useRoute()
  const router = useRouter()

  const state = reactive({
    chargeId: null,
    charge: null,
    entries: null
  })
  
  watch(
    () => route.params.charge_id,
    chargeId => {
      state.chargeId = parseInt(chargeId)
      axiosPlain.get('/charge/' + chargeId)
          .then(rows => {
            state.charge = rows.data
            reloadEntries()
          })
    }, { immediate: true }
  )

  function reloadEntries() {
    state.entries = null
    axiosPlain.get('/charge/' + state.chargeId + '/entries')
        .then(rows => {
          state.entries = rows.data
        })
  }

  const entryTableHeaders = [
    {title: '', align: 'start', sortable: true, key: 'no'},
    {title: 'No', align: 'start', sortable: true, key: 'car_no'},
    {title: 'Team', align: 'start', sortable: true, key: 'entry_name'},
    
    {title: 'Categories', align: 'start', sortable: true, key: 'categories'},
    {title: 'Captain', align: 'start', sortable: true, key: 'captain'},
    {title: 'Car', align:'center', children: [
      {title: 'Colour', align: 'start', sortable: true, key: 'colour'},
      {title: 'Year', align: 'start', sortable: true, key: 'year'},
      {title: 'Make', align: 'start', sortable: true, key: 'make'},
      {title: 'Model', align: 'start', sortable: true, key: 'model'},
    ]},
    {title: 'First Aid Kit', align: 'start', sortable: true, key: 'check'},
    {title: 'Water', align: 'start', sortable: true, key: 'check'},
    {title: 'Fire ext', align: 'start', sortable: true, key: 'check'},
    {title: 'Belts', align: 'start', sortable: true, key: 'check'},
    {title: 'GPS', align: 'start', sortable: true, key: 'check'}
  ]  
  
</script>

<template>
  <v-container fluid>
    <v-row>
      <v-col cols="12" class="pb-0">
        <v-card v-if="state.charge" elevation="0" border rounded>
  
            <v-card-title class="d-flex pb-0">
              <span class="text-h4">{{ state.charge.charge_name }}</span>
              <v-spacer/>
              <v-menu>
                <template v-slot:activator="{ props }">
                  <v-btn class="mt-2" density="compact" icon="mdi-dots-vertical" v-bind="props"></v-btn>
                </template>
                <v-list density="compact">
                  <v-list-item>
                      <v-btn prepend-icon="mdi-pencil" density="compact" variant="text" @click="chargeFormShow=true">Edit charge</v-btn>
                  </v-list-item>
                  <v-list-item>
                      <v-btn prepend-icon="mdi-delete" density="compact" variant="text" @click="deleteCharge">Delete charge</v-btn>
                  </v-list-item>
                  <v-list-item>
                      <v-btn prepend-icon="mdi-book" density="compact" variant="text" @click="router.push({ name: 'Charge Results', params: { charge_id: state.charge.charge_id } })">Results</v-btn>
                  </v-list-item>                  
                </v-list>
              </v-menu>              
            </v-card-title>
            <v-card-text class="pt-1 pb-1">
              {{ DateTime.fromISO(state.charge.charge_date).toFormat('ccc d LLL y') }} {{ DateTime.fromISO(state.charge.start_time).toFormat('HH:mm') }}-{{ DateTime.fromISO(state.charge.end_time).toFormat('HH:mm') }}, <i>{{ state.charge.location }}.</i>
            </v-card-text>
        </v-card>
      </v-col>
    </v-row>
    <v-row>
    <v-col class="" cols="12">
      <v-data-table
        v-if="state.entries"
        :headers="entryTableHeaders"
        :items="state.entries"
        :sort-by="[{key: 'car_no', order: 'asc'}]"
        item-value="name"
        items-per-page="-1"
        class="elevation-1"
        density="compact"
      >
        <template 
          v-for="heder in formatters" 
          v-slot:[`item.${heder.key}`]="{ _header, value }"
        >
          {{ heder.formatter(value) }}
        </template>
        <template v-slot:[`item.entry_name`]="{ item }">
          <router-link :to="{name: 'Entry', params: {entry_id: item.entry_id }}">{{ item.entry_name }}</router-link>
        </template> 
        <template v-slot:[`item.check`]="{ item }">
          <v-checkbox />
        </template> 
        <template v-slot:item.no="{ index }">
          {{  index+1  }}
        </template> 
        <template v-slot:item.car_no="{ item }">
          <v-chip variant="elevated" style="min-width: 40px;" :color="item.color">{{ item.car_no }}</v-chip>
        </template>        
        <template #bottom>
        </template>      
      </v-data-table>     
    </v-col>
  </v-row>    
  </v-container>
</template>