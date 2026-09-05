<script setup>
  import { reactive, inject, watch } from 'vue'
  import EntryForm from './EntryForm.vue'
  import TeamForm from './TeamForm.vue'

  const axiosPlain = inject('axiosPlain')
  const format = inject('format')

  const props = defineProps({
    charge: Object
  })

  const state = reactive({
    entries: null
  })

  watch(()=>props.charge, newVal => {
    console.log('chargeId', newVal)
    reloadEntries()
  }, { immediate: true })

  function reloadEntries() {
    state.entries = null
    axiosPlain.get('/charge/' + props.charge.charge_id + '/entries')
        .then(rows => {
          state.entries = rows.data
        })
  }

  const sortStatus = (value) => {
    console.log('sortStatus', value)
    if (value.status) {
      if (value.status == 'COMPLETE') { return value.distance_total_competition } else { return 2000 }
    } else { return 3000 }
  }

  const entryTableHeaders = [
    {title: '', align: 'start', sortable: true, key: 'no'},
    {title: 'No', align: 'start', sortable: true, key: 'car_no'},
    {title: 'Team', align: 'start', sortable: true, key: 'entry_name'},
    {title: 'Class', align: 'start', sortable: true, key: 'class_name'},
    {title: 'Categories', align: 'start', sortable: true, key: 'categories'},
    {title: 'Pledge $', align: 'end', sortable: true, key: 'raised_dollars'},
    {title: 'Distances', align:'center', children: [
      {title: 'Measured', align: 'end', sortable: true, key: 'distance_total'},
      {title: 'Competition', align: 'end', sortable: true, key: 'distance_total_competition'},
      {title: 'Net', align: 'end', sortable: true, key: 'distance_net'}
    ] },
    {title: 'Status', align: 'center', sortable: true, key: 'status'},
    {title: 'Actions', align: 'center', sortable: true, key: 'actions'}
  ]
  const formatters = [
    {key: 'raised_dollars', formatter: format.currency},
    {key: 'distance_total', formatter: format.distance},
    {key: 'distance_total_competition', formatter: format.distance},
    {key: 'distance_net', formatter: format.distance}
  ]

  function entryCreated() {
    reloadEntries()
  }
  function deleteEntry(entry) {
    axiosPlain.delete(`/entry/${entry.entry_id}`)
      .then(() => {
        state.entries.splice(state.entries.map(v=>v.entry_id).indexOf(entry.entries_id), 1)
      })
      .catch(err => {alert('error', 'Error', JSON.stringify(err.message))})
  }
  function entryUpdated() {
    reloadEntries()
  }

</script>

<template>
  <v-row>
    <v-col class="" cols="12">
      <v-data-table
        v-if="state.entries"
        :headers="entryTableHeaders"
        :items="state.entries"
        :sort-by="[{key: 'car_no', order: 'asc'}]"
        item-value="name"
        items-per-page="-1"
        class="elevation-1"
        density="compact"
        :custom-key-sort="{'status': (a,b) => sortStatus(a)-sortStatus(b)}"
      >
        <template
          v-for="heder in formatters"
          v-slot:[`item.${heder.key}`]="{ _header, value }"
        >
          {{ heder.formatter(value) }}
        </template>
        <template v-slot:[`item.entry_name`]="{ item }">
          <router-link :to="{name: 'Entry', params: {entry_id: item.entry_id }}">{{ item.entry_name }}</router-link>
        </template>

        <template v-slot:[`item.status`]="{ item }">
          <v-chip :color="format.entryStatusColor(item)">
            {{ format.entryStatusDescription(item) }}
          </v-chip>
        </template>
        <template v-slot:item.no="{ index }">
          {{  index+1  }}
        </template>
        <template v-slot:item.car_no="{ item }">
          <v-chip variant="elevated" style="min-width: 40px;" :color="item.color">{{ item.car_no }}</v-chip>
        </template>
        <template v-slot:item.actions="{ item }">
          <EntryForm :charge-id="props.charge.charge_id" :entry-id="item.entry_id" @entry-updated="entryUpdated">
            <template #activator="{ activate }">
              <v-btn size="x-small" title="Edit entry" variant="flat" @click="activate" icon="mdi-folder-edit-outline"></v-btn>
            </template>
          </EntryForm>
          <TeamForm :team-id="item.team_id" @team-updated="teamUpdated">
            <template #activator="{ activate }">
              <v-btn size="x-small" title="Edit team" variant="flat" @click="activate" icon="mdi-clipboard-edit-outline"></v-btn>
            </template>
          </TeamForm>

          <v-btn title="Delete entry" v-if="item.processing_status == 'NO_GPS'" size="x-small" variant="flat" @click="deleteEntry(item)" icon="mdi-delete"></v-btn>
        </template>
        <template #bottom>
          <v-row class="mt-2 mb-2 mr-2">
            <v-col cols="12" class="d-flex">
              <v-spacer/>
              <EntryForm :charge-id="props.charge.charge_id" @entry-created="entryCreated">
              <template #activator="{ activate }">
                <v-btn color="primary" variant="flat" @click="activate">Add Entry</v-btn>
              </template>
            </EntryForm>
            </v-col>
          </v-row>
        </template>
      </v-data-table>
    </v-col>
  </v-row>
</template>
<style>
  .v-chip__content {
    margin: auto;
  }
</style>
