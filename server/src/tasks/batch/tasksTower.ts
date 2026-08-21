import { BatchContext } from './context.js';
import { getTowerActId } from './towerActId.js';
import { normalizeWeirdTowerMaxClimb } from './towerLimit.js';

/**
 * 爬塔类任务（单账号版）
 */
export function createTasksTower(ctx: BatchContext) {
  const climbTower = async (): Promise<void> => {
    if (ctx.shouldStop) return;
    try {
      ctx.log('info', `=== 开始爬塔: ${ctx.tokenId} ===`);

      const settings: any = await ctx.loadSettings();

      const teamInfo = await ctx.send("presetteam_getinfo", {}, 5000);
      if (!teamInfo || !(teamInfo as any).presetTeamInfo) {
        ctx.log('warn', `阵容信息异常: ${JSON.stringify(teamInfo)}`);
      }

      const currentFormation = (teamInfo as any)?.presetTeamInfo?.useTeamId;
      let Isswitching = false;
      if (currentFormation === settings.towerFormation) {
        ctx.log('info', `当前已是阵容${settings.towerFormation}，无需切换`);
      } else {
        await ctx.send("presetteam_saveteam", { teamId: settings.towerFormation }, 5000);
        Isswitching = true;
        ctx.log('info', `成功切换到阵容${settings.towerFormation}`);
      }

      await ctx.send("tower_getinfo", {}, 5000).catch(() => {});
      let roleInfo: any;
      roleInfo = await ctx.send("role_getroleinfo", {}, 5000);
      let energy = (roleInfo as any)?.role?.tower?.energy || 0;
      ctx.log('info', `${ctx.tokenId} 初始体力: ${energy}`);

      let count = 0;
      const MAX_CLIMB = 100;
      let consecutiveFailures = 0;

      while (energy > 0 && count < MAX_CLIMB && !ctx.shouldStop) {
        try {
          await ctx.send("fight_starttower", {}, 5000);
          count++;
          consecutiveFailures = 0;
          ctx.log('info', `${ctx.tokenId} 爬塔第 ${count} 次`);
          await ctx.sleep(1000);

          if (count % 5 === 0) {
            try {
              const ri = await ctx.send("role_getroleinfo", {}, 5000);
              energy = (ri as any)?.role?.tower?.energy || 0;
            } catch (e) {
              // 忽略刷新失败
            }
          } else {
            energy--;
          }
        } catch (err) {
          const msg = (err as Error).message || "";
          if (msg.includes("200400")) {
            ctx.log('warn', `${ctx.tokenId} 操作过快 (200400)，等待5秒后重试...`);
            await ctx.sleep(5000);
            continue;
          }
          if (msg.includes("1500040")) {
            ctx.log('warn', `${ctx.tokenId} 上座塔奖励未领取，尝试自动领取并等待...`);
            try {
              if (!roleInfo) {
                roleInfo = await ctx.send("role_getroleinfo", {}, 5000);
              }
              const towerId = (roleInfo as any)?.role?.tower?.id;
              if (towerId !== undefined) {
                const rewardFloor = Math.floor(towerId / 10);
                if (rewardFloor > 0) {
                  ctx.log('info', `${ctx.tokenId} 尝试领取第 ${rewardFloor} 层奖励`);
                  ctx.sendNoAck("tower_claimreward", { rewardId: rewardFloor });
                }
              }
            } catch (e) {
              // 忽略获取信息失败
            }
            await ctx.sleep(3000);
            try {
              roleInfo = await ctx.send("role_getroleinfo", {}, 5000);
              energy = (roleInfo as any)?.role?.tower?.energy || 0;
            } catch (e) {}
            consecutiveFailures = 0;
            continue;
          }

          consecutiveFailures++;
          ctx.log('warn', `战斗出错: ${msg} (重试 ${consecutiveFailures}/3)`);
          if (consecutiveFailures >= 3) {
            ctx.log('error', `${ctx.tokenId} 连续失败次数过多，停止爬塔`);
            break;
          }
          await ctx.sleep(2000);
          try {
            roleInfo = await ctx.send("role_getroleinfo", {}, 5000);
            energy = (roleInfo as any)?.role?.tower?.energy || 0;
          } catch (e) {}
        }
      }
      if (Isswitching) {
        await ctx.send("presetteam_saveteam", { teamId: currentFormation }, 5000);
      }
      ctx.log('success', `=== ${ctx.tokenId} 爬塔结束，共 ${count} 次 ===`);
    } catch (error) {
      ctx.log('error', `爬塔失败: ${(error as Error).message || "未知错误"}`);
      throw error;
    }
  };

  const climbWeirdTower = async (): Promise<void> => {
    if (ctx.shouldStop) return;
    try {
      ctx.log('info', `=== 开始爬怪异塔: ${ctx.tokenId} ===`);

      const settings: any = await ctx.loadSettings();

      const teamInfo = await ctx.send("presetteam_getinfo", {}, 5000);
      if (!teamInfo || !(teamInfo as any).presetTeamInfo) {
        ctx.log('warn', `阵容信息异常: ${JSON.stringify(teamInfo)}`);
      }

      const currentFormation = (teamInfo as any)?.presetTeamInfo?.useTeamId;
      let Isswitching = false;
      if (currentFormation === settings.towerFormation) {
        ctx.log('info', `当前已是阵容${settings.towerFormation}，无需切换`);
      } else {
        await ctx.send("presetteam_saveteam", { teamId: settings.towerFormation }, 5000);
        Isswitching = true;
        ctx.log('info', `成功切换到阵容${settings.towerFormation}`);
      }

      const evotowerinfo1 = await ctx.send("evotower_getinfo", {}, 5000);
      let currentEnergy = (evotowerinfo1 as any)?.evoTower?.energy;
      ctx.log('info', `${ctx.tokenId} 初始能量: ${currentEnergy}`);

      let count = 0;
      const MAX_CLIMB = normalizeWeirdTowerMaxClimb(ctx.weirdTowerMaxClimb);
      let consecutiveFailures = 0;

      ctx.log('info', `${ctx.tokenId} 本次最多爬怪异塔 ${MAX_CLIMB} 次`);

      while (currentEnergy > 0 && count < MAX_CLIMB && !ctx.shouldStop) {
        try {
          await ctx.send("evotower_readyfight", {}, 5000);
          const fightResult = await ctx.send("evotower_fight", { battleNum: 1, winNum: 1 }, 10000);
          count++;
          consecutiveFailures = 0;
          ctx.log('info', `${ctx.tokenId} 爬怪异塔第 ${count} 次`);
          await ctx.sleep(500);

          const evotowerinfo2 = await ctx.send("evotower_getinfo", {}, 5000);

          if (evotowerinfo2 && (evotowerinfo2 as any).evoTower && (evotowerinfo2 as any).evoTower.taskClaimMap) {
            const now = new Date();
            const year = now.getFullYear().toString().slice(2);
            const month = (now.getMonth() + 1).toString().padStart(2, "0");
            const day = now.getDate().toString().padStart(2, "0");
            const dateKey = `${year}${month}${day}`;

            const dailyTasks = (evotowerinfo2 as any).evoTower.taskClaimMap[dateKey] || {};
            const taskIds = [1, 2, 3];

            for (const taskId of taskIds) {
              if (!dailyTasks[taskId]) {
                await ctx.send("evotower_claimtask", { taskId }, 2000).then(() => {
                  ctx.log('success', `${ctx.tokenId} 领取每日任务奖励 ${taskId} 成功`);
                }).catch(() => {});
                await ctx.sleep(200);
              }
            }
          }

          const towerId = (evotowerinfo2 as any)?.evoTower?.towerId || 0;
          const floor = (towerId % 10) + 1;
          if (
            fightResult &&
            (fightResult as any).winList &&
            (fightResult as any).winList[0] === true &&
            floor === 1
          ) {
            await ctx.send("evotower_claimreward", {}, 5000);
            ctx.log('success', `${ctx.tokenId} 成功领取第${Math.floor(towerId / 10)}章通关奖励！`);
            await ctx.sleep(1000);
          }

          try {
            const evotowerinfoRefresh1 = await ctx.send("evotower_getinfo", {}, 5000);
            currentEnergy = (evotowerinfoRefresh1 as any)?.evoTower?.energy || 0;
          } catch (e) {
            // 忽略刷新失败
          }
        } catch (err) {
          consecutiveFailures++;
          ctx.log('warn', `战斗出错: ${(err as Error).message} (重试 ${consecutiveFailures}/3)`);
          if (consecutiveFailures >= 3) {
            ctx.log('error', `${ctx.tokenId} 连续失败次数过多，停止爬怪异塔`);
            break;
          }
          await ctx.sleep(1000);
          try {
            const evotowerinfoRefresh2 = await ctx.send("evotower_getinfo", {}, 5000);
            currentEnergy = (evotowerinfoRefresh2 as any)?.evoTower?.energy || 0;
          } catch (e) {}
        }
      }
      if (Isswitching) {
        await ctx.send("presetteam_saveteam", { teamId: currentFormation }, 5000);
      }
      ctx.log('success', `=== ${ctx.tokenId} 爬怪异塔结束，共 ${count} 次 ===`);
    } catch (error) {
      ctx.log('error', `爬怪异塔失败: ${(error as Error).message || "未知错误"}`);
      throw error;
    }
  };

  const batchClaimFreeEnergy = async (): Promise<void> => {
    if (ctx.shouldStop) return;
    try {
      ctx.log('info', `=== 开始领取怪异塔免费道具: ${ctx.tokenId} ===`);

      const freeEnergyResult = await ctx.send("mergebox_getinfo", { actType: 1 }, 5000);

      if (freeEnergyResult && (freeEnergyResult as any).mergeBox.freeEnergy > 0) {
        await ctx.send("mergebox_claimfreeenergy", { actType: 1 }, 5000);
        ctx.log('success', `=== ${ctx.tokenId} 成功领取免费道具${(freeEnergyResult as any).mergeBox.freeEnergy}个 ===`);
      } else {
        ctx.log('success', `===  ${ctx.tokenId} 暂无免费道具可领取 ===`);
      }
    } catch (error) {
      ctx.log('error', `领取免费道具失败: ${(error as Error).message || "未知错误"}`);
      throw error;
    }
  };

  const skinChallenge = async (): Promise<void> => {
    if (ctx.shouldStop) return;
    try {
      ctx.log('info', `=== 开始换皮闯关: ${ctx.tokenId} ===`);

      let res = await ctx.send("towers_getinfo", { actId: getTowerActId() }, 5000);
      let towerData: any = (res as any).actId ? res : ((res as any).towerData && (res as any).towerData.actId ? (res as any).towerData : res);

      if (!(towerData as any).actId) {
        ctx.log('warn', `${ctx.tokenId} 换皮闯关活动信息获取失败`);
        return;
      }

      const actId = String((towerData as any).actId);
      if (actId.length >= 6) {
        const year = "20" + actId.substring(0, 2);
        const month = actId.substring(2, 4);
        const day = actId.substring(4, 6);
        const startDate = new Date(`${year}-${month}-${day}T00:00:00`);
        const endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 7);
        const now = new Date();
        if (now < startDate || now >= endDate) {
          ctx.log('warn', `${ctx.tokenId} 换皮闯关活动已结束`);
          return;
        }
      }

      let levelRewardMap = (towerData as any).levelRewardMap || {};

      const todayWeekDay = new Date().getDay();
      const openTowerMap: Record<number, number[]> = {
        5: [1],
        6: [2],
        0: [3],
        1: [4],
        2: [5],
        3: [6],
        4: [1, 2, 3, 4, 5, 6],
      };
      const todayOpenTowers = openTowerMap[todayWeekDay] || [];

      const isTowerCleared = (type: number, map: any) => {
        const key1 = `${type}008`;
        const key2 = Number(key1);
        return !!(map[key1] || map[key2]);
      };

      const getTowerLevel = (type: number, map: any) => {
        for (let i = 8; i >= 1; i--) {
          const key1 = `${type}00${i}`;
          const key2 = Number(key1);
          if (map[key1] || map[key2]) {
            if (i === 8) return 8;
            return i + 1;
          }
        }
        return 1;
      };

      const targetTowers = todayOpenTowers.filter((type) => !isTowerCleared(type, levelRewardMap));

      if (todayWeekDay === 4) {
        ctx.log('info', `${ctx.tokenId} 周四全开放，检测到需补打BOSS: ${targetTowers.length > 0 ? targetTowers.join(", ") : "无"}`);
      } else if (targetTowers.length === 0 && todayOpenTowers.length > 0) {
        ctx.log('info', `${ctx.tokenId} 今日BOSS ${todayOpenTowers[0]} 已通关`);
      }

      if (targetTowers.length === 0) {
        ctx.log('success', `=== ${ctx.tokenId} 换皮闯关结束 (无需挑战) ===`);
        return;
      }

      for (const type of targetTowers) {
        if (ctx.shouldStop) break;
        ctx.log('info', `${ctx.tokenId} 开始挑战 BOSS ${type}`);

        let needStart = true;
        let loop = true;
        let failCount = 0;

        while (loop && !ctx.shouldStop) {
          if (needStart) {
            await ctx.send("towers_start", { actId: getTowerActId(), towerType: type }, 5000);
            await ctx.sleep(500);
          }

          const fightRes = await ctx.send("towers_fight", { actId: getTowerActId(), towerType: type }, 5000);
          const battleData = (fightRes as any)?.battleData;
          const curHP = battleData?.result?.accept?.ext?.curHP;

          const currentLevel = getTowerLevel(type, levelRewardMap);

          if (curHP === 0) {
            ctx.log('success', `${ctx.tokenId} BOSS ${type} 第 ${currentLevel} 层挑战成功`);
            needStart = false;
            failCount = 0;

            res = await ctx.send("towers_getinfo", { actId: getTowerActId() }, 5000);
            towerData = (res as any).actId ? res : ((res as any).towerData && (res as any).towerData.actId ? (res as any).towerData : res);
            levelRewardMap = (towerData as any).levelRewardMap || {};

            if (isTowerCleared(type, levelRewardMap)) {
              loop = false;
              ctx.log('success', `${ctx.tokenId} BOSS ${type} 全部通关`);
            } else {
              await ctx.sleep(1000);
            }
          } else {
            ctx.log('warn', `${ctx.tokenId} BOSS ${type} 第 ${currentLevel} 层挑战失败`);
            needStart = true;
            failCount++;

            if (failCount >= 3) {
              ctx.log('error', `${ctx.tokenId} BOSS ${type} 连续失败3次，跳过`);
              loop = false;
            } else {
              await ctx.sleep(1000);
            }
          }
        }
      }

      ctx.log('info', `${ctx.tokenId} 闯关结束，开始领取奖励`);

      // 源文件此处引用了未定义的 actIdList（原始 bug），保持空数组避免运行时报错
      const actIdList: any[] = [];
      let claimCount = 0;
      for (const { actId: id } of actIdList) {
        const claimActId = id % 10 === 1 ? id + 1 : id;
        try {
          while (!ctx.shouldStop) {
            await ctx.send("activity_startactegame", { actId: claimActId }, 5000);
            claimCount++;
            ctx.log('success', `${ctx.tokenId} 活动 ${claimActId} 领取奖励第 ${claimCount} 次`);
            await ctx.sleep(300);
          }
        } catch (e) {
          ctx.log(claimCount > 0 ? 'success' : 'info', `${ctx.tokenId} 活动 ${claimActId} 领取结束（共 ${claimCount} 次）`);
        }
      }
      if (claimCount > 0) {
        ctx.log('success', `${ctx.tokenId} 领取奖励 ${claimCount} 次`);
      }

      ctx.log('success', `=== ${ctx.tokenId} 换皮闯关结束 ===`);
    } catch (error) {
      let errorMessage = (error as Error).message;
      if (errorMessage && errorMessage.includes("200330")) {
        errorMessage = "存在未完成的挑战，需要手动处理";
      }
      ctx.log('error', `换皮闯关失败: ${errorMessage}`);
      throw error;
    }
  };

  const batchUseItems = async (): Promise<void> => {
    if (ctx.shouldStop) return;
    try {
      ctx.log('info', `=== 开始使用道具: ${ctx.tokenId} ===`);

      const infoRes = await ctx.send("mergebox_getinfo", { actType: 1 }, 5000);
      const towerInfoRes = await ctx.send("evotower_getinfo", {}, 5000);

      if (!infoRes || !(infoRes as any).mergeBox) {
        throw new Error("获取活动信息失败");
      }

      let costTotalCnt = (infoRes as any).mergeBox.costTotalCnt || 0;
      let lotteryLeftCnt = (towerInfoRes as any)?.evoTower?.lotteryLeftCnt || 0;

      if (lotteryLeftCnt <= 0) {
        ctx.log('warn', `${ctx.tokenId} 没有剩余道具可使用`);
        return;
      }

      ctx.log('info', `${ctx.tokenId} 开始使用道具，剩余：${lotteryLeftCnt}，已用：${costTotalCnt}`);

      let processedCount = 0;

      while (lotteryLeftCnt > 0 && !ctx.shouldStop) {
        let pos: any = {};
        if (costTotalCnt < 2) {
          pos = { gridX: 4, gridY: 5 };
        } else if (costTotalCnt < 102) {
          pos = { gridX: 7, gridY: 3 };
        } else {
          pos = { gridX: 6, gridY: 3 };
        }

        await ctx.send("mergebox_openbox", { actType: 1, pos }, 5000);
        costTotalCnt++;
        lotteryLeftCnt--;
        processedCount++;
        await ctx.sleep(500);
      }

      await ctx.send("mergebox_claimcostprogress", { actType: 1 }, 5000).catch(() => {});
      ctx.log('info', `${ctx.tokenId} 尝试领取累计使用奖励`);

      ctx.log('success', `=== ${ctx.tokenId} 使用道具结束，共使用 ${processedCount} 次 ===`);
    } catch (error) {
      ctx.log('error', `使用道具失败: ${(error as Error).message || "未知错误"}`);
      throw error;
    }
  };

  const batchMergeItems = async (): Promise<void> => {
    if (ctx.shouldStop) return;
    try {
      ctx.log('info', `=== 开始一键合成: ${ctx.tokenId} ===`);

      let loopCount = 0;
      const MAX_LOOPS = 20;

      while (loopCount < MAX_LOOPS && !ctx.shouldStop) {
        loopCount++;

        const infoRes = await ctx.send("mergebox_getinfo", { actType: 1 }, 5000);

        if (!infoRes || !(infoRes as any).mergeBox) {
          ctx.log('warn', `${ctx.tokenId} 返回数据缺少 mergeBox`);
          break;
        }

        if ((infoRes as any).mergeBox.taskMap) {
          const taskMap = (infoRes as any).mergeBox.taskMap;
          const taskClaimMap = (infoRes as any).mergeBox.taskClaimMap || {};

          const rewardMapping: Record<number, { name: string; reward: string }> = {
            2: { name: "短裙手套", reward: "10随机红色碎片" },
            3: { name: "拽拽菜篮", reward: "2黄金鱼竿" },
            4: { name: "狂野菜板", reward: "2招募令" },
            5: { name: "大胃锅", reward: "2珍珠" },
            6: { name: "幽影茶壶", reward: "5皮肤币" },
            7: { name: "愤怒面包机", reward: "2珍珠" },
            8: { name: "惊讶榨汁机", reward: "1四圣宝珠碎片" },
            9: { name: "动感电饭锅", reward: "5000白玉" },
            10: { name: "迅捷烤炉", reward: "12珍珠" },
            11: { name: "至尊打蛋机", reward: "15彩玉" },
            12: { name: "完美烤炉", reward: "24珍珠" },
          };

          for (const taskId in taskMap) {
            if (ctx.shouldStop) break;
            if (taskMap[taskId] !== 0 && !taskClaimMap[taskId]) {
              await ctx.send("mergebox_claimmergeprogress", { actType: 1, taskId: parseInt(taskId) }, 2000).catch(() => {});
              const idStr = String(taskId);
              const lastTwo = parseInt(idStr.slice(-2));
              const taskInfo = rewardMapping[lastTwo];
              const taskDesc = taskInfo ? `${lastTwo}级 ${taskInfo.reward ? " 奖励" + taskInfo.reward : ""}` : `任务${taskId}`;
              ctx.log('success', `${ctx.tokenId} 领取合成奖励: ${taskDesc}`);
              await ctx.sleep(500);
            }
          }
        }

        const gridMap = (infoRes as any).mergeBox.gridMap || {};
        const items: any[] = [];

        for (const xStr in gridMap) {
          for (const yStr in gridMap[xStr]) {
            const item = gridMap[xStr][yStr];
            if (item.gridConfId == 0 && item.gridItemId > 0 && !item.isLock) {
              items.push({ x: parseInt(xStr), y: parseInt(yStr), id: item.gridItemId });
            }
          }
        }

        const groupedItems: Record<number, any[]> = {};
        items.forEach((item) => {
          if (!groupedItems[item.id]) groupedItems[item.id] = [];
          groupedItems[item.id].push(item);
        });

        let hasPotentialMerge = false;
        for (const id in groupedItems) {
          if (groupedItems[id].length >= 2) {
            hasPotentialMerge = true;
            break;
          }
        }

        if (!hasPotentialMerge) {
          if (loopCount === 1) {
            ctx.log('info', `${ctx.tokenId} 当前没有可合成的物品`);
          }
          break;
        }

        const isLevel8OrAbove = (infoRes as any).mergeBox.taskMap && (infoRes as any).mergeBox.taskMap["251212208"] && (infoRes as any).mergeBox.taskMap["251212208"] !== 0;

        if (isLevel8OrAbove) {
          await ctx.send("mergebox_automergeitem", { actType: 1 }, 10000);
          await ctx.sleep(1500);
        } else {
          for (const id in groupedItems) {
            if (ctx.shouldStop) break;
            const group = groupedItems[id];
            while (group.length >= 2) {
              if (ctx.shouldStop) break;
              const source = group.shift();
              const target = group.shift();
              await ctx.send("mergebox_mergeitem", {
                actType: 1,
                sourcePos: { gridX: source.x, gridY: source.y },
                targetPos: { gridX: target.x, gridY: target.y },
              }, 1000).catch(() => {});
              await ctx.sleep(300);
            }
          }
        }

        await ctx.sleep(500);
      }

      ctx.log('success', `=== ${ctx.tokenId} 一键合成完成 ===`);
    } catch (error) {
      ctx.log('error', `一键合成失败: ${(error as Error).message || "未知错误"}`);
      throw error;
    }
  };

  return {
    climbTower,
    climbWeirdTower,
    batchClaimFreeEnergy,
    skinChallenge,
    batchUseItems,
    batchMergeItems,
  };
}
