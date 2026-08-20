import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api, setStoredToken, getStoredToken } from '../api';
import { useTokensStore } from './tokens';

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null);
  const token = ref(getStoredToken());
  const isLoading = ref(false);

  async function login(credentials) {
    isLoading.value = true;
    try {
      const resp = await api.auth.login(credentials.password);
      const tk = resp.data?.token;
      if (!tk) throw new Error('登录失败');
      setStoredToken(tk);
      token.value = tk;
      user.value = { username: 'admin' };
      const store = useTokensStore();
      await store.refresh();
      return { success: true };
    } catch (err) {
      return { success: false, message: err?.message ?? '登录失败' };
    } finally {
      isLoading.value = false;
    }
  }

  function logout() {
    setStoredToken(null);
    token.value = null;
    user.value = null;
  }

  async function fetchUserInfo() {
    if (!token.value) return false;
    try {
      const resp = await api.auth.me();
      user.value = resp.data;
      return true;
    } catch {
      logout();
      return false;
    }
  }

  function initAuth() {
    if (token.value) {
      user.value = { username: 'admin' };
    }
  }

  return { user, token, isLoading, login, logout, fetchUserInfo, initAuth };
});

export function useLocalTokenStore() {
  return {
    setUserToken: (t) => setStoredToken(t),
    clearUserToken: () => setStoredToken(null),
    initTokenManager: () => {},
    clearAllGameTokens: () => {},
  };
}