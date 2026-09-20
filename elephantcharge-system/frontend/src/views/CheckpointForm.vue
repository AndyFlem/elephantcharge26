<script setup>
  import { ref, reactive, inject, computed, watch } from 'vue'
  import SponsorForm from './SponsorForm.vue';

  import Map from 'ol/Map'
  import View from 'ol/View'
  import TileLayer from 'ol/layer/Tile'
  import XYZ from 'ol/source/XYZ'
  import { fromLonLat, toLonLat } from 'ol/proj.js'
  import VectorSource from 'ol/source/Vector'
  import VectorLayer from 'ol/layer/Vector'
  import GeoJSON from 'ol/format/GeoJSON.js'
  import Feature from 'ol/Feature'
  import Point from 'ol/geom/Point'
  import CircleGeom from 'ol/geom/Circle'
  import { Circle as CircleStyle, Fill, Stroke, Style } from 'ol/style.js'

  const axiosPlain = inject('axiosPlain')
  const emit = defineEmits(['checkpointCreated', 'checkpointUpdated'])
  const props = defineProps({
    checkpointId: Number,
    chargeId: Number
  })

  const dialog = ref(false)
  const form = ref()
  const mapContainer = ref()

  const MAP_RADIUS_M = 500 // half-width of map view, ie. map spans ~1km across
  const TRACKS_RADIUS_M = 600 // how far out to fetch/clip clean tracks

  const shiftMode = ref(false)

  let map
  let tracksLayer
  let radiusLayer
  let checkpointLayer
  let fetchTracksTimeout
  let suppressFit = false

  const blankCheckpoint = {
    checkpoint_id: null,
    radius: 30,
    charge_id: props.chargeId,
    starters_count: 0,
    checkins_count: 0,
    lat: null,
    lon: null
  }
  const state = reactive({
    checkpoint: {...blankCheckpoint},
    sponsors: null,
    selectedSponsor: null,
  })

  async function submit () {
    if (state.selectedSponsor) {
      state.checkpoint.sponsor_id = state.selectedSponsor.sponsor_id
      state.checkpoint.sponsor_name = state.selectedSponsor.sponsor_name
    }

    const { valid } = await form.value.validate()
    if (valid) {
      if (props.checkpointId) {
        axiosPlain.put(`/checkpoint/${props.checkpointId}`, state.checkpoint)
          .then(() => {
            emit('checkpointUpdated', state.checkpoint)
            hide()
          })
      } else {
        axiosPlain.post('/checkpoint', state.checkpoint)
          .then(ret => {
            state.checkpoint.checkpoint_id = ret.data.checkpoint_id
            emit('checkpointCreated', state.checkpoint)
            hide()
          })
      }
    }
  }
  function show() {
    axiosPlain.get(`/charge/${props.chargeId}/sponsorsAvailable${props.checkpointId?'?include=' + props.checkpointId:''}`)
      .then(rows => {
        state.sponsors = rows.data.sort((a, b) => a.sponsor_name.localeCompare(b.sponsor_name))
        if (props.checkpointId) {
        axiosPlain.get(`/checkpoint/${props.checkpointId}`)
          .then(row => {
            state.checkpoint = row.data

            state.checkpoint.lon = JSON.parse( state.checkpoint.location ).coordinates[0]
            state.checkpoint.lat = JSON.parse( state.checkpoint.location ).coordinates[1]
            state.selectedSponsor = state.sponsors.find( t => t.sponsor_id === state.checkpoint.sponsor_id )
          })
        }
      })

    dialog.value = true
  }
  function hide() {
    dialog.value = false
    state.checkpoint = {...blankCheckpoint}
  }
  function sponsorCreated(sponsor) {
    state.sponsors.push(sponsor)
    state.selectedSponsor = sponsor
  }

  //================================
  // Map
  //================================
  const hasLocation = computed(() => {
    return !isNaN(parseFloat(state.checkpoint.lat)) && !isNaN(parseFloat(state.checkpoint.lon))
  })

  watch(
    () => [dialog.value, state.checkpoint.lat, state.checkpoint.lon, state.checkpoint.radius_m],
    () => {
      if (!dialog.value || !hasLocation.value) return
      if (!mapContainer.value) return

      if (!map) {
        setupMap()
      } else if (map.getTargetElement() !== mapContainer.value) {
        // the map's container div gets torn down/recreated when the dialog
        // briefly shows the loading skeleton (eg. on reopen), leaving the
        // map bound to a detached element - reattach it to the current one
        map.setTarget(mapContainer.value)
      }
      map.updateSize()
      updateMapPosition()
    },
    { flush: 'post' }
  )

  function setupMap() {
    checkpointLayer = new VectorLayer({ style: checkpointStyleFunction })
    radiusLayer = new VectorLayer({ style: radiusStyleFunction })
    tracksLayer = new VectorLayer({ style: trackStyleFunction })

    map = new Map({
      target: mapContainer.value,
      layers: [
        new TileLayer({ source: new XYZ({ url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png' }) }),
        tracksLayer,
        radiusLayer,
        checkpointLayer,
      ],
      view: new View({
        center: fromLonLat([0, 0]),
        zoom: 2,
      })
    })

    map.on('click', evt => {
      if (!shiftMode.value) return

      const [lon, lat] = toLonLat(evt.coordinate)
      suppressFit = true
      state.checkpoint.lat = lat.toFixed(6)
      state.checkpoint.lon = lon.toFixed(6)
      shiftMode.value = false
    })
  }

  watch(shiftMode, active => {
    if (mapContainer.value) mapContainer.value.style.cursor = active ? 'crosshair' : ''
  })
  watch(dialog, open => {
    if (!open) shiftMode.value = false
  })

  function updateMapPosition() {
    const lat = parseFloat(state.checkpoint.lat)
    const lon = parseFloat(state.checkpoint.lon)
    const radius_m = parseFloat(state.checkpoint.radius_m) || 30

    const center = fromLonLat([lon, lat])

    if (suppressFit) {
      suppressFit = false
    } else {
      const extent = [center[0] - MAP_RADIUS_M, center[1] - MAP_RADIUS_M, center[0] + MAP_RADIUS_M, center[1] + MAP_RADIUS_M]
      map.getView().fit(extent, { size: map.getSize() })
    }

    checkpointLayer.setSource(new VectorSource({
      features: [new Feature(new Point(center))]
    }))
    radiusLayer.setSource(new VectorSource({
      features: [new Feature(new CircleGeom(center, radius_m))]
    }))

    clearTimeout(fetchTracksTimeout)
    fetchTracksTimeout = setTimeout(() => fetchNearbyTracks(lat, lon), 400)
  }

  function fetchNearbyTracks(lat, lon) {
    axiosPlain.get(`/charge/${props.chargeId}/nearbyTracks`, { params: { lat, lon, radius_m: TRACKS_RADIUS_M } })
      .then(rows => {
        const json = {
          type: 'FeatureCollection',
          features: rows.data.filter(r => r.line_json).map(r => ({
            type: 'Feature',
            properties: { entry_id: r.entry_id, car_no: r.car_no, color: r.color },
            geometry: JSON.parse(r.line_json)
          }))
        }
        tracksLayer.setSource(new VectorSource({
          features: new GeoJSON().readFeatures(json, { dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' })
        }))
      })
  }

  //==============================
  // Styles
  //==============================
  function checkpointStyleFunction() {
    return new Style({
      image: new CircleStyle({
        radius: 5,
        fill: new Fill({ color: 'red' }),
        stroke: new Stroke({ color: 'white', width: 1 }),
      })
    })
  }
  function radiusStyleFunction() {
    return new Style({
      stroke: new Stroke({ color: 'red', width: 1.5, lineDash: [4, 4] }),
      fill: new Fill({ color: 'rgba(255,0,0,0.05)' }),
    })
  }
  function trackStyleFunction(feature) {
    return new Style({
      stroke: new Stroke({ color: feature.get('color') || '#777', width: 2 })
    })
  }
</script>

<template>
  <slot name="activator" :activate="show"></slot>
  <v-dialog v-model="dialog" persistent max-width="600px">
    <v-skeleton-loader
      v-if="(props.checkpointId && !state.checkpoint.checkpoint_id) || !state.sponsors"
      class="mx-auto"
      max-width="600px"
      width="100%"
      type="card, actions"
    ></v-skeleton-loader>
    <v-card
      v-else
      prepend-icon="mdi-factory"
      :title="`Checkpoint`"
    >
      <v-card-text>
        <v-form ref="form">
          <v-row>
            <v-col cols="12"  class="d-flex pb-1">
            <v-autocomplete
                :items="state.sponsors"
                item-title="sponsor_name"
                :return-object="true"
                v-model="state.selectedSponsor"
                density="compact"
                variant="outlined"
                label="Sponsor*"
                :rules="[v => !!v || 'Sponsor is required']"
              ></v-autocomplete>
              <SponsorForm @sponsor-created="sponsorCreated">
                <template #activator="{ activate }">
                  <v-btn class="mt-1 ml-3" size="x-small" @click="activate" icon="mdi-plus"></v-btn>
                </template>
              </SponsorForm>
            </v-col>
            <v-col cols="6" class="pt-4 pb-1">
              <v-checkbox
                label="Gauntlet?"
                density="compact"
                v-model="state.checkpoint.is_gauntlet"
                variant="outlined"
              ></v-checkbox>
            </v-col>
            <v-col cols="6" class="pt-4 pb-1">
              <v-text-field
                label="Radius*"
                density="compact"
                v-model="state.checkpoint.radius_m"
                placeholder="50"
                variant="outlined"
                :rules="[v => !!v || 'Radius is required']"
              ></v-text-field>
            </v-col>
            <v-col cols="6" class="pt-4 pb-1">
              <v-text-field
                label="Lat*"
                density="compact"
                v-model="state.checkpoint.lat"
                placeholder="-12.45"
                variant="outlined"
                :rules="[v => !!v || 'Latitude is required']"
              ></v-text-field>
            </v-col>
            <v-col cols="6" class="pt-4 pb-1">
              <v-text-field
                label="Lon*"
                density="compact"
                v-model="state.checkpoint.lon"
                placeholder="28.54"
                variant="outlined"
                :rules="[v => !!v || 'Longitude is required']"
              ></v-text-field>
            </v-col>

          </v-row>
        </v-form>
        <div v-show="hasLocation" class="checkpoint-map-wrapper">
          <v-btn
            class="shift-cp-btn"
            size="small"
            :color="shiftMode ? 'primary' : undefined"
            :variant="shiftMode ? 'flat' : 'outlined'"
            @click="shiftMode = !shiftMode"
          >
            {{ shiftMode ? 'Click map to place...' : 'Shift CP' }}
          </v-btn>
          <div ref="mapContainer" class="checkpoint-map"></div>
        </div>
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

<style>
  @import '../../node_modules/ol/ol.css';
  .checkpoint-map-wrapper {
    position: relative;
    margin-top: 12px;
  }
  .checkpoint-map {
    width: 100%;
    height: 300px;
  }
  .shift-cp-btn {
    position: absolute;
    top: 8px;
    right: 8px;
    z-index: 1;
  }
</style>
