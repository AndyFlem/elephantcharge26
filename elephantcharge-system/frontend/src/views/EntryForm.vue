<script setup>
//  import { DateTime } from 'luxon';
  import { ref, reactive, inject, watch, computed } from 'vue'
  import CarForm from './CarForm.vue'
  import TeamForm from './TeamForm.vue'

  const axiosPlain = inject('axiosPlain')
  const emit = defineEmits(['entryCreated', 'entryUpdated'])
  const props = defineProps({
    entryId: Number,
    chargeId: Number,
    dialog: Boolean
  })

  const visible = ref(false)
  const form = ref()

  const blankEntry = {
    charge_id: props.chargeId,
    entry_id: null,
    team_id: null,
    car_id: null,
    class_id: null,
    entry_name: null,
    car_no: null,
    captain: null,
    members: null,
    distance_total_competition: 0,
    raised_dollars: 0,
    distance_total: 0,
    distance_net: 0,
    imei: null,
  }
  const state = reactive({    
    entry: {...blankEntry},
    teams: null,
    selectedTeam: null,
    cars: null,
    selectedCar: null,
    carNosAvailable: null,
    classes: null,
    selectedClass: null,
    categories: null,
    selectedCategories: [],
    imeis: null
  })

  const ready = computed(() => { 
    return (!props.entryId || (props.entryId && state.entry.entry_id)) && (state.classes, state.teams && state.cars && state.carNosAvailable && state.categories)
  })
  
  watch(()=>props.dialog, newVal => {
    newVal ? show() : hide()
  })

  watch(()=>state.selectedTeam, newVal => {
    if (newVal) {
      if (!state.entry.entry_name || !state.entry.entry_id) { 
        state.entry.entry_name = newVal.team_name 
        state.entry.captain = newVal.captain
      }}
  })  
  
  async function submit () {
    if (state.selectedTeam) {
      state.entry.team_id = state.selectedTeam.team_id
      state.entry.team_name = state.selectedTeam.team_name
    }
    if (state.selectedCar) {
      state.entry.car_id = state.selectedCar.car_id
      state.entry.car_name = state.selectedCar.car_name
    }
    if (state.selectedClass) {
      state.entry.class_id = state.selectedClass.class_id
      state.entry.class_name = state.selectedClass.class_name
    }
    state.entry.category_ids = state.selectedCategories.map(c => c.category_id)
    state.entry.categories = state.selectedCategories.map(c => c.category).join(', ')

    const { valid } = await form.value.validate()

    if (valid) {
      if (props.entryId) {
        axiosPlain.put(`/entry/${props.entryId}`, state.entry)
          .then(() => {
            emit('entryUpdated', props.entryId)
            hide()
          })
      } else {
        axiosPlain.post('/entry', state.entry)
          .then(ret => {
            // state.entry.entry_id = ret.data.entry_id
            // state.entry.processing_status = 'NO_GPS'
            emit('entryCreated', ret.data.entry_id)
            hide()
          })
      }
    }
  }
  function show() {
    visible.value = true
    Promise.all([
    axiosPlain.get(`/charge/${props.chargeId}/teamsAvailable${props.entryId?'?include=' + props.entryId:''}`)
      .then(rows => {
        state.teams = rows.data.sort((a, b) => a.team_name.localeCompare(b.team_name))
      }),
      axiosPlain.get(`/charge/${props.chargeId}/carsAvailable${props.entryId?'?include=' + props.entryId:''}`)
      .then(rows => {
        state.cars = rows.data.sort((a, b) => a.car_name.localeCompare(b.car_name))
      }),
      axiosPlain.get('/classes')
      .then(rows => {
        state.classes = rows.data.sort((a, b) => a.class_id - b.class_id)
      }),     
      axiosPlain.get('/categories')
      .then(rows => {
        state.categories = rows.data.sort((a, b) => a.category.localeCompare(b.category))
      }),
      axiosPlain.get(`/charge/${props.chargeId}/carNosAvailable`)
      .then(rows => {
        state.carNosAvailable = rows.data 
      }),
      axiosPlain.get(`/teltonika/imeis`)
      .then(rows => {
        state.imeis = rows.data
        state.imeis.splice(0, 0, {imei: null})
      })]
    )
    .then(()=>{
      if (props.entryId) {
        axiosPlain.get(`/entry/${props.entryId}`)
          .then(row => {
            state.entry = row.data
            state.selectedCar = state.cars.find(c => c.car_id === state.entry.car_id)
            state.selectedTeam = state.teams.find(t => t.team_id === state.entry.team_id)
            state.selectedClass = state.classes.find(c => c.class_id === state.entry.class_id)

            state.entry.category_ids = JSON.parse('[' + state.entry.category_ids + ']')

            state.selectedCategories = state.categories.filter(c => state.entry.category_ids.includes(c.category_id))
          })
      }
    })
  }
  function hide() {
    visible.value = false
    state.entry = {...blankEntry}
    state.selectedCar=null
    state.selectedCategories=[]
    state.selectedClass = null
    state.selectedTeam = null
  }

  function carCreated(car) {
    state.cars.push(car)
    state.selectedCar = car
  }
  function teamCreated(team) {
    state.teams.push(team)
    state.selectedTeam = team
  }  
