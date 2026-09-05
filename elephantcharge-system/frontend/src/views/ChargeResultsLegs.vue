<script setup>
  import { reactive, inject, watch } from 'vue'
  import { useRoute } from 'vue-router'
  import { DateTime } from 'luxon'
  const format = inject('format')

  import ChargeResultsLeg from './ChargeResultsLeg.vue';

  const axiosPlain = inject('axiosPlain')
  const route = useRoute()

  const state = reactive({
    chargeId: null,
    charge: null,
    legs: null,
  })
  
  watch(
    () => route.params.charge_id,
    chargeId => {
      state.chargeId = parseInt(chargeId)
      axiosPlain.get('/charge/' + chargeId)
          .then(rows => {
            state.charge = rows.data
            return axiosPlain.get('/charge/'+ chargeId + '/legs')
          })
          .then(rows => {
            state.legs = rows.data
          })
    }, { immediate: true }
  )

</script>

<template>
  <v-container fluid>
    <v-row>
      <v-col cols="12" class="pb-0">
        <v-card v-if="state.charge" elevation="0" border rounded>
            <v-card-title class="d-flex pb-0">
              <span class="text-h4"><router-link style="text-decoration: none;" :to="{name: 'Charge', params: {charge_id: state.charge.charge_ref }}">{{ state.charge.charge_name }}</router-link></span>
            </v-card-title>
            <v-card-text class="pt-1 pb-1">
              {{ DateTime.fromISO(state.charge.charge_date).toFormat('ccc d LLL y') }} {{ DateTime.fromISO(state.charge.start_time).toFormat('HH:mm') }}-{{ DateTime.fromISO(state.charge.end_time).toFormat('HH:mm') }}, <i>{{ state.charge.location }}.</i>
            </v-card-text>
            <v-card-text class="pt-1 pb-1">
              ${{ format.currency(state.charge.raised_dollars) }} raised by {{ state.charge.entry_count }} entries. {{  state.charge.entry_completed_count }} teams completed the course. 
            </v-card-text>
        </v-card>
      </v-col>
    </v-row>
    <v-row v-if="state.legs">
      <v-col :key="leg.leg_id" v-for="leg in state.legs" cols="12">
        <charge-results-leg :charge="state.charge" :leg="leg" />
      </v-col>
    </v-row>
  </v-container>
</template>