<template>
  <div class="batch-daily-tasks">
    <n-card title="批量日常任务" :bordered="false">
      <n-space vertical>
        <n-alert type="info">
          选择多个 Token, 服务端会按顺序为每个 Token 执行日常任务.
          实时日志通过 SSE 推送.
        </n-alert>

        <n-space>
          <n-button @click="refresh">刷新 Token 列表</n-button>
          <n-button type="primary" :disabled="!selectedIds.length || running" @click="runBatch">
            启动批量执行 ({{ selectedIds.length }})
          </n-button>
          <n-button v-if="running" type="error" @click="stop">停止</n-button>
        </n-space>

        <n-data-table
          :columns="columns"
          :data="tokens"
          :row-key="(r) => r.id"
          :checked-row-keys="selectedIds"
          @update:checked-row-keys="(keys) => (selectedIds = keys)"
        />

        <n-divider>实时日志</n-divider>
        <div class="logs">
          <div v-for="(log, i) in logs" :key="i" :class="['log', `log-${log.level}`]">
            <span class="ts">{{ formatTime(log.ts) }}</span>
            <span class="msg">{{ log.message }}</span>
          </div>
          <div v-if="!logs.length" class="empty">尚无日志</div>
        </div>
      </n-space>
    </n-card>
  </div>
</template>

<script setup>
import { h, onMounted, ref, computed } from 'vue';
import { NButton, NSpace, NCard, NAlert, NDataTable, NDivider, NTag, useMessage } from 'naive-ui';
import { api } from '@/api';
import { useSseStream } from '@/composables/useSseStream';
import { useTokensStore } from '@/stores/tokens';

const message = useMessage();
const tokensStore = useTokensStore();
const tokens = computed(() => tokensStore.tokens);
const selectedIds = ref([]);
const running = ref(false);
const batchId = ref('');
const logs = ref([]);

const columns = [
  {
    type: 'selection',
  },
  { title: '名称', key: 'name' },
  {
    title: '状态',
    key: 'status',
    render(row) {
      return h(NTag, { type: row.status === 'connected' ? 'success' : 'default' }, () => row.status ?? 'disconnected');
    },
  },
  { title: '服务器', key: 'server' },
  { title: '导入方式', key: 'importMethod' },
];

async function refresh() {
  await tokensStore.refresh();
}

useSseStream({
  onEvent: (evt) => {
    if (evt.type !== 'task.log') return;
    if (batchId.value && evt.runId !== batchId.value) return;
    logs.value.push({ level: evt.level, message: evt.message, ts: evt.ts });
    if (logs.value.length > 500) logs.value.splice(0, 100);
    if (evt.message?.includes('批日常任务完成')) running.value = false;
  },
});

async function runBatch() {
  if (!selectedIds.value.length) return;
  running.value = true;
  logs.value = [];
  try {
    const resp = await api.batch.daily(selectedIds.value);
    batchId.value = resp.data.batchId;
    message.success(`批任务已启动: ${batchId.value}`);
  } catch (err) {
    running.value = false;
    message.error(err.message ?? '启动失败');
  }
}

async function stop() {
  if (!batchId.value) return;
  try {
    await api.batch.stop(batchId.value);
    message.info('已请求停止');
  } catch (err) {
    message.error(err.message);
  }
}

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

onMounted(refresh);
</script>

<style scoped>
.batch-daily-tasks { padding: 24px; }
.logs { max-height: 480px; overflow: auto; background: #1e1e1e; color: #e0e0e0; padding: 12px; border-radius: 6px; font-family: monospace; }
.log { padding: 2px 0; }
.log-error { color: #ff6b6b; }
.log-warn { color: #ffd93d; }
.log-info { color: #e0e0e0; }
.ts { color: #888; margin-right: 8px; }
.empty { color: #888; text-align: center; padding: 16px; }
</style>