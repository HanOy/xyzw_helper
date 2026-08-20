<template>
  <div class="ws-tester">
    <n-card title="WebSocket 测试">
      <n-alert type="info">
        WebSocket 连接由服务端维护. 此页面已迁移至 /api/tokens/:id/command 命令通道.
      </n-alert>
    </n-card>
  </div>
</template>

<script setup>
import { NCard, NAlert } from 'naive-ui';
</script>

<style scoped>
.ws-tester { padding: 24px; }
</style>