// Composables
import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    component: () => import('@/layouts/default/Default.vue'),
    children: [
      {
        path: '/',
        name: 'Charges',
        // route level code-splitting. This generates a separate chunk (about.[hash].js) for this route which is lazy-loaded when the route is visited.
        component: () => import(/* webpackChunkName: "home" */ '@/views/ChargesList.vue'),
      }, {
        path: '/charge/:charge_id',
        name: 'Charge',
        component: () => import(/* webpackChunkName: "charge" */ '@/views/ChargeDetails.vue'),
      }, {
        path: '/charge/:charge_id/entries',
        name: 'Charge Entries',
        component: () => import(/* webpackChunkName: "charge" */ '@/views/ChargeEntriesList.vue'),
      }, {
        path: '/entry/:entry_id',
        name: 'Entry',
        component: () => import(/* webpackChunkName: "charge" */ '@/views/EntryDetails.vue'),
      },{
        path: '/teams',
        name: 'Teams',
        component: () => import(/* webpackChunkName: "charges" */ '@/views/TeamsList.vue'),
      }, {
        path: '/cars',
        name: 'Cars',
        component: () => import(/* webpackChunkName: "charges" */ '@/views/CarsList.vue'),
      }, {
        path: '/sponsors',
        name: 'Sponsors',
        component: () => import(/* webpackChunkName: "charges" */ '@/views/SponsorsList.vue'),
      }, {
        path: '/trackers',
        name: 'TrackerList',
        component: () => import(/* webpackChunkName: "charges" */ '@/views/TrackerList.vue'),
      },
    ],
  },{
    path: '/charge/:charge_id/live',
    component: () => import('@/layouts/default/LiveMap.vue')
  },  {
    path: '/charge/:charge_id/results',
    name: 'Charge Results',
    component: () => import(/* webpackChunkName: "charge" */ '@/views/ChargeResults.vue'),
  },{
    path: '/charge/:charge_id/entries_results',
    name: 'Charge Entry Results',
    component: () => import(/* webpackChunkName: "charge" */ '@/views/ChargeResultsEntries.vue'),
  },{
    path: '/charge/:charge_id/legs_results',
    name: 'Charge Leg Results',
    component: () => import(/* webpackChunkName: "charge" */ '@/views/ChargeResultsLegs.vue'),
  }
]

const router = createRouter({
  history: createWebHistory(process.env.BASE_URL),
  routes,
})

export default router
