<script setup>
  import { reactive, inject, watch, computed } from 'vue'
  import { useRoute } from 'vue-router'

  import Map from 'ol/Map'
  import View from 'ol/View'
  import TileLayer from 'ol/layer/Tile'
  import XYZ from 'ol/source/XYZ'
  import { fromLonLat} from 'ol/proj.js'
  import VectorSource from 'ol/source/Vector'
  import VectorLayer from 'ol/layer/Vector'
  import GeoJSON from 'ol/format/GeoJSON.js'
  import { Circle as CircleStyle,Fill,Stroke,Style, Text} from 'ol/style.js'
  import Overlay from 'ol/Overlay.js'
  import { DateTime } from 'luxon'
  

  const axiosPlain = inject('axiosPlain')
  const route = useRoute()

  //Array of 40 random html color codes
  const colors = ['#FF6633', '#FFB399', '#FF33FF', '#FFFF99', '#00B3E6', 
    '#E6B333', '#3366E6', '#999966', '#99FF99', '#B34D4D',
    '#80B300', '#809900', '#E6B3B3', '#6680B3', '#66991A', 
    '#FF99E6', '#CCFF1A', '#FF1A66', '#E6331A', '#33FFCC',
    '#66994D', '#B366CC', '#4D8000', '#B33300', '#CC80CC', 
    '#66664D', '#991AFF', '#E666FF', '#4DB3FF', '#1AB399',
    '#E666B3', '#33991A', '#CC9999', '#B3B31A', '#00E680', 
    '#4D8066', '#809980', '#E6FF80', '#1AFF33', '#999933',
    '#FF3380', '#CCCC00', '#66E64D', '#4D80CC', '#9900B3', 
    '#E64D66', '#4DB380', '#FF4D4D', '#99E6E6', '#6666FF']
  

  let map
  let checkpointPoints
  
  const state = reactive({
    chargeId: null,
    charge: null,
    entries: null,
    checkpoints: null,
  })

  watch(
    () => route.params.charge_id,
    chargeId => {
      state.chargeId = parseInt(chargeId)
      axiosPlain.get('/charge/' + chargeId)
        .then(rows => {
          state.charge = rows.data
          return axiosPlain.get('/charge/' + chargeId + '/checkpoints')
          
        })
        .then(rows => {
          state.checkpoints = rows.data
          return axiosPlain.get('/charge/' + chargeId + '/teltonika_entries')
        })
        .then(rows => {
          state.entries = rows.data
          setupMap()
          setupTracks()
        })
        .then(() => {
          state.entries.map(async e => {
            await resetTracks(e)
            setInterval(await resetTracks, 20000,e)
          })
        })
    }, { immediate: true }
  )

  function setupTracks() {
    state.entries.forEach(e => {
      const color = colors[Math.round(Math.random()*40)]
      const card = document.createElement('div')
      card.classList.add('card')
      card.style.borderColor = color
      card.id = 'card_' + e.imei
      
      const cardTitle = document.createElement('div')
      card.append(cardTitle)
      cardTitle.classList.add('cardTitle')
      cardTitle.innerHTML = e.entry_name
      
      const cardBody = document.createElement('div')
      card.append(cardBody)
      cardBody.classList.add('cardBody')
      const cardOverlay = new Overlay({
        element: card,
      })
      map.addOverlay(cardOverlay)

      const trackLayer = new VectorLayer({
        style: trackStyleFunction(color),
      })
      map.addLayer(trackLayer)

      e.map = {trackLayer: trackLayer, cardBody: cardBody, cardTitle: cardTitle, cardOverlay: cardOverlay, color: color}
    })
  }
  async function resetTracks(e) {
    console.log(`Reset track ${e.entry_name}`)

    const {trackLayer, cardBody, cardTitle, cardOverlay, color} = e.map
    let lastData, lastPosition

    cardBody.innerHTML = ''
    
    return axiosPlain.get('/teltonika/' + e.imei + '/recent_track?hrs=100')
      .then(rows=>{
        lastData = rows.data
        lastPosition = JSON.parse(lastData.last_position)
        
        trackLayer.setSource(
          new VectorSource({
            features: new GeoJSON().readFeatures(JSON.parse(lastData.track), {dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857'})
          })
        )

        let age = -DateTime.fromISO(lastData.received).diffNow([ 'minutes']).toObject().minutes
        let ageStr = age > 60 ? Math.floor(age/60) + 'h ' + Math.floor(age) % 60 + 'm' : Math.floor(age) + 'm'
        let ageGps = -DateTime.fromISO(lastData.gps_datetime).diffNow([ 'minutes']).toObject().minutes
        let ageGpsStr = ageGps > 60 ? Math.floor(ageGps/60) + 'h ' + Math.floor(ageGps) % 60 + 'm' : Math.floor(ageGps) + 'm'
        cardBody.innerHTML = '<div>Last fix: ' + ageGpsStr + '</div>'
        if (lastData.speed>0) {
          cardBody.innerHTML += '<div>Speed: ' + lastData.speed + ' km/h</div>'
        } else {
          cardBody.innerHTML += '<div>Stopped</div>'    
        }
        if (age>5) {
          cardBody.innerHTML += `<div style="margin-top:2px;border-top:1px solid #fff;">Last data: ` + ageStr + '</div>' 
        }
        cardOverlay.setPosition(fromLonLat(lastPosition.coordinates))
      })
  }

  const mapCenter = computed(() => {
    if (state.charge.map_center) {
      let pnt=JSON.parse(state.charge.map_center)
      return fromLonLat(pnt.coordinates)
    } else {
      return fromLonLat([0,0])
    }
  })

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

  function trackStyleFunction(color) {
    return new Style({
      stroke: new Stroke({
        color: color,
        width: 2,
      })
    })
  } 

  function checkpointStyleFunction(feature) {
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

  function textStyle(feature) {
    return new Text( {
      text: feature.get('name'),
      textAlign: 'left',
      offsetX: 10,
      offsetY: 0
    })
  }  

  function setupMap() {   
    console.log('setupMap') 

    checkpointPoints = new VectorLayer({
      style: checkpointStyleFunction,
    })
    
    map = new Map({
      target: 'map',
      layers: [
        new TileLayer({ source: new XYZ({url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'})})
      ],
      view: new View({
        center: mapCenter.value,
        zoom: state.charge.map_scale + 2,
      })
    })

    checkpointPoints.setSource(
      new VectorSource({
        features: new GeoJSON().readFeatures(checkpointMarkers.value, {dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857'})
      })
    )
    map.addLayer(checkpointPoints)
  }
</script>

<template>  
  <div id="map" style="color:red;" class="map">
    <div id="info"></div>
  </div>
</template>
<style>
  @import '../../../node_modules/ol/ol.css'; 

  .map {
    width: 100%;
    height: 100%;
    position: absolute;
  }
  .card {
    width: 130px;
    border-width: 3px 3px 3px 10px;
    border-radius: 4px;
    border-style: solid;
    padding: 2px 2px 2px 5px;
    background-color: #333;
    position: relative;
  }
  .cardTitle {
    color: #fff;
    font-size: small;
    font-variant: small-caps; 
    font-weight:bold;
  }
  .cardBody {
    color: #fff;
    font-size: x-small;
  }  
</style>