<script setup>
  import { ref, reactive, inject } from 'vue'
  const axiosPlain = inject('axiosPlain')
  const emit = defineEmits(['carCreated', 'carUpdated'])
  const props = defineProps({
    carId: Number
  })

  const dialog = ref(false)
  const form = ref()

  const blankCar = {
    car_id: null,
    car_name: null,
    make_id: null,
    make: null,
    model: null,
    year: null,
    colour: null,
    registration: null,
    car_description: null
  }
  const state = reactive({    
    car: {...blankCar},
    makes: null,
    selectedMake: null,
  })

  
  async function submit () {
    if (state.selectedMake) {
      state.car.make_id = state.selectedMake.make_id
      state.car.make = state.selectedMake.make
    }
    state.car.car_description = state.car.car_name + ' - ' + (state.car.colour?(' ' + state.car.colour):'') + (state.car.year?(' ' + state.car.year):'')  + (state.car.make?(' ' + state.car.make):'')  + (state.car.model?(' ' + state.car.model):'') + (state.car.registration?(' ' + state.car.registration):'') 
    state.car.processing_status = 'NO_GPS'

    const { valid } = await form.value.validate()

    if (valid) {
      if (props.carId) {
        axiosPlain.put(`/car/${props.carId}`, state.car)
          .then(() => {
            emit('carUpdated', state.car)
            hide()
          })
      } else {
        axiosPlain.post('/car', state.car)
          .then(ret => {
            state.car.car_id = ret.data.car_id
            state.car.team_count=0
            state.car.entry_count=0
            emit('carCreated', state.car)
            hide()
          })
      }
    }
  }
  function show() {
    axiosPlain.get('/makes')
      .then(rows => {
        state.makes = rows.data.sort((a, b) => a.make.localeCompare(b.make))
      })

    if (props.carId) {
      axiosPlain.get(`/car/${props.carId}`)
        .then(row => {
          state.car = row.data
          state.selectedMake = {make_id: state.car.make_id, make: state.car.make}
        })
    }
    dialog.value = true
  }
  function hide() {
    dialog.value = false
    state.car = {...blankCar}
    state.selectedMake = null
  }
</script>

<template>
  <slot name="activator" :activate="show"></slot>
  <v-dialog v-model="dialog" persistent max-width="600px"> 
    <v-skeleton-loader
      v-if="(props.carId && !state.car.car_id) || !state.makes"
      class="mx-auto"
      max-width="600px"
      width="100%"
      type="card, actions"
    ></v-skeleton-loader>    
    <v-card
      v-else
      prepend-icon="mdi-car"
      :title="`Car ${ carId }`"
    >
      <v-card-text>
        <v-form
          ref="form"
        >        
          <v-row>
            <v-col
              cols="12" 
            >
              <v-text-field
                label="Car name*"
                density="compact"
                v-model="state.car.car_name"
                placeholder="Ninky Nonk"
                variant="outlined"
                :rules="[v => !!v || 'Name is required']"
              ></v-text-field>
            </v-col>
            <v-col
              cols="12"
              md="6"
            >
              <v-select
                v-if="state.makes"
                label="Make"
                :items="state.makes"
                item-title="make"
                :return-object="true"
                v-model="state.selectedMake"
                density="compact"
                variant="outlined"
              ></v-select>
            </v-col>
            <v-col
              cols="12"
              md="6"              
            >
              <v-text-field
                label="Model"
                density="compact"
                placeholder="Corolla"
                v-model="state.car.model"
                variant="outlined"
              ></v-text-field>
            </v-col>
            <v-col
              cols="12"
              md="4"
            >
              <v-text-field
                label="Year"
                density="compact"
                v-model="state.car.year"
                placeholder="2021"
                variant="outlined"
              ></v-text-field>
            </v-col>
            <v-col
              cols="12"
              md="4"              
            >
              <v-text-field
                label="Colour"
                density="compact" 
                placeholder="Red"
                v-model="state.car.colour"
                variant="outlined"
              ></v-text-field>
            </v-col>                                 
            <v-col
              cols="12"
              md="4"
            >
              <v-text-field
                label="Registration"
                density="compact"
                v-model="state.car.registration"
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
