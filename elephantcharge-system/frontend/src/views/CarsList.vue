<script setup>
  // import { onMounted } from 'vue'
  import { inject } from 'vue'
  import { reactive } from 'vue'
  import CarForm from './CarForm.vue'
  
  const axiosPlain = inject('axiosPlain')

  const state = reactive({
    cars: []
  })
  
  const alerts = reactive({
    visible:false,
    type:null,
    title: null,
    text: null
  })

  axiosPlain.get('/cars')
    .then(rows => {
      state.cars = rows.data
    })

  function alert(type, title, text) {
    alerts.type = type
    alerts.title = title
    alerts.text = text
    alerts.visible = true
    setTimeout(function(){
      alerts.visible = false
    }, 3000)
  }
  
  function carCreated(car) {
    state.cars.push(car)
  }

  function carUpdated(car) {
    state.cars[state.cars.map(v=>v.car_id).indexOf(car.car_id)] = car
  }

  function deleteCar(car) {
    axiosPlain.delete(`/car/${car.car_id}`)
      .then(() => {
        state.cars.splice(state.cars.map(v=>v.car_id).indexOf(car.car_id), 1)
      })
      .catch(err => {alert('error', 'Error', JSON.stringify(err.message))})
  }

  const carTableHeaders = [
    
    {title: 'Car', align: 'start', sortable: true, key: 'car_name'},
    {title: 'Make', align: 'start', sortable: true, key: 'make'},
    {title: 'Model', align: 'start', sortable: true, key: 'model'},
    {title: 'Year', align: 'start', sortable: true, key: 'year'},
    {title: 'Colour', align: 'start', sortable: true, key: 'colour'},
    {title: 'Registration', align: 'start', sortable: true, key: 'registration'},
    {title: 'Teams', align: 'start', sortable: true, key: 'team_count'},
    {title: 'Entries', align: 'start', sortable: true, key: 'entry_count'},
    {title: 'Last Charge', align: 'start', sortable: true, key: 'last_charge'},
    {title: 'Actions', align: 'middle', sortable: false, key: 'actions'},
  ]

</script>

<template>
  <v-container fluid>
    <v-alert
      :type="alerts.type"
      :title="alerts.title"
      :text="alerts.text"
      v-if="alerts.visible"
    ></v-alert>     
    <v-row>
      <v-col class="" cols="12">
        <CarForm @car-created="carCreated">
          <template #activator="{ activate }">
            <v-btn color="primary" @click="activate">Add Car</v-btn>
          </template>
        </CarForm>
      </v-col>
    </v-row>
    <v-row>
      <v-col class="" cols="12">
        <v-card v-if="state.cars" class="mx-auto">
          <v-data-table
            :sort-by="[{key:'car_name'}]"
            :headers="carTableHeaders"
            :items="state.cars"
            item-value="name"
            items-per-page="-1"
            class="elevation-1"
            density="compact"
          >
            <template v-slot:item.actions="{ item }">
              <CarForm :car-id="item.car_id" @car-updated="carUpdated">
                <template #activator="{ activate }">
                  <v-btn size="x-small" variant="flat" @click="activate" icon="mdi-pencil"></v-btn>
                </template>
              </CarForm>
              <v-btn v-if="item.entry_count == 0" size="x-small" variant="flat" @click="deleteCar(item)" icon="mdi-delete"></v-btn>
            </template> 
            <template #bottom></template>
          </v-data-table>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>