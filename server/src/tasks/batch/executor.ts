import { connectionPool } from '../../game/poolSingleton.js';
import { tokenService } from '../../token/TokenService.js';
import { createRun, taskLog, taskProgress, updateRun, isCancelled, enqueueBatchToken } from '../runState.js';
import { BatchContext } from './context.js';
import { dispatchSelectedTasks } from './registry.js';
import { isTransientConnectionError, waitForReconnect, TOKEN_MAX_ATTEMPTS } from './helpers.js';

export interface BatchOperationsRequest {
  tokenIds: string[];
  selectedTasks?: string[];
  settings?: Record<string, unknown>;
}

export function runBatchOperations(
  opts: BatchOperationsRequest,
  onComplete?: (status: 'success' | 'partial' | 'failed', error?: string) => void,
): string {
  const batchId = createRun({
    type: 'batch-ops',
    settings: { tokenCount: opts.tokenIds.length, ...(opts.settings ?? {}) },
  });
  updateRun(batchId, {
    status: 'running',
    startedAt: new Date().toISOString(),
    total: opts.tokenIds.length,
  });

  void (async () => {
    let failedCount = 0;
    try {
      for (let i = 0; i < opts.tokenIds.length; i++) {
    if (isCancelled(batchId)) {
      updateRun(batchId, { status: 'cancelled', finishedAt: new Date().toISOString() });
      taskLog({ runId: batchId, level: 'warn', message: '批量操作已取消' });
      return batchId;
    }
    const tokenId = opts.tokenIds[i];
    const token = tokenService.get(tokenId);
    const tokenName = token?.name ?? tokenId;
    await enqueueBatchToken(tokenId, async () => {
      taskLog({ runId: batchId, tokenId, level: 'info', message: `开始处理 ${tokenName}` });
      let lastError: Error | null = null;
      for (let attempt = 1; attempt <= TOKEN_MAX_ATTEMPTS; attempt++) {
        try {
          const meta = tokenService.toConnectionMeta(tokenId);
          if (!meta) throw new Error('token 不存在');
          await connectionPool.ensureConnection(meta);
          const ctx = new BatchContext({
            runId: batchId,
            tokenId,
            batchSettings: opts.settings,
            shouldStop: () => isCancelled(batchId),
          });
          await ctx.getRoleInfo();
          await dispatchSelectedTasks(ctx, opts.selectedTasks ?? []);
          lastError = null;
          taskLog({ runId: batchId, tokenId, level: 'success', message: `${tokenName} 批量任务完成` });
          break;
        } catch (err) {
          lastError = err as Error;
          // 连接层瞬时错误 (僵尸连接/掉线) → 等自动重连恢复后重试, 不直接判失败
          if (attempt < TOKEN_MAX_ATTEMPTS && isTransientConnectionError(err)) {
            taskLog({
              runId: batchId,
              tokenId,
              level: 'warn',
              message: `${tokenName} 连接已断开 (${lastError.message})，等待重连后重试`,
            });
            await waitForReconnect(tokenId);
            continue;
          }
          break;
        }
      }
      if (lastError) {
        failedCount += 1;
        taskLog({
          runId: batchId,
          tokenId,
          level: 'error',
          message: `${tokenName} 失败: ${lastError.message}`,
        });
      }
    });
    taskProgress(batchId, i + 1, opts.tokenIds.length, tokenName);
      }

      const total = opts.tokenIds.length;
      const status = failedCount === 0 ? 'success' : failedCount >= total ? 'failed' : 'partial';
      updateRun(batchId, {
        status,
        finishedAt: new Date().toISOString(),
        error: failedCount > 0 ? `${failedCount}/${total} 个账号失败` : undefined,
      });
      if (failedCount > 0) {
        taskLog({
          runId: batchId,
          level: failedCount >= total ? 'error' : 'warn',
          message: `批量操作完成: 成功 ${total - failedCount}/${total}`,
        });
      } else {
        taskLog({ runId: batchId, level: 'info', message: '批量操作完成' });
      }
      onComplete?.(status, failedCount > 0 ? `${failedCount}/${total} 个账号失败` : undefined);
    } catch (err) {
      const message = (err as Error).message;
      updateRun(batchId, { status: 'failed', finishedAt: new Date().toISOString(), error: message });
      taskLog({ runId: batchId, level: 'error', message: `批量操作异常终止: ${message}` });
      onComplete?.('failed', message);
    }
  })();
  return batchId;
}
