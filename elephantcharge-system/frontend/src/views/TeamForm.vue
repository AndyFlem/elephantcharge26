<script setup>
  import { ref, reactive, inject } from 'vue'
  const axiosPlain = inject('axiosPlain')
  const emit = defineEmits(['teamCreated', 'teamUpdated'])
  const props = defineProps({
    teamId: Number
  })

  const dialog = ref(false)
  const form = ref()

  const blankTeam = {
    team_id: null,
    team_name: null
  }
  const state = reactive({    
    team: {...blankTeam},
    makes: null,
    selectedMake: null,
  })
  
  async function submit () {
    const { valid } = await form.value.validate()

    if (valid) {
      if (props.teamId) {
        axiosPlain.put(`/team/${props.teamId}`, state.team)
          .then(() => {
            emit('teamUpdated', state.team)
            hide()
          })
      } else {
        axiosPlain.post('/team', state.team)
          .then(ret => {
            state.team.team_id = ret.data.team_id
            state.team.entry_count=0
            state.team.completed_count=0
            state.team.completed_count=0
            state.team.raised_dollars=0
            state.team.dollars_per_entry=0
            
            emit('teamCreated', state.team)
            hide()
          })
      }
    }
  }
  function show() {
    if (props.teamId) {
      axiosPlain.get(`/team/${props.teamId}`)
        .then(row => {
          state.team = row.data
        })
    }
    dialog.value = true
  }
  function hide() {
    dialog.value = false
    state.team = {...blankTeam}
  }
</script>

<template>
  <slot name="activator" :activate="show"></slot>
  <v-dialog v-model="dialog" persistent max-width="600px"> 
    <v-skeleton-loader
      v-if="(props.teamId && !state.team.team_id)"
      class="mx-auto"
      max-width="600px"
      width="100%"
      type="card, actions"
    ></v-skeleton-loader>    
    <v-card
      v-else
      prepend-icon="mdi-factory"
      :title="`Team ${ teamId }`"
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
                label="Team name*"
                density="compact"
                v-model="state.team.team_name"
                placeholder="Coca-cola"
                variant="outlined"
                :rules="[v => !!v || 'Name is required']"
              ></v-text-field>
            </v-col>
            <v-col
              cols="6" 
            >
              <v-text-field
                label="Captain"
                density="compact"
                v-model="state.team.captain"
                placeholder="Joe Bloggs"
                variant="outlined"
              ></v-text-field>
            </v-col>
            <v-col
              cols="6" 
            >
              <v-text-field
                label="Ref"
                density="compact"
                v-model="state.team.team_ref"
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
                v-model="state.team.website"
                placeholder="http://www.mudhogs.com"
                variant="outlined"
              ></v-text-field>
            </v-col>
            <v-col
              cols="6" 
            >
              <v-text-field
                label="Email"
                density="compact"
                v-model="state.team.email"
                placeholder="camel@gmail.com"
                variant="outlined"
              ></v-text-field>
            </v-col>         
          </v-row>
          <v-row>
            <v-col cols="12">
              <v-color-picker hide-inputs v-model="state.team.color"/>
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
