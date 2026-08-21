import { BatchContext } from './context.js';

/**
 * 罐子类任务（单账号版：执行器已负责 token 循环与连接，这里只处理当前 ctx.tokenId）
 */
export function createTasksBottle(ctx: BatchContext) {
  const resetBottles = async (): Promise<void> => {
    ctx.log('info', `=== 开始重置罐子 ===`);
    try {
      ctx.log('info', `停止计时...`);
      await ctx.send('bottlehelper_stop', {}, 5000);
      await ctx.sleep(500);
      ctx.log('info', `开始计时...`);
      await ctx.send('bottlehelper_start', {}, 5000);
      ctx.log('success', `重置完成`);
    } catch (e) {
      ctx.log('error', `重置失败: ${(e as Error).message}`);
      throw e;
    }
  };

  const batchlingguanzi = async (): Promise<void> => {
    ctx.log('info', `=== 开始一键领取盐罐 ===`);
    try {
      if (ctx.shouldStop) return;
      await ctx.send('bottlehelper_claim', {}, 5000);
      await ctx.sleep(500);
      ctx.log('success', `领取盐罐已完成`);
    } catch (e) {
      ctx.log('error', `领取盐罐失败: ${(e as Error).message || '未知错误'}`);
      throw e;
    }
  };

  return { resetBottles, batchlingguanzi };
}
