<script setup>
  import { inject } from 'vue'
  import { reactive } from 'vue'
  import TeamForm from './TeamForm.vue'
  import { format } from 'd3'

  const axiosPlain = inject('axiosPlain')

  const state = reactive({
    teams: []
  })
  
  const alerts = reactive({
    visible:false,
    type:null,
    title: null,
    text: null
  })

  axiosPlain.get('/teams')
    .then(rows => {
      state.teams = rows.data
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
  
  function teamCreated(team) {
    state.teams.push(team)
  }

  function teamUpdated(team) {
    state.teams[state.teams.map(v=>v.team_id).indexOf(team.team_id)] = team
  }

  function deleteTeam(team) {
    axiosPlain.delete(`/team/${team.team_id}`)
      .then(() => {
        state.teams.splice(state.teams.map(v=>v.team_id).indexOf(team.team_id), 1)
      })
      .catch(err => {alert('error', 'Error', JSON.stringify(err.message))})
  }

  const formatCurrency = (value) => {
    return format(',.0f')(value)
  }

  const teamTableHeaders = [
    {title: '', align: 'middle', sortable: true, key: 'color'},
    {title: 'Team', align: 'start', sortable: true, key: 'team_name'},
    {title: 'Captain', align: 'start', sortable: true, key: 'captain'},
    {title: 'Website', align: 'start', maxWidth:'250', sortable: true, key: 'website'},
    {title: 'Email', align: 'start', sortable: true, key: 'email'},
    {title: 'Charges', align: 'start', sortable: true, key: 'entry_count'},
    {title: 'Completed', align: 'start', sortable: true, key: 'completed_count'},
    {title: 'Last Charge', align: 'start', sortable: true, key: 'last_charge'},
    {title: 'Dollars Raised', align: 'start', sortable: true, key: 'raised_dollars', formatter: formatCurrency},
    {title: 'Dollars Per Charge', align: 'start', sortable: true, key: 'dollars_per_entry',formatter: formatCurrency},
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
        <TeamForm @team-created="teamCreated">
          <template #activator="{ activate }">
            <v-btn color="primary" @click="activate">Add Team</v-btn>
          </template>
        </TeamForm>
      </v-col>
    </v-row>
    <v-row>
      <v-col class="" cols="12">
        <v-card v-if="state.teams" class="mx-auto">
          <v-data-table
            :sort-by="[{key:'team_name'}]"
            :headers="teamTableHeaders"
            :items="state.teams"
            item-value="name"
            items-per-page="-1"
            class="elevation-1"
            density="compact"
          >
          <template 
            v-for="heder in teamTableHeaders.filter((h) => (h.hasOwnProperty('formatter')))" 
            v-slot:[`item.${heder.key}`]="{ _header, value }"
          >
              {{ heder.hasOwnProperty('formatter') ? heder.formatter(value) : value}}
          </template>          
          <template v-slot:item.color="{ value, index }">
            <v-chip variant="elevated" :color="value">{{index+1}}</v-chip>
          </template>
            <template v-slot:item.actions="{ item }">
              <TeamForm :team-id="item.team_id" @team-updated="teamUpdated">
                <template #activator="{ activate }">
                  <v-btn size="x-small" variant="flat" @click="activate" icon="mdi-pencil"></v-btn>
                </template>
              </TeamForm>
              <v-btn v-if="item.entry_count == 0" size="x-small" variant="flat" @click="deleteTeam(item)" icon="mdi-delete"></v-btn>
            </template>               
            <template #bottom></template>
          </v-data-table>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>