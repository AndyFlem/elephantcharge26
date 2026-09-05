<script setup>
  import { reactive, inject, watch, ref } from 'vue'
  import { useRoute } from 'vue-router'
  import { DateTime } from 'luxon'

  import EntryGPSData from './EntryGPSData.vue'
  import EntryCheckpointCard from './EntryCheckpointCard.vue'
  import EntryCheckins from './EntryCheckins.vue'
  import EntryLegs from './EntryLegs.vue'
  import MapPanel from './MapPanel.vue'
  import EntryResults from './EntryResults.vue'
  import EntryForm from './EntryForm.vue'

  const axiosPlain = inject('axiosPlain')
  const axiosStatic = inject('axiosStatic')

  const format = inject('format')

  const route = useRoute()

  const showGPSDataForm = ref(false)
  const showYellowCard = ref(false)

  const entryFormShow = ref(false)


  const state = reactive({
    entryId: null,
    entry: null,
    charge: null,
  })


  const alerts = reactive({
    visible:false,
    type:null,
    title: null,
    text: null
  })

  watch(() => route.params.entry_id, newEntryId => { 
    state.entryId = newEntryId
    if (state.entryId) { getEntry() }
  },{immediate: true})

  function getEntry() {
    return axiosPlain.get('/entry/' + state.entryId)
      .then(rows => {
        state.entry = rows.data
        console.log('entry', state.entry.checkins_inconsistent_message)
        return axiosPlain.get('/charge/' + state.entry.charge_id)
      })
      .then(rows =>{
        state.charge = rows.data
      })
      .catch(err => {alert('error', 'Error', err)})
  }

  function alert(type, title, text) { 
    alerts.type = type
      alerts.title = title
      alerts.text = text
      alerts.visible = true
      setTimeout(()=>{alerts.visible = false},3000)    
  }
  function entryUpdated() {
    getEntry()
  }
  function entryGPSUpdated(){
    getEntry()
      .then(() => {
        if (state.entry.processing_status=='CHECKINS' && state.entry.starting_checkpoint_id) {
          return processLegs()
        }    
      })
  }
  function checkpopintCardUpdated(){
    getEntry()
      .then(() => {
        if (state.entry.processing_status=='CHECKINS' && state.entry.starting_checkpoint_id) {
          return processLegs()
        }
      })
  }
  function processLegs() {
    return axiosPlain.put('/entry/' + state.entry.entry_id + '/process_legs')
      .then(() => {
        return getEntry()
      })
      .catch(err =>{ alert('error','Error calculating checkins', JSON.stringify(err)) })
  }
  function clearResult() {
    return axiosPlain.put('/entry/' + state.entry.entry_id + '/clear_result')
      .then(() => {
        return getEntry()
      })
      .catch(err =>{ alert('error','Error clearing the result', JSON.stringify(err)) })   
  }

  function generateKml() {
    return axiosPlain.get('/entry/' + state.entry.entry_id + '/kml')
      .then((kml) => {
        state.entry.kml = kml
      })
      .catch(err =>{ console.log('error','Error getting the kml', JSON.stringify(err)) })   
  }

  function downloadItem( url, label ) {
    axiosStatic.get(url, { responseType: 'blob' })
      .then(response => {
        const blob = new Blob([response.data], { type: 'application/kml' })
        const link = document.createElement('a')
        link.href = URL.createObjectURL(blob)
        link.download = label
        link.click()
        URL.revokeObjectURL(link.href)
      }).catch(console.error)
  }  
</script>

