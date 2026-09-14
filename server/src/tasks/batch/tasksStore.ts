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

  // 金鱼竿(黄金鱼竿) itemId; 1011=普通鱼竿
  const ROD_ITEM_ID = 1012;
  // 防死循环保险: 黑市刷新次数用尽前理论轮次很小
  const MAX_ROD_ROUNDS = 60;

  /**
   * 一键采购金鱼竿: 买光当前黑市的金鱼竿 → 刷新黑市 → 继续买, 直到刷新次数用尽。
   * store_goodslist 响应结构无历史样本, 做多形态防御解析; 解析失败时把原始响应
   * 截断打进日志, 便于按真实结构修正字段名。
   */
  const store_purchase_gold_rod = async (): Promise<void> => {
    if (ctx.shouldStop) return;
    try {
      ctx.log('info', `=== 开始一键采购金鱼竿: ${ctx.tokenId} ===`);

      const extractGoods = (resp: any): any[] => {
        if (!resp || typeof resp !== 'object') return [];
        const raw =
          resp.goodsList ?? resp.goods ?? resp.list ?? resp.goods_list ??
          resp.data?.goodsList ?? resp.data?.goods ?? resp.store?.goodsList ?? [];
        return Array.isArray(raw) ? raw : [];
      };
      const isRod = (g: any): boolean =>
        g?.itemId === ROD_ITEM_ID || g?.item?.id === ROD_ITEM_ID || g?.item?.itemId === ROD_ITEM_ID;
      const getGoodsId = (g: any) => g?.goodsId ?? g?.id;

      let bought = 0;
      let rounds = 0;

      while (!ctx.shouldStop && rounds < MAX_ROD_ROUNDS) {
        rounds++;
        const listResp: any = await ctx.send('store_goodslist', { storeId: 1 }, 8000);
        await ctx.sleep((ctx.delayConfig as any).action);

        const goods = extractGoods(listResp);
        if (!goods.length) {
          ctx.log('warn', `${ctx.tokenId} 黑市商品列表为空或结构未识别, 原始响应: ${JSON.stringify(listResp ?? null).slice(0, 400)}`);
          break;
        }

        const rods = goods.filter(isRod);
        ctx.log('info', `${ctx.tokenId} 第 ${rounds} 轮: 黑市 ${goods.length} 件商品, 其中金鱼竿 ${rods.length} 件`);

        let goldRunOut = false;
        for (const g of rods) {
          if (ctx.shouldStop) break;
          const res: any = await ctx.send('store_purchase', { goodsId: getGoodsId(g) }, 8000);
          await ctx.sleep((ctx.delayConfig as any).action);
          if (res?.error) {
            ctx.log('warn', `${ctx.tokenId} 购买金鱼竿失败: ${res.error}`);
            // 金砖花光后继续刷新也只是空转, 直接收尾
            if (/金砖|不足/.test(String(res.error))) {
              goldRunOut = true;
              break;
            }
          } else {
            bought++;
            ctx.log('info', `${ctx.tokenId} 已购买金鱼竿, 累计 ${bought} 根`);
          }
        }
        if (goldRunOut || ctx.shouldStop) break;

        const refreshResp: any = await ctx.send('store_refresh', { storeId: 1 }, 8000);
        await ctx.sleep((ctx.delayConfig as any).action);
        if (refreshResp?.error) {
          ctx.log('info', `${ctx.tokenId} 黑市刷新结束: ${refreshResp.error}`);
          break;
        }
        ctx.log('info', `${ctx.tokenId} 黑市已刷新 (第 ${rounds} 轮)`);
      }

      ctx.log('success', `${ctx.tokenId} === 一键采购金鱼竿完成: 共购买 ${bought} 根, ${rounds} 轮 ===`);
    } catch (error) {
      ctx.log('error', `${ctx.tokenId} 一键采购金鱼竿出错: ${(error as Error).message}`);
      throw error;
    }
  };

  return {
    legion_storebuygoods,
    legionStoreBuySkinCoins,
    store_purchase,
    store_purchase_gold_rod,
    collection_claimfreereward,
  };
}
