<script setup>
// Sidebar: list of profiles + new-profile buttons.
// Purely presentational; the parent owns state.
defineProps({
  // Already sorted by parent — we don't re-sort here.
  profiles: { type: Array, required: true },
  editingId: { type: String, default: null },
});

defineEmits(['new-fixed', 'new-auto', 'pick']);
</script>

<template>
  <aside class="sidebar">
    <div class="toolbar">
      <button type="button" @click="$emit('new-fixed')">+ Fixed Proxy</button>
      <button type="button" @click="$emit('new-auto')">+ Auto Switch</button>
    </div>
    <ul class="profile-list">
      <li
        v-for="p in profiles"
        :key="p.id"
        class="item"
        :class="{ selected: editingId === p.id }"
        @click="$emit('pick', p)"
      >
        <span class="tag" :class="`tag-${p.type}`" />
        <span class="name">{{ p.name }}</span>
      </li>
    </ul>
  </aside>
</template>
