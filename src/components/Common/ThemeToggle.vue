<template>
  <button class="theme-toggle" @click="toggle" :title="isDark ? '切换浅色' : '切换深色'">
    {{ isDark ? '☀' : '☾' }}
  </button>
</template>

<script setup>
import { ref, onMounted } from 'vue';

const isDark = ref(localStorage.getItem('theme') === 'dark');

function applyTheme(dark) {
  if (dark) document.documentElement.setAttribute('data-theme', 'dark');
  else document.documentElement.removeAttribute('data-theme');
  localStorage.setItem('theme', dark ? 'dark' : 'light');
  isDark.value = dark;
}

function toggle() {
  applyTheme(!isDark.value);
}

onMounted(() => applyTheme(isDark.value));
</script>

<style scoped>
.theme-toggle {
  background: transparent;
  border: 1px solid currentColor;
  border-radius: 50%;
  width: 36px;
  height: 36px;
  cursor: pointer;
  font-size: 18px;
  color: inherit;
}
</style>