<script setup>
  // import { onMounted } from 'vue'
  import { inject } from 'vue'
  import { reactive } from 'vue'
  import { parseISO } from 'date-fns'

  const axiosPlain = inject('axiosPlain')

  const state = reactive({
    charges: []
  })

  axiosPlain.get('/charges')
    .then(rows => {
      state.charges = rows.data.map(c=> {
        c.charge_date = parseISO(c.charge_date)
        return c
      }).sort((a,b) => b.charge_date - a.charge_date)
    })
</script>
<template>
  <v-container fluid>
    <v-row>
      <v-col class="" cols="12" sm="6">
        <v-card
          class="mx-auto" prepend-icon="mdi-home">
          <template v-slot:title><router-link to="charges">Charges</router-link></template>
          <v-card-text>
            This is content
          </v-card-text>
        </v-card>
      </v-col>
      <v-col class="" cols="12" sm="6">
        <v-card
          class="mx-auto" prepend-icon="mdi-home">
          <template v-slot:title><router-link to="teams">Teams</router-link></template>
          <v-card-text>
            This is content
          </v-card-text>
        </v-card>
      </v-col>
      <v-col class="" cols="12" sm="6">        
        <v-card
          class="mx-auto" prepend-icon="mdi-home">
          <template v-slot:title>Cars</template>
          <v-card-text>
            This is content
          </v-card-text>
        </v-card>
      </v-col>
      <v-col class="" cols="12" sm="6">        
        <v-card
          class="mx-auto" prepend-icon="mdi-home">
          <template v-slot:title>Sponsors</template>
          <v-card-text>
            This is content
          </v-card-text>
        </v-card>

      </v-col>
    </v-row>
  </v-container>
</template>