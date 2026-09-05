<script setup>
  import { inject } from 'vue'
  import { reactive } from 'vue'
  import appConfig from '@/config'
  import BeneficiaryForm from './BeneficiaryForm.vue'

  const axiosPlain = inject('axiosPlain')

  const state = reactive({
    beneficiaries: []
  })

  const alerts = reactive({
    visible:false,
    type:null,
    title: null,
    text: null
  })

  axiosPlain.get('/beneficiaries')
    .then(rows => {
      state.beneficiaries = rows.data
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

  function logoUrl(beneficiary) {
    if (!beneficiary.logo_file_name) return null
    return appConfig.baseUrlStatic + 'beneficiaries/logos/' + beneficiary.logo_file_name
  }

  function beneficiaryCreated(beneficiary) {
    state.beneficiaries.push(beneficiary)
  }

  function beneficiaryUpdated(beneficiary) {
    state.beneficiaries[state.beneficiaries.map(v=>v.beneficiary_id).indexOf(beneficiary.beneficiary_id)] = beneficiary
  }

  function deleteBeneficiary(beneficiary) {
    axiosPlain.delete(`/beneficiary/${beneficiary.beneficiary_id}`)
      .then(() => {
        state.beneficiaries.splice(state.beneficiaries.map(v=>v.beneficiary_id).indexOf(beneficiary.beneficiary_id), 1)
      })
      .catch(err => {alert('error', 'Error', JSON.stringify(err.message))})
  }

  const beneficiaryTableHeaders = [
    {title: 'Logo', align: 'start', sortable: false, key: 'logo'},
    {title: 'Name', align: 'start', sortable: true, key: 'name'},
    {title: 'Short Name', align: 'start', sortable: true, key: 'short_name'},
    {title: 'Geography', align: 'start', sortable: true, key: 'geography'},
    {title: 'Website', align: 'start', sortable: true, maxWidth:'350', key: 'website'},
    {title: 'Grants', align: 'start', sortable: true, key: 'grant_count'},
    {title: 'Total (ZMW)', align: 'start', sortable: true, key: 'total_kwacha'},
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
        <BeneficiaryForm @beneficiary-created="beneficiaryCreated">
          <template #activator="{ activate }">
            <v-btn color="primary" @click="activate">Add Beneficiary</v-btn>
          </template>
        </BeneficiaryForm>
      </v-col>
    </v-row>
    <v-row>
      <v-col class="" cols="12">
        <v-card v-if="state.beneficiaries" class="mx-auto">
          <v-data-table
            :sort-by="[{key:'name'}]"
            :headers="beneficiaryTableHeaders"
            :items="state.beneficiaries"
            item-value="beneficiary_id"
            items-per-page="-1"
            class="elevation-1"
            density="compact"
          >
            <template v-slot:item.logo="{ item }">
              <v-avatar size="32" rounded="0">
                <v-img v-if="logoUrl(item)" :src="logoUrl(item)" :alt="item.name"></v-img>
                <v-icon v-else icon="mdi-hand-heart" size="20"></v-icon>
              </v-avatar>
            </template>
            <template v-slot:item.actions="{ item }">
              <BeneficiaryForm :beneficiary-id="item.beneficiary_id" @beneficiary-updated="beneficiaryUpdated">
                <template #activator="{ activate }">
                  <v-btn size="x-small" variant="flat" @click="activate" icon="mdi-pencil"></v-btn>
                </template>
              </BeneficiaryForm>
              <v-btn v-if="item.grant_count == 0" size="x-small" variant="flat" @click="deleteBeneficiary(item)" icon="mdi-delete"></v-btn>
            </template>
            <template #bottom></template>
          </v-data-table>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>
