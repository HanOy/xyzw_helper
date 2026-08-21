import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '@/api';

export const useSettingsStore = defineStore('settings', () => {
  const cache = ref<Record<string, string>>({});
  const hydrated = ref(false);

  async function hydrate(): Promise<void> {
    try {
      const res = await api.settings.list();
      const rows = ((res as any)?.data?.data ?? []) as { key: string; value: string }[];
      const map: Record<string, string> = {};
      for (const r of rows) map[r.key] = r.value;
      cache.value = map;
    } catch {
      cache.value = {};
    } finally {
      hydrated.value = true;
    }
  }

  async function load(key: string): Promise<string | null> {
    if (key in cache.value) return cache.value[key];
    try {
      const res = await api.settings.get(key);
      const value = ((res as any)?.data?.data?.value as string) ?? null;
      if (value !== null) cache.value[key] = value;
      return value;
    } catch {
      return null;
    }
  }

  function getItem(key: string): string | null {
    return key in cache.value ? cache.value[key] : null;
  }

  async function setItem(key: string, value: string): Promise<void> {
    cache.value[key] = value;
    try {
      await api.settings.set(key, value);
    } catch (e) {
      console.error('save setting failed', key, e);
    }
  }

  async function removeItem(key: string): Promise<void> {
    delete cache.value[key];
    try {
      await api.settings.remove(key);
    } catch (e) {
      console.error('remove setting failed', key, e);
    }
  }

  return { cache, hydrated, hydrate, load, getItem, setItem, removeItem };
});
