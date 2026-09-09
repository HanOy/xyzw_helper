import { runDailyTasks, type DailyTaskSettings } from './DailyTaskRunner.js';
import { createRun, taskLog, taskProgress, updateRun, isCancelled, enqueueBatchToken } from './runState.js';
import { connectionPool } from '../game/poolSingleton.js';
import { tokenService } from '../token/TokenService.js';
import { getSetting } from '../settings/settingsService.js';
import { db } from '../db/index.js';
import { logger } from '../logger.js';

const log = logger.child({ mod: 'task-runner' });

let seeded = false;

export function seedTasksIfNeeded(): void {
  if (seeded) return;
  seeded = true;
  log.info('task runner seeded');
}

/**
 * 从 role_cache 读出 token 对应游戏账号的 roleId (业务 ID, 跨 token 重导稳定)
 */
function readRoleIdFromCache(tokenId: string): string | null {
  try {
    const row = db
      .prepare("SELECT data FROM role_cache WHERE token_id = ? AND section = 'role'")
      .get(tokenId) as { data: string } | undefined;
    if (!row) return null;
    const obj = JSON.parse(row.data) as { role?: { roleId?: number | string } };
    const id = obj?.role?.roleId;
    return id != null ? String(id) : null;
  } catch {
    return null;
  }
}

function loadTokenSettings(tokenId: string): DailyTaskSettings | undefined {
  const roleId = readRoleIdFromCache(tokenId);
  if (roleId == null) return undefined; // 还没拉过角色信息, 后续流程会先 role_getroleinfo
  const raw = getSetting(`daily-settings:${roleId}`);
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
  onComplete?: (status: 'success' | 'failed', error?: string) => void,
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