<script setup>
  import { DateTime } from 'luxon';
  import { ref, reactive, inject, watch } from 'vue'

  const axiosPlain = inject('axiosPlain')
  const emit = defineEmits(['chargeCreated', 'chargeUpdated'])
  const props = defineProps({
    chargeId: Number,
    dialog: Boolean
  })

  const visible = ref(false)
  const form = ref()

  const blankCharge = {
    charge_id: null,
    charge_ref: null,
    charge_name: null,
    start_time:"07:00:00+02",
    end_time:"15:00:00+02",
    m_per_local:0.5,
    gauntlet_multiplier:3,
    exchange_rate:25,
    map_scale:12,
    location:'Unknown location'
  }
  const state = reactive({    
    charge: {...blankCharge},
    charge_date: null
  })
  
  watch(()=>props.dialog, newVal => {
    newVal ? show() : hide()
  })
  watch(()=>state.charge_date, newVal => {
    state.charge.charge_date=DateTime.fromJSDate(newVal).toISODate()
  })

  async function submit () {
    const { valid } = await form.value.validate()

    if (valid) {
      if (props.chargeId) {
        axiosPlain.put(`/charge/${props.chargeId}`, state.charge)
          .then(() => {
            emit('chargeUpdated', state.charge)
            hide()
          })
      } else {
        axiosPlain.post('/charge', state.charge)
          .then(ret => {
            console.log(ret)
            state.charge.charge_id = ret.data.charge_id
            emit('chargeCreated', state.charge)
            hide()
          })
      }
    }
  }
  function show() {
    if (props.chargeId) {
      axiosPlain.get(`/charge/${props.chargeId}`)
        .then(row => {
          state.charge = row.data
          state.charge_date = DateTime.fromISO(state.charge.charge_date).toJSDate()
        })
    }
    visible.value = true
  }
  function hide() {
    visible.value = false
    state.charge = {...blankCharge}
  }
</script>

<template>
  <slot name="activator" :activate="show"></slot>
  <v-dialog v-model="visible" persistent max-width="600px"> 
    <v-skeleton-loader
      v-if="(props.chargeId && !state.charge.charge_id)"
      class="mx-auto"
      max-width="600px"
      width="100%"
      type="card, actions"
    ></v-skeleton-loader>    
    <v-card
      v-else
      prepend-icon="mdi-elephant"
      :title="`Charge ${ chargeId }`"
    >
      <v-card-text>
        <v-form
          ref="form"
        >        
          <v-row>
            <v-col cols="12" class="pt-4 pb-1">
              <v-text-field
                label="Charge name*"
                density="compact"
                v-model="state.charge.charge_name"
                placeholder="Fuchs Elephant Charge 2023"
                variant="outlined"
                :rules="[v => !!v || 'Name is required']"
              ></v-text-field>
            </v-col>
            <v-col cols="6" class="pt-1 pb-1">
              <v-date-input
                label="Charge Date"
                density="compact"
                v-model="state.charge_date"
                :rules="[v => !!v || 'Date is required']"                
                variant="outlined"
              ></v-date-input>
            </v-col>
            <v-col cols="6"  class="pt-1 pb-1">
              <v-text-field
                label="Ref"
                density="compact"
                v-model="state.charge.charge_ref"
                :rules="[v => !!v || 'Charge ref is required']" 
                placeholder="2019"
                variant="outlined"
              ></v-text-field>
            </v-col>
            <v-col
              cols="12"  class="pt-1 pb-1"
            >
              <v-text-field
                label="Location"
                density="compact"
                v-model="state.charge.location"
                placeholder="Big River"
                variant="outlined"
              ></v-text-field>
            </v-col>
            <v-col cols="6"  class="pt-1 pb-1">
              <v-text-field
                label="Start Time"
                density="compact"
                v-model="state.charge.start_time"
                placeholder="07:00"
                variant="outlined"
              ></v-text-field>              
            </v-col>            
            <v-col cols="6"  class="pt-1 pb-1">
              <v-text-field
                label="End Time"
                density="compact"
                v-model="state.charge.end_time"
                placeholder="07:00"
                variant="outlined"
              ></v-text-field>              
            </v-col>
            <v-col cols="6"  class="pt-1 pb-1">
              <v-text-field
                label="Gauntlet multiplier"
                density="compact"
                v-model="state.charge.gauntlet_multiplier"
                :rules="[v => !!v || 'Gauntelt multiplier is required']" 
                placeholder="3"
                variant="outlined"
              ></v-text-field>              
            </v-col>            
            <v-col cols="6"  class="pt-1 pb-1">
              <v-text-field
                label="Exchange Rate"
                density="compact"
                v-model="state.charge.exchange_rate"
                :rules="[v => !!v || 'Exchange rate is required']" 
                placeholder="25"
                variant="outlined"
              ></v-text-field>              
            </v-col>                        
            <v-col cols="6"  class="pt-1 pb-1">
              <v-text-field
                label="Net Distance - m per pledge"
                density="compact"
                v-model="state.charge.m_per_local"
                :rules="[v => !!v || 'm per pledge is required']" 
                placeholder="0.5"
                variant="outlined"
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
