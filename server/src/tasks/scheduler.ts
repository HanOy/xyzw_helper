import { runBatchDailyTasks } from './taskRunner.js';
import { runBatchOperations } from './batch/executor.js';
import { getSetting } from '../settings/settingsService.js';
import { tokenService } from '../token/TokenService.js';
import {
  listScheduledTasks,
  markTaskRun,
  shouldRunNow,
  type ScheduledTask,
} from './scheduledTasks.js';
import { logger } from '../logger.js';

function loadBatchSettings(): Record<string, unknown> | undefined {
  const raw = getSetting('batchSettings');
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

const log = logger.child({ mod: 'scheduler' });

const CHECK_INTERVAL_MS = 60_000;

let timer: NodeJS.Timeout | null = null;

function executeTask(task: ScheduledTask): void {
  // 定时任务不绑定固定 Token, 触发时对所有当前 Token 执行
  const tokenIds = tokenService.list().map((t) => t.id);
  if (!tokenIds.length) {
    log.warn({ taskId: task.id }, '当前没有Token, 定时任务跳过');
    markTaskRun(task.id, 'skipped', 'no tokens');
    return;
  }
  log.info(
    { taskId: task.id, name: task.name, tokens: tokenIds.length },
    '触发定时任务(全部Token)',
  );
  markTaskRun(task.id, 'running');
  const onDone = (status: 'success' | 'failed', error?: string) => {
    if (status === 'success') {
      markTaskRun(task.id, 'success');
      log.info({ taskId: task.id }, '定时任务执行完成');
    } else {
      markTaskRun(task.id, 'failed', error);
      log.error({ taskId: task.id, err: error }, '定时任务执行失败');
    }
  };
  if (task.selectedTasks?.length) {
    runBatchOperations(
      {
        tokenIds,
        selectedTasks: task.selectedTasks,
        settings: loadBatchSettings(),
      },
      onDone,
    );
  } else {
    runBatchDailyTasks({ tokenIds }, onDone);
  }
}

function tick(): void {
  const now = new Date();
  let tasks: ScheduledTask[];
  try {
    tasks = listScheduledTasks().filter((t) => shouldRunNow(t, now));
  } catch (err) {
    log.error({ err: (err as Error).message }, '读取定时任务失败');
    return;
  }
  for (const task of tasks) {
    executeTask(task);
  }
}

export function startScheduler(): void {
  if (timer) return;
  timer = setInterval(tick, CHECK_INTERVAL_MS);
  log.info('定时任务调度器已启动');
}

export function stopScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  log.info('定时任务调度器已停止');
}

export function runScheduledTaskNow(id: string): string {
  const task = listScheduledTasks().find((t) => t.id === id);
  if (!task) throw new Error('定时任务不存在');
  if (!task.tokenIds.length) throw new Error('定时任务没有选中任何 token');
  markTaskRun(task.id, 'running');
  const onDone = (status: 'success' | 'failed', error?: string) => {
    if (status === 'success') markTaskRun(task.id, 'success');
    else markTaskRun(task.id, 'failed', error);
  };
  const batchId = task.selectedTasks?.length
    ? runBatchOperations(
        {
          tokenIds: task.tokenIds,
          selectedTasks: task.selectedTasks,
          settings: loadBatchSettings(),
        },
        onDone,
      )
    : runBatchDailyTasks({ tokenIds: task.tokenIds }, onDone);
  // 同步返回 batchId, 不 await 整个长任务, 避免 HTTP 请求长时间挂起导致前端误判"执行失败"
  return batchId;
}
