<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useSettingsStore } from '@/stores/settings'
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

// Migration wizard
const calibreLibPath = ref('')
const preferFormat = ref('')
const migrating = ref(false)
const migrationResult = ref<import('@/types').MigrateResult | null>(null)
const migrationStep = ref<'start' | 'preview' | 'done'>('start')
const migrationError = ref<string | null>(null)

const isMigrated = computed(() => {
  if (settings.value.calibreMigrated !== 'true') return false
  if (!settings.value.calibreLibraryPath) return true
  if (!calibreLibPath.value.trim()) return true
  return settings.value.calibreLibraryPath === calibreLibPath.value.trim()
})

onMounted(async () => {
  await Promise.all([
    settingsStore.fetchSettings(),
    profilesStore.fetchProfiles(),
  ])

  libraryPath.value = settings.value.libraryPath || ''
  calibreLibPath.value = settings.value.calibreLibraryPath || ''
  authEnabled.value = settings.value.authEnabled === 'true'
  username.value = settings.value.username || ''
  password.value = settings.value.password || ''
})

async function dryRunMigrate() {
  if (!calibreLibPath.value.trim()) return
  migrating.value = true
  migrationError.value = null
  migrationResult.value = null
  try {
    const result = await settingsStore.migrateFromCalibre(calibreLibPath.value.trim(), {
      preferFormat: preferFormat.value || undefined,
      dryRun: true,
    })
    migrationResult.value = result
    migrationStep.value = 'preview'
  } catch (e: unknown) {
    migrationError.value = e instanceof Error ? e.message : 'Dry run failed'
  } finally {
    migrating.value = false
  }
}

