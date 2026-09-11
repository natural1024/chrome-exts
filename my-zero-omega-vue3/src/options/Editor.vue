<script setup>
// Profile editor — dispatches to type-specific fieldset components.
// Uses v-model:profile so the parent can flip between profiles freely.

import { computed } from 'vue';
import { ProfileType } from '../lib/constants.js';
import FixedFields from './FixedFields.vue';
import AutoFields from './AutoFields.vue';

const props = defineProps({
  profile: { type: Object, required: true },
  profiles: { type: Object, required: true },
  isDraft: { type: Boolean, default: false },
  msg: { type: Object, required: true }, // { text, kind }
});

const emit = defineEmits(['update:profile', 'submit', 'delete']);

const isBuiltin = computed(() => props.profile.type.startsWith('builtin'));
const isFixed   = computed(() => props.profile.type === ProfileType.FIXED);
const isAuto    = computed(() => props.profile.type === ProfileType.AUTO_SWITCH);

// Wrapper models that patch the parent's profile immutably. We avoid
// mutating props directly — even though Vue's deep reactivity would let us,
// keeping updates funneled through emit('update:profile') matches how the
// React version behaves and makes the data flow easier to follow.
function patch(update) {
  emit('update:profile', { ...props.profile, ...update });
}

// v-model targets so <FixedFields> / <AutoFields> can rely on nested v-model.
const nameModel = computed({
  get: () => props.profile.name,
  set: v => patch({ name: v }),
});
</script>

<template>
  <form class="editor-form" autocomplete="off" @submit.prevent="$emit('submit')">
    <div class="row">
      <label>Name</label>
      <input type="text" v-model="nameModel" :disabled="isBuiltin" required>
    </div>
    <div class="row">
      <label>Type</label>
      <input type="text" :value="profile.type" disabled>
    </div>

    <FixedFields
      v-if="isFixed"
      :profile="profile"
      @update:profile="emit('update:profile', $event)"
    />
    <AutoFields
      v-if="isAuto"
      :profile="profile"
      :profiles="profiles"
      @update:profile="emit('update:profile', $event)"
    />

    <div class="actions">
      <button v-if="!isBuiltin" type="submit" class="primary">Save</button>
      <button
        v-if="!isBuiltin && !isDraft"
        type="button"
        class="btn-delete"
        @click="$emit('delete')"
      >Delete</button>
    </div>
    <div class="msg" :class="msg.kind">{{ msg.text }}</div>
  </form>
</template>
