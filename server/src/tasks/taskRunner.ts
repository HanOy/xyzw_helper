import { runDailyTasks, type DailyTaskSettings } from './DailyTaskRunner.js';
import { createRun, taskLog, taskProgress, updateRun, isCancelled, enqueueBatchToken } from './runState.js';
import { connectionPool } from '../game/poolSingleton.js';
import { tokenService } from '../token/TokenService.js';
import { getSetting } from '../settings/settingsService.js';
import { logger } from '../logger.js';

const log = logger.child({ mod: 'task-runner' });

let seeded = false;

export function seedTasksIfNeeded(): void {
  if (seeded) return;
  seeded = true;
  log.info('task runner seeded');
}

function loadTokenSettings(tokenId: string): DailyTaskSettings | undefined {
  const raw = getSetting(`daily-settings:${tokenId}`);
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as DailyTaskSettings;
  } catch {
    return undefined;
  }
}

export interface BatchDailyRequest {
  tokenIds: string[];
  settings?: Record<string, unknown>;
}

export async function runBatchDailyTasks(opts: BatchDailyRequest): Promise<string> {
  const batchId = createRun({
    type: 'batch-daily',
    settings: { tokenCount: opts.tokenIds.length, ...(opts.settings ?? {}) },
  });
  updateRun(batchId, {
    status: 'running',
    startedAt: new Date().toISOString(),
    total: opts.tokenIds.length,
  });

  for (let i = 0; i < opts.tokenIds.length; i++) {
    if (isCancelled(batchId)) {
      taskLog({ runId: batchId, level: 'warn', message: '批任务已取消' });
      updateRun(batchId, { status: 'cancelled', finishedAt: new Date().toISOString() });
      return batchId;
    }
    const tokenId = opts.tokenIds[i];
    const token = tokenService.get(tokenId);
    const tokenName = token?.name ?? tokenId;
    await enqueueBatchToken(tokenId, async () => {
      taskLog({ runId: batchId, tokenId, level: 'info', message: `开始处理 ${tokenName}` });
      try {
        const meta = tokenService.toConnectionMeta(tokenId);
        if (!meta) throw new Error('token 不存在');
        connectionPool.beginTask(tokenId);
        try {
          await connectionPool.ensureConnection(meta);
          const tokenSettings =
            opts.settings && Object.keys(opts.settings).length
              ? (opts.settings as unknown as DailyTaskSettings)
              : loadTokenSettings(tokenId);
          const subRunId = await runDailyTasks(tokenId, tokenSettings);
          taskLog({ runId: batchId, tokenId, level: 'info', message: `${tokenName} 日常任务完成 (${subRunId})` });
        } finally {
          connectionPool.endTask(tokenId);
        }
      } catch (err) {
        taskLog({ runId: batchId, tokenId, level: 'error', message: `${tokenName} 失败: ${(err as Error).message}` });
      }
    });
    taskProgress(batchId, i + 1, opts.tokenIds.length, tokenName);
  }

  updateRun(batchId, { status: 'success', finishedAt: new Date().toISOString() });
  taskLog({ runId: batchId, level: 'info', message: '批日常任务完成' });
  return batchId;
}

export async function cancelRun(runId: string): Promise<boolean> {
  updateRun(runId, { cancelledAt: new Date().toISOString() });
  return true;
}