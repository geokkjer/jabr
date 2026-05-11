import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
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
  {
    path: '/login',
    name: 'login',
    component: () => import('@/pages/LoginPage.vue'),
    meta: { public: true },
  },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

router.beforeEach(async (to, _from, next) => {
  const authStore = useAuthStore()
  await authStore.checkStatus()

  if (to.meta.public) {
    next()
    return
  }

  if (authStore.authEnabled && !authStore.isAuthenticated) {
    next('/login')
    return
  }

  next()
})

export default router
