import { BatchContext } from './context.js';

/**
 * 挂机、答题、签到类任务（单账号版）
 */
export function createTasksHangUp(ctx: BatchContext) {
  const claimHangUpRewards = async (): Promise<void> => {
    if (ctx.shouldStop) return;
    try {
      ctx.log('info', `=== 开始领取挂机: ${ctx.tokenId} ===`);
      ctx.log('info', `${ctx.tokenId} 领取挂机奖励`);
      await ctx.send("system_claimhangupreward", {}, 5000);
      await ctx.sleep(500);

      for (let i = 0; i < 4; i++) {
        if (ctx.shouldStop) break;
        ctx.log('info', `${ctx.tokenId} 挂机加钟 ${i + 1}/4`);
        await ctx.send("system_mysharecallback", { isSkipShareCard: true, type: 2 }, 5000);
        await ctx.sleep(500);
      }
      ctx.log('success', `=== ${ctx.tokenId} 领取挂机奖励完成 ===`);
    } catch (error) {
      ctx.log('error', `领取挂机奖励失败: ${(error as Error).message || "未知错误"}`);
      throw error;
    }
  };

  const batchAddHangUpTime = async (): Promise<void> => {
    if (ctx.shouldStop) return;
    try {
      ctx.log('info', `=== 开始一键加钟: ${ctx.tokenId} ===`);
      for (let i = 0; i < 4; i++) {
        if (ctx.shouldStop) break;
        ctx.log('info', `${ctx.tokenId} 执行加钟 ${i + 1}/4`);
        await ctx.send("system_mysharecallback", { isSkipShareCard: true, type: 2 }, 5000);
        await ctx.sleep(500);
      }
      ctx.log('success', `=== ${ctx.tokenId} 加钟完成 ===`);
    } catch (error) {
      ctx.log('error', `加钟失败: ${(error as Error).message || "未知错误"}`);
      throw error;
    }
  };

  // 后端无答题题库/事件推送，preload 设为空操作（保持结构一致）
  const preloadQuestions = async (): Promise<void> => {};

  const batchStudy = async (): Promise<void> => {
    if (ctx.shouldStop) return;
    try {
      ctx.log('info', `正在加载题库...`);
      await preloadQuestions();

      ctx.log('info', `=== 开始答题: ${ctx.tokenId} ===`);

      // 后端没有前端那样的 gameData.studyStatus 实时事件更新，这里用本地对象维持结构，
      // 等待逻辑与前端一致（最多 90 秒）。
      let studyStatus = {
        isAnswering: false,
        questionCount: 0,
        answeredCount: 0,
        status: "",
        timestamp: null as number | null,
      };

      await ctx.send("study_startgame", {}, 5000);

      let maxWait = 90;
      let completed = false;
      let lastStatus = "";

      while (maxWait > 0 && !ctx.shouldStop) {
        const status = studyStatus;
        if (status.status !== lastStatus) {
          lastStatus = status.status;
          if (status.status === "answering") {
            ctx.log('info', `${ctx.tokenId} 开始答题...`);
          } else if (status.status === "claiming_rewards") {
            ctx.log('info', `${ctx.tokenId} 领取奖励...`);
          }
        }
        if (status.status === "completed") {
          completed = true;
          break;
        }
        await ctx.sleep(1000);
        maxWait--;
      }

      if (completed) {
        ctx.log('success', `=== ${ctx.tokenId} 答题完成 ===`);
      } else {
        if (ctx.shouldStop) {
          ctx.log('warn', `${ctx.tokenId} 已停止`);
        } else {
          ctx.log('error', `${ctx.tokenId} 答题超时或未开始`);
        }
      }
    } catch (error) {
      ctx.log('error', `答题失败: ${(error as Error).message || "未知错误"}`);
      throw error;
    }
  };

  const batchclubsign = async (): Promise<void> => {
    if (ctx.shouldStop) return;
    try {
      ctx.log('info', `=== 开始一键俱乐部签到: ${ctx.tokenId} ===`);
      if (ctx.shouldStop) return;
      await ctx.send("legion_signin", {}, 5000);
      await ctx.sleep(500);
      ctx.log('success', `=== ${ctx.tokenId} 俱乐部签到已完成 ===`);
    } catch (error) {
      ctx.log('error', `俱乐部签到失败: ${(error as Error).message || "未知错误"}`);
      throw error;
    }
  };

  return {
    claimHangUpRewards,
    batchAddHangUpTime,
    batchStudy,
    batchclubsign,
  };
}
