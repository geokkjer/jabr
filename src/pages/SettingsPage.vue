<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useProfilesStore } from '@/stores/profiles'
import { storeToRefs } from 'pinia'

const profilesStore = useProfilesStore()
const { profiles, activeId, loading, error } = storeToRefs(profilesStore)
const newName = ref('')
const message = ref('')

onMounted(() => { profilesStore.fetchProfiles() })

async function addProfile() {
  if (!newName.value.trim()) return
  await profilesStore.createProfile(newName.value.trim())
  newName.value = ''
  showMessage('Profile created')
}

function showMessage(msg: string) {
  message.value = msg
  setTimeout(() => message.value = '', 3000)
}
</script>

<template>
  <div class="max-w-2xl mx-auto px-4 py-8">
    <div class="flex items-center justify-between mb-8">
      <h1 class="font-display text-3xl font-bold text-coffee">Settings</h1>
      <router-link to="/" class="text-sage hover:text-ocher transition-colors font-medium">
        &larr; Library
      </router-link>
    </div>

    <div v-if="message" class="mb-6 p-3 rounded-xl bg-forest/10 border border-forest/30 text-forest font-medium">
      {{ message }}
    </div>

    <div v-if="error" class="mb-6 p-3 rounded-xl bg-clay/10 border border-clay/30 text-clay font-medium">
      {{ error }}
    </div>

    <!-- Profiles -->
    <section class="mb-8">
      <h2 class="font-display text-xl font-bold text-coffee mb-4">Reading Profiles</h2>

      <div v-if="loading" class="text-center py-8 text-sage">Loading profiles...</div>

      <div v-else-if="profiles.length === 0" class="text-center py-8 text-sage">
        No profiles yet. Create one below.
      </div>

      <div v-else class="space-y-2">
        <div
          v-for="profile in profiles"
          :key="profile.id"
          class="flex items-center justify-between p-3 rounded-xl bg-card border-2 border-coffee/10"
        >
          <span class="font-medium text-coffee">{{ profile.name }}</span>
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

      <form class="mt-4 flex gap-2" @submit.prevent="addProfile">
        <input
          v-model="newName"
          type="text"
          placeholder="New profile name..."
          class="flex-1 px-3 py-2 rounded-xl border-2 border-coffee/10 bg-card text-coffee placeholder-sage/60 focus:border-ocher focus:outline-none"
        />
        <button
          type="submit"
          class="px-4 py-2 rounded-xl bg-forest text-white font-bold hover:bg-forest/90 transition-colors"
        >
          Add Profile
        </button>
      </form>
    </section>

    <!-- App Info -->
    <section>
      <h2 class="font-display text-xl font-bold text-coffee mb-4">About</h2>
      <p class="text-sm text-leather">JABR v0.1.0</p>
      <p class="text-sm text-leather">Just Another Book Reader</p>
    </section>
  </div>
</template>
