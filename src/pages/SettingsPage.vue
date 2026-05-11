<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useSettingsStore } from '@/stores/auth'
import { useProfilesStore } from '@/stores/profiles'
import { storeToRefs } from 'pinia'
import Logo from '@/components/Logo.vue'

const settingsStore = useSettingsStore()
const profilesStore = useProfilesStore()

const { settings, error: settingsError } = storeToRefs(settingsStore)
const { profiles, activeId, loading: profilesLoading } = storeToRefs(profilesStore)

const libraryPath = ref('')
const authEnabled = ref(false)
const username = ref('')
const password = ref('')
const newProfileName = ref('')
const busy = ref(false)
const resetBusy = ref(false)
const message = ref('')
const showResetConfirm = ref(false)

onMounted(async () => {
  await Promise.all([
    settingsStore.fetchSettings(),
    profilesStore.fetchProfiles(),
  ])

  libraryPath.value = settings.value.libraryPath || ''
  authEnabled.value = settings.value.authEnabled === 'true'
  username.value = settings.value.username || ''
  password.value = settings.value.password || ''
})

function showMessage(msg: string) {
  message.value = msg
  setTimeout(() => (message.value = ''), 3000)
}

async function saveSettings() {
  busy.value = true
  try {
    await settingsStore.saveSettings({
      libraryPath: libraryPath.value,
      authEnabled: authEnabled.value.toString(),
      username: username.value,
      password: password.value,
    })
    showMessage('Settings saved successfully.')
  } catch (e: unknown) {
    console.error('Failed to save settings:', e)
  } finally {
    busy.value = false
  }
}

async function addProfile() {
  if (!newProfileName.value.trim()) return
  await profilesStore.createProfile(newProfileName.value.trim())
  newProfileName.value = ''
  showMessage('Profile created.')
}

async function resetApp() {
  resetBusy.value = true
  try {
    await settingsStore.resetDatabase()
    showMessage('Database reset successfully. Reloading...')
    setTimeout(() => {
      window.location.href = '/'
    }, 1500)
  } catch (e: unknown) {
    console.error('Failed to reset:', e)
  } finally {
    resetBusy.value = false
    showResetConfirm.value = false
  }
}

