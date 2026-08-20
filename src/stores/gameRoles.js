import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useGameRolesStore = defineStore('gameRoles', () => {
  const roles = ref([]);
  const selectedRoleId = ref('');
  return {
    roles,
    selectedRoleId,
    setSelectedRole(id) {
      selectedRoleId.value = id;
    },
  };
});