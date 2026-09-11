<script setup>
// Fixed-proxy fieldset. Keeps `bypassList` in the storage-schema shape
// (string[]) — we serialize/deserialize it against the textarea via computed.

import { computed } from 'vue';

const props = defineProps({
  profile: { type: Object, required: true },
});
const emit = defineEmits(['update:profile']);

const SCHEMES = ['http', 'https', 'socks5', 'socks4'];

function patch(update) {
  emit('update:profile', { ...props.profile, ...update });
}

const schemeModel = computed({
  get: () => props.profile.scheme,
  set: v => patch({ scheme: v }),
});
const hostModel = computed({
  get: () => props.profile.host,
  set: v => patch({ host: v }),
});
const portModel = computed({
  get: () => props.profile.port,
  set: v => patch({ port: Number(v) }),
});
const bypassTextModel = computed({
  get: () => (props.profile.bypassList || []).join('\n'),
  set: v => patch({
    bypassList: v.split('\n').map(s => s.trim()).filter(Boolean),
  }),
});
</script>

<template>
  <fieldset>
    <legend>Fixed Proxy</legend>
    <div class="row">
      <label>Scheme</label>
      <select v-model="schemeModel">
        <option v-for="s in SCHEMES" :key="s" :value="s">{{ s }}</option>
      </select>
    </div>
    <div class="row">
      <label>Host</label>
      <input type="text" v-model="hostModel" placeholder="127.0.0.1" required>
    </div>
    <div class="row">
      <label>Port</label>
      <input type="number" min="1" max="65535" v-model.number="portModel" required>
    </div>
    <div class="row">
      <label>
        Bypass List
        <span class="hint">one per line — e.g. &lt;local&gt;, *.internal, 192.168.0.0/16</span>
      </label>
      <textarea rows="4" v-model="bypassTextModel" />
    </div>
  </fieldset>
</template>
