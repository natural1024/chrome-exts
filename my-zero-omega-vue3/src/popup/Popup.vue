<script setup>
// Toolbar popup — mirrors the vanilla popup.js UX exactly:
//   - list all profiles (built-ins first, then alphabetical)
//   - click applies the profile, reloads the active tab, and closes the popup
//   - a banner is shown when another extension controls proxy settings
// State lives here as refs; no Pinia — the popup only exists for the split
// second the user has it open, a global store would be overkill.

import { computed, onMounted, ref } from 'vue';
import { MSG } from '../lib/constants.js';
import { send } from '../lib/rpc.js';

const state = ref(null);
const levelOfControl = ref(null);
const error = ref(null);

// Built-ins first, then alphabetical by name.
function profileOrder(a, b) {
  const abt = a.type.startsWith('builtin') ? 0 : 1;
  const bbt = b.type.startsWith('builtin') ? 0 : 1;
  if (abt !== bbt) return abt - bbt;
  return a.name.localeCompare(b.name);
}

// Chrome internal pages cannot be reloaded by extensions; a call throws.
// Skip them so a profile-switch itself never fails.
function isInternalUrl(url) {
  if (!url) return true;
  return /^(chrome|chrome-extension|edge|about|devtools|view-source):/i.test(url);
}

async function reloadActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return;
  if (isInternalUrl(tab.url)) return;
  try {
    await chrome.tabs.reload(tab.id, { bypassCache: false });
  } catch {
    // Reload failed (e.g. missing permission) — not fatal for the switch.
  }
}

const sortedProfiles = computed(() => {
  if (!state.value) return [];
  return Object.values(state.value.profiles).sort(profileOrder);
});

const showWarn = computed(() =>
  levelOfControl.value === 'controlled_by_other_extensions' ||
  levelOfControl.value === 'not_controllable'
);

onMounted(async () => {
  try {
    const res = await send({ type: MSG.GET_STATE });
    state.value = res.state;
    levelOfControl.value = res.levelOfControl;
  } catch (err) {
    error.value = err.message;
  }
});

async function onPick(profileId) {
  try {
    await send({ type: MSG.APPLY_PROFILE, profileId });
    await reloadActiveTab();
    // Close so the reloaded page takes focus — feels snappier.
    window.close();
  } catch (err) {
    alert(`Failed to apply profile: ${err.message}`);
  }
}

function openOptions() {
  chrome.runtime.openOptionsPage();
}
</script>

<template>
  <header>
    <h1>My Zero Omega</h1>
    <button
      type="button"
      class="btn-options"
      title="Open options"
      aria-label="Options"
      @click="openOptions"
    >⚙</button>
  </header>

  <div v-if="showWarn" class="warn">
    Proxy setting is "{{ levelOfControl }}". Another extension may be in control — disable it to let My Zero Omega apply changes.
  </div>

  <ul class="profiles" role="listbox">
    <li v-if="error" class="profile">
      <span />
      <span class="name">Error: {{ error }}</span>
      <span />
    </li>

    <li
      v-for="p in sortedProfiles"
      :key="p.id"
      class="profile"
      :class="{ active: p.id === state.activeProfileId }"
      role="option"
      :aria-selected="p.id === state.activeProfileId"
      @click="onPick(p.id)"
    >
      <span class="tag" :class="`tag-${p.type}`" />
      <span class="name">{{ p.name }}</span>
      <span class="check">✓</span>
    </li>
  </ul>
</template>
