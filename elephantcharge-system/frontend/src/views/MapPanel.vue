<script setup>
  import { reactive, inject, watch, computed } from 'vue'

  import Map from 'ol/Map'
  import View from 'ol/View'
  import TileLayer from 'ol/layer/Tile'
  import XYZ from 'ol/source/XYZ'
  import { fromLonLat} from 'ol/proj.js'
  import VectorSource from 'ol/source/Vector'
  import VectorLayer from 'ol/layer/Vector'
  import GeoJSON from 'ol/format/GeoJSON.js'
  import { Circle as CircleStyle,Fill,Stroke,Style, Text} from 'ol/style.js'

  const axiosPlain = inject('axiosPlain')

  let map
  let checkpointPoints
  let entryRawTrack
  let entryLegsTrack
  let chargeLegsTrack

  const props = defineProps({
    entry: Object,
    charge: Object,
    showChargeLegs: Boolean
  })

  const state = reactive({
    checkpoints: null,
    entry: null,
    chargeLegs: null
  })

  //================================
  // Watch for prop changes
  //================================
  watch(()=>props.charge, () => {
    if (props.charge){

      return axiosPlain.get('/charge/' + props.charge.charge_id + '/checkpoints')
        .then(rows => {
          state.checkpoints = rows.data

          return axiosPlain.get('/charge/' + props.charge.charge_id + '/legs')
        })
        .then(rows => {
          state.chargeLegs = rows.data

          if (!map) {
            setupMap()
          }
          refreshCheckpoints()
          // If props.entry was already set then
          if (props.entry) {
            refreshEntryLegs()
            refreshEntryRawTrack()
          }
        })
    }  
  }, {immediate:true})

  watch(()=>props.entry, () => {
    if (props.entry) {
      let fnc = []
      if (props.entry.processing_status!='NO_GPS') {
        fnc.push(
          axiosPlain.get('/entry/' + props.entry.entry_id + '/geometry')
            .then(rows => {
              state.entry = rows.data[0]
            })
        )
      } else {
        state.entry = null
      }
      if(props.entry.processing_status=='LEGS') {
        fnc.push(
          axiosPlain.get('/entry/' + props.entry.entry_id + '/legs?geometry=geojson')
            .then(rows => {
              state.entry.legs = rows.data
            })
        )
      } else {
        if (state.entry) {
          state.entry.legs = null
        }
         
      }
      Promise.all(fnc)
        .then(() => {
          if (map) {
            refreshEntryRawTrack()
            refreshEntryLegs()
          }
        })
    }
  },{ immediate: true })

  //================================
  // Refresh map items
  //================================
  function refreshCheckpoints() {
    checkpointPoints.setSource(
      new VectorSource({
        features: new GeoJSON().readFeatures(checkpointMarkers.value, {dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857'})
      })
    )
    chargeLegsTrack.setSource(
      new VectorSource({
        features: new GeoJSON().readFeatures(legLines.value, {dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857'})
      })
    )
  }

  function refreshEntryLegs() {
    if (map && state.entry && state.entry.legs) {
      if (!entryLegsTrack) {
        entryLegsTrack = new VectorLayer({
          style: lineStyleFunction(props.entry.color, 2.5),
        })
        map.addLayer(entryLegsTrack)
      }
      let json = {type: 'FeatureCollection', features: state.entry.legs.map(l=>{
        return {
          type: 'Feature',
          properties: {name: l.leg_no},
          geometry: JSON.parse(l.leg_line)
        }
      })}
      entryLegsTrack.setSource(
        new VectorSource({
          features: new GeoJSON().readFeatures(json, {dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857'})
        })
      )
    }
  }

  function refreshEntryRawTrack() {
    if (map && state.entry && state.entry.clean_line_json) {
      let json

      if (!entryRawTrack) {
        entryRawTrack = new VectorLayer({
          style: lineStyleFunction('#777', 1.5),
        })
        map.addLayer(entryRawTrack) 
      }

      json = JSON.parse(state.entry.clean_line_json)
      entryRawTrack.setSource(
        new VectorSource({
          features: new GeoJSON().readFeatures(json, {dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857'})
        })
      )
    }
  }

  //==============================
  //Computed map data
  //==============================
  const checkpointMarkers = computed(() => {
    if (state.checkpoints) {
      return {
        type: "FeatureCollection",
        features: state.checkpoints.map(c => {
          return {
            type: 'Feature',
            properties: {name: c.short_name? c.short_name : c.sponsor_name, is_gauntlet: c.is_gauntlet},
            geometry: JSON.parse(c.location)
          }
        })
      }
    } else {
      return {}
    }
  })
  const legLines = computed(() => {
    if (state.chargeLegs) {
      return {
        type: "FeatureCollection",
        features: state.chargeLegs.map(c => {
          return {
            type: 'Feature',
            properties: {name: c.short_name? c.short_name : c.sponsor_name, is_gauntlet: c.is_gauntlet, is_tsetse: c.is_tsetse},
            geometry: {type: 'LineString', coordinates: [JSON.parse(c.checkpoint1_location).coordinates,JSON.parse(c.checkpoint2_location).coordinates]}
          }
        })
      }
    } else {
      return {}
    }
  })

  //==============================
  //Setup
  //==============================
  const mapCenter = computed(() => {
    if (props.charge.map_center) {
      let pnt=JSON.parse(props.charge.map_center)
      return fromLonLat(pnt.coordinates)
    } else {
      return fromLonLat([0,0])
    }
  })

  function setupMap() {   
    checkpointPoints = new VectorLayer({
      style: pointStyleFunction,
    })
    chargeLegsTrack = new VectorLayer({
      style: chargeLegStyleFunction,
    })

    map = new Map({
      target: 'map',
      layers: [
        new TileLayer({ source: new XYZ({url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'})})
      ],
      view: new View({
        center: mapCenter.value,
        zoom: props.charge.map_scale + 1,
      })
    })

    map.addLayer(checkpointPoints) 
    if (props.showChargeLegs) {
      map.addLayer(chargeLegsTrack)
    }    
  }
  
  //==============================
  //Styles
  //==============================
  function textStyle(feature) {
    return new Text( {
      text: feature.get('name'),
      textAlign: 'left',
      offsetX: 10,
      offsetY: 0
    })
  }
  function pointStyleFunction(feature) { //, resolution) {
    let props = feature.getProperties()
    return new Style({
      image: new CircleStyle({
        radius: props.is_gauntlet ? 5 : 3,
        fill: new Fill({color: props.is_gauntlet?'red':'black'}),
        stroke: new Stroke({color: props.is_gauntlet?'red':'black', width: 0.5}),
      }),
    text: textStyle(feature)
    })
  }
  function lineStyleFunction(color, size) {
    return function() {
      return new Style({
        stroke: new Stroke({
          color: color,
          width: size,
        })
      })
    }
  }
  function chargeLegStyleFunction(feature) {
    let props = feature.getProperties()
    return new Style({
      stroke: new Stroke({
        color: props.is_tsetse ? 'red' : 'grey',
        width: props.is_tsetse ? 2 : 0.5,
      })
    })
  }

</script>

<template>
  <v-card class="px-1 pt-2 pb-1"><div id="map" style="color:red;width:100%;height:400px;" class="map"></div></v-card>
  
</template>
<style>
  @import '../../node_modules/ol/ol.css';
  .map {
    width: 100%;
    height: 400px;
  }
</style>