import { BatchContext } from './context.js';

/**
 * 盐杯竞猜任务（单账号版）
 */
export function createTasksFootball(ctx: BatchContext) {
  const batchFootballBet = async (pick = 3): Promise<void> => {
    if (ctx.shouldStop) return;
    try {
      ctx.log('info', `=== 开始盐杯竞猜: ${ctx.tokenId} ===`);

      const betInfoResp = await ctx.send("saltcup26_getbetinfo", {}, 8000);
      const matchList = (betInfoResp as any)?.matchList;
      const betRecord = (betInfoResp as any)?.roleData?.betRecord || {};

      const scheduleIds = Object.keys(betRecord);
      if (scheduleIds.length === 0) {
        ctx.log('warn', `${ctx.tokenId} 没有可竞猜的比赛`);
        return;
      }

      const lastScheduleId = scheduleIds[scheduleIds.length - 1];
      const scheduleBets = betRecord[lastScheduleId] || {};

      const unbetMatchIds = Object.keys(scheduleBets).filter(
        (matchId) => (scheduleBets as any)[matchId].pick === 0,
      );

      if (unbetMatchIds.length === 0) {
        ctx.log('success', `${ctx.tokenId} 所有比赛已下注，无需操作`);
        return;
      }

      ctx.log('info', `${ctx.tokenId} ${unbetMatchIds.length} 场待竞猜`);

      let successCount = 0;
      let failCount = 0;
      const pickLabel = ({ 1: "主胜", 2: "平局", 3: "客胜" } as Record<number, string>)[pick] || `选项${pick}`;

      for (const matchId of unbetMatchIds) {
        if (ctx.shouldStop) break;
        try {
          await ctx.send("saltcup26_placebet", { matchId, pick }, 8000);
          successCount++;
          ctx.log('success', `${ctx.tokenId} ${matchId} → ${pickLabel} ✓`);
        } catch (err) {
          failCount++;
          ctx.log('error', `${ctx.tokenId} ${matchId} 下注失败: ${(err as Error).message}`);
        }
        await ctx.sleep(500);
      }

      ctx.log('success', `=== ${ctx.tokenId} 竞猜完成: 成功${successCount} 失败${failCount} ===`);
    } catch (error) {
      ctx.log('error', `盐杯竞猜失败: ${(error as Error).message || "未知错误"}`);
      throw error;
    }
  };

  return {
    batchFootballBet,
  };
}
