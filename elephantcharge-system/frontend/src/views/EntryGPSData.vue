<script setup>
  import { reactive, inject, watch, ref, onMounted } from 'vue'
  import { DateTime } from 'luxon'

  const axiosPlain = inject('axiosPlain')
  const axiosLong = inject('axiosLong')
  const axiosUpload = inject('axiosUpload')


  const format = inject('format')

  const emit = defineEmits(['closed', 'entryGpsUpdated'])
  const props = defineProps({
    dialog: Boolean,
    entry: Object,
    charge: Object
  })

  const visible = ref(false)
  const state = reactive({
    geotabs: null,
    geotab: {
      selected: null,
      info: null,
      offset24hr: true
    },
    teltonikabinFile: null,
    gpxFile: null,
    offsetMinutes: 0
  })
  const alerts = reactive({
    visible:false,
    type:null,
    title: null,
    text: null
  })

  onMounted(() => {
    axiosPlain.get('/geotab/devices')
      .then(rows => {
        state.geotabs = rows.data
        if (props.entry) {
          if (props.entry && props.entry.geotab_device_id){
            state.geotab.selected = state.geotabs.find(g => g.iID == props.entry.geotab_device_id)
          }
        }
      })
      .catch(err => {alert('error', 'Error', JSON.stringify(err.message))})
  })
  
  watch(()=>props.dialog, newVal => {
    newVal ? show() : hide()
  })

  watch(() => props.entry, () => {
    if (props.entry && props.entry.geotab_device_id && state.geotabs) {
        state.geotab.selected = state.geotabs.find(g => g.iID == props.entry.geotab_device_id)
    }
  },{immediate: true})
    
  watch(()=>state.geotab.selected, newVal => {
    state.geotab.info = null
    axiosPlain.get('/geotab/' + newVal.iID + '/info')
      .then(rows => {
        state.geotab.info = rows.data
      })
      .catch(err => {alert('error', 'Error', JSON.stringify(err.message))})
  })

  const geotabInfoHeaders = [
    {title: 'Date', key: 'date', formatter: format.date},
    {title: 'Points', key: 'points', formatter: format.number},
    {title: '', key: 'actions'}
  ]

  function alert(type, title, text) {
    alerts.type = type
      alerts.title = title
      alerts.text = text
      alerts.visible = true
      setTimeout(()=>{alerts.visible = false},5000)    
  }

  function importGeotab(item) {
    axiosLong.post('/entry/' + props.entry.entry_id + '/importGeotab', {device_id: state.geotab.selected.iID , date: DateTime.fromISO(item.date).toISODate(), offsetMinutes: state.offsetMinutes})
      .then(counts => {
        emit('entryGpsUpdated', counts.data.count)
        hide()
      })
      .catch(err => {alert('error', 'Error', JSON.stringify(err.message))})
  }

  function importTeltonika() {
    axiosPlain.post('/entry/' + props.entry.entry_id + '/importTeltonikaDB',{imei: props.entry.imei})
      .then(counts => {
        emit('entryGpsUpdated', counts.data.count)
        hide()
      })
      .catch(err => {alert('error', 'Error', JSON.stringify(err.message))})
  }

  function binSelected() {
    //state.uploadResult = ''
    const formData = new FormData()
    formData.append('file', state.teltonikabinFile)
    formData.append('imei', props.entry.imei)
    
    axiosUpload.post('/entry/' + props.entry.entry_id + '/importTeltonikaBin', formData)
      .then(counts => {
        emit('entryGpsUpdated', counts.data.count)
        state.file=null
        hide()
      })
  }

  function gpxSelected() {
    //state.uploadResult = ''
    const formData = new FormData()
    formData.append('file', state.gpxFile);
    axiosUpload.post('/entry/' + props.entry.entry_id + '/importGpx', formData)
      .then(counts => {
        emit('entryGpsUpdated', counts.data.count)
        state.file=null
        hide()
      })
  }
  function show() {
    visible.value = true
  }
  function hide() {
    emit('closed')
    visible.value = false
  }  
</script>

<template>
  <slot name="activator" :activate="show"></slot>
  <v-dialog v-model="visible" persistent max-width="600px"> 
    <v-card :color="props.entry.processing_status=='NO_GPS'?'red-lighten-5':''">
      <v-card-title>
        <v-icon>mdi-map-marker</v-icon>
        <span>GPS Data</span> <span class="ml-2 text-subtitle-1 text-grey">{{ format.number(entry.cleans_count) }} gps points.</span>
      </v-card-title>
      <v-card-text>
        <v-row>
          <v-col>
            <v-alert
              :type="alerts.type"
              :title="alerts.title"
              :text="alerts.text"
              v-if="alerts.visible"
            ></v-alert> 
          </v-col>
        </v-row>
        <v-row v-if="state.geotabs">
          <v-col cols="12" class="pb-0 d-flex">
            <v-select
              label="Geotab Device"
              :items="state.geotabs"
              item-title="sDescription"
              :return-object="true"
              v-model="state.geotab.selected"
              density="compact"
              variant="outlined"
            ></v-select>
          </v-col>
          <v-col v-if="state.geotab.info" cols="12" class="pt-0">
            <v-text-field
              label="Raw offset minutes"
              density="compact"
              v-model="state.offsetMinutes"
              variant="outlined"
            ></v-text-field>
    
            <v-data-table
              :headers="geotabInfoHeaders"
              :items="state.geotab.info"
              item-value="name"
              class="elevation-1"
              density="compact">
              <template 
                v-for="heder in geotabInfoHeaders.filter((h) => (h.hasOwnProperty('formatter')))" 
                v-slot:[`item.${heder.key}`]="{ value }"
              >
                  {{ heder.hasOwnProperty('formatter') ? heder.formatter(value) : value}}
              </template> 
              <template v-slot:item.actions="{ item }">
                <v-btn size="small" variant="flat" @click="importGeotab(item)" icon="mdi-import"></v-btn>
              </template>                  
              <template #bottom></template> 
              </v-data-table>
          </v-col>         
        </v-row>
        <v-row no-gutters><v-col><v-divider/></v-col></v-row>
        <v-row v-if="props.entry.imei">
          <v-col cols="12">
            IMEI: {{ props.entry.imei }}
          </v-col>
          <v-col cols="12">
            <v-btn @click="importTeltonika">Import Live Teltonika</v-btn>
          </v-col>
          <v-col cols="12">
            <v-file-input
              v-model="state.teltonikabinFile"
              @update:model-value="binSelected"
              accept=".bin"
              density="compact"
              variant="outlined"
              label="Teltonika bin"
              required
            ></v-file-input>
          </v-col>
        </v-row>
        <v-row no-gutters><v-col><v-divider/></v-col></v-row>
        <v-row>
          <v-col cols="12">
            <v-file-input
              v-model="state.gpxFile"
              @update:model-value="gpxSelected"
              accept=".gpx"
              density="compact"
              variant="outlined"
              label="Track GPX file"
              required
            ></v-file-input>
          </v-col>
        </v-row>
      </v-card-text>
      <v-card-actions>
        <v-spacer></v-spacer>

        <v-btn
          text="Close"
          variant="plain"
          @click="hide"
        ></v-btn>
      </v-card-actions>      
    </v-card>
  </v-dialog>
</template>
