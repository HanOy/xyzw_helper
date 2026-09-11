import { runDailyTasks, type DailyTaskSettings } from './DailyTaskRunner.js';
import { createRun, taskLog, taskProgress, updateRun, isCancelled, enqueueBatchToken } from './runState.js';
import { connectionPool } from '../game/poolSingleton.js';
import { tokenService } from '../token/TokenService.js';
import { getSetting, listSettings, deleteSetting } from '../settings/settingsService.js';
import { logger } from '../logger.js';

const log = logger.child({ mod: 'task-runner' });

let seeded = false;

/** 清理以 tokenId/roleId 形式存在、但后缀不在当前 tokens.name 集合里的孤儿 settings */
function cleanupOrphanSettings(): void {
  try {
    const validNames = new Set(
      tokenService.list().map((t) => t.name).filter((n): n is string => !!n),
    );
    const removed: string[] = [];
    for (const row of listSettings('daily-settings:')) {
      const suffix = row.key.replace(/^daily-settings:/, '');
      if (!validNames.has(suffix)) {
        deleteSetting(row.key);
        removed.push(row.key);
      }
    }
    for (const row of listSettings('dream-items:')) {
      const suffix = row.key.replace(/^dream-items:/, '');
      if (!validNames.has(suffix)) {
        deleteSetting(row.key);
        removed.push(row.key);
      }
    }
    if (removed.length > 0) {
      log.info({ count: removed.length, sample: removed.slice(0, 5) }, '已清理孤儿 settings (tokenId/roleId 维度残留)');
    }
  } catch (err) {
    log.warn({ err: (err as Error).message }, '清理孤儿 settings 失败');
  }
}

export function seedTasksIfNeeded(): void {
  if (seeded) return;
  seeded = true;
  log.info('task runner seeded');
  cleanupOrphanSettings();
}

/**
 * 用 token 的 nickname (tokens.name) 作 key 加载设置 (与 tokenId/roleId 解绑, 重扫码自动续接)
 */
function loadTokenSettings(tokenId: string): DailyTaskSettings | undefined {
  const token = tokenService.get(tokenId);
  if (!token?.name) return undefined;
  const raw = getSetting(`daily-settings:${token.name}`);
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

export function runBatchDailyTasks(
  opts: BatchDailyRequest,
  onComplete?: (status: 'success' | 'partial' | 'failed', error?: string) => void,
): string {
  const batchId = createRun({
    type: 'batch-daily',
    settings: { tokenCount: opts.tokenIds.length, ...(opts.settings ?? {}) },
  });
  updateRun(batchId, {
    status: 'running',
    startedAt: new Date().toISOString(),
    total: opts.tokenIds.length,
  });

  void (async () => {
    try {
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
        await connectionPool.ensureConnection(meta);
        const tokenSettings =
          opts.settings && Object.keys(opts.settings).length
            ? (opts.settings as unknown as DailyTaskSettings)
            : loadTokenSettings(tokenId);
        const subRunId = await runDailyTasks(tokenId, tokenSettings);
        taskLog({ runId: batchId, tokenId, level: 'info', message: `${tokenName} 日常任务完成 (${subRunId})` });
      } catch (err) {
        taskLog({ runId: batchId, tokenId, level: 'error', message: `${tokenName} 失败: ${(err as Error).message}` });
      }
    });
    taskProgress(batchId, i + 1, opts.tokenIds.length, tokenName);
      }

      updateRun(batchId, { status: 'success', finishedAt: new Date().toISOString() });
      taskLog({ runId: batchId, level: 'info', message: '批日常任务完成' });
      onComplete?.('success');
    } catch (err) {
      const message = (err as Error).message;
      updateRun(batchId, { status: 'failed', finishedAt: new Date().toISOString(), error: message });
      taskLog({ runId: batchId, level: 'error', message: `批日常任务异常终止: ${message}` });
      onComplete?.('failed', message);
    }
  })();
  return batchId;
}

export async function cancelRun(runId: string): Promise<boolean> {
  updateRun(runId, { cancelledAt: new Date().toISOString() });
  return true;
}