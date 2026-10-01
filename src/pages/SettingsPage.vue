<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAdminStore } from '@/stores/admin'
import { useBooksStore } from '@/stores/books'
import { useProfilesStore } from '@/stores/profiles'
import { storeToRefs } from 'pinia'
import { AdminApi } from '@/services/api'
import type { Book } from '@/types'
import Logo from '@/components/Logo.vue'

const adminStore = useAdminStore()
const booksStore = useBooksStore()
const profilesStore = useProfilesStore()

const { error: adminError } = storeToRefs(adminStore)
const { profiles, activeId, loading: profilesLoading } = storeToRefs(profilesStore)

const hiddenBooks = ref<Book[]>([])
const hiddenLoading = ref(true)

const newProfileName = ref('')
const editingId = ref('')
const editingName = ref('')
const resetBusy = ref(false)
const message = ref('')
const showResetConfirm = ref(false)

onMounted(async () => {
  await Promise.all([profilesStore.ensureDefaultProfile(), loadHiddenBooks()])
})

async function loadHiddenBooks() {
  hiddenLoading.value = true
  try {
    hiddenBooks.value = await booksStore.fetchHiddenBooks()
  } finally {
    hiddenLoading.value = false
  }
}

async function restore(id: string) {
  await booksStore.restoreBook(id)
  await loadHiddenBooks()
  showMessage('Book restored to the library.')
}

function startRename(id: string, currentName: string) {
  editingId.value = id
  editingName.value = currentName
}

function cancelRename() {
  editingId.value = ''
  editingName.value = ''
}

async function saveRename(id: string) {
  const name = editingName.value.trim()
  if (!name) return
  await profilesStore.renameProfile(id, name)
  cancelRename()
  showMessage('Profile renamed.')
}

function showMessage(msg: string) {
  message.value = msg
  setTimeout(() => (message.value = ''), 3000)
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
    await adminStore.resetDatabase()
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
    const res = await fetch(AdminApi.exportUrl)
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
        <!-- How books get in -->
        <div>
          <h2 class="text-xl font-bold text-coffee mb-4">Adding Books</h2>
          <p class="text-leather mb-4 italic">
            Drop book files into your books directory, or upload them from the Library page.
          </p>

          <ul class="flex flex-col gap-2 text-coffee">
            <li class="flex gap-2">
              <span class="text-sage font-bold">1.</span>
              <span>
                <strong>Folder:</strong> put <code class="font-mono text-sm">.epub</code>,
                <code class="font-mono text-sm">.pdf</code>, <code class="font-mono text-sm">.txt</code> or
                <code class="font-mono text-sm">.md</code> files in the directory the server scans
                (<code class="font-mono text-sm">JABR_BOOKS_PATH</code>, <code class="font-mono text-sm">/app/books</code>
                in the container). Subfolders are scanned too.
              </span>
            </li>
            <li class="flex gap-2">
              <span class="text-sage font-bold">2.</span>
              <span>
                <strong>Upload:</strong> use <em>Upload</em> on the Library page — single files or a whole folder.
              </span>
            </li>
            <li class="flex gap-2">
              <span class="text-sage font-bold">3.</span>
              <span>
                <strong>Naming:</strong> title and author are read from the filename as
                <code class="font-mono text-sm">Author - Title.ext</code>. Anything else shows up under
                <em>Unknown</em>, readable but unsorted.
              </span>
            </li>
          </ul>

          <p class="text-leather mt-4 italic text-sm">
            Coming from Calibre? Use <em>Save to disk</em> with the template
            <code class="font-mono">&#123;authors&#125; - &#123;title&#125;</code> and point it at your books
            directory — that produces exactly the naming convention above.
          </p>
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
              class="flex items-center justify-between gap-3 p-3 rounded-xl bg-parchment border-2 border-coffee/10"
            >
              <template v-if="editingId === profile.id">
                <input
                  v-model="editingName"
                  type="text"
                  class="flex-1 px-3 py-2 bg-card text-coffee font-bold border-2 border-coffee rounded-lg focus:outline-none"
                  @keyup.enter="saveRename(profile.id)"
                  @keyup.esc="cancelRename"
                />
                <button
                  class="px-3 py-2 bg-forest text-parchment font-bold border-2 border-coffee rounded-lg hover:shadow-brutal transition-all"
                  @click="saveRename(profile.id)"
                >
                  Save
                </button>
                <button
                  class="px-3 py-2 bg-card text-coffee font-bold border-2 border-coffee rounded-lg hover:shadow-brutal transition-all"
                  @click="cancelRename"
                >
                  Cancel
                </button>
              </template>

              <template v-else>
                <span class="font-bold text-coffee">{{ profile.name }}</span>
                <div class="flex items-center gap-3">
                  <button
                    class="text-sm font-bold text-leather hover:text-coffee transition-colors"
                    @click="startRename(profile.id, profile.name)"
                  >
                    Rename
                  </button>
                  <button
                    v-if="profile.id !== activeId"
                    class="text-sm font-bold text-ocher hover:text-ocher/80 transition-colors"
                    @click="profilesStore.setActiveProfile(profile.id)"
                  >
                    Select
                  </button>
                  <span v-else class="text-sm font-bold text-sage">Active</span>
                </div>
              </template>
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

        <!-- Hidden books -->
        <div class="border-t-2 border-coffee/10 pt-6">
          <h2 class="text-xl font-bold text-coffee mb-4">Hidden Books</h2>
          <p class="text-leather mb-4 italic">
            Books hidden from the library. Their files were never touched — restore one and it
            comes back, progress and all.
          </p>

          <div v-if="hiddenLoading" class="text-center py-4 text-sage">Loading...</div>

          <div v-else-if="hiddenBooks.length === 0" class="text-center py-4 text-sage">
            Nothing hidden.
          </div>

          <div v-else class="space-y-2">
            <div
              v-for="book in hiddenBooks"
              :key="book.id"
              class="flex items-center justify-between gap-3 p-3 rounded-xl bg-parchment border-2 border-coffee/10"
            >
              <div class="min-w-0">
                <p class="font-bold text-coffee truncate">{{ book.title }}</p>
                <p class="text-sm text-leather truncate">{{ book.author }} · {{ book.format }}</p>
              </div>
              <button
                class="shrink-0 px-3 py-2 bg-forest text-parchment font-bold border-2 border-coffee rounded-lg hover:shadow-brutal transition-all"
                @click="restore(book.id)"
              >
                Restore
              </button>
            </div>
          </div>
        </div>

        <!-- Backup -->
        <div class="border-t-2 border-coffee/10 pt-6">
          <h2 class="text-xl font-bold text-coffee mb-4">Backup & Export</h2>
          <p class="text-leather mb-4 italic">
            Export your profiles and reading progress as a JSON file. Book files are not included —
            they are just files on disk, copy them however you like.
          </p>
          <button
            class="px-6 py-3 bg-forest text-parchment font-bold border-2 border-coffee rounded-xl hover:shadow-brutal transition-all"
            @click="exportBackup"
          >
            Export Backup
          </button>
        </div>

        <!-- Danger Zone -->
        <div class="border-t-2 border-coffee/10 pt-6">
          <div class="flex items-center gap-4 mb-4">
            <p v-if="message" class="text-forest font-bold">{{ message }}</p>
            <p v-if="adminError" class="text-red-600 font-bold">{{ adminError }}</p>
          </div>

          <h3 class="text-xl font-bold text-clay mb-2">Danger Zone</h3>
          <p class="text-leather mb-4 italic">
            Reset the database (clears all profiles and reading progress, and rebuilds the book index).
            Your book files are untouched.
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
</template>
