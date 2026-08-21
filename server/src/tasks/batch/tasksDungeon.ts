import { BatchContext } from './context.js';
import { isDungeonOpen, merchantConfig } from './dreamConstants.js';

/**
 * 宝库、梦境类任务（单账号版）
 */
export function createTasksDungeon(ctx: BatchContext) {
  const batchbaoku13 = async (): Promise<void> => {
    if (ctx.shouldStop) return;
    try {
      ctx.log('info', `=== 开始一键宝库: ${ctx.tokenId} ===`);

      const bosstowerinfo = await ctx.send("bosstower_getinfo", {}, 8000);
      const towerId = (bosstowerinfo as any).bossTower.towerId;

      if (towerId >= 1 && towerId <= 3) {
        for (let i = 0; i < 2; i++) {
          if (ctx.shouldStop) break;
          await ctx.send("bosstower_startboss", {}, 8000);
          await ctx.sleep(500);
        }
        for (let i = 0; i < 9; i++) {
          if (ctx.shouldStop) break;
          await ctx.send("bosstower_startbox", {}, 8000);
          await ctx.sleep(500);
        }
      }
      ctx.log('success', `=== ${ctx.tokenId} 宝库战斗已完成，请上线手动领取奖励 ===`);
    } catch (error) {
      ctx.log('error', `宝库战斗失败: ${(error as Error).message || "未知错误"}`);
      throw error;
    }
  };

  const batchbaoku45 = async (): Promise<void> => {
    if (ctx.shouldStop) return;
    try {
      ctx.log('info', `=== 开始一键宝库: ${ctx.tokenId} ===`);

      const bosstowerinfo = await ctx.send("bosstower_getinfo", {}, 8000);
      const towerId = (bosstowerinfo as any).bossTower.towerId;

      if (towerId >= 4 && towerId <= 5) {
        for (let i = 0; i < 2; i++) {
          if (ctx.shouldStop) break;
          await ctx.send("bosstower_startboss", {}, 8000);
          await ctx.sleep(500);
        }
      }
      ctx.log('success', `=== ${ctx.tokenId} 宝库战斗已完成 ===`);
    } catch (error) {
      ctx.log('error', `宝库战斗失败: ${(error as Error).message || "未知错误"}`);
      throw error;
    }
  };

  const batchmengjing = async (): Promise<void> => {
    if (ctx.shouldStop) return;
    try {
      ctx.log('info', `=== 开始咸王梦境: ${ctx.tokenId} ===`);

      const mjbattleTeam = { 0: 107 };
      const dayOfWeek = new Date().getDay();
      if (dayOfWeek === 0 || dayOfWeek === 1 || dayOfWeek === 3 || dayOfWeek === 4) {
        await ctx.send("dungeon_selecthero", { battleTeam: mjbattleTeam }, 5000);
        await ctx.sleep(500);
        ctx.log('success', `=== ${ctx.tokenId} 咸王梦境已完成 ===`);
      } else {
        ctx.log('error', `=== ${ctx.tokenId} 当前未在开放时间 ===`);
      }
    } catch (error) {
      ctx.log('error', `咸王梦境失败: ${(error as Error).message || "未知错误"}`);
      throw error;
    }
  };

  const batchBuyDreamItems = async (): Promise<void> => {
    if (ctx.shouldStop) return;

    if (!isDungeonOpen()) {
      ctx.log('warn', `当前不是梦境开放时间（周三/周四/周日/周一）`);
      return;
    }

    const purchaseList = (ctx.batchSettings as any).dreamPurchaseList || [];
    if (purchaseList.length === 0) {
      ctx.log('warn', `请先在设置中配置购买清单`);
      return;
    }

    try {
      ctx.log('info', `=== 开始梦境购买: ${ctx.tokenId} ===`);

      const roleInfo = await ctx.send("role_getroleinfo", {}, 15000);
      if (!(roleInfo as any) || !(roleInfo as any).role || !(roleInfo as any).role.dungeon || !(roleInfo as any).role.dungeon.merchant) {
        throw new Error("无法获取梦境商店数据");
      }

      const merchantData = (roleInfo as any).role.dungeon.merchant;
      const levelId = (roleInfo as any).role.levelId || 0;
      let successCount = 0;
      let failCount = 0;

      const operations: any[] = [];

      for (const itemKey of purchaseList) {
        const [targetMerchantId, targetItemIndex] = String(itemKey).split("-").map(Number);
        const merchantItems = merchantData[targetMerchantId];
        if (merchantItems) {
          for (let pos = 0; pos < merchantItems.length; pos++) {
            if (merchantItems[pos] === targetItemIndex) {
              operations.push({ merchantId: targetMerchantId, index: targetItemIndex, pos });
            }
          }
        }
      }
      operations.sort((a: any, b: any) => {
        if (a.merchantId !== b.merchantId) return a.merchantId - b.merchantId;
        return b.pos - a.pos;
      });

      for (const op of operations) {
        if (ctx.shouldStop) break;

        if (levelId < 4000) {
          ctx.log('warn', `${ctx.tokenId} 关卡数小于4000，无法购买`);
          return;
        }

        try {
          const response = await ctx.send("dungeon_buymerchant", {
            id: op.merchantId,
            index: op.index,
            pos: op.pos,
          }, 5000);

          if (response && (response as any).reward) {
            successCount++;
            const merchantName = merchantConfig[op.merchantId] ? merchantConfig[op.merchantId].name : `商人${op.merchantId}`;
            const itemName = merchantConfig[op.merchantId] && merchantConfig[op.merchantId].items[op.index] ? merchantConfig[op.merchantId].items[op.index] : `商品${op.index}`;
            ctx.log('success', `${ctx.tokenId} 购买成功: ${merchantName} - ${itemName}`);
          } else {
            failCount++;
          }
        } catch (err) {
          failCount++;
        }
        await ctx.sleep(500);
      }

      ctx.log('success', `=== ${ctx.tokenId} 梦境购买完成: 成功${successCount}, 失败${failCount} ===`);
    } catch (error) {
      ctx.log('error', `梦境购买失败: ${(error as Error).message || "未知错误"}`);
      throw error;
    }
  };

  return {
    batchbaoku13,
    batchbaoku45,
    batchmengjing,
    batchBuyDreamItems,
  };
}
