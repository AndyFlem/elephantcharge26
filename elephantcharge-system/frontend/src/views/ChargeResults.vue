<script setup>
  import { reactive, inject, watch } from 'vue'
  import { useRoute } from 'vue-router'
  import { DateTime } from 'luxon'
  const format = inject('format')


  import ChargeResultsAward from './ChargeResultsAward.vue';
  
  const axiosPlain = inject('axiosPlain')
  const route = useRoute()

  const state = reactive({
    chargeId: null,
    charge: null,
    awards: null,
    awardResults: null
  })
  
  watch(
    () => route.params.charge_id,
    chargeId => {
      state.chargeId = parseInt(chargeId)
      axiosPlain.get('/charge/' + chargeId)
          .then(rows => {
            state.charge = rows.data
            return axiosPlain.get('/awards')
          })
          .then(rows => {
            state.awards = rows.data
            return axiosPlain.get('/charge/'+ chargeId + '/award_results')
          })
          .then(rows => {
            state.awardResults = rows.data
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
    <v-row v-if="state.awardResults">
      <v-col cols="12">
        <v-card>
          <v-table class="mx-4 my-5">
            <tbody>
          <template :key="award.award_id" v-for="award in state.awardResults">
            <tr v-if="award.results.length>0">
              <td style=""><b>{{ award.name }}</b></td>              
              <td>{{ award.results[0].car_no }} {{ award.results[0].entry_name }}</td>
            </tr>
          </template>
        </tbody>
        </v-table>
        </v-card>
      </v-col>
    </v-row>
    <template v-if="state.awards">
      <v-row :key="award.award_id" v-for="award in state.awards">
        <v-col>
          <v-card>
            <v-card-title>{{ award.name }}</v-card-title>
            <v-card-text>
              <charge-results-award :charge="state.charge" :award="award" />
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>
    </template>
  </v-container>
</template>