<template>
  <EntryForm v-if="state.charge && state.entry" :charge-id="state.charge.charge_id" :entry-id="state.entry.entry_id" :dialog="entryFormShow" @entry-updated="entryUpdated"/>
  <EntryGPSData :dialog="showGPSDataForm" :charge="state.charge" :entry="state.entry" @closed="showGPSDataForm=false" @entry-gps-updated="entryGPSUpdated" />
  <EntryCheckpointCard :dialog="showYellowCard" :charge="state.charge" :entry="state.entry" @closed="showYellowCard=false" @checkpopint-card-updated="checkpopintCardUpdated"/>
  <v-container fluid>
    <v-alert
      :type="alerts.type"
      :title="alerts.title"
      :text="alerts.text"
      v-if="alerts.visible"
    ></v-alert>    
    <v-row>
      <v-col class="pb-0" cols="12">
        <v-card v-if="state.charge" elevation="0" border rounded>
          <v-card-title class="d-flex pb-0">
            <span class="text-h4"><router-link style="text-decoration: none;" :to="{name: 'Charge', params: {charge_id: state.charge.charge_ref }}">{{ state.charge.charge_name }}</router-link></span>
            <v-spacer/>
          </v-card-title>
          <v-card-text class="pt-1 pb-1">
            {{ DateTime.fromISO(state.charge.charge_date).toFormat('ccc d LLL y') }} {{ DateTime.fromISO(state.charge.start_time).toFormat('HH:mm') }}-{{ DateTime.fromISO(state.charge.end_time).toFormat('HH:mm') }}, <i>{{ state.charge.location }}.</i>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col class="pt-1 pb-1" cols="12">
        <v-sheet v-if="state.entry" color="" class="border rounded px-3 py-3">
          <v-row no-gutters>
            <v-col class="d-flex">
              <v-chip variant="elevated" class="mr-3 mt-1 text-h5" :color="state.entry.color">{{ state.entry.car_no }}</v-chip> <span class="text-h4">{{ state.entry.entry_name }}</span>
              <v-spacer/>
              <v-chip class="mr-3 mt-2" variant="elevated" :color="format.entryStatusColor(state.entry)">{{ format.entryStatusDescription(state.entry) }}</v-chip>
              <v-menu>
                <template v-slot:activator="{ props }">
                  <v-btn class="mt-2" density="compact" icon="mdi-dots-vertical" v-bind="props"></v-btn>
                </template>
                <v-list density="compact">
                  <v-list-item v-if="state.entry && state.charge">
                    <v-btn prepend-icon="mdi-pencil" @click="entryFormShow=true" density="compact" variant="text">Edit Entry</v-btn>
                  </v-list-item>
                  <v-list-item v-if="state.entry && state.charge">
                    <v-btn prepend-icon="mdi-map-marker" @click="showGPSDataForm=true" density="compact" variant="text">GPS Data</v-btn>
                  </v-list-item>
                  <v-list-item v-if="state.entry && state.charge">
                      <v-btn prepend-icon="mdi-file-document" @click="showYellowCard=true" density="compact" variant="text">Yellow Card</v-btn>
                  </v-list-item>
                  <v-list-item v-if="state.entry && state.charge">
                      <v-btn prepend-icon="mdi-call-split" @click="processLegs" density="compact" variant="text">Process Legs</v-btn>
                  </v-list-item>
                  <v-list-item v-if="state.entry && state.charge">
                      <v-btn prepend-icon="mdi-cancel" @click="clearResult" density="compact" variant="text">Clear Result</v-btn>
                  </v-list-item>                  
                  <v-list-item v-if="state.entry && state.charge && state.entry.kml">
                      <v-btn prepend-icon="mdi-earth" @click="downloadItem(`/charges/kml/${state.entry.kml}`,`${state.entry.kml}`)" density="compact" variant="text">Download Kml</v-btn>
                  </v-list-item>
                  <v-list-item v-if="state.entry && state.charge && !state.entry.kml && state.entry.processing_status=='LEGS'">
                      <v-btn prepend-icon="mdi-earth" @click="generateKml" density="compact" variant="text">Generate Kml</v-btn>
                  </v-list-item>                                  
                </v-list>
              </v-menu>              
            </v-col>
          </v-row>
        </v-sheet>
      </v-col>
    </v-row>
    <v-row>
      <EntryLegs v-if="state.entry && state.entry.processing_status=='LEGS'" :charge="state.charge" :entry="state.entry"/>
      <EntryCheckins v-if="state.entry && state.entry.processing_status=='CHECKINS'" :charge="state.charge" :entry="state.entry" @entry-updated="entryUpdated"/>      
    </v-row>
    <v-row>
      <v-col cols="12" sm="4">
        <MapPanel v-if="state.entry && state.charge" :charge="state.charge" :entry="state.entry"/>
      </v-col>
      <v-col cols="12" sm="8">
        <EntryResults v-if="state.entry && state.charge" :charge="state.charge" :entry="state.entry"/>
      </v-col>
    </v-row>
  </v-container>
</template>