async function exportBackup() {
  try {
    const res = await fetch('/api/export')
    if (!res.ok) throw new Error('Export failed')
    const blob = await res.blob()
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `jabr-backup-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
  } catch (e) {
    console.error('Export failed:', e)
  }
}
</script>

<template>
  <div class="min-h-screen p-8 bg-parchment">
    <header class="mb-12">
      <div class="flex items-center gap-4 mb-4">
        <router-link to="/" class="text-coffee font-bold hover:underline">← Back to Library</router-link>
      </div>
      <div class="flex items-center gap-4">
        <Logo :size="48" />
        <h1 class="text-6xl font-black text-coffee tracking-tight">Settings</h1>
      </div>
    </header>

    <div
      class="max-w-2xl p-8 bg-card rounded-2xl border-4 border-coffee shadow-brutal-lg"
    >
      <div class="flex flex-col gap-6">
        <!-- Library Path -->
        <div>
          <label for="libraryPath" class="block text-xl font-bold text-coffee mb-2">
            Books Directory Path
          </label>
          <p class="text-leather mb-4 italic">
            Point this to the folder containing your books.
          </p>
          <input
            id="libraryPath"
            v-model="libraryPath"
            type="text"
            placeholder="/path/to/your/books"
            class="w-full px-4 py-3 bg-parchment text-coffee font-bold placeholder-leather/70 border-2 border-coffee rounded-xl focus:outline-none"
          />
        </div>

        <!-- Auth -->
        <div class="border-t-2 border-coffee/10 pt-6">
          <label class="flex items-center gap-3 cursor-pointer mb-4">
            <input v-model="authEnabled" type="checkbox" class="w-6 h-6 accent-forest" />
            <span class="text-xl font-bold text-coffee">Enable Login Page</span>
          </label>

          <div v-if="authEnabled" class="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              />
            </div>
          </div>
        </div>

        <!-- Profiles -->
        <div class="border-t-2 border-coffee/10 pt-6">
          <h2 class="text-xl font-bold text-coffee mb-4">Reading Profiles</h2>

          <div v-if="profilesLoading" class="text-center py-4 text-sage">Loading profiles...</div>

          <div v-else-if="profiles.length === 0" class="text-center py-4 text-sage">
            No profiles yet. Create one below.
          </div>

          <div v-else class="space-y-2 mb-4">
            <div
              v-for="profile in profiles"
              :key="profile.id"
              class="flex items-center justify-between p-3 rounded-xl bg-parchment border-2 border-coffee/10"
            >
              <span class="font-bold text-coffee">{{ profile.name }}</span>
              <button
                v-if="profile.id !== activeId"
                class="text-sm font-bold text-ocher hover:text-ocher/80 transition-colors"
                @click="profilesStore.setActiveProfile(profile.id)"
              >
                Select
              </button>
              <span v-else class="text-sm font-bold text-sage">Active</span>
            </div>
          </div>

          <form class="flex gap-2" @submit.prevent="addProfile">
            <input
              v-model="newProfileName"
              type="text"
              placeholder="New profile name..."
              class="flex-1 px-4 py-3 bg-parchment text-coffee font-bold placeholder-leather/70 border-2 border-coffee rounded-xl focus:outline-none"
            />
            <button
              type="submit"
              class="px-6 py-3 bg-forest text-parchment font-bold border-2 border-coffee rounded-xl hover:shadow-brutal transition-all"
            >
              Add Profile
            </button>
          </form>
        </div>

        <!-- Backup -->
        <div class="border-t-2 border-coffee/10 pt-6">
          <h2 class="text-xl font-bold text-coffee mb-4">Backup & Export</h2>
          <p class="text-leather mb-4 italic">
            Export all settings, profiles, and reading progress as a backup file.
          </p>
          <button
            class="px-6 py-3 bg-forest text-parchment font-bold border-2 border-coffee rounded-xl hover:shadow-brutal transition-all"
            @click="exportBackup"
          >
            Export Backup
          </button>
        </div>

        <!-- Save + Danger Zone -->
        <div class="flex flex-col gap-4">
          <div class="flex items-center gap-4">
            <button
              class="px-6 py-3 bg-forest text-parchment font-bold border-2 border-coffee rounded-xl hover:shadow-brutal disabled:opacity-60 transition-all"
              :disabled="busy"
              @click="saveSettings"
            >
              {{ busy ? 'Saving...' : 'Save Settings' }}
            </button>

            <p v-if="message" class="text-forest font-bold">{{ message }}</p>
            <p v-if="settingsError" class="text-red-600 font-bold">{{ settingsError }}</p>
          </div>

          <div class="border-t-2 border-coffee/10 pt-6">
            <h3 class="text-xl font-bold text-clay mb-2">Danger Zone</h3>
            <p class="text-leather mb-4 italic">
              Reset the database (clears all settings, profiles, and reading progress).
            </p>

            <div v-if="showResetConfirm" class="flex items-center gap-4">
              <p class="text-coffee font-bold">Are you sure? This cannot be undone.</p>
              <button
                class="px-4 py-2 bg-clay text-parchment font-bold border-2 border-coffee rounded-xl hover:shadow-brutal disabled:opacity-60 transition-all"
                :disabled="resetBusy"
                @click="resetApp"
              >
                {{ resetBusy ? 'Resetting...' : 'Yes, Reset' }}
              </button>
              <button
                class="px-4 py-2 bg-card text-coffee font-bold border-2 border-coffee rounded-xl hover:shadow-brutal disabled:opacity-60 transition-all"
                :disabled="resetBusy"
                @click="showResetConfirm = false"
              >
                Cancel
              </button>
            </div>
            <button
              v-else
              class="px-4 py-2 bg-clay text-parchment font-bold border-2 border-coffee rounded-xl hover:shadow-brutal transition-all"
              @click="showResetConfirm = true"
            >
              Reset Database
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
