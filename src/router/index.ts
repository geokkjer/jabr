import { createRouter, createWebHistory } from 'vue-router'
import LibraryPage from '@/pages/LibraryPage.vue'

const routes = [
  { path: '/', name: 'library', component: LibraryPage },
  {
    path: '/read/:id',
    name: 'reader',
    component: () => import('@/pages/ReaderPage.vue'),
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('@/pages/SettingsPage.vue'),
  },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

export default router
