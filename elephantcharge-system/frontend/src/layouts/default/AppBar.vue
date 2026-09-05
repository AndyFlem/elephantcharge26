<script setup>
  import { ref, watch } from 'vue'
  
  const drawer = ref(false)
  const group = ref(null)

  watch(group, () => {
    drawer.value = false
  })
</script>

<template>
  <v-app-bar :elevation="2">
    <template v-slot:prepend>
      <v-app-bar-nav-icon @click.stop="drawer = !drawer"></v-app-bar-nav-icon>
    </template>
    <v-app-bar-title>Elephant Charge</v-app-bar-title>
    <template v-slot:append>

    </template>
  </v-app-bar>
  <v-navigation-drawer temporary v-model="drawer">
    <v-list
          density="compact"
          nav
        >
          <v-list-item prepend-icon="mdi-view-dashboard" to="/">Charges</v-list-item>
          <v-list-item prepend-icon="mdi-view-dashboard" to="/teams">Teams</v-list-item>
          <v-list-item prepend-icon="mdi-view-dashboard" to="/cars">Cars</v-list-item>
          <v-list-item prepend-icon="mdi-view-dashboard" to="/sponsors">Sponsors</v-list-item>
        </v-list>
  </v-navigation-drawer>
</template>
