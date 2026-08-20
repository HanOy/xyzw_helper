<template>
  <div class="daily-task-card">
    <n-card :title="title">
      <slot />
    </n-card>
  </div>
</template>

<script setup>
import { NCard } from 'naive-ui';
defineProps({ title: { type: String, default: '日常任务' } });
</script>