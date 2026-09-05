<script setup>
  import { reactive, inject, watch } from 'vue'
  import { format } from 'd3'

  import GrantForm from './GrantForm.vue'

  const axiosPlain = inject('axiosPlain')

  const props = defineProps({
    charge: Object
  })

  const state = reactive({
    grants: null
  })

  watch(()=>props.charge, () => {
    reload()
  }, { immediate: true })

  function reload() {
    axiosPlain.get('/charge/' + props.charge.charge_id + '/grants')
        .then(rows => {
          state.grants = rows.data
        })
  }

  const formatDollars = (value) => {
    return format(',.0f')(value)
  }

  const grantTableHeaders = [
    {title: 'Beneficiary', align: 'start', sortable: true, key: 'beneficiary_name'},
    {title: 'Amount ($)', align: 'end', sortable: true, key: 'grant_dollars', formatter: formatDollars, sum: true},
    {title: 'Description', align: 'start', sortable: false, key: 'description'},
    {title: 'Actions', align: 'center', sortable: true, key: 'actions'}
  ]

  function grantCreated(grant) {
    state.grants.push(grant)
  }
  function grantUpdated(grant) {
    state.grants[state.grants.map(v=>v.grant_id).indexOf(grant.grant_id)] = grant
  }
  function deleteGrant(grant) {
    axiosPlain.delete(`/grant/${grant.grant_id}`)
      .then(() => {
        state.grants.splice(state.grants.map(v=>v.grant_id).indexOf(grant.grant_id), 1)
      })
  }
</script>

<template>
  <v-row>
    <v-col cols="12">
      <v-card-title class="pl-0">Grants</v-card-title>
      <v-data-table
        v-if="state.grants"
        :headers="grantTableHeaders"
        :items="state.grants"
        item-value="grant_id"
        items-per-page="-1"
        class="elevation-1"
        density="compact"
      >
        <template
          v-for="heder in grantTableHeaders.filter((h) => (h.hasOwnProperty('formatter')))"
          v-slot:[`item.${heder.key}`]="{ value }"
        >
            {{ heder.hasOwnProperty('formatter') ? heder.formatter(value) : value}}
        </template>
        <template v-slot:item.actions="{ item }">
          <GrantForm :charge-id="props.charge.charge_id" :grant-id="item.grant_id" @grant-updated="grantUpdated">
            <template #activator="{ activate }">
              <v-btn title="Edit grant" size="x-small" variant="flat" @click="activate" icon="mdi-pencil"></v-btn>
            </template>
          </GrantForm>
          <v-btn title="Delete grant" size="x-small" variant="flat" @click="deleteGrant(item)" icon="mdi-delete"></v-btn>
        </template>
        <template v-slot:body.append="{ items }">
          <tr>
            <td v-for="(header, i) in grantTableHeaders" :key="i" :class="header.align == 'end' ? 'text-end' : ''">
              <b v-if="header.sum">{{ formatDollars(items.reduce((acc, item) => acc + (item[header.key] || 0), 0)) }}</b>
            </td>
          </tr>
        </template>
        <template #bottom>
          <v-row class="mt-2 mb-2 mr-2">
            <v-col cols="12" class="d-flex">
              <v-spacer/>
              <GrantForm :charge-id="props.charge.charge_id" @grant-created="grantCreated">
                <template #activator="{ activate }">
                  <v-btn color="primary" variant="flat" @click="activate">Add Grant</v-btn>
                </template>
              </GrantForm>
            </v-col>
          </v-row>
        </template>
      </v-data-table>
    </v-col>
  </v-row>
</template>
