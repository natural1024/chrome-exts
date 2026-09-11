<script setup>
// Root options view — mirrors the vanilla options.js semantics, but leans on
// Vue's v-model reactivity so we don't need a `collectForm()` step. The
// `editing` ref is always the exact payload we send to SAVE_PROFILE.

import { computed, onMounted, ref } from 'vue';
import { MSG } from '../lib/constants.js';
import { send } from '../lib/rpc.js';
import { makeAutoProfile, makeFixedProfile, profileOrder, validate } from './helpers.js';
import Sidebar from './Sidebar.vue';
import Editor from './Editor.vue';

const state = ref(null);
/** Currently-editing profile snapshot (never a direct storage reference). */
const editing = ref(null);
const msg = ref({ text: '', kind: '' });

const sortedProfiles = computed(() => {
  if (!state.value) return [];
  return Object.values(state.value.profiles).sort(profileOrder);
});

// A draft is an in-flight new profile the user hasn't saved yet.
const isDraft = computed(() =>
  !!editing.value && !state.value?.profiles[editing.value.id]
);

async function refresh() {
  const res = await send({ type: MSG.GET_STATE });
  state.value = res.state;
  // Re-sync editor with latest storage IF editor is not a draft. Drafts
  // are transient objects — never overwrite them from storage.
  if (editing.value && state.value.profiles[editing.value.id]) {
    editing.value = structuredClone(state.value.profiles[editing.value.id]);
  }
}

onMounted(refresh);

function startEditing(profile) {
  editing.value = structuredClone(profile);
  msg.value = { text: '', kind: '' };
}

function onNewFixed() { startEditing(makeFixedProfile()); }
function onNewAuto()  { startEditing(makeAutoProfile()); }

async function onSubmit() {
  const err = validate(editing.value, state.value.profiles);
  if (err) { msg.value = { text: err, kind: 'error' }; return; }
  try {
    await send({ type: MSG.SAVE_PROFILE, profile: editing.value });
    msg.value = { text: 'Saved.', kind: 'ok' };
    await refresh();
  } catch (e) {
    msg.value = { text: e.message, kind: 'error' };
  }
}

async function onDelete() {
  if (!confirm(`Delete profile "${editing.value.name}"?`)) return;
  try {
    await send({ type: MSG.DELETE_PROFILE, profileId: editing.value.id });
    editing.value = null;
    msg.value = { text: '', kind: '' };
    await refresh();
  } catch (e) {
    msg.value = { text: e.message, kind: 'error' };
  }
}
</script>

<template>
  <header><h1>My Zero Omega — Options</h1></header>
  <main>
    <Sidebar
      :profiles="sortedProfiles"
      :editing-id="editing?.id"
      @new-fixed="onNewFixed"
      @new-auto="onNewAuto"
      @pick="startEditing"
    />
    <section class="editor">
      <div v-if="!editing" class="empty">
        Pick a profile on the left, or create a new one.
      </div>
      <Editor
        v-else
        v-model:profile="editing"
        :profiles="state.profiles"
        :is-draft="isDraft"
        :msg="msg"
        @submit="onSubmit"
        @delete="onDelete"
      />
    </section>
  </main>
</template>
