import { BatchContext } from './context.js';
import { PEACH_TASKS } from './peachTasks.js';

/**
 * 物品类任务（单账号版：执行器已负责 token 循环与连接，这里只处理当前 ctx.tokenId）
 * 导出方法名需与前端 availableTasks 的 value 完全一致。
 */
export function createTasksItem(ctx: BatchContext) {
  const boxNames: Record<number, string> = {
    2001: "木质宝箱",
    2002: "青铜宝箱",
    2003: "黄金宝箱",
    2004: "铂金宝箱",
  };

  const fishNames: Record<number, string> = { 1: "普通鱼竿", 2: "黄金鱼竿" };

  const batchOpenBox = async (isScheduledTask = false): Promise<void> => {
    if (ctx.shouldStop) return;
    try {
      const boxType = isScheduledTask
        ? (ctx.batchSettings as any).defaultBoxType
        : (ctx.helperSettings as any).boxType;
      const totalCount = isScheduledTask
        ? (ctx.batchSettings as any).boxCount
        : (ctx.helperSettings as any).count;
      const batches = Math.floor(totalCount / 10);
      const remainder = totalCount % 10;

      ctx.log('info', `=== 开始批量开箱: ${ctx.tokenId} ===`);
      ctx.log('info', `宝箱类型: ${boxNames[boxType]}, 数量: ${totalCount}`);

      for (let i = 0; i < batches && !ctx.shouldStop; i++) {
        await ctx.send("item_openbox", { itemId: boxType, number: 10 }, 5000);
        ctx.log('info', `开箱进度: ${(i + 1) * 10}/${totalCount}`);
        await ctx.sleep((ctx.delayConfig as any).action);
      }

      if (remainder > 0 && !ctx.shouldStop) {
        await ctx.send("item_openbox", { itemId: boxType, number: remainder }, 5000);
        ctx.log('info', `开箱进度: ${totalCount}/${totalCount}`);
      }
      await ctx.send("item_batchclaimboxpointreward", {}, 5000);
      await ctx.sleep((ctx.delayConfig as any).action);
      await ctx.sendNoAck("role_getroleinfo");
      ctx.log('success', `=== ${ctx.tokenId} 开箱完成 ===`);
    } catch (error) {
      ctx.log('error', `开箱失败: ${(error as Error).message || "未知错误"}`);
      throw error;
    }
  };

  const batchOpenBoxByPoints = async (isScheduledTask = false): Promise<void> => {
    if (ctx.shouldStop) return;
    try {
      const targetPoints = isScheduledTask
        ? (ctx.batchSettings as any).targetBoxPoints
        : (ctx.helperSettings as any).targetPoints;

      const boxPriority = [
        { id: 2001, name: "木质宝箱", points: 1, reserve: 200 },
        { id: 2002, name: "青铜宝箱", points: 10, reserve: 0 },
        { id: 2003, name: "黄金宝箱", points: 20, reserve: 0 },
        { id: 2004, name: "铂金宝箱", points: 50, reserve: 0 },
      ];

      ctx.log('info', `=== 开始按积分开箱: ${ctx.tokenId} ===`);
      ctx.log('info', `目标积分: ${targetPoints}`);

      const roleInfoRes = await ctx.send("role_getroleinfo", {}, 5000);
      const role = (roleInfoRes as any)?.role || (roleInfoRes as any)?.data?.role || {};
      const items = role.items || {};

      const boxInventory: Record<number, number> = {};
      let totalAvailablePoints = 0;

      for (const box of boxPriority) {
        const count = items[box.id]?.quantity || 0;
        boxInventory[box.id] = count;
        totalAvailablePoints += count * box.points;
      }

      ctx.log('info', `箱子库存: 木质=${boxInventory[2001]}, 青铜=${boxInventory[2002]}, 黄金=${boxInventory[2003]}, 铂金=${boxInventory[2004]}`);
      ctx.log('info', `可获得总积分: ${totalAvailablePoints}`);

      if (totalAvailablePoints < targetPoints) {
        ctx.log('error', `积分不足! 需要 ${targetPoints}, 可获得 ${totalAvailablePoints}`);
        return;
      }

      const boxToOpen: Record<number, number> = {};
      let remainingPoints = targetPoints;

      const woodenAvailable = boxInventory[2001] - 200;
      if (woodenAvailable >= 10) {
        const woodenPoints = woodenAvailable * 1;
        const pointsNeeded = Math.min(woodenPoints, remainingPoints);
        let woodenToOpen = Math.min(pointsNeeded, woodenAvailable);
        woodenToOpen = Math.floor(woodenToOpen / 10) * 10;
        if (woodenToOpen === 0 && woodenAvailable >= 10 && pointsNeeded > 0) {
          woodenToOpen = 10;
        }

        if (woodenToOpen >= 10) {
          boxToOpen[2001] = woodenToOpen;
          remainingPoints -= woodenToOpen * 1;
          ctx.log('info', `计划开 木质宝箱: ${woodenToOpen} 个 (积分: ${woodenToOpen})`);
        }
      }

      if (remainingPoints > 0) {
        const bronzeAvailable = Math.floor(boxInventory[2002] / 10) * 10;
        const goldAvailable = Math.floor(boxInventory[2003] / 10) * 10;
        const platinumAvailable = Math.floor(boxInventory[2004] / 10) * 10;
        const woodenTotal = Math.floor(boxInventory[2001] / 10) * 10;

        let bestResult: any = null;
        let minWaste = Infinity;

        for (let bronze = 0; bronze <= bronzeAvailable; bronze += 10) {
          const bronzePoints = bronze * 10;
          if (bronzePoints > remainingPoints) break;

          for (let gold = 0; gold <= goldAvailable; gold += 10) {
            const goldPoints = gold * 20;
            if (bronzePoints + goldPoints > remainingPoints) break;

            const afterBronzeGold = remainingPoints - bronzePoints - goldPoints;

            for (let platinum = 0; platinum <= platinumAvailable; platinum += 10) {
              const platinumPoints = platinum * 50;
              if (platinumPoints > afterBronzeGold) break;

              const afterPlatinum = afterBronzeGold - platinumPoints;

              let wooden = 0;
              if (afterPlatinum > 0) {
                wooden = Math.ceil(afterPlatinum / 10) * 10;
                if (wooden > woodenTotal || wooden > 100) continue;
              }

              const totalPoints = bronzePoints + goldPoints + platinumPoints + wooden;
              const waste = totalPoints - targetPoints;

              if (waste >= 0 && waste < minWaste) {
                minWaste = waste;
                bestResult = { bronze, gold, platinum, wooden, totalPoints };
                if (waste === 0) break;
              }
            }
            if (minWaste === 0) break;
          }
          if (minWaste === 0) break;
        }

        if (bestResult) {
          if (bestResult.bronze > 0) {
            boxToOpen[2002] = bestResult.bronze;
            ctx.log('info', `计划开 青铜宝箱: ${bestResult.bronze} 个 (积分: ${bestResult.bronze * 10})`);
          }
          if (bestResult.gold > 0) {
            boxToOpen[2003] = bestResult.gold;
            ctx.log('info', `计划开 黄金宝箱: ${bestResult.gold} 个 (积分: ${bestResult.gold * 20})`);
          }
          if (bestResult.platinum > 0) {
            boxToOpen[2004] = bestResult.platinum;
            ctx.log('info', `计划开 铂金宝箱: ${bestResult.platinum} 个 (积分: ${bestResult.platinum * 50})`);
          }
          if (bestResult.wooden > 0) {
            boxToOpen[2001] = (boxToOpen[2001] || 0) + bestResult.wooden;
            ctx.log('info', `计划开 木质宝箱: ${bestResult.wooden} 个 (积分: ${bestResult.wooden})`);
          }
          remainingPoints = 0;
        }
      }

      for (const box of boxPriority) {
        if (ctx.shouldStop) break;

        const count = boxToOpen[box.id] || 0;
        if (count <= 0) continue;

        const batches = Math.floor(count / 10);
        const remainder = count % 10;

        ctx.log('info', `开始开 ${box.name}: ${count} 个`);

        for (let i = 0; i < batches && !ctx.shouldStop; i++) {
          await ctx.send("item_openbox", { itemId: box.id, number: 10 }, 5000);
          ctx.log('info', `${box.name} 开箱进度: ${(i + 1) * 10}/${count}`);
          await ctx.sleep((ctx.delayConfig as any).action);
        }

        if (remainder > 0 && !ctx.shouldStop) {
          await ctx.send("item_openbox", { itemId: box.id, number: remainder }, 5000);
          ctx.log('info', `${box.name} 开箱进度: ${count}/${count}`);
        }
      }

      await ctx.sendNoAck("role_getroleinfo");
      ctx.log('success', `=== ${ctx.tokenId} 按积分开箱完成 ===`);
    } catch (error) {
      ctx.log('error', `按积分开箱失败: ${(error as Error).message || "未知错误"}`);
      throw error;
    }
  };

  const batchClaimBoxPointReward = async (): Promise<void> => {
    if (ctx.shouldStop) return;
    try {
      ctx.log('info', `=== 开始领取宝箱积分: ${ctx.tokenId} ===`);
      await ctx.send("item_batchclaimboxpointreward", {}, 5000);
      ctx.log('success', `宝箱积分领取成功`);
      await ctx.send("role_getroleinfo", {}, 5000);
      ctx.log('success', `=== ${ctx.tokenId} 领取完成 ===`);
    } catch (error) {
      ctx.log('error', `领取失败: ${(error as Error).message || "未知错误"}`);
      throw error;
    }
  };

  const batchFish = async (isScheduledTask = false): Promise<void> => {
    if (ctx.shouldStop) return;
    try {
      const fishType = isScheduledTask
        ? (ctx.batchSettings as any).defaultFishType
        : (ctx.helperSettings as any).fishType;
      const totalCount = isScheduledTask
        ? (ctx.batchSettings as any).fishCount
        : (ctx.helperSettings as any).count;
      const batches = Math.floor(totalCount / 10);
      const remainder = totalCount % 10;

      ctx.log('info', `=== 开始批量钓鱼: ${ctx.tokenId} ===`);

      let role = await ctx.getRoleInfo(true);
      role = role?.role || role?.data?.role;
      const rodId = fishType === 1 ? 1011 : 1012;
      const rodCount = role?.items?.[rodId]?.quantity || 0;

      ctx.log('info', `鱼竿类型: ${fishNames[fishType]}, 目标数量: ${totalCount}, 当前库存: ${rodCount}`);

      let availableCount = totalCount;
      if (rodCount < totalCount) {
        ctx.log('warn', `库存不足 (${rodCount} < ${totalCount})，将仅消耗现有库存`);
        availableCount = rodCount;
      }

      if (availableCount <= 0) {
        ctx.log('warn', `没有可用的鱼竿，停止任务`);
        return;
      }

      const batches2 = Math.floor(availableCount / 10);
      const remainder2 = availableCount % 10;

      for (let i = 0; i < batches2 && !ctx.shouldStop; i++) {
        await ctx.send("artifact_lottery", { type: fishType, lotteryNumber: 10, newFree: true }, 5000);
        ctx.log('info', `钓鱼进度: ${(i + 1) * 10}/${availableCount}`);

        if ((i + 1) % 5 === 0 && i < batches2 - 1) {
          try {
            const roleRes = await ctx.send("role_getroleinfo", {}, 5000);
            const currentRole = (roleRes as any)?.role || (roleRes as any)?.data?.role;
            if (currentRole) {
              const currentRodCount = currentRole.items?.[rodId]?.quantity || 0;
              if (currentRodCount < 10) {
                ctx.log('warn', `同步后发现鱼竿不足 (${currentRodCount} < 10)，停止后续批量任务`);
                break;
              }
            }
          } catch (e) {
            // ignore
          }
        }

        await ctx.sleep((ctx.delayConfig as any).action);
      }

      if (remainder2 > 0 && !ctx.shouldStop) {
        await ctx.send("artifact_lottery", { type: fishType, lotteryNumber: remainder2, newFree: true }, 5000);
        ctx.log('info', `钓鱼进度: ${availableCount}/${availableCount}`);
      }

      try {
        const roleRes = await ctx.send("role_getroleinfo", {}, 5000);
        const currentRole = (roleRes as any)?.role || (roleRes as any)?.data?.role;
        if (currentRole) {
          const points = currentRole.statistics?.["artifact:point"] || 0;
          const exchangeCount = Math.floor(points / 20);

          if (exchangeCount > 0) {
            ctx.log('info', `检测到鱼竿累计使用 ${points}，开始领取 ${exchangeCount} 次累计奖励`);
            for (let k = 0; k < exchangeCount && !ctx.shouldStop; k++) {
              try {
                await ctx.send("artifact_exchange", {}, 3000);
                await ctx.sleep(500);
              } catch (err) {
                ctx.log('warn', `领取累计奖励失败 (第${k + 1}次): ${(err as Error).message}`);
                break;
              }
            }
            ctx.log('success', `累计奖励领取结束`);
          }
        }
      } catch (e) {
        ctx.log('warn', `检查累计奖励失败: ${(e as Error).message}`);
      }

      ctx.log('success', `=== ${ctx.tokenId} 钓鱼完成 ===`);
    } catch (error) {
      ctx.log('error', `钓鱼失败: ${(error as Error).message || "未知错误"}`);
      throw error;
    }
  };

  const batchRecruit = async (isScheduledTask = false): Promise<void> => {
    if (ctx.shouldStop) return;
    try {
      const totalCount = isScheduledTask
        ? (ctx.batchSettings as any).recruitCount
        : (ctx.helperSettings as any).count;
      const batches = Math.floor(totalCount / 10);
      const remainder = totalCount % 10;

      ctx.log('info', `=== 开始批量招募: ${ctx.tokenId} ===`);
      ctx.log('info', `招募数量: ${totalCount}`);

      for (let i = 0; i < batches && !ctx.shouldStop; i++) {
        await ctx.send("hero_recruit", { recruitType: 1, recruitNumber: 10 }, 5000);
        ctx.log('info', `招募进度: ${(i + 1) * 10}/${totalCount}`);
        await ctx.sleep((ctx.delayConfig as any).action);
      }

      if (remainder > 0 && !ctx.shouldStop) {
        await ctx.send("hero_recruit", { recruitType: 1, recruitNumber: remainder }, 5000);
        ctx.log('info', `招募进度: ${totalCount}/${totalCount}`);
      }

      await ctx.sendNoAck("role_getroleinfo");
      ctx.log('success', `=== ${ctx.tokenId} 招募完成 ===`);
    } catch (error) {
      ctx.log('error', `招募失败: ${(error as Error).message || "未知错误"}`);
      throw error;
    }
  };

  const batchClaimPeachTasks = async (): Promise<void> => {
    if (ctx.shouldStop) return;
    try {
      ctx.log('info', `=== 开始领取蟠桃园任务奖励: ${ctx.tokenId} ===`);

      const res = await ctx.send("legion_getpayloadtask", {}, 5000);
      const payloadTask = (res as any)?.payloadTask || (res as any)?.data?.payloadTask;

      if (payloadTask && payloadTask.taskMap) {
        const taskMap = payloadTask.taskMap;
        const tasks: any[] = [];
        Object.values(taskMap).forEach((item: any) => {
          const availableTasks = PEACH_TASKS.filter(
            (t: any) =>
              t.type === item.typ &&
              item.progress >= t.target &&
              item.claimedProgress < t.target,
          );
          tasks.push(...availableTasks);
        });

        let claimedCount = 0;

        ctx.log('info', `获取到 ${tasks.length} 个任务奖励`);

        for (const task of tasks) {
          if (ctx.shouldStop) break;
          try {
            const claimRes = await ctx.send("legion_claimpayloadtask", { taskId: task.id }, 5000);
            const ok = claimRes && (claimRes as any).payloadTask;
            if (ok) {
              claimedCount++;
              ctx.log('success', `领取${task.desc}任务奖励成功`);
            }
          } catch (err) {
            // ignore
          }
          await ctx.sleep((ctx.delayConfig as any).action);
        }

        try {
          const progressMapres = await ctx.send("legion_getpayloadtask", {}, 5000);

          if (progressMapres && (progressMapres as any).payloadTask) {
            const legionPoint = (progressMapres as any).payloadTask.legionPoint || 0;
            const selfPoint = (progressMapres as any).payloadTask.selfPoint || 0;
            const progressMap = (progressMapres as any).payloadTask.progressMap || {};
            const taskGroupprogressMap = progressMap[1] || progressMap["1"] || 0;
            const selfPointprogressMap = progressMap[2] || progressMap["2"] || 0;

            if (legionPoint > taskGroupprogressMap && taskGroupprogressMap < 25) {
              try {
                await ctx.send("legion_claimpayloadtaskprogress", { taskGroup: 1 }, 5000);
                ctx.log('success', `领取俱乐部任务奖励 (当前积分: ${legionPoint})`);
                await ctx.sleep(1000);
              } catch (e) {
                ctx.log('error', `领取俱乐部任务奖励失败: ${(e as Error).message}`);
              }
            }

            if (selfPoint > selfPointprogressMap && selfPointprogressMap < 25) {
              try {
                await ctx.send("legion_claimpayloadtaskprogress", { taskGroup: 2 }, 5000);
                ctx.log('success', `领取个人任务奖励 (当前积分: ${selfPoint})`);
                await ctx.sleep(1000);
              } catch (e) {
                ctx.log('error', `领取个人任务奖励失败: ${(e as Error).message}`);
              }
            }
          }
        } catch (err) {
          ctx.log('error', `领取积分奖励异常: ${(err as Error).message}`);
        }

        if (claimedCount === 0) {
          ctx.log('info', `没有可领取的任务奖励`);
        }
      } else {
        ctx.log('warn', `未获取到任务奖励列表`);
      }

      ctx.log('success', `=== ${ctx.tokenId} 领取蟠桃园任务奖励完成 ===`);
    } catch (error) {
      ctx.log('error', `领取蟠桃园任务奖励失败: ${(error as Error).message || "未知错误"}`);
      throw error;
    }
  };

  const batchGenieSweep = async (): Promise<void> => {
    if (ctx.shouldStop) return;
    try {
      ctx.log('info', `=== 开始灯神扫荡: ${ctx.tokenId} ===`);

      const roleInfoRes = await ctx.send("role_getroleinfo", {}, 5000);
      const role = (roleInfoRes as any)?.role || (roleInfoRes as any)?.data?.role || {};
      const genieData = role.genie || {};
      const sweepTicketCount = role.items?.[1021]?.quantity || 0;

      ctx.log('info', `当前扫荡券数量: ${sweepTicketCount}`);

      if (sweepTicketCount <= 0) {
        ctx.log('warn', `扫荡券不足，停止扫荡`);
        return;
      }

      let maxLayer = -1;
      let bestGenieId = -1;

      for (let i = 1; i <= 4; i++) {
        if (genieData[i] !== undefined) {
          const currentLayer = genieData[i] + 1;
          if (currentLayer > maxLayer) {
            maxLayer = currentLayer;
            bestGenieId = i;
          }
        }
      }

      if (bestGenieId === -1) {
        ctx.log('warn', `未找到可扫荡的灯神关卡`);
        return;
      }

      const genieNames: Record<number, string> = { 1: "魏国", 2: "蜀国", 3: "吴国", 4: "群雄", 5: "深海" };
      ctx.log('info', `扫荡: ${genieNames[bestGenieId]}灯神 (第${maxLayer}层)`);

      let remainingTickets = sweepTicketCount;

      while (remainingTickets > 0 && !ctx.shouldStop) {
        const sweepCnt = Math.min(remainingTickets, 20);

        try {
          const res = await ctx.send("genie_sweep", { genieId: bestGenieId, sweepCnt }, 5000);
          const ok = res && ((res as any).role || (res as any).role.items);

          if (ok) {
            ctx.log('success', `扫荡成功 ${sweepCnt} 次`);
            remainingTickets = (res as any).role.items?.[1021]?.quantity || 0;
          } else {
            ctx.log('error', `扫荡失败: ${(res as any)?.hint || "未知错误"}`);
            break;
          }
        } catch (err) {
          ctx.log('error', `扫荡请求异常: ${(err as Error).message}`);
          break;
        }

        if (remainingTickets > 0) {
          await ctx.sleep((ctx.delayConfig as any).action);
        }
      }

      await ctx.sendNoAck("role_getroleinfo");
      ctx.log('success', `=== ${ctx.tokenId} 灯神扫荡完成 ===`);
    } catch (error) {
      ctx.log('error', `灯神扫荡失败: ${(error as Error).message || "未知错误"}`);
      throw error;
    }
  };

  return {
    batchOpenBox,
    batchOpenBoxByPoints,
    batchClaimBoxPointReward,
    batchFish,
    batchRecruit,
    batchClaimPeachTasks,
    batchGenieSweep,
  };
}
