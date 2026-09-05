<script setup>
  import { ref, reactive, inject } from 'vue'
  import BeneficiaryForm from './BeneficiaryForm.vue'

  const axiosPlain = inject('axiosPlain')
  const emit = defineEmits(['grantCreated', 'grantUpdated'])
  const props = defineProps({
    grantId: Number,
    chargeId: Number
  })

  const dialog = ref(false)
  const form = ref()

  const blankGrant = {
    grant_id: null,
    charge_id: props.chargeId,
    grant_kwacha: null,
    description: null
  }
  const state = reactive({
    grant: {...blankGrant},
    beneficiaries: null,
    selectedBeneficiary: null,
  })

  async function submit () {
    if (state.selectedBeneficiary) {
      state.grant.beneficiary_id = state.selectedBeneficiary.beneficiary_id
      state.grant.beneficiary_name = state.selectedBeneficiary.name
    }

    const { valid } = await form.value.validate()
    if (valid) {
      if (props.grantId) {
        axiosPlain.put(`/grant/${props.grantId}`, state.grant)
          .then(() => {
            emit('grantUpdated', state.grant)
            hide()
          })
      } else {
        axiosPlain.post('/grant', state.grant)
          .then(ret => {
            state.grant.grant_id = ret.data.grant_id
            emit('grantCreated', state.grant)
            hide()
          })
      }
    }
  }
  function show() {
    axiosPlain.get('/beneficiaries')
      .then(rows => {
        state.beneficiaries = rows.data.sort((a, b) => a.name.localeCompare(b.name))
        if (props.grantId) {
          axiosPlain.get(`/grant/${props.grantId}`)
            .then(row => {
              state.grant = row.data
              state.selectedBeneficiary = state.beneficiaries.find(b => b.beneficiary_id === state.grant.beneficiary_id)
            })
        }
      })

    dialog.value = true
  }
  function hide() {
    dialog.value = false
    state.grant = {...blankGrant}
    state.selectedBeneficiary = null
  }
  function beneficiaryCreated(beneficiary) {
    state.beneficiaries.push(beneficiary)
    state.selectedBeneficiary = beneficiary
  }
</script>

<template>
  <slot name="activator" :activate="show"></slot>
  <v-dialog v-model="dialog" persistent max-width="600px">
    <v-skeleton-loader
      v-if="(props.grantId && !state.grant.grant_id) || !state.beneficiaries"
      class="mx-auto"
      max-width="600px"
      width="100%"
      type="card, actions"
    ></v-skeleton-loader>
    <v-card
      v-else
      prepend-icon="mdi-hand-heart"
      :title="`Grant`"
    >
      <v-card-text>
        <v-form ref="form">
          <v-row>
            <v-col cols="12" class="d-flex pb-1">
              <v-autocomplete
                :items="state.beneficiaries"
                item-title="name"
                :return-object="true"
                v-model="state.selectedBeneficiary"
                density="compact"
                variant="outlined"
                label="Beneficiary*"
                :rules="[v => !!v || 'Beneficiary is required']"
              ></v-autocomplete>
              <BeneficiaryForm @beneficiary-created="beneficiaryCreated">
                <template #activator="{ activate }">
                  <v-btn class="mt-1 ml-3" size="x-small" @click="activate" icon="mdi-plus"></v-btn>
                </template>
              </BeneficiaryForm>
            </v-col>
            <v-col cols="12" class="pt-1 pb-1">
              <v-text-field
                label="Amount (ZMW)*"
                density="compact"
                v-model="state.grant.grant_kwacha"
                placeholder="315000"
                variant="outlined"
                :rules="[v => !!v || 'Amount is required']"
              ></v-text-field>
            </v-col>
            <v-col cols="12" class="pt-1 pb-1">
              <v-textarea
                label="Description"
                density="compact"
                rows="3"
                v-model="state.grant.description"
                variant="outlined"
              ></v-textarea>
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
