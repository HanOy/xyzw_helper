import { runBatchDailyTasks } from './taskRunner.js';
import {
  listScheduledTasks,
  markTaskRun,
  shouldRunNow,
  type ScheduledTask,
} from './scheduledTasks.js';
import { logger } from '../logger.js';

const log = logger.child({ mod: 'scheduler' });

const CHECK_INTERVAL_MS = 60_000;

let timer: NodeJS.Timeout | null = null;

function executeTask(task: ScheduledTask): void {
  if (!task.tokenIds.length) {
    log.warn({ taskId: task.id }, '定时任务没有选中任何 token, 跳过');
    markTaskRun(task.id, 'skipped', 'no tokens');
    return;
  }
  log.info({ taskId: task.id, name: task.name, tokens: task.tokenIds.length }, '触发定时任务');
  markTaskRun(task.id, 'running');
  runBatchDailyTasks({ tokenIds: task.tokenIds })
    .then((batchId) => {
      markTaskRun(task.id, 'success');
      log.info({ taskId: task.id, batchId }, '定时任务执行完成');
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      markTaskRun(task.id, 'failed', message);
      log.error({ taskId: task.id, err: message }, '定时任务执行失败');
    });
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

export function runScheduledTaskNow(id: string): Promise<string> {
  const task = listScheduledTasks().find((t) => t.id === id);
  if (!task) return Promise.reject(new Error('定时任务不存在'));
  if (!task.tokenIds.length) return Promise.reject(new Error('定时任务没有选中任何 token'));
  markTaskRun(task.id, 'running');
  return runBatchDailyTasks({ tokenIds: task.tokenIds })
    .then((batchId) => {
      markTaskRun(task.id, 'success');
      return batchId;
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      markTaskRun(task.id, 'failed', message);
      throw err;
    });
}
