<script setup>
  import { ref, reactive, inject, watch } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import { DateTime } from 'luxon'

  import ChargeForm from './ChargeForm.vue' 
  import ChargeEntries from './ChargeEntries.vue'
  import ChargeCheckpoints from './ChargeCheckpoints.vue'
  import ChargeLegs from './ChargeLegs.vue'
  import ChargeGrants from './ChargeGrants.vue'
  
  const axiosPlain = inject('axiosPlain')
  const axiosStatic = inject('axiosStatic')
  const route = useRoute()
  const router = useRouter()

  const state = reactive({
    chargeId: null,
    charge: null,
    downloadingKml: false
  })

  const chargeFormShow = ref(false)

  watch(
    () => route.params.charge_id,
    chargeId => {
      state.chargeId = parseInt(chargeId)
      axiosPlain.get('/charge/' + chargeId)
          .then(rows => {
            state.charge = rows.data
          })
    }, { immediate: true }
  )

  function chargeUpdated(charge) {
    state.charge = charge
  }
  function deleteCharge() {
    axiosPlain.delete(`/charge/${state.chargeId}`)
      .then(() => {
        // Redirect to charges list
        router.push({name: 'Charges'})
      })
      .catch(err => {alert('error', 'Error', JSON.stringify(err.message))})
  }

  function downloadKml() {
    state.downloadingKml = true
    return axiosPlain.get('/charge/' + state.charge.charge_id + '/kml')
      .then(result => {
        return axiosStatic.get('/charges/kml/' + result.data.kml, { responseType: 'blob' })
          .then(response => {
            const blob = new Blob([response.data], { type: 'application/vnd.google-earth.kml+xml' })
            const link = document.createElement('a')
            link.href = URL.createObjectURL(blob)
            link.download = result.data.kml.split('/').pop()
            link.click()
            URL.revokeObjectURL(link.href)
          })
      })
      .catch(err => {alert('error', 'Error generating the kml', JSON.stringify(err.message))})
      .finally(() => { state.downloadingKml = false })
  }

</script>

<template>
  <v-container fluid>
    <v-row>
      <v-col cols="12" class="pb-0">
        <v-card v-if="state.charge" elevation="0" border rounded>
            <ChargeForm :charge-id="state.charge.charge_id" :dialog="chargeFormShow" @charge-updated="chargeUpdated" />

            <v-card-title class="d-flex pb-0">
              <span class="text-h4">{{ state.charge.charge_name }}</span>
              <v-spacer/>
              <v-menu>
                <template v-slot:activator="{ props }">
                  <v-btn class="mt-2" density="compact" icon="mdi-dots-vertical" v-bind="props"></v-btn>
                </template>
                <v-list density="compact">
                  <v-list-item>
                      <v-btn prepend-icon="mdi-pencil" density="compact" variant="text" @click="chargeFormShow=true">Edit charge</v-btn>
                  </v-list-item>
                  <v-list-item>
                      <v-btn prepend-icon="mdi-delete" density="compact" variant="text" @click="deleteCharge">Delete charge</v-btn>
                  </v-list-item>
                  <v-list-item>
                      <v-btn prepend-icon="mdi-book" density="compact" variant="text" @click="router.push({ name: 'Charge Entries', params: { charge_id: state.charge.charge_id } })">Entries</v-btn>
                  </v-list-item>                     
                  <v-list-item>
                      <v-btn prepend-icon="mdi-flag-checkered" density="compact" variant="text" :href="`/charge/${state.charge.charge_id}/results`">Charge Results</v-btn>
                  </v-list-item>
                  <v-list-item>
                      <v-btn prepend-icon="mdi-format-list-bulleted" density="compact" variant="text" :href="`/charge/${state.charge.charge_id}/entries_results`">Charge Entry Results</v-btn>
                  </v-list-item>
                  <v-list-item>
                      <v-btn prepend-icon="mdi-map-marker-distance" density="compact" variant="text" :href="`/charge/${state.charge.charge_id}/legs_results`">Charge Leg Results</v-btn>
                  </v-list-item>
                  <v-list-item>
                      <v-btn prepend-icon="mdi-earth" density="compact" variant="text" :loading="state.downloadingKml" @click="downloadKml">Download Kml</v-btn>
                  </v-list-item>

                </v-list>
              </v-menu>              
            </v-card-title>
            <v-card-text class="pt-1 pb-1">
              {{ DateTime.fromISO(state.charge.charge_date).toFormat('ccc d LLL y') }} {{ DateTime.fromISO(state.charge.start_time).toFormat('HH:mm') }}-{{ DateTime.fromISO(state.charge.end_time).toFormat('HH:mm') }}, <i>{{ state.charge.location }}.</i>
            </v-card-text>
        </v-card>
      </v-col>
    </v-row>
    <ChargeEntries v-if="state.charge" :charge="state.charge" />
    <ChargeCheckpoints v-if="state.charge" :charge="state.charge" />
    <ChargeLegs v-if="state.charge" :charge="state.charge" />
    <ChargeGrants v-if="state.charge" :charge="state.charge" />
  </v-container>
</template>