<script setup>
  // import { onMounted } from 'vue'
  import { inject } from 'vue'
  import { reactive } from 'vue'
  import SponsorForm from './SponsorForm.vue'
  
  const axiosPlain = inject('axiosPlain')

  const state = reactive({
    sponsors: []
  })
  
  const alerts = reactive({
    visible:false,
    type:null,
    title: null,
    text: null
  })

  axiosPlain.get('/sponsors')
    .then(rows => {
      state.sponsors = rows.data
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
  
  function sponsorCreated(sponsor) {
    state.sponsors.push(sponsor)
  }

  function sponsorUpdated(sponsor) {
    state.sponsors[state.sponsors.map(v=>v.sponsor_id).indexOf(sponsor.sponsor_id)] = sponsor
  }

  function deleteSponsor(sponsor) {
    axiosPlain.delete(`/sponsor/${sponsor.sponsor_id}`)
      .then(() => {
        state.sponsors.splice(state.sponsors.map(v=>v.sponsor_id).indexOf(sponsor.sponsor_id), 1)
      })
      .catch(err => {alert('error', 'Error', JSON.stringify(err.message))})
  }

  const sponsorTableHeaders = [
    
    {title: 'Sponsor', align: 'start', sortable: true, key: 'sponsor_name'},
    {title: 'Short Name', align: 'start', sortable: true, key: 'short_name'},
    {title: 'Ref', align: 'start', sortable: true, key: 'sponsor_ref'},
    {title: 'Website', align: 'start', sortable: true, maxWidth:'350', key: 'website'},
    {title: 'Email', align: 'start', sortable: true, key: 'email'},
    {title: 'Checkpoints', align: 'start', sortable: true, key: 'checkpoint_count'},
    
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
        <sponsorForm @sponsor-created="sponsorCreated">
          <template #activator="{ activate }">
            <v-btn color="primary" @click="activate">Add Sponsor</v-btn>
          </template>
        </sponsorForm>
      </v-col>
    </v-row>
    <v-row>
      <v-col class="" cols="12">
        <v-card v-if="state.sponsors" class="mx-auto">
          <v-data-table
            :sort-by="[{key:'sponsor_name'}]"
            :headers="sponsorTableHeaders"
            :items="state.sponsors"
            item-value="name"
            items-per-page="-1"
            class="elevation-1"
            density="compact"
          >
            <template v-slot:item.actions="{ item }">
              <SponsorForm :sponsor-id="item.sponsor_id" @sponsor-updated="sponsorUpdated">
                <template #activator="{ activate }">
                  <v-btn size="x-small" variant="flat" @click="activate" icon="mdi-pencil"></v-btn>
                </template>
              </SponsorForm>
              <v-btn v-if="(item.charge_count + item.checkpoint_count) == 0" size="x-small" variant="flat" @click="deleteSponsor(item)" icon="mdi-delete"></v-btn>
            </template>
            <template #bottom></template>
          </v-data-table>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>