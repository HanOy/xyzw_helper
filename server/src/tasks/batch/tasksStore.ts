import { BatchContext } from './context.js';

/**
 * 商店类任务（单账号版）
 */
export function createTasksStore(ctx: BatchContext) {
  const legion_storebuygoods = async (): Promise<void> => {
    if (ctx.shouldStop) return;
    try {
      ctx.log('info', `=== 开始购买四圣碎片: ${ctx.tokenId} ===`);
      ctx.log('info', `${ctx.tokenId} 发送购买请求...`);

      const result = await ctx.send("legion_storebuygoods", { id: 6 }, 5000);
      await ctx.sleep((ctx.delayConfig as any).action);

      if ((result as any).error) {
        if ((result as any).error.includes("俱乐部商品购买数量超出上限")) {
          ctx.log('info', `${ctx.tokenId} 本周已购买过四圣碎片，跳过`);
        } else if ((result as any).error.includes("物品不存在")) {
          ctx.log('error', `${ctx.tokenId} 盐锭不足或未加入军团，购买失败`);
        } else {
          ctx.log('error', `${ctx.tokenId} 购买失败: ${(result as any).error}`);
        }
      } else {
        ctx.log('success', `${ctx.tokenId} 购买成功，获得四圣碎片`);
      }
    } catch (error) {
      ctx.log('error', `${ctx.tokenId} 购买过程出错: ${(error as Error).message}`);
      throw error;
    }
  };

  const legionStoreBuySkinCoins = async (): Promise<void> => {
    if (ctx.shouldStop) return;
    try {
      ctx.log('info', `=== 开始购买俱乐部5皮肤币: ${ctx.tokenId} ===`);
      ctx.log('info', `${ctx.tokenId} 发送购买请求...`);

      let result: any = null;
      for (let i = 0; i < 5; i++) {
        if (ctx.shouldStop) break;
        result = await ctx.send("legion_storebuygoods", { id: 1 }, 5000);
        await ctx.sleep((ctx.delayConfig as any).action);
      }

      if (result && result.error) {
        if (result.error.includes("俱乐部商品购买数量超出上限")) {
          ctx.log('info', `${ctx.tokenId} 本周已购买过皮肤币，跳过`);
        } else if (result.error.includes("物品不存在")) {
          ctx.log('error', `${ctx.tokenId} 盐锭不足或未加入军团，购买失败`);
        } else {
          ctx.log('error', `${ctx.tokenId} 购买失败: ${result.error}`);
        }
      } else {
        ctx.log('success', `${ctx.tokenId} 购买成功，获得皮肤币`);
      }
    } catch (error) {
      ctx.log('error', `${ctx.tokenId} 购买过程出错: ${(error as Error).message}`);
      throw error;
    }
  };

  const collection_claimfreereward = async (): Promise<void> => {
    if (ctx.shouldStop) return;
    try {
      ctx.log('info', `=== 开始免费领取珍宝阁: ${ctx.tokenId} ===`);
      ctx.log('info', `${ctx.tokenId} 发送珍宝阁免费领取请求...`);

      const result = await ctx.send("collection_claimfreereward", {}, 5000);
      await ctx.sleep((ctx.delayConfig as any).action);

      if ((result as any).error) {
        ctx.log('error', `${ctx.tokenId} 珍宝阁领取失败: ${(result as any).error}`);
      } else {
        ctx.log('success', `${ctx.tokenId} 珍宝阁领取成功`);
      }
    } catch (error) {
      ctx.log('error', `${ctx.tokenId} 珍宝阁领取过程出错: ${(error as Error).message}`);
      throw error;
    }
  };

  const store_purchase = async (): Promise<void> => {
    if (ctx.shouldStop) return;
    try {
      ctx.log('info', `=== 开始黑市一键采购: ${ctx.tokenId} ===`);
      ctx.log('info', `${ctx.tokenId} 发送黑市采购请求...`);

      const result = await ctx.send("store_purchase", {}, 5000);
      await ctx.sleep((ctx.delayConfig as any).action);

      if ((result as any).error) {
        ctx.log('error', `${ctx.tokenId} 黑市采购失败: ${(result as any).error}`);
      } else {
        ctx.log('success', `${ctx.tokenId} 黑市采购成功`);
      }
    } catch (error) {
      ctx.log('error', `${ctx.tokenId} 黑市采购过程出错: ${(error as Error).message}`);
      throw error;
    }
  };

  return {
    legion_storebuygoods,
    legionStoreBuySkinCoins,
    store_purchase,
    collection_claimfreereward,
  };
}