</script>

<template>
  <slot name="activator" :activate="show"></slot>
  <v-dialog v-model="visible" persistent max-width="600px"> 
    <v-skeleton-loader
      v-if="!ready"
      class="mx-auto"
      max-width="600px"
      width="100%"
      type="card, actions"
    ></v-skeleton-loader>    
    <v-card
      v-else
      prepend-icon="mdi-car"
      :title="`Entry - ${ state.entry.entry_name?state.entry.entry_name:'New' }`"
    >
      <v-card-text>
        <v-form
          ref="form"
        >        
          <v-row>
            <v-col cols="12"  class="d-flex pb-1">
              <v-autocomplete
                :items="state.teams"
                item-title="team_name"
                :return-object="true"
                v-model="state.selectedTeam"
                density="compact"
                variant="outlined"
                label="Team*"
                :rules="[v => !!v || 'Team is required']"
              ></v-autocomplete>
              <TeamForm @team-created="teamCreated">
                <template #activator="{ activate }">
                  <v-btn class="mt-1 ml-3" size="x-small" @click="activate" icon="mdi-plus"></v-btn>
                </template>
              </TeamForm>              
            </v-col> 
            <v-col cols="6"  class="pt-4 pb-1">
              <v-select
                label="Car No."
                :items="state.carNosAvailable"
                item-title="car_no"
                item-value="car_no"
                v-model="state.entry.car_no"
                :rules="[v => !!v || 'Entry no is required']"
                density="compact"
                variant="outlined"
              ></v-select>
            </v-col>
            <v-col cols="6" class="pt-4 pb-1">
              <v-text-field
                label="Entry name*"
                density="compact"
                v-model="state.entry.entry_name"
                placeholder="The Team 2023"
                variant="outlined"
                :rules="[v => !!v || 'Name is required']"
              ></v-text-field>
            </v-col>
            <v-col cols="12"  class="d-flex pt-4 pb-1">
              <v-autocomplete
                :items="state.cars"
                item-title="car_description"
                :return-object="true"
                v-model="state.selectedCar"
                density="compact"
                variant="outlined"
                label="Car*"
                :rules="[v => !!v || 'Car is required']"
              ></v-autocomplete>
              <CarForm @car-created="carCreated">
                <template #activator="{ activate }">
                  <v-btn class="mt-1 ml-3" size="x-small" @click="activate" icon="mdi-plus"></v-btn>
                </template>
              </CarForm>              
              
            </v-col>  
            <v-col cols="6"  class="pt-4 pb-1">
              <v-select
                label="Class"
                :items="state.classes"
                v-if="state.classes"
                item-title="class_name"
                :return-object="true"
                v-model="state.selectedClass"
                :rules="[v => !!v || 'Class is required']"
                density="compact"
                variant="outlined"
              ></v-select>
            </v-col>
            <v-col cols="6" class="pt-4 pb-1">
              <v-text-field
                label="Team captain"
                density="compact"
                v-model="state.entry.captain"
                placeholder="Joe Bloggs"
                variant="outlined"
              ></v-text-field>
            </v-col>                                 
            <v-col cols="12" class="pt-4 pb-1">
              <v-text-field
                label="Team members"
                density="compact"
                v-model="state.entry.members"
                placeholder="Joe Bloggs"
                variant="outlined"
              ></v-text-field>
            </v-col>
            <v-col cols="6"  class="pt-4 pb-1">
              <v-select
                label="Categories"
                v-if="state.categories"
                :items="state.categories"
                item-title="category"
                multiple
                :return-object="true"
                v-model="state.selectedCategories"
                density="compact"
                variant="outlined"
              ></v-select>
            </v-col> 
            <v-col cols="6"  class="pt-4 pb-1">
              <v-select
                v-if="state.imeis"
                label="Teltonika Device IMEI" 
                :items="state.imeis"
                item-title="imei"
                item-value="imei"
                v-model="state.entry.imei"
                density="compact"
                variant="outlined"
              ></v-select>
            </v-col>            
          </v-row>
          <v-row>
            <v-col cols="6" class="pt-4 pb-1">
              <v-text-field
                label="Amount Raised (local currency)"
                density="compact"
                v-model="state.entry.raised_local"
                placeholder="100000"
                variant="outlined"
              ></v-text-field>
            </v-col>                                                         
            <v-col cols="6" class="pt-4 pb-1">
              <v-text-field
                label="Gauntlet penalties m"
                density="compact"
                v-model="state.entry.dist_penalty_gauntlet"
                placeholder="100000"
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
