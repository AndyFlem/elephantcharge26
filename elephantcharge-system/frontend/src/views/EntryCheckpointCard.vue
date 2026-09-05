<script setup>
  import { reactive, inject, watch, ref } from 'vue'

  const axiosPlain = inject('axiosPlain')

  const emit = defineEmits(['closed', 'checkpopintCardUpdated'])
  const props = defineProps({
    dialog: Boolean,
    entry: Object,
    charge: Object
  })

  const visible = ref(false)
  const form = ref()

  const state = reactive({
    checkpoints: null,
    selectedCheckpoint: null,
    completePerCard: null
  })

  const alerts = reactive({
    visible:false,
    type:null,
    title: null,
    text: null
  })

  watch(()=>props.dialog, newVal => {
    newVal ? show() : hide()
  }) 

  watch(()=>props.charge, () => {
    if (props.charge) {
      axiosPlain.get('/charge/' + props.charge.charge_id + '/checkpoints')
        .then(rows => {
          state.checkpoints = rows.data.filter(v=>!v.is_gauntlet)
          state.selectedCheckpoint = state.checkpoints.find(v=>v.checkpoint_id == props.entry.starting_checkpoint_id)
        })
    }
  }, {immediate: true}) 

  watch(()=>props.entry, () => {
    if (props.entry) {
      state.completePerCard = props.entry.complete_per_card
    }
  }, {immediate: true}) 

  function alert(type, title, text) {
    alerts.type = type
      alerts.title = title
      alerts.text = text
      alerts.visible = true
      setTimeout(()=>{alerts.visible = false},3000)    
  }

  function show() {
    visible.value = true
  }
  function hide() {
    emit('closed')
    visible.value = false
  }  
  function submit() {
    if (form.value){
      axiosPlain.put('/entry/' + props.entry.entry_id + '/update_checkpoint_card', {
      starting_checkpoint_id: state.selectedCheckpoint.checkpoint_id,
      complete_per_card: state.completePerCard
    })
      .then(() => {
        hide()
        emit('checkpopintCardUpdated')
      })
      .catch(err => {alert('error', 'Error', JSON.stringify(err.message))})
    }
 }
</script>

<template>
  <slot name="activator" :activate="show"></slot>
  <v-dialog v-model="visible" persistent max-width="600px"> 
    <v-alert
      :type="alerts.type"
      :title="alerts.title"
      :text="alerts.text"
      v-if="alerts.visible"
    ></v-alert>
    
    <v-card v-if="props.charge && props.entry" :color="'yellow-lighten-4'">
      <v-form v-model="form" @submit.prevent="submit">
        <v-card-title>
          <v-icon class="mr-2">mdi-file-document</v-icon>
          <span>Competition Record Card</span>
        </v-card-title>
        <v-card-text>
            <v-col cols="6"  class="pt-4 pb-1">
              <v-select
                label="Starting Checkpoint"
                :items="state.checkpoints"
                item-title="sponsor_name"
                :return-object="true"
                v-model="state.selectedCheckpoint"
                :rules="[v => {
                  return !!v || 'Starting checkpoint is required'
                  }]"
                density="compact"
                variant="outlined"
              ></v-select>
            </v-col>        
            <v-col cols="6"  class="pt-1 pb-1">
              <v-radio-group
                v-model="state.completePerCard"
                inline
                :rules="[v => {
                  return (v !== null) || 'Course completed status is required'
                  }]"
                density="compact"
                variant="outlined"
              >
                <template v-slot:label>
                  <div>Course complete?</div>
                </template>
                <v-radio
                  class="mr-2"
                  label="Complete"
                  :value="true"
                ></v-radio>
                <v-radio
                  label="DNF"
                  :value="false"
                ></v-radio>
              </v-radio-group>
            </v-col>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn
            text="Close"
            variant="plain"
            @click="hide"
          ></v-btn>
          <v-btn
            color="primary"
            text="Save"
            type="submit"
            variant="tonal"
          ></v-btn>
        </v-card-actions>      
    </v-form>
    </v-card>
    <v-skeleton-loader
      v-else
      class="mx-auto"
      max-width="600px"
      width="100%"
      type="card, actions"/>
  </v-dialog> 
</template>
