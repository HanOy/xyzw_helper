import { BatchContext } from './context.js';
import {
  normalizeCars,
  gradeLabel,
  shouldSendCar,
  canClaim,
} from './carUtils.js';

// 车辆研究消耗表（原 src/utils/batch/constants.js 的 CarresearchItem 原样移植）
const CarresearchItem = [
  20, 21, 22, 23, 24, 26, 28, 30, 32, 34, 36, 38, 40, 42, 44, 47, 50, 53, 56,
  59, 62, 65, 68, 71, 74, 78, 82, 86, 90, 94, 99, 104, 109, 114, 119, 126, 133,
  140, 147, 154, 163, 172, 181, 190, 199, 210, 221, 232, 243, 369, 393, 422,
  457, 498, 548, 607, 678, 763, 865, 1011,
];

/**
 * 车辆类任务（单账号版）
 */
export function createTasksCar(ctx: BatchContext) {
  const batchSmartSendCar = async (): Promise<void> => {
    if (ctx.shouldStop) return;
    try {
      ctx.log('info', `=== 开始智能发车: ${ctx.tokenId} ===`);

      const res = await ctx.send("car_getrolecar", {}, 10000);
      let carList = normalizeCars((res as any)?.body ?? res);

      let refreshTickets = 0;
      let currentRoleId: string | null = null;
      try {
        const roleRes = await ctx.send("role_getroleinfo", {}, 10000);
        const qty = (roleRes as any)?.role?.items?.[35002]?.quantity;
        refreshTickets = Number(qty || 0);
        currentRoleId = (roleRes as any)?.role?.roleId ? String((roleRes as any).role.roleId) : null;
        ctx.log('info', `${ctx.tokenId} 剩余刷新次数: ${refreshTickets}`);
      } catch (_) {}

      let helperUsageMap: any = {};
      let sortedHelpers: any[] = [];

      const updateHelperUsage = async () => {
        try {
          const usageRes = await ctx.send("car_getmemberhelpingcnt", {}, 5000);
          helperUsageMap =
            (usageRes as any)?.body?.memberHelpingCntMap ||
            (usageRes as any)?.memberHelpingCntMap ||
            {};
        } catch (e) {
          // 忽略更新失败
        }
      };

      try {
        await updateHelperUsage();

        const legionRes = await ctx.send("legion_getinfo", {}, 5000);
        const membersMap =
          (legionRes as any)?.body?.info?.members || (legionRes as any)?.info?.members || {};

        sortedHelpers = Object.values(membersMap)
          .filter((m: any) => !currentRoleId || String(m.roleId) !== currentRoleId)
          .map((m: any) => ({
            id: String(m.roleId),
            name: m.name || m.nickname || String(m.roleId),
            redQuench: m.custom?.red_quench_cnt || 0,
          }))
          .sort((a: any, b: any) => b.redQuench - a.redQuench);

        ctx.log('info', `${ctx.tokenId} 获取到 ${sortedHelpers.length} 位潜在护卫`);
      } catch (e) {
        ctx.log('warn', `${ctx.tokenId} 获取护卫数据失败: ${(e as Error).message}，将不带护卫发车`);
      }

      const assignHelperIfNeeded = async (car: any) => {
        const color = Number(car.color || 0);
        if (color < 5) return;
        if (car.helperId) return;

        await updateHelperUsage();

        if (!sortedHelpers.length) {
          ctx.log('warn', `${ctx.tokenId} 车辆[${gradeLabel(car.color)}]需要护卫，但未获取到可用护卫列表`);
          return;
        }

        const bestHelper = sortedHelpers.find((h: any) => {
          const used = Number(helperUsageMap[h.id] || 0);
          return used < 4;
        });

        if (bestHelper) {
          car.helperId = bestHelper.id;
          helperUsageMap[bestHelper.id] = Number(helperUsageMap[bestHelper.id] || 0) + 1;
          ctx.log('success', `${ctx.tokenId} 车辆[${gradeLabel(car.color)}]自动分配护卫: ${bestHelper.name} (已助战: ${helperUsageMap[bestHelper.id]}/4)`);
        } else {
          ctx.log('warn', `${ctx.tokenId} 车辆[${gradeLabel(car.color)}]需要护卫，但所有护卫次数已满`);
        }
      };

      const bs = ctx.batchSettings as any;

      for (const car of carList) {
        if (ctx.shouldStop) break;
        if (Number(car.sendAt || 0) !== 0) continue;

        try {
          const effectiveTickets = bs.useGoldRefreshFallback ? 999 : refreshTickets;

          const customConditions = {
            gold: bs.smartDepartureGoldThreshold,
            recruit: bs.smartDepartureRecruitThreshold,
            jade: bs.smartDepartureJadeThreshold,
            ticket: bs.smartDepartureTicketThreshold,
          };

          if (shouldSendCar(car, effectiveTickets, bs.carMinColor, customConditions, bs.useGoldRefreshFallback, bs.smartDepartureMatchAll)) {
            await assignHelperIfNeeded(car);
            ctx.log('info', `${ctx.tokenId} 车辆[${gradeLabel(car.color)}]满足条件，直接发车`);
            await ctx.send("car_send", {
              carId: String(car.id),
              helperId: car.helperId ? String(car.helperId) : 0,
              text: "",
              isUpgrade: false,
            }, 10000);
            await ctx.sleep((ctx.delayConfig as any).action);
            continue;
          }

          let shouldRefresh = false;
          const free = Number(car.refreshCount ?? 0) === 0;
          const useGoldFallback = bs.useGoldRefreshFallback && !free && refreshTickets < 6;

          if (refreshTickets >= 6) shouldRefresh = true;
          else if (free) shouldRefresh = true;
          else if (useGoldFallback) {
            shouldRefresh = true;
            ctx.log('warn', `${ctx.tokenId} 车辆[${gradeLabel(car.color)}]仍不满足条件且无刷新次数，将启用金砖刷新`);
          } else {
            await assignHelperIfNeeded(car);
            ctx.log('warn', `${ctx.tokenId} 车辆[${gradeLabel(car.color)}]不满足条件且无刷新次数，直接发车`);
            await ctx.send("car_send", {
              carId: String(car.id),
              helperId: car.helperId ? String(car.helperId) : 0,
              text: "",
              isUpgrade: false,
            }, 10000);
            await ctx.sleep((ctx.delayConfig as any).action);
            continue;
          }

          while (shouldRefresh && !ctx.shouldStop) {
            ctx.log('info', `${ctx.tokenId} 车辆[${gradeLabel(car.color)}]尝试刷新...`);
            const resp = await ctx.send("car_refresh", { carId: String(car.id) }, 10000);
            const data = (resp as any)?.car || (resp as any)?.body?.car || resp;

            if (data && typeof data === "object") {
              if (data.color != null) car.color = Number(data.color);
              if (data.refreshCount != null) car.refreshCount = Number(data.refreshCount);
              if (data.rewards != null) car.rewards = data.rewards;
            }

            try {
              const roleRes = await ctx.send("role_getroleinfo", {}, 5000);
              refreshTickets = Number((roleRes as any)?.role?.items?.[35002]?.quantity || 0);
            } catch (_) {}

            if (shouldSendCar(car, bs.useGoldRefreshFallback ? 999 : refreshTickets, bs.carMinColor, customConditions, bs.useGoldRefreshFallback, bs.smartDepartureMatchAll)) {
              await assignHelperIfNeeded(car);
              ctx.log('success', `${ctx.tokenId} 刷新后车辆[${gradeLabel(car.color)}]满足条件，发车`);
              await ctx.send("car_send", {
                carId: String(car.id),
                helperId: car.helperId ? String(car.helperId) : 0,
                text: "",
                isUpgrade: false,
              }, 10000);
              await ctx.sleep((ctx.delayConfig as any).action);
              break;
            }

            const freeNow = Number(car.refreshCount ?? 0) === 0;
            const useGoldFallback2 = bs.useGoldRefreshFallback && !freeNow && refreshTickets < 6;

            if (refreshTickets >= 6) shouldRefresh = true;
            else if (freeNow) shouldRefresh = true;
            else if (useGoldFallback2) {
              shouldRefresh = true;
              ctx.log('warn', `${ctx.tokenId} 刷新后车辆[${gradeLabel(car.color)}]仍不满足条件且无刷新次数，将启用金砖刷新`);
            } else {
              assignHelperIfNeeded(car);
              ctx.log('warn', `${ctx.tokenId} 刷新后车辆[${gradeLabel(car.color)}]仍不满足条件且无刷新次数，发车`);
              await ctx.send("car_send", {
                carId: String(car.id),
                helperId: car.helperId ? String(car.helperId) : 0,
                text: "",
                isUpgrade: false,
              }, 10000);
              await ctx.sleep((ctx.delayConfig as any).action);
              break;
            }

            await ctx.sleep((ctx.delayConfig as any).refresh);
          }
        } catch (carError) {
          ctx.log('error', `${ctx.tokenId} 车辆[${gradeLabel(car.color)}]处理失败: ${(carError as Error).message}，跳过该车辆`);
          continue;
        }
      }

      ctx.log('success', `=== ${ctx.tokenId} 智能发车完成 ===`);
    } catch (error) {
      ctx.log('error', `智能发车失败: ${(error as Error).message || "未知错误"}`);
      throw error;
    }
  };

  const batchClaimCars = async (): Promise<void> => {
    if (ctx.shouldStop) return;
    try {
      ctx.log('info', `=== 开始一键收车: ${ctx.tokenId} ===`);

      const res = await ctx.send("car_getrolecar", {}, 10000);
      let carList = normalizeCars((res as any)?.body ?? res);
      let refreshlevel = (res as any)?.roleCar?.research?.[1] || 0;

      let claimedCount = 0;
      for (const car of carList) {
        if (ctx.shouldStop) break;
        if (canClaim(car)) {
          try {
            await ctx.send("car_claim", { carId: String(car.id) }, 10000);
            claimedCount++;
            ctx.log('success', `${ctx.tokenId} 收车成功: ${gradeLabel(car.color)}`);

            const roleRes = await ctx.send("role_getroleinfo", {}, 5000);
            let refreshpieces = Number((roleRes as any)?.role?.items?.[35009]?.quantity || 0);

            while (
              refreshlevel < CarresearchItem.length &&
              refreshpieces >= CarresearchItem[refreshlevel] &&
              !ctx.shouldStop
            ) {
              try {
                await ctx.send("car_research", { researchId: 1 }, 5000);
                refreshlevel++;

                const updatedRoleRes = await ctx.send("role_getroleinfo", {}, 5000);
                refreshpieces = Number((updatedRoleRes as any)?.role?.items?.[35009]?.quantity || 0);

                ctx.log('success', `${ctx.tokenId} 执行车辆改装升级，当前等级: ${refreshlevel}`);
                await ctx.sleep((ctx.delayConfig as any).action);
              } catch (e) {
                ctx.log('error', `${ctx.tokenId} 车辆改装升级失败: ${(e as Error).message}`);
                break;
              }
            }

            try {
              const rewardRes = await ctx.send("car_claimpartconsumereward", {}, 5000);
              if (rewardRes && (rewardRes as any).reward) {
                ctx.log('success', `${ctx.tokenId} 领取改装升级累计奖励成功`);
              }
            } catch (e) {
              // 忽略错误
            }
          } catch (e) {
            ctx.log('warn', `${ctx.tokenId} 收车失败: ${(e as Error).message}`);
          }
          await ctx.sleep((ctx.delayConfig as any).action);
        }
      }

      if (claimedCount === 0) {
        ctx.log('info', `${ctx.tokenId} 没有可收取的车辆`);
      }

      ctx.log('success', `=== ${ctx.tokenId} 收车完成，共收取 ${claimedCount} 辆 ===`);
    } catch (error) {
      ctx.log('error', `收车失败: ${(error as Error).message || "未知错误"}`);
      throw error;
    }
  };

  return {
    batchSmartSendCar,
    batchClaimCars,
  };
}
