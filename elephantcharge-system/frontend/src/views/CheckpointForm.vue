<script setup>
  import { ref, reactive, inject } from 'vue'
  import SponsorForm from './SponsorForm.vue';

  const axiosPlain = inject('axiosPlain')
  const emit = defineEmits(['checkpointCreated', 'checkpointUpdated'])
  const props = defineProps({
    checkpointId: Number,
    chargeId: Number
  })

  const dialog = ref(false)
  const form = ref()

  const blankCheckpoint = {
    checkpoint_id: null,
    radius: 30,
    charge_id: props.chargeId,
    starters_count: 0,
    checkins_count: 0,
    lat: null,
    lon: null
  }
  const state = reactive({    
    checkpoint: {...blankCheckpoint},
    sponsors: null,
    selectedSponsor: null,
  })
  
  async function submit () {
    if (state.selectedSponsor) {
      state.checkpoint.sponsor_id = state.selectedSponsor.sponsor_id
      state.checkpoint.sponsor_name = state.selectedSponsor.sponsor_name
    }

    const { valid } = await form.value.validate()
    if (valid) {
      if (props.checkpointId) {
        axiosPlain.put(`/checkpoint/${props.checkpointId}`, state.checkpoint)
          .then(() => {
            emit('checkpointUpdated', state.checkpoint)
            hide()
          })
      } else {
        axiosPlain.post('/checkpoint', state.checkpoint)
          .then(ret => {
            state.checkpoint.checkpoint_id = ret.data.checkpoint_id
            emit('checkpointCreated', state.checkpoint)
            hide()
          })
      }
    }
  }
  function show() {
    axiosPlain.get(`/charge/${props.chargeId}/sponsorsAvailable${props.checkpointId?'?include=' + props.checkpointId:''}`)
      .then(rows => {
        state.sponsors = rows.data.sort((a, b) => a.sponsor_name.localeCompare(b.sponsor_name))
        if (props.checkpointId) {
        axiosPlain.get(`/checkpoint/${props.checkpointId}`)
          .then(row => {
            state.checkpoint = row.data

            state.checkpoint.lon = JSON.parse( state.checkpoint.location ).coordinates[0]
            state.checkpoint.lat = JSON.parse( state.checkpoint.location ).coordinates[1]
            state.selectedSponsor = state.sponsors.find( t => t.sponsor_id === state.checkpoint.sponsor_id )
          })
        }
      })

    dialog.value = true
  }
  function hide() {
    dialog.value = false
    state.checkpoint = {...blankCheckpoint}
  }
  function sponsorCreated(sponsor) {
    state.sponsors.push(sponsor)
    state.selectedSponsor = sponsor
  }
</script>

<template>
  <slot name="activator" :activate="show"></slot>
  <v-dialog v-model="dialog" persistent max-width="600px"> 
    <v-skeleton-loader
      v-if="(props.checkpointId && !state.checkpoint.checkpoint_id) || !state.sponsors"
      class="mx-auto"
      max-width="600px"
      width="100%"
      type="card, actions"
    ></v-skeleton-loader>    
    <v-card
      v-else
      prepend-icon="mdi-factory"
      :title="`Checkpoint`"
    >
      <v-card-text>
        <v-form ref="form">        
          <v-row>
            <v-col cols="12"  class="d-flex pb-1">
            <v-autocomplete
                :items="state.sponsors"
                item-title="sponsor_name"
                :return-object="true"
                v-model="state.selectedSponsor"
                density="compact"
                variant="outlined"
                label="Sponsor*"
                :rules="[v => !!v || 'Sponsor is required']"
              ></v-autocomplete>
              <SponsorForm @sponsor-created="sponsorCreated">
                <template #activator="{ activate }">
                  <v-btn class="mt-1 ml-3" size="x-small" @click="activate" icon="mdi-plus"></v-btn>
                </template>
              </SponsorForm>
            </v-col>
            <v-col cols="6" class="pt-4 pb-1">
              <v-checkbox
                label="Gauntlet?"
                density="compact"
                v-model="state.checkpoint.is_gauntlet"
                variant="outlined"
              ></v-checkbox>
            </v-col>
            <v-col cols="6" class="pt-4 pb-1">
              <v-text-field
                label="Radius*"
                density="compact"
                v-model="state.checkpoint.radius_m"
                placeholder="50"
                variant="outlined"
                :rules="[v => !!v || 'Radius is required']"
              ></v-text-field>
            </v-col> 
            <v-col cols="6" class="pt-4 pb-1">
              <v-text-field
                label="Lat*"
                density="compact"
                v-model="state.checkpoint.lat"
                placeholder="-12.45"
                variant="outlined"
                :rules="[v => !!v || 'Latitude is required']"
              ></v-text-field>
            </v-col>                        
            <v-col cols="6" class="pt-4 pb-1">
              <v-text-field
                label="Lon*"
                density="compact"
                v-model="state.checkpoint.lon"
                placeholder="28.54"
                variant="outlined"
                :rules="[v => !!v || 'Longitude is required']"
              ></v-text-field>
            </v-col>                        

          </v-row>
        </v-form>
      </v-card-text>

      <v-divider></v-divider>

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
          variant="tonal"
          @click="submit"
        ></v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
