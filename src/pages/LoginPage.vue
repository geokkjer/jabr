<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import Logo from '@/components/Logo.vue'

const router = useRouter()
const authStore = useAuthStore()

const username = ref('')
const password = ref('')
const error = ref<string | null>(null)
const busy = ref(false)

async function login() {
  busy.value = true
  error.value = null
  try {
    await authStore.login(username.value, password.value)
    router.push('/')
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Login failed'
  } finally {
    busy.value = false
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') login()
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-parchment p-8">
    <div
      class="w-full max-w-md p-8 bg-card rounded-2xl border-4 border-coffee shadow-brutal-lg"
    >
      <div class="flex flex-col items-center mb-8">
        <Logo :size="64" class="mb-4" />
        <h1 class="text-4xl font-black text-coffee text-center">JABR Login</h1>
      </div>

      <div class="flex flex-col gap-6">
        <div>
          <label for="username" class="block text-sm font-bold text-coffee mb-2">Username</label>
          <input
            id="username"
            v-model="username"
            type="text"
            class="w-full px-4 py-3 bg-parchment text-coffee font-bold border-2 border-coffee rounded-xl focus:outline-none"
          />
        </div>

        <div>
          <label for="password" class="block text-sm font-bold text-coffee mb-2">Password</label>
          <input
            id="password"
            v-model="password"
            type="password"
            class="w-full px-4 py-3 bg-parchment text-coffee font-bold border-2 border-coffee rounded-xl focus:outline-none"
            @keydown="onKeydown"
          />
        </div>

        <p v-if="error" class="text-red-600 font-bold text-center">{{ error }}</p>

        <button
          class="w-full py-4 bg-forest text-parchment font-bold border-2 border-coffee rounded-xl hover:shadow-brutal disabled:opacity-60 transition-all"
          :disabled="busy"
          @click="login"
        >
          {{ busy ? 'Logging in...' : 'Login' }}
        </button>
      </div>
    </div>
  </div>
</template>
