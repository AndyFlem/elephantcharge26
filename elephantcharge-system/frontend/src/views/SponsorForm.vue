<script setup>
  import { ref, reactive, inject } from 'vue'
  const axiosPlain = inject('axiosPlain')
  const emit = defineEmits(['sponsorCreated', 'sponsorUpdated'])
  const props = defineProps({
    sponsorId: Number
  })

  const dialog = ref(false)
  const form = ref()

  const blankSponsor = {
    sponsor_id: null,
    sponsor_name: null
  }
  const state = reactive({    
    sponsor: {...blankSponsor},
    makes: null,
    selectedMake: null,
  })
  
  async function submit () {
    const { valid } = await form.value.validate()

    if (valid) {
      if (props.sponsorId) {
        axiosPlain.put(`/sponsor/${props.sponsorId}`, state.sponsor)
          .then(() => {
            emit('sponsorUpdated', state.sponsor)
            hide()
          })
      } else {
        axiosPlain.post('/sponsor', state.sponsor)
          .then(ret => {
            state.sponsor.sponsor_id = ret.data.sponsor_id
            state.sponsor.charge_count=0
            state.sponsor.checkpoint_count=0
            emit('sponsorCreated', state.sponsor)
            hide()
          })
      }
    }
  }
  function show() {
    if (props.sponsorId) {
      axiosPlain.get(`/sponsor/${props.sponsorId}`)
        .then(row => {
          state.sponsor = row.data
        })
    }
    dialog.value = true
  }
  function hide() {
    dialog.value = false
    state.sponsor = {...blankSponsor}
  }
</script>

<template>
  <slot name="activator" :activate="show"></slot>
  <v-dialog v-model="dialog" persistent max-width="600px"> 
    <v-skeleton-loader
      v-if="(props.sponsorId && !state.sponsor.sponsor_id)"
      class="mx-auto"
      max-width="600px"
      width="100%"
      type="card, actions"
    ></v-skeleton-loader>    
    <v-card
      v-else
      prepend-icon="mdi-factory"
      :title="`Sponsor ${ sponsorId }`"
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
                label="Sponsor name*"
                density="compact"
                v-model="state.sponsor.sponsor_name"
                placeholder="Coca-cola"
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
                v-model="state.sponsor.short_name"
                placeholder="Coke"
                variant="outlined"
              ></v-text-field>
            </v-col>
            <v-col
              cols="6" 
            >
              <v-text-field
                label="Ref"
                density="compact"
                v-model="state.sponsor.sponsor_ref"
                placeholder="Coke"
                variant="outlined"
              ></v-text-field>
            </v-col>
            <v-col
              cols="6" 
            >
              <v-text-field
                label="Website"
                density="compact"
                v-model="state.sponsor.website"
                placeholder="http://www.coke.com"
                variant="outlined"
              ></v-text-field>
            </v-col>
            <v-col
              cols="6" 
            >
              <v-text-field
                label="Email"
                density="compact"
                v-model="state.sponsor.email"
                placeholder="coke@cola.com"
                variant="outlined"
              ></v-text-field>
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
