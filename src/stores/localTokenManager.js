import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useLocalTokenStore = defineStore('localToken', () => {
  const userToken = ref(localStorage.getItem('token') ?? '');
  function setUserToken(t) {
    userToken.value = t;
    if (t) localStorage.setItem('token', t);
  }
  function clearUserToken() {
    userToken.value = '';
    localStorage.removeItem('token');
  }
  function clearAllGameTokens() {}
  function initTokenManager() {}
  return { userToken, setUserToken, clearUserToken, clearAllGameTokens, initTokenManager };
});