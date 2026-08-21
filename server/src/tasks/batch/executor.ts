import { connectionPool } from '../../game/poolSingleton.js';
import { tokenService } from '../../token/TokenService.js';
import { createRun, taskLog, taskProgress, updateRun, isCancelled } from '../runState.js';
import { BatchContext } from './context.js';
import { dispatchSelectedTasks } from './registry.js';

export interface BatchOperationsRequest {
  tokenIds: string[];
  selectedTasks?: string[];
  settings?: Record<string, unknown>;
}

export async function runBatchOperations(opts: BatchOperationsRequest): Promise<string> {
  const batchId = createRun({
    type: 'batch-ops',
    settings: { tokenCount: opts.tokenIds.length, ...(opts.settings ?? {}) },
  });
  updateRun(batchId, {
    status: 'running',
    startedAt: new Date().toISOString(),
    total: opts.tokenIds.length,
  });

  for (let i = 0; i < opts.tokenIds.length; i++) {
    if (isCancelled(batchId)) {
      updateRun(batchId, { status: 'cancelled', finishedAt: new Date().toISOString() });
      taskLog({ runId: batchId, level: 'warn', message: '批量操作已取消' });
      return batchId;
    }
    const tokenId = opts.tokenIds[i];
    const token = tokenService.get(tokenId);
    const tokenName = token?.name ?? tokenId;
    taskLog({ runId: batchId, tokenId, level: 'info', message: `开始处理 ${tokenName}` });
    try {
      const meta = tokenService.toConnectionMeta(tokenId);
      if (!meta) throw new Error('token 不存在');
      connectionPool.beginTask(tokenId);
      try {
        await connectionPool.ensureConnection(meta);
        const ctx = new BatchContext({
          runId: batchId,
          tokenId,
          batchSettings: opts.settings,
          shouldStop: () => isCancelled(batchId),
        });
        await ctx.getRoleInfo();
        await dispatchSelectedTasks(ctx, opts.selectedTasks ?? []);
        taskLog({ runId: batchId, tokenId, level: 'success', message: `${tokenName} 批量任务完成` });
      } finally {
        connectionPool.endTask(tokenId);
      }
    } catch (err) {
      taskLog({
        runId: batchId,
        tokenId,
        level: 'error',
        message: `${tokenName} 失败: ${(err as Error).message}`,
      });
    }
    taskProgress(batchId, i + 1, opts.tokenIds.length, tokenName);
  }

  updateRun(batchId, { status: 'success', finishedAt: new Date().toISOString() });
  taskLog({ runId: batchId, level: 'info', message: '批量操作完成' });
  return batchId;
}
