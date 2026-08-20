<template>
  <div class="message-tester">
    <n-card title="消息测试">
      <n-alert type="info">
        此工具已迁移到服务端. 在此直接调用 /api/tokens/:id/command 接口.
      </n-alert>
      <n-space vertical style="margin-top: 16px">
        <n-input v-model:value="tokenId" placeholder="Token ID" />
        <n-input v-model:value="cmd" placeholder="命令" />
        <n-input v-model:value="params" type="textarea" placeholder='{"key":"value"}' />
        <n-button type="primary" :loading="loading" @click="send">发送</n-button>
      </n-space>
      <pre v-if="result" class="result">{{ JSON.stringify(result, null, 2) }}</pre>
    </n-card>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { NCard, NAlert, NSpace, NInput, NButton, useMessage } from 'naive-ui';
import { api } from '@/api';

const message = useMessage();
const tokenId = ref('');
const cmd = ref('role_getroleinfo');
const params = ref('{}');
const result = ref(null);
const loading = ref(false);

async function send() {
  if (!tokenId.value) {
    message.warning('请输入 Token ID');
    return;
  }
  let parsed;
  try {
    parsed = params.value ? JSON.parse(params.value) : {};
  } catch {
    message.error('参数 JSON 解析失败');
    return;
  }
  loading.value = true;
  try {
    const resp = await api.tokens.command(tokenId.value, cmd.value, parsed);
    result.value = resp.data;
  } catch (err) {
    result.value = { error: err.message };
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.message-tester { padding: 24px; }
.result { background: #1e1e1e; color: #e0e0e0; padding: 16px; border-radius: 6px; overflow: auto; max-height: 480px; }
</style>