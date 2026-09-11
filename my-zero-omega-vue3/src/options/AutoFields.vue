<script setup>
// Auto-switch fieldset: default profile picker + rules table.

import { computed } from 'vue';
import { ProfileType } from '../lib/constants.js';
import { profileOrder } from './helpers.js';

const props = defineProps({
  profile: { type: Object, required: true },
  profiles: { type: Object, required: true },
});
const emit = defineEmits(['update:profile']);

// Only non-auto profiles can be a rule/default target — no auto→auto nesting.
const targets = computed(() =>
  Object.values(props.profiles)
    .filter(x => x.type !== ProfileType.AUTO_SWITCH)
    .sort(profileOrder)
);

const firstNonAutoId = computed(() => targets.value[0]?.id ?? 'direct');

function patch(update) {
  emit('update:profile', { ...props.profile, ...update });
}

const defaultProfileIdModel = computed({
  get: () => props.profile.defaultProfileId,
  set: v => patch({ defaultProfileId: v }),
});

function addRule() {
  patch({
    rules: [
      ...(props.profile.rules || []),
      { pattern: '*.example.com', profileId: firstNonAutoId.value, matchType: 'wildcard' },
    ],
  });
}

function removeRule(i) {
  patch({
    rules: (props.profile.rules || []).filter((_, idx) => idx !== i),
  });
}

function updateRule(i, key, value) {
  patch({
    rules: (props.profile.rules || []).map(
      (r, idx) => idx === i ? { ...r, [key]: value } : r
    ),
  });
}
</script>

<template>
  <fieldset>
    <legend>Auto Switch</legend>
    <div class="row">
      <label>
        Default profile
        <span class="hint">used when no rule matches</span>
      </label>
      <select v-model="defaultProfileIdModel">
        <option v-for="t in targets" :key="t.id" :value="t.id">{{ t.name }}</option>
      </select>
    </div>
    <div class="row">
      <label>
        Rules
        <span class="hint">wildcard: * = any chars, ? = one char</span>
      </label>
      <div>
        <table class="rules">
          <thead>
            <tr><th>Pattern</th><th>Target Profile</th><th /></tr>
          </thead>
          <tbody>
            <tr v-for="(r, i) in profile.rules || []" :key="i">
              <td>
                <input
                  type="text"
                  :value="r.pattern"
                  placeholder="*.example.com"
                  @input="updateRule(i, 'pattern', $event.target.value)"
                >
              </td>
              <td>
                <select
                  :value="r.profileId"
                  @change="updateRule(i, 'profileId', $event.target.value)"
                >
                  <option v-for="t in targets" :key="t.id" :value="t.id">{{ t.name }}</option>
                </select>
              </td>
              <td>
                <button
                  type="button"
                  class="btn-remove-rule"
                  title="Remove rule"
                  @click="removeRule(i)"
                >×</button>
              </td>
            </tr>
          </tbody>
        </table>
        <button type="button" class="btn-add-rule" @click="addRule">
          + Add rule
        </button>
      </div>
    </div>
  </fieldset>
</template>
