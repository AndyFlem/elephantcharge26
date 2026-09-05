<script setup>
  import { reactive, inject, watch } from 'vue'
  import { format } from 'd3'
  
  import CheckpointForm from './CheckpointForm.vue'
  import CheckpointUploadForm from './CheckpointUploadForm.vue'
  import MapPanel from './MapPanel.vue'
  import SponsorForm from './SponsorForm.vue'

  const axiosPlain = inject('axiosPlain')

  const props = defineProps({
    charge: Object
  })

  const state = reactive({
    checkpoints: null
  })

  watch(()=>props.charge, () => {
    reload()
  }, { immediate: true })
  
  function reload() {
    axiosPlain.get('/charge/' + props.charge.charge_id + '/checkpoints')
        .then(rows => {
          state.checkpoints = rows.data
        })
  }

  const formatCount = (value) => {
    return Math.round(value) === 0 ? ' - ' : format(',.0f')(value)
  }

  const checkpointTableHeaders = [
    {title: '', align: 'center', sortable: true, key: 'index'},
    {title: 'Checkpoint', align: 'start', sortable: true, key: 'sponsor_name'},
    {title: 'Gauntlet', align: 'center', sortable: true, key: 'is_gauntlet'},
    //{title: 'Radius', align: 'start', sortable: true, key: 'radius_m'},
    {title: 'Starters', align: 'center', sortable: true, key: 'starters_count', formatter: formatCount},
    {title: 'Checkins', align: 'center', sortable: true, key: 'checkins_count', formatter: formatCount},
    {title: 'Actions', align: 'center', sortable: true, key: 'actions'}
  ]

  function checkpointCreated(checkpoint) {
    state.checkpoints.push(checkpoint)
  }
  function deleteCheckpoint(checkpoint) {
    axiosPlain.delete(`/checkpoint/${checkpoint.checkpoint_id}`)
      .then(() => {
        state.checkpoints.splice(state.checkpoints.map(v=>v.checkpoint_id).indexOf(checkpoint.checkpoint_id), 1)

      })
  }
  function checkpointUpdated(checkpoint) {
    state.checkpoints[state.checkpoints.map(v=>v.checkpoint_id).indexOf(checkpoint.checkpoint_id)] = checkpoint
  }
  function checkpointsImported() {
    reload()
  }
  function sponsorUpdated(checkpoint, sponsor) {
    console.log(checkpoint, sponsor)
    let item = state.checkpoints[state.checkpoints.map(v=>v.checkpoint_id).indexOf(checkpoint.checkpoint_id)]
    item.sponsor_name = sponsor.sponsor_name
    item.short_name = sponsor.short_name
    
  }
</script>

<template>
  <v-row>
    <v-col class="" cols="12" sm="8">
      <v-data-table
        v-if="state.checkpoints"
        :headers="checkpointTableHeaders"
        :items="state.checkpoints"
        item-value="name"
        items-per-page="-1"
        class="elevation-1"
        density="compact"
      >
        <template 
          v-for="heder in checkpointTableHeaders.filter((h) => (h.hasOwnProperty('formatter')))" 
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
        <template v-slot:[`item.sponsor_name`]="{ item }">
          <SponsorForm :sponsor-id="item.sponsor_id" @sponsor-updated="sponsorUpdated(item, $event)">
            <template #activator="{ activate }">
              <v-btn size="x-small" variant="flat" @click="activate" icon="mdi-pencil"></v-btn>
            </template>
          </SponsorForm>
          {{ item.sponsor_name }}   
        </template>
        <template v-slot:item.actions="{ item }">
          <CheckpointForm :charge-id="props.charge.charge_id" :checkpoint-id="item.checkpoint_id" @checkpoint-updated="checkpointUpdated">
            <template #activator="{ activate }">
              <v-btn size="x-small" title="Edit checkpoint" variant="flat" @click="activate" icon="mdi-pencil"></v-btn>
            </template>
          </CheckpointForm>
          <v-btn title="Delete checkpoint" v-if="item.checkins_count == '0'" size="x-small" variant="flat" @click="deleteCheckpoint(item)" icon="mdi-delete"></v-btn>
        </template>       
        <template #bottom>
          <v-row class="mt-2 mb-2 mr-2">
            <v-col cols="12" class="d-flex">
              <v-spacer/>
              <CheckpointUploadForm @checkpoints-imported="checkpointsImported" :charge-id="props.charge.charge_id">
                <template #activator="{ activate }">
                  <v-btn color="primary" class="mr-2" variant="flat" @click="activate">Upload Checkpoints KMZ</v-btn>
                </template>
              </CheckpointUploadForm>       
              <CheckpointForm :charge-id="props.charge.charge_id" @checkpoint-created="checkpointCreated">
                <template #activator="{ activate }">
                  <v-btn color="primary" variant="flat" @click="activate">Add Checkpoint</v-btn>
                </template>
              </CheckpointForm>
            </v-col>
          </v-row>
        </template>      
      </v-data-table>
    </v-col>
    <v-col cols="12" sm="4">
      <MapPanel :charge="props.charge" showChargeLegs/>
    </v-col>
  </v-row>
</template>