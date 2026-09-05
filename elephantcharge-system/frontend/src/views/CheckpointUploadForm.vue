<script setup>
  import { ref, reactive, inject } from 'vue'
  const axiosUpload = inject('axiosUpload')

  const emit = defineEmits(['checkpointsImported'])
  const props = defineProps({
    chargeId: Number
  })

  const dialog = ref(false)
  const state = reactive({
    file: null
  })

  const alerts = reactive({
    visible:false,
    type:null,
    title: null,
    text: null
  })
  function alert(type, title, text) {
    alerts.type = type
      alerts.title = title
      alerts.text = text
      alerts.visible = true
      setTimeout(()=>{alerts.visible = false},30000)    
  }

  function show() {
    dialog.value = true
  }
  function hide() {
    state.file=null
    alerts.visible = false
    dialog.value = false
  }
  function fileSeleced() {
    state.uploadResult = ''
    const formData = new FormData()
    formData.append('file', state.file);
    axiosUpload.post('/charge/' + props.chargeId + '/checkpointsFromKML', formData)
      .then(response => {
        let msg ='Inserted: ' + response.data.inserted.length + ', updated: ' + response.data.updated.length + '. Not uploaded: ' + response.data.missed.join(', ')
        alert('success', 'Checkpoints uploaded', msg)
        emit('checkpointsImported')
      })
  }
</script>

<template>
  <slot name="activator" :activate="show"></slot>
  <v-dialog v-model="dialog" persistent max-width="600px"> 
    <v-card
      prepend-icon="mdi-target"
      :title="`Checkpoints`"
    >
      <v-card-text>
        <v-form ref="form">
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
          <v-row>
            <v-col cols="12"  class="d-flex pb-1">
              <v-file-input
                v-model="state.file"
                :rules="[v => !!v || 'File is required']"
                @update:model-value="fileSeleced"
                accept=".kmz,.kml,application/vnd.google-earth.kmz,application/vnd.google-earth.kml+xml"
                label="Checkpoints KMZ file"
                required
              ></v-file-input>
            </v-col>
          </v-row>
        </v-form>
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