<script setup>
  import { ref, reactive, inject } from 'vue'
  import appConfig from '@/config'
  const axiosPlain = inject('axiosPlain')
  const axiosUpload = inject('axiosUpload')
  const emit = defineEmits(['beneficiaryCreated', 'beneficiaryUpdated'])
  const props = defineProps({
    beneficiaryId: Number
  })

  const dialog = ref(false)
  const form = ref()

  const blankBeneficiary = {
    beneficiary_id: null,
    name: null,
    short_name: null,
    geography: null,
    geography_description: null,
    description: null,
    website: null,
    facebook: null,
    email_admin: null,
    email_public: null,
    grant_description_default: null,
    logo_file_name: null,
    grant_count: 0,
    total_kwacha: 0,
  }
  const state = reactive({
    beneficiary: {...blankBeneficiary},
    logoFile: null,
  })

  const logoUrl = () => state.beneficiary.logo_file_name
    ? appConfig.baseUrlStatic + 'beneficiaries/logos/' + state.beneficiary.logo_file_name
    : null

  async function submit () {
    const { valid } = await form.value.validate()

    if (valid) {
      if (props.beneficiaryId) {
        axiosPlain.put(`/beneficiary/${props.beneficiaryId}`, state.beneficiary)
          .then(() => {
            emit('beneficiaryUpdated', state.beneficiary)
            hide()
          })
      } else {
        axiosPlain.post('/beneficiary', state.beneficiary)
          .then(ret => {
            state.beneficiary.beneficiary_id = ret.data.beneficiary_id
            state.beneficiary.grant_count = 0
            state.beneficiary.total_kwacha = 0
            emit('beneficiaryCreated', state.beneficiary)
            hide()
          })
      }
    }
  }
  function show() {
    if (props.beneficiaryId) {
      axiosPlain.get(`/beneficiary/${props.beneficiaryId}`)
        .then(row => {
          state.beneficiary = row.data
        })
    }
    dialog.value = true
  }
  function hide() {
    dialog.value = false
    state.beneficiary = {...blankBeneficiary}
    state.logoFile = null
  }
  function logoSelected() {
    if (!state.logoFile) return
    const formData = new FormData()
    formData.append('logo', state.logoFile)
    axiosUpload.post(`/beneficiary/${props.beneficiaryId}/logo`, formData)
      .then(ret => {
        state.beneficiary.logo_file_name = ret.data.logo_file_name
        state.logoFile = null
        emit('beneficiaryUpdated', state.beneficiary)
      })
  }
</script>

<template>
  <slot name="activator" :activate="show"></slot>
  <v-dialog v-model="dialog" persistent max-width="600px">
    <v-skeleton-loader
      v-if="(props.beneficiaryId && !state.beneficiary.beneficiary_id)"
      class="mx-auto"
      max-width="600px"
      width="100%"
      type="card, actions"
    ></v-skeleton-loader>
    <v-card
      v-else
      prepend-icon="mdi-hand-heart"
      :title="`Beneficiary ${ beneficiaryId }`"
    >
      <v-card-text>
        <v-form
          ref="form"
        >
          <v-row>
            <v-col
              cols="12"
            >
              <v-text-field
                label="Name*"
                density="compact"
                v-model="state.beneficiary.name"
                placeholder="Conservation Lower Zambezi"
                variant="outlined"
                :rules="[v => !!v || 'Name is required']"
              ></v-text-field>
            </v-col>
            <v-col
              cols="6"
            >
              <v-text-field
                label="Short name"
                density="compact"
                v-model="state.beneficiary.short_name"
                placeholder="clz"
                variant="outlined"
              ></v-text-field>
            </v-col>
            <v-col
              cols="6"
            >
              <v-text-field
                label="Geography"
                density="compact"
                v-model="state.beneficiary.geography"
                variant="outlined"
              ></v-text-field>
            </v-col>
            <v-col
              cols="12"
            >
              <v-text-field
                label="Geography description"
                density="compact"
                v-model="state.beneficiary.geography_description"
                variant="outlined"
              ></v-text-field>
            </v-col>
            <v-col
              cols="12"
            >
              <v-textarea
                label="Description"
                density="compact"
                rows="2"
                v-model="state.beneficiary.description"
                variant="outlined"
              ></v-textarea>
            </v-col>
            <v-col
              cols="12"
            >
              <v-textarea
                label="Default grant description"
                density="compact"
                rows="2"
                v-model="state.beneficiary.grant_description_default"
                variant="outlined"
              ></v-textarea>
            </v-col>
            <v-col
              cols="6"
            >
              <v-text-field
                label="Website"
                density="compact"
                v-model="state.beneficiary.website"
                placeholder="http://www.example.org"
                variant="outlined"
              ></v-text-field>
            </v-col>
            <v-col
              cols="6"
            >
              <v-text-field
                label="Facebook"
                density="compact"
                v-model="state.beneficiary.facebook"
                variant="outlined"
              ></v-text-field>
            </v-col>
            <v-col
              cols="6"
            >
              <v-text-field
                label="Public email"
                density="compact"
                v-model="state.beneficiary.email_public"
                variant="outlined"
              ></v-text-field>
            </v-col>
            <v-col
              cols="6"
            >
              <v-text-field
                label="Admin email"
                density="compact"
                v-model="state.beneficiary.email_admin"
                variant="outlined"
              ></v-text-field>
            </v-col>
          </v-row>
          <v-row v-if="props.beneficiaryId">
            <v-col cols="12" class="d-flex align-center pb-1">
              <v-avatar size="56" rounded="0" class="mr-4">
                <v-img v-if="logoUrl()" :src="logoUrl()" alt="Logo"></v-img>
                <v-icon v-else icon="mdi-hand-heart" size="32"></v-icon>
              </v-avatar>
              <v-file-input
                v-model="state.logoFile"
                @update:model-value="logoSelected"
                accept="image/*"
                label="Replace logo"
                density="compact"
                variant="outlined"
                hide-details
              ></v-file-input>
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
