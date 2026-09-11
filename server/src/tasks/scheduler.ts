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

/**
 * 定时任务执行核心 (自动 + 手动触发共用)
 * - 实时取全部 Token, 不读取任务里可能过期的 tokenIds
 * - 「日常任务」(startBatch) = 完整日常; 可与其其它项叠加, 串行执行
 * - 返回首个 stage 的 batchId (前端手动执行需要)
 */
function runScheduledStages(task: ScheduledTask): string {
  const tokenIds = tokenService.list().map((t) => t.id);
  if (!tokenIds.length) {
    markTaskRun(task.id, 'skipped', 'no tokens');
    log.warn({ taskId: task.id }, '当前没有Token, 定时任务跳过');
    throw new Error('当前没有可用的Token');
  }
  log.info(
    { taskId: task.id, name: task.name, tokens: tokenIds.length },
    '触发定时任务(全部Token)',
  );
  markTaskRun(task.id, 'running');

  const selected = task.selectedTasks ?? [];
  const rest = selected.filter((v) => v !== 'startBatch');
  const fullDaily = selected.length === 0 || selected.includes('startBatch');

  type StageStatus = 'success' | 'partial' | 'failed';
  type Stage = (
    cb: (status: StageStatus, error?: string) => void,
  ) => string;
  const stages: Stage[] = [];
  if (fullDaily) {
    stages.push((cb) => runBatchDailyTasks({ tokenIds }, cb));
  }
  if (rest.length) {
    stages.push((cb) =>
      runBatchOperations(
        {
          tokenIds,
          selectedTasks: rest,
          settings: loadBatchSettings(),
        },
        cb,
      ),
    );
  }
  if (!stages.length) {
    markTaskRun(task.id, 'skipped', 'no tasks selected');
    throw new Error('定时任务没有可执行的内容');
  }

  let failures = 0;
  let partials = 0;
  let lastError: string | undefined;
  let index = 0;
  const next = (status: StageStatus, error?: string): void => {
    if (status === 'failed') {
      failures += 1;
      lastError = error ?? lastError;
    } else if (status === 'partial') {
      partials += 1;
      lastError = lastError ?? error;
    }
    index += 1;
    if (index < stages.length) {
      stages[index](next);
      return;
    }
    if (failures > 0) {
      markTaskRun(task.id, 'failed', lastError);
      log.error({ taskId: task.id, err: lastError }, '定时任务执行失败');
    } else if (partials > 0) {
      markTaskRun(task.id, 'partial', lastError);
      log.warn({ taskId: task.id, err: lastError }, '定时任务部分账号失败');
    } else {
      markTaskRun(task.id, 'success');
      log.info({ taskId: task.id }, '定时任务执行完成');
    }
  };

  // 同步返回首个 stage 的 batchId, 避免 HTTP 长挂起
  return stages[0](next);
}

function executeTask(task: ScheduledTask): void {
  try {
    runScheduledStages(task);
  } catch (err) {
    log.warn(
      { taskId: task.id, err: (err as Error).message },
      '定时任务触发失败',
    );
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
  return runScheduledStages(task);
}
