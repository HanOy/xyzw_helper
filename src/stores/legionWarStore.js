// Stub: Legion war data now comes from server cache/SSE
import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useLegionWarStore = defineStore('legionWar', () => {
  const data = ref(null);
  return { data };
});