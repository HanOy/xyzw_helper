import { BatchContext } from './context.js';
import {
  FISH_TARGET,
  ARENA_TARGET,
  pickArenaTargetId,
  isTodayAvailable,
  calculateMonthProgress,
} from './helpers.js';

/**
 * 竞技场、补齐类任务（单账号版）
 */
export function createTasksArena(ctx: BatchContext) {
  const batcharenafight = async (): Promise<void> => {
    if (ctx.shouldStop) return;
    try {
      ctx.log('info', `=== 开始一键竞技场战斗: ${ctx.tokenId} ===`);
      if (ctx.shouldStop) return;

      let role = await ctx.getRoleInfo(true);
      role = (role as any)?.role || (role as any)?.data?.role;
      const ticketCount = (role as any)?.items?.[1007]?.quantity || 0;
      ctx.log('info', `${ctx.tokenId} 当前咸神门票: ${ticketCount}`);

      if (ticketCount <= 0) {
        ctx.log('warn', `${ctx.tokenId} 咸神门票不足，无法进行竞技场战斗`);
        return;
      }

      const teamInfo = await ctx.send("presetteam_getinfo", {}, 5000);
      if (!teamInfo || !(teamInfo as any).presetTeamInfo) {
        ctx.log('warn', `阵容信息异常: ${JSON.stringify(teamInfo)}`);
      }

      const settings: any = await ctx.loadSettings();
      const currentFormation = (teamInfo as any)?.presetTeamInfo?.useTeamId;
      let Isswitching = false;
      if (currentFormation === settings.arenaFormation) {
        ctx.log('info', `当前已是阵容${settings.arenaFormation}，无需切换`);
      } else {
        await ctx.send("presetteam_saveteam", { teamId: settings.arenaFormation }, 5000);
        Isswitching = true;
        ctx.log('info', `成功切换到阵容${settings.arenaFormation}`);
      }

      const fights = Math.min(3, ticketCount);
      if (fights < 3) {
        ctx.log('warn', `${ctx.tokenId} 咸神门票仅剩 ${ticketCount} 张，将执行 ${fights} 次战斗`);
      }

      let battleVersion = 240475;
      try {
        const levelRes = (await ctx.send("fight_startlevel", {}, 8000)) as {
          battleData?: { version?: number };
        } | null;
        if (levelRes?.battleData?.version) battleVersion = levelRes.battleData.version;
      } catch {}

      for (let i = 0; i < fights; i++) {
        if (ctx.shouldStop) break;
        await ctx.send("arena_startarea", {}, 8000);
        let targets;
        try {
          targets = await ctx.send("arena_getareatarget", {}, 8000);
        } catch (err) {
          ctx.log('error', `获取竞技场目标失败：${(err as Error).message}`);
          break;
        }
        const targetId = pickArenaTargetId(targets);
        if (!targetId) {
          ctx.log('error', `${ctx.tokenId} 未找到可用的竞技场目标`);
          break;
        }
        try {
          await ctx.send("fight_startareaarena", { targetId, battleVersion }, 15000);
          ctx.log('info', `${ctx.tokenId} 竞技场战斗 ${i + 1}/3`);
          await ctx.sleep((ctx.delayConfig as any).battle);
        } catch (e) {
          ctx.log('error', `${ctx.tokenId} 竞技场对决失败: ${(e as Error).message || "未知错误"}`);
        }
      }
      await ctx.sleep((ctx.delayConfig as any).battle);
      if (Isswitching) {
        await ctx.send("presetteam_saveteam", { teamId: currentFormation }, 5000);
      }
      ctx.log('success', `=== ${ctx.tokenId} 竞技场战斗已完成 ===`);
    } catch (error) {
      ctx.log('error', `一键竞技场战斗失败: ${(error as Error).message || "未知错误"}`);
      throw error;
    }
  };

  const batchTopUpFish = async (): Promise<void> => {
    if (ctx.shouldStop) return;
    try {
      ctx.log('info', `=== 开始钓鱼补齐: ${ctx.tokenId} ===`);

      const result = await ctx.send("activity_get", {}, 10000);
      const act = (result as any)?.activity || (result as any)?.body?.activity || result;

      if (!act) {
        ctx.log('error', `${ctx.tokenId} 获取月度任务进度失败`);
        return;
      }
      const myMonthInfo = (act as any).myMonthInfo || {};
      const fishNum = Number((myMonthInfo as any)?.["2"]?.num || 0);

      const monthProgress = calculateMonthProgress();
      const now = new Date();
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const dayOfMonth = now.getDate();
      const remainingDays = Math.max(0, daysInMonth - dayOfMonth);
      const shouldBe = remainingDays === 0 ? FISH_TARGET : Math.min(FISH_TARGET, Math.ceil(monthProgress * FISH_TARGET));
      const need = Math.max(0, shouldBe - fishNum);
      ctx.log('info', `${ctx.tokenId} 当前进度: ${fishNum}/${FISH_TARGET}，需要补齐: ${need}次`);

      if (need <= 0) {
        ctx.log('success', `当前进度已达标，无需补齐`);
        return;
      }

      ctx.log('info', `${ctx.tokenId} 开始执行钓鱼补齐...`);

      let role = await ctx.getRoleInfo(true);
      role = (role as any)?.role || (role as any)?.data?.role;
      let freeUsed = 0;
      const lastFreeTime = Number((role as any)?.statisticsTime?.["artifact:normal:lottery:time"] || 0);
      if (isTodayAvailable(lastFreeTime)) {
        ctx.log('info', `${ctx.tokenId} 检测到今日免费钓鱼次数，开始消耗 3 次`);
        for (let i = 0; i < 3 && need > freeUsed && !ctx.shouldStop; i++) {
          try {
            await ctx.send("artifact_lottery", { lotteryNumber: 1, newFree: true, type: 1 }, 8000);
            freeUsed++;
            await ctx.sleep((ctx.delayConfig as any).action);
          } catch (e) {
            ctx.log('error', `${ctx.tokenId} 免费钓鱼失败: ${(e as Error).message}`);
            break;
          }
        }
      }

      const updatedResult = await ctx.send("activity_get", {}, 10000);
      const updatedAct = (updatedResult as any)?.activity || (updatedResult as any)?.body?.activity || updatedResult;
      const updatedMyMonthInfo = (updatedAct as any).myMonthInfo || {};
      const updatedFishNum = Number((updatedMyMonthInfo as any)?.["2"]?.num || 0);
      let remaining = Math.max(0, shouldBe - updatedFishNum);
      ctx.log('info', `${ctx.tokenId} 免费次数后进度: ${updatedFishNum}/${FISH_TARGET}，还需补齐: ${remaining}次`);

      if (remaining <= 0) {
        ctx.log('success', `已通过免费次数完成目标`);
        return;
      }

      const rodCount = (role as any)?.items?.[1011]?.quantity || 0;
      ctx.log('info', `${ctx.tokenId} 当前普通鱼竿: ${rodCount}`);
      if (rodCount < remaining) {
        ctx.log('warn', `${ctx.tokenId} 普通鱼竿不足 (${rodCount} < ${remaining})，将仅使用现有鱼竿`);
        remaining = rodCount;
      }

      while (remaining > 0 && !ctx.shouldStop) {
        const batch = Math.min(10, remaining);
        try {
          await ctx.send("artifact_lottery", { lotteryNumber: batch, newFree: true, type: 1 }, 12000);
          ctx.log('info', `${ctx.tokenId} 完成 ${batch} 次付费钓鱼`);
          remaining -= batch;

          if (remaining > 0 && batch >= 10 && remaining % 50 === 0) {
            try {
              const roleRes = await ctx.send("role_getroleinfo", {}, 5000);
              const currentRole = (roleRes as any)?.role || (roleRes as any)?.data?.role;
              if (currentRole) {
                const currentRodCount = currentRole.items?.[1011]?.quantity || 0;
                if (currentRodCount < remaining) {
                  ctx.log('warn', `${ctx.tokenId} 同步后发现鱼竿不足 (${currentRodCount} < ${remaining})，调整目标`);
                  remaining = currentRodCount;
                }
              }
            } catch (e) {}
          }
          await ctx.sleep((ctx.delayConfig as any).battle);
        } catch (e) {
          ctx.log('error', `${ctx.tokenId} 付费钓鱼失败: ${(e as Error).message}`);
          break;
        }
      }

      const finalResult = await ctx.send("activity_get", {}, 10000);
      const finalAct = (finalResult as any)?.activity || (finalResult as any)?.body?.activity || finalResult;
      const finalMyMonthInfo = (finalAct as any).myMonthInfo || {};
      const finalFishNum = Number((finalMyMonthInfo as any)?.["2"]?.num || 0);
      if (finalFishNum >= shouldBe || finalFishNum >= FISH_TARGET) {
        ctx.log('success', `${ctx.tokenId} 钓鱼补齐完成，最终进度: ${finalFishNum}/${FISH_TARGET}`);
      } else {
        ctx.log('warn', `${ctx.tokenId} 钓鱼补齐已停止，未达到目标，最终进度: ${finalFishNum}/${FISH_TARGET}`);
      }

      try {
        const roleRes = await ctx.send("role_getroleinfo", {}, 5000);
        const currentRole = (roleRes as any)?.role || (roleRes as any)?.data?.role;
        if (currentRole) {
          const points = currentRole.statistics?.["artifact:point"] || 0;
          const exchangeCount = Math.floor(points / 20);
          if (exchangeCount > 0) {
            ctx.log('info', `${ctx.tokenId} 检测到鱼竿累计使用 ${points}，开始领取 ${exchangeCount} 次累计奖励`);
            for (let k = 0; k < exchangeCount && !ctx.shouldStop; k++) {
              try {
                await ctx.send("artifact_exchange", {}, 3000);
                await ctx.sleep(500);
              } catch (err) {
                ctx.log('warn', `${ctx.tokenId} 领取累计奖励失败 (第${k + 1}次): ${(err as Error).message}`);
                break;
              }
            }
            ctx.log('success', `${ctx.tokenId} 累计奖励领取结束`);
          }
        }
      } catch (e) {
        ctx.log('warn', `${ctx.tokenId} 检查累计奖励失败: ${(e as Error).message}`);
      }
    } catch (error) {
      ctx.log('error', `钓鱼补齐失败: ${(error as Error).message || "未知错误"}`);
      throw error;
    }
  };

  const batchTopUpArena = async (): Promise<void> => {
    if (ctx.shouldStop) return;
    try {
      ctx.log('info', `=== 开始竞技场补齐: ${ctx.tokenId} ===`);

      const settings: any = await ctx.loadSettings();

      const teamInfo = await ctx.send("presetteam_getinfo", {}, 5000);
      if (!teamInfo || !(teamInfo as any).presetTeamInfo) {
        ctx.log('warn', `阵容信息异常: ${JSON.stringify(teamInfo)}`);
      }
      const currentFormation = (teamInfo as any)?.presetTeamInfo?.useTeamId;
      let Isswitching = false;
      if (currentFormation === settings.arenaFormation) {
        ctx.log('info', `当前已是阵容${settings.arenaFormation}，无需切换`);
      } else {
        await ctx.send("presetteam_saveteam", { teamId: settings.arenaFormation }, 5000);
        Isswitching = true;
        ctx.log('info', `成功切换到阵容${settings.arenaFormation}`);
      }

      ctx.log('info', `${ctx.tokenId} 获取月度任务进度...`);
      const result = await ctx.send("activity_get", {}, 10000);
      const act = (result as any)?.activity || (result as any)?.body?.activity || result;

      if (!act) {
        ctx.log('error', `${ctx.tokenId} 获取月度任务进度失败`);
        return;
      }
      const myArenaInfo = (act as any).myArenaInfo || {};
      const arenaNum = Number((myArenaInfo as any)?.num || 0);

      const monthProgress = calculateMonthProgress();
      const now = new Date();
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const dayOfMonth = now.getDate();
      const remainingDays = Math.max(0, daysInMonth - dayOfMonth);
      const shouldBe = remainingDays === 0 ? ARENA_TARGET : Math.min(ARENA_TARGET, Math.ceil(monthProgress * ARENA_TARGET));
      const need = Math.max(0, shouldBe - arenaNum);
      ctx.log('info', `${ctx.tokenId} 当前进度: ${arenaNum}/${ARENA_TARGET}，需要补齐: ${need}次`);

      if (need <= 0) {
        ctx.log('success', `${ctx.tokenId} 当前进度已达标，无需补齐`);
        return;
      }

      let role = await ctx.getRoleInfo(true);
      role = (role as any)?.role || (role as any)?.data?.role;
      const ticketCount = (role as any)?.items?.[1007]?.quantity || 0;
      ctx.log('info', `${ctx.tokenId} 当前咸神门票: ${ticketCount}`);

      if (ticketCount < need) {
        ctx.log('warn', `${ctx.tokenId} 咸神门票不足 (${ticketCount} < ${need})，将仅使用现有门票`);
      }

      let ticketsLeft = ticketCount;
      let remaining = Math.min(need, ticketsLeft);

      if (remaining <= 0) {
        ctx.log('warn', `${ctx.tokenId} 没有可用的咸神门票`);
        return;
      }

      try {
        await ctx.send("arena_startarea", {}, 8000);
      } catch (error) {
        ctx.log('warn', `${ctx.tokenId} 开始竞技场失败: ${(error as Error).message}`);
      }

      let battleVersion = 240475;
      try {
        const levelRes = (await ctx.send("fight_startlevel", {}, 8000)) as {
          battleData?: { version?: number };
        } | null;
        if (levelRes?.battleData?.version) battleVersion = levelRes.battleData.version;
      } catch {}

      let safetyCounter = 0;
      const safetyMaxFights = 100;
      let round = 1;
      while (remaining > 0 && ticketsLeft > 0 && safetyCounter < safetyMaxFights && !ctx.shouldStop) {
        const planFights = Math.min(Math.ceil(remaining / 2), ticketsLeft);
        ctx.log('info', `${ctx.tokenId} 第${round}轮：计划战斗 ${planFights} 场 (剩余门票: ${ticketsLeft})`);

        let actualFights = 0;
        for (let i = 0; i < planFights && safetyCounter < safetyMaxFights && !ctx.shouldStop; i++) {
          let targets;
          try {
            targets = await ctx.send("arena_getareatarget", {}, 8000);
          } catch (err) {
            ctx.log('error', `${ctx.tokenId} 获取竞技场目标失败：${(err as Error).message}`);
            break;
          }
          const targetId = pickArenaTargetId(targets);
          if (!targetId) {
            ctx.log('warn', `${ctx.tokenId} 未找到可用的竞技场目标`);
            break;
          }
          try {
            await ctx.send("fight_startareaarena", { targetId, battleVersion }, 15000);
            actualFights++;
            ticketsLeft--;
            ctx.log('info', `${ctx.tokenId} 竞技场战斗 ${i + 1}/${planFights} 完成`);
          } catch (e) {
            ctx.log('error', `${ctx.tokenId} 竞技场对决失败：${(e as Error).message}`);
          }
          safetyCounter++;
          await ctx.sleep((ctx.delayConfig as any).refresh);
        }

        const updatedResult = await ctx.send("activity_get", {}, 10000);
        const updatedAct = (updatedResult as any)?.activity || (updatedResult as any)?.body?.activity || updatedResult;
        const updatedMyArenaInfo = (updatedAct as any).myArenaInfo || {};
        const updatedArenaNum = Number((updatedMyArenaInfo as any)?.num || 0);

        const neededForTarget = Math.max(0, shouldBe - updatedArenaNum);

        try {
          const roleRes = await ctx.send("role_getroleinfo", {}, 5000);
          const currentRole = (roleRes as any)?.role || (roleRes as any)?.data?.role;
          if (currentRole) {
            const newTickets = currentRole.items?.[1007]?.quantity || 0;
            if (newTickets !== ticketsLeft) {
              ctx.log('info', `${ctx.tokenId} 同步最新门票数量: ${newTickets} (原记录: ${ticketsLeft})`);
              ticketsLeft = newTickets;
            }
          }
        } catch (e) {}

        remaining = Math.min(neededForTarget, ticketsLeft);
        ctx.log('info', `${ctx.tokenId} 第${round}轮后进度: ${updatedArenaNum}/${ARENA_TARGET}，还需补齐: ${remaining}次`);
        round++;
      }

      const finalResult = await ctx.send("activity_get", {}, 10000);
      const finalAct = (finalResult as any)?.activity || (finalResult as any)?.body?.activity || finalResult;
      const finalMyArenaInfo = (finalAct as any).myArenaInfo || {};
      const finalArenaNum = Number((finalMyArenaInfo as any)?.num || 0);
      if (finalArenaNum >= shouldBe || finalArenaNum >= ARENA_TARGET) {
        ctx.log('success', `${ctx.tokenId} 竞技场补齐完成，最终进度: ${finalArenaNum}/${ARENA_TARGET}`);
      } else if (safetyCounter >= safetyMaxFights) {
        ctx.log('warn', `达到安全上限，竞技场补齐已停止，最终进度: ${finalArenaNum}/${ARENA_TARGET}`);
      } else {
        ctx.log('warn', `${ctx.tokenId} 竞技场补齐已停止，未达到目标，最终进度: ${finalArenaNum}/${ARENA_TARGET}`);
      }
      if (Isswitching) {
        await ctx.send("presetteam_saveteam", { teamId: currentFormation }, 5000);
      }
    } catch (error) {
      ctx.log('error', `竞技场补齐失败: ${(error as Error).message || "未知错误"}`);
      throw error;
    }
  };

  return {
    batcharenafight,
    batchTopUpFish,
    batchTopUpArena,
  };
}