async function runMigration() {
  if (!calibreLibPath.value.trim()) return
  migrating.value = true
  migrationError.value = null
  migrationResult.value = null
  try {
    const result = await settingsStore.migrateFromCalibre(calibreLibPath.value.trim(), {
      preferFormat: preferFormat.value || undefined,
      dryRun: false,
    })
    migrationResult.value = result
    migrationStep.value = 'done'
    if (result.copied > 0) {
      showMessage(`Imported ${result.copied} books from Calibre. Reload to see them in your library.`)
    } else if (result.errors > 0) {
      showMessage(`Migration completed with ${result.errors} errors.`)
    } else {
      showMessage('Migration complete. No new books to import.')
    }
  } catch (e: unknown) {
    migrationError.value = e instanceof Error ? e.message : 'Migration failed'
  } finally {
    migrating.value = false
  }
}

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
    const res = await fetch('/api/settings/export')
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

        <!-- Migrate from Calibre -->
        <div class="border-t-2 border-coffee/10 pt-6">
          <h2 class="text-xl font-bold text-coffee mb-4">Migrate from Calibre</h2>

          <p class="text-leather mb-4 italic">
            Import books from an existing Calibre library. Files are copied into your books directory.
          </p>

          <div class="flex flex-col gap-4">
            <div>
              <label for="calibreLibPath" class="block text-sm font-bold text-coffee mb-2">
                Calibre Library Path
              </label>
              <input
                id="calibreLibPath"
                v-model="calibreLibPath"
                type="text"
                placeholder="/path/to/calibre/library"
                class="w-full px-4 py-3 bg-parchment text-coffee font-bold placeholder-leather/70 border-2 border-coffee rounded-xl focus:outline-none"
                :disabled="migrating"
              />
            </div>

            <div>
              <label for="preferFormat" class="block text-sm font-bold text-coffee mb-2">
                Preferred Format <span class="text-leather font-normal">(optional)</span>
              </label>
              <select
                id="preferFormat"
                v-model="preferFormat"
                class="w-full px-4 py-3 bg-parchment text-coffee font-bold border-2 border-coffee rounded-xl focus:outline-none"
                :disabled="migrating"
              >
                <option value="">All formats</option>
                <option value="epub">EPUB only</option>
                <option value="pdf">PDF only</option>
                <option value="txt">Text only</option>
              </select>
            </div>

            <div v-if="migrationError" class="p-3 rounded-xl bg-clay/10 border border-clay/30 text-clay font-bold">
              {{ migrationError }}
            </div>

            <!-- Step 1: Start -->
            <div v-if="migrationStep === 'start'" class="flex flex-wrap gap-3">
              <button
                class="px-6 py-3 bg-card text-coffee font-bold border-2 border-coffee rounded-xl hover:shadow-brutal disabled:opacity-60 transition-all"
                :disabled="!calibreLibPath.trim() || migrating"
                @click="dryRunMigrate"
              >
                {{ migrating ? 'Scanning...' : 'Preview Import' }}
              </button>
              <button
                class="px-6 py-3 bg-forest text-parchment font-bold border-2 border-coffee rounded-xl hover:shadow-brutal disabled:opacity-60 transition-all"
                :disabled="!calibreLibPath.trim() || migrating || isMigrated"
                :title="isMigrated ? 'Migration already completed for this library' : ''"
                @click="runMigration"
              >
                {{ migrating ? 'Importing...' : 'Run Import' }}
              </button>
              <p v-if="isMigrated" class="text-sage font-bold text-sm self-center">
                  ✓ Already imported from this library
                </p>
            </div>

            <!-- Step 2: Preview -->
            <div v-if="migrationStep === 'preview' && migrationResult" class="flex flex-col gap-3">
              <div class="p-4 rounded-xl bg-parchment border-2 border-coffee/10">
                <p class="font-bold text-coffee mb-2">
                  Preview: {{ migrationResult.total }} books found
                </p>
                <p class="text-sm text-leather">
                  {{ migrationResult.details.filter(d => d.action === 'dry-run').length }} would be copied,
                  {{ migrationResult.skipped }} would be skipped
                </p>
              </div>

              <div v-if="migrationResult.details.length > 0" class="max-h-48 overflow-y-auto border-2 border-coffee/10 rounded-xl p-2">
                <div
                  v-for="(d, i) in migrationResult.details"
                  :key="i"
                  class="text-sm py-1 px-2 border-b border-coffee/5 last:border-0"
                  :class="d.action === 'skip' ? 'text-sage' : 'text-coffee'"
                >
                  <span v-if="d.action === 'dry-run'">📄</span>
                  <span v-else-if="d.action === 'skip'">⏭</span>
                  {{ d.title }}
                  <span class="text-leather">by {{ d.author }}</span>
                  <span class="text-sage text-xs">({{ d.format }})</span>
                  <span v-if="d.reason" class="text-clay text-xs"> — {{ d.reason }}</span>
                </div>
              </div>

              <div class="flex gap-3">
                <button
                  class="px-6 py-3 bg-forest text-parchment font-bold border-2 border-coffee rounded-xl hover:shadow-brutal disabled:opacity-60 transition-all"
                  :disabled="migrating || isMigrated"
                  @click="runMigration"
                >
                  {{ migrating ? 'Importing...' : 'Confirm & Run Import' }}
                </button>
                <button
                  class="px-4 py-3 bg-card text-coffee font-bold border-2 border-coffee rounded-xl hover:shadow-brutal transition-all"
                  @click="migrationStep = 'start'; migrationResult = null"
                >
                  Cancel
                </button>
              </div>
            </div>

            <!-- Step 3: Done -->
            <div v-if="migrationStep === 'done' && migrationResult" class="flex flex-col gap-3">
              <div
                class="p-4 rounded-xl border-2"
                :class="migrationResult.errors > 0 ? 'bg-clay/10 border-clay/30' : 'bg-forest/10 border-forest/30'"
              >
                <p class="font-bold text-coffee mb-1">
                  Migration Complete!
                </p>
                <p class="text-sm text-leather">
                  Copied: {{ migrationResult.copied }} |
                  Skipped: {{ migrationResult.skipped }} |
                  Errors: {{ migrationResult.errors }}
                </p>
              </div>

              <div v-if="migrationResult.errors_list.length > 0" class="max-h-32 overflow-y-auto">
                <p class="text-sm font-bold text-clay mb-1">Errors:</p>
                <p v-for="(err, i) in migrationResult.errors_list" :key="i" class="text-xs text-clay">
                  {{ err }}
                </p>
              </div>

              <button
                class="self-start px-4 py-2 bg-card text-coffee font-bold border-2 border-coffee rounded-xl hover:shadow-brutal transition-all"
                @click="migrationStep = 'start'; migrationResult = null"
              >
                Done
              </button>
            </div>
          </div>
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
