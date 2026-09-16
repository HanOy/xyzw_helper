/**
 * 商店类任务
 * 包含: legion_storebuygoods, legionStoreBuySkinCoins, store_purchase, collection_claimfreereward
 */

/**
 * 创建商店类任务执行器
 * @param {Object} deps - 依赖项
 * @returns {Object} 任务函数集合
 */
export function createTasksStore(deps) {
  const {
    selectedTokens,
    tokens,
    tokenStatus,
    isRunning,
    shouldStop,
    ensureConnection,
    releaseConnectionSlot,
    connectionQueue,
    batchSettings,
    tokenStore,
    addLog,
    message,
    currentRunningTokenId,
    delayConfig,
  } = deps;

  /**
   * 一键购买四圣碎片
   */
  const legion_storebuygoods = async () => {
    if (selectedTokens.value.length === 0) return;

    isRunning.value = true;
    shouldStop.value = false;

    selectedTokens.value.forEach((id) => {
      tokenStatus.value[id] = "waiting";
    });

    const taskPromises = selectedTokens.value.map(async (tokenId) => {
      if (shouldStop.value) return;

      tokenStatus.value[tokenId] = "running";

      const token = tokens.value.find((t) => t.id === tokenId);

      try {
        addLog({
          time: new Date().toLocaleTimeString(),
          message: `=== 开始购买四圣碎片: ${token.name} ===`,
          type: "info",
        });

        await ensureConnection(tokenId);

        addLog({
          time: new Date().toLocaleTimeString(),
          message: `${token.name} 发送购买请求...`,
          type: "info",
        });
        const result = await tokenStore.sendMessageWithPromise(
          tokenId,
          "legion_storebuygoods",
          { id: 6 },
          5000,
        );

        await new Promise((r) => setTimeout(r, delayConfig.action));

        if (result.error) {
          if (result.error.includes("俱乐部商品购买数量超出上限")) {
            addLog({
              time: new Date().toLocaleTimeString(),
              message: `${token.name} 本周已购买过四圣碎片，跳过`,
              type: "info",
            });
          } else if (result.error.includes("物品不存在")) {
            addLog({
              time: new Date().toLocaleTimeString(),
              message: `${token.name} 盐锭不足或未加入军团，购买失败`,
              type: "error",
            });
            tokenStatus.value[tokenId] = "failed";
          } else {
            addLog({
              time: new Date().toLocaleTimeString(),
              message: `${token.name} 购买失败: ${result.error}`,
              type: "error",
            });
            tokenStatus.value[tokenId] = "failed";
          }
        } else {
          addLog({
            time: new Date().toLocaleTimeString(),
            message: `${token.name} 购买成功，获得四圣碎片`,
            type: "success",
          });
          tokenStatus.value[tokenId] = "completed";
        }
      } catch (error) {
        addLog({
          time: new Date().toLocaleTimeString(),
          message: `${token.name} 购买过程出错: ${error.message}`,
          type: "error",
        });
        tokenStatus.value[tokenId] = "failed";
      } finally {
        releaseConnectionSlot();
        addLog({
          time: new Date().toLocaleTimeString(),
          message: `${token.name} 任务完成  (队列: ${connectionQueue.active}/${batchSettings.maxActive})`,
          type: "info",
        });
      }
    });

    await Promise.all(taskPromises);

    currentRunningTokenId.value = null;
    isRunning.value = false;
    shouldStop.value = false;
  };

  /**
   * 一键购买俱乐部5皮肤币
   */
  const legionStoreBuySkinCoins = async () => {
    if (selectedTokens.value.length === 0) return;

    isRunning.value = true;
    shouldStop.value = false;

    selectedTokens.value.forEach((id) => {
      tokenStatus.value[id] = "waiting";
    });

    const taskPromises = selectedTokens.value.map(async (tokenId) => {
      if (shouldStop.value) return;

      tokenStatus.value[tokenId] = "running";

      const token = tokens.value.find((t) => t.id === tokenId);

      try {
        addLog({
          time: new Date().toLocaleTimeString(),
          message: `=== 开始购买俱乐部5皮肤币: ${token.name} ===`,
          type: "info",
        });

        await ensureConnection(tokenId);

        addLog({
          time: new Date().toLocaleTimeString(),
          message: `${token.name} 发送购买请求...`,
          type: "info",
        });

        let result = null;
        for (let i = 0; i < 5; i++) {
          if (shouldStop.value) break;
          result = await tokenStore.sendMessageWithPromise(
            tokenId,
            "legion_storebuygoods",
            { id: 1 },
            5000,
          );

          await new Promise((r) => setTimeout(r, delayConfig.action));
        }

        if (result && result.error) {
          if (result.error.includes("俱乐部商品购买数量超出上限")) {
            addLog({
              time: new Date().toLocaleTimeString(),
              message: `${token.name} 本周已购买过皮肤币，跳过`,
              type: "info",
            });
          } else if (result.error.includes("物品不存在")) {
            addLog({
              time: new Date().toLocaleTimeString(),
              message: `${token.name} 盐锭不足或未加入军团，购买失败`,
              type: "error",
            });
            tokenStatus.value[tokenId] = "failed";
          } else {
            addLog({
              time: new Date().toLocaleTimeString(),
              message: `${token.name} 购买失败: ${result.error}`,
              type: "error",
            });
            tokenStatus.value[tokenId] = "failed";
          }
        } else {
          addLog({
            time: new Date().toLocaleTimeString(),
            message: `${token.name} 购买成功，获得皮肤币`,
            type: "success",
          });
          tokenStatus.value[tokenId] = "completed";
        }
      } catch (error) {
        addLog({
          time: new Date().toLocaleTimeString(),
          message: `${token.name} 购买过程出错: ${error.message}`,
          type: "error",
        });
        tokenStatus.value[tokenId] = "failed";
      } finally {
        releaseConnectionSlot();
        addLog({
          time: new Date().toLocaleTimeString(),
          message: `${token.name} 任务完成  (队列: ${connectionQueue.active}/${batchSettings.maxActive})`,
          type: "info",
        });
      }
    });

    await Promise.all(taskPromises);

    currentRunningTokenId.value = null;
    isRunning.value = false;
    shouldStop.value = false;
  };

  /**
   * 免费领取珍宝阁每日奖励
   */
  const collection_claimfreereward = async () => {
    if (selectedTokens.value.length === 0) return;
    isRunning.value = true;
    shouldStop.value = false;
    selectedTokens.value.forEach((id) => {
      tokenStatus.value[id] = "waiting";
    });

    const taskPromises = selectedTokens.value.map(async (tokenId) => {
      if (shouldStop.value) return;

      tokenStatus.value[tokenId] = "running";

      const token = tokens.value.find((t) => t.id === tokenId);

      try {
        addLog({
          time: new Date().toLocaleTimeString(),
          message: `=== 开始免费领取珍宝阁: ${token.name} ===`,
          type: "info",
        });

        await ensureConnection(tokenId);

        addLog({
          time: new Date().toLocaleTimeString(),
          message: `${token.name} 发送珍宝阁免费领取请求...`,
          type: "info",
        });
        const result = await tokenStore.sendMessageWithPromise(
          tokenId,
          "collection_claimfreereward",
          {},
          5000,
        );

        await new Promise((r) => setTimeout(r, delayConfig.action));

        if (result.error) {
          addLog({
            time: new Date().toLocaleTimeString(),
            message: `${token.name} 珍宝阁领取失败: ${result.error}`,
            type: "error",
          });
          tokenStatus.value[tokenId] = "failed";
        } else {
          addLog({
            time: new Date().toLocaleTimeString(),
            message: `${token.name} 珍宝阁领取成功`,
            type: "success",
          });
          tokenStatus.value[tokenId] = "completed";
        }
      } catch (error) {
        addLog({
          time: new Date().toLocaleTimeString(),
          message: `${token.name} 珍宝阁领取过程出错: ${error.message}`,
          type: "error",
        });
        tokenStatus.value[tokenId] = "failed";
      } finally {
        releaseConnectionSlot();
        addLog({
          time: new Date().toLocaleTimeString(),
          message: `${token.name} 任务完成  (队列: ${connectionQueue.active}/${batchSettings.maxActive})`,
          type: "info",
        });
      }
    });

    await Promise.all(taskPromises);

    currentRunningTokenId.value = null;
    isRunning.value = false;
    shouldStop.value = false;
  };

  /**
   * 黑市一键采购
   */
  const store_purchase = async () => {
    if (selectedTokens.value.length === 0) return;

    isRunning.value = true;
    shouldStop.value = false;

    selectedTokens.value.forEach((id) => {
      tokenStatus.value[id] = "waiting";
    });

    const taskPromises = selectedTokens.value.map(async (tokenId) => {
      if (shouldStop.value) return;

      tokenStatus.value[tokenId] = "running";

      const token = tokens.value.find((t) => t.id === tokenId);

      try {
        addLog({
          time: new Date().toLocaleTimeString(),
          message: `=== 开始黑市一键采购: ${token.name} ===`,
          type: "info",
        });

        await ensureConnection(tokenId);

        addLog({
          time: new Date().toLocaleTimeString(),
          message: `${token.name} 发送黑市采购请求...`,
          type: "info",
        });
        const result = await tokenStore.sendMessageWithPromise(
          tokenId,
          "store_purchase",
          {},
          5000,
        );

        await new Promise((r) => setTimeout(r, delayConfig.action));

        if (result.error) {
          addLog({
            time: new Date().toLocaleTimeString(),
            message: `${token.name} 黑市采购失败: ${result.error}`,
            type: "error",
          });
          tokenStatus.value[tokenId] = "failed";
        } else {
          addLog({
            time: new Date().toLocaleTimeString(),
            message: `${token.name} 黑市采购成功`,
            type: "success",
          });
          tokenStatus.value[tokenId] = "completed";
        }
      } catch (error) {
        addLog({
          time: new Date().toLocaleTimeString(),
          message: `${token.name} 黑市采购过程出错: ${error.message}`,
          type: "error",
        });
        tokenStatus.value[tokenId] = "failed";
      } finally {
        releaseConnectionSlot();
        addLog({
          time: new Date().toLocaleTimeString(),
          message: `${token.name} 任务完成  (队列: ${connectionQueue.active}/${batchSettings.maxActive})`,
          type: "info",
        });
      }
    });

    await Promise.all(taskPromises);

    currentRunningTokenId.value = null;
    isRunning.value = false;
    shouldStop.value = false;
  };

  /**
   * 一键采购金鱼竿: 买光当前黑市的金鱼竿(itemId 1012) → 刷新黑市 → 继续买,
   * 直到刷新次数用尽。与后端 tasksStore.ts 同逻辑 (定时任务走后端, 按钮走这里)。
   */
  const store_purchase_gold_rod = async () => {
    if (selectedTokens.value.length === 0) return;

    const ROD_ITEM_ID = 1012;
    // 黑市槽位配置 (来自游戏客户端 GoodsConf 表, config_ap.json, 2026-09-15 提取):
    // goodsId 1~16 固定槽位, goodsId=12 即金鱼竿 (itemId 1012, 一轮 5 根, 基础价 2500, 每日限购 1)。
    const ROD_GOODS_IDS = [12];
    // GoodsConf: 黑市一份金鱼竿 (goodsId=12) 含 5 根
    const RODS_PER_BUY = 5;
    const MAX_ROD_ROUNDS = 60;

    const extractGoods = (resp) => {
      if (!resp || typeof resp !== "object") return [];
      const raw =
        resp.goodsList ?? resp.goods ?? resp.list ?? resp.goods_list ??
        resp.data?.goodsList ?? resp.data?.goods ?? resp.store?.goodsList ?? [];
      if (Array.isArray(raw)) return raw;
      if (raw && typeof raw === "object") {
        // 记录形态: goodsList: { "1": {...}, "2": {...} }, key 即 goodsId
        return Object.entries(raw).map(([gid, info]) => ({
          goodsId: /^\d+$/.test(gid) ? Number(gid) : gid,
          ...(typeof info === "object" && info !== null ? info : { value: info }),
        }));
      }
      return [];
    };
    const isRod = (g) =>
      [g?.itemId, g?.item_id, g?.item?.id, g?.item?.itemId, g?.goods?.itemId, g?.goods?.id]
        .includes(ROD_ITEM_ID) || ROD_GOODS_IDS.includes(getGoodsId(g));
    const getGoodsId = (g) => g?.goodsId ?? g?.id;
    // 实测 (2026-09-14): goodslist 响应只有 goodsList 记录 + refresh, 没有 itemId 字段。
    // refresh = 今日已刷新次数 (用户确认, 非剩余); 道具身份由客户端按 goodsId
    // 查本地配置得出 → 槽位映射固定, 用 ROD_GOODS_IDS 兜底识别。
    const getRefreshUsed = (resp) => {
      const v = resp?.refresh ?? resp?.data?.refresh ?? resp?.store?.refresh;
      return typeof v === "number" ? v : undefined;
    };
    // 原始响应完整落日志 (分块), 结构不符时用来定位字段名
    const dumpRaw = (name, label, resp) => {
      const s = JSON.stringify(resp ?? null) ?? "null";
      for (let i = 0; i < s.length; i += 600) {
        addLog({
          time: new Date().toLocaleTimeString(),
          message: `${name} ${label}[${Math.floor(i / 600) + 1}]: ${s.slice(i, i + 600)}`,
          type: "warning",
        });
      }
    };
    // sendMessageWithPromise 遇到服务器错误码 (如 1300030 刷新次数用尽/金砖不足) 会
    // 直接 throw, 包一层转成 {error} 返回, 让循环里的错误分支统一处理而非中断任务
    const safeSend = async (tokenId, cmd, params = {}, timeoutMs = 8000) => {
      try {
        return await tokenStore.sendMessageWithPromise(tokenId, cmd, params, timeoutMs);
      } catch (err) {
        return { error: err?.message ?? String(err) };
      }
    };

    isRunning.value = true;
    shouldStop.value = false;

    selectedTokens.value.forEach((id) => {
      tokenStatus.value[id] = "waiting";
    });

    const taskPromises = selectedTokens.value.map(async (tokenId) => {
      if (shouldStop.value) return;

      tokenStatus.value[tokenId] = "running";

      const token = tokens.value.find((t) => t.id === tokenId);

      try {
        addLog({
          time: new Date().toLocaleTimeString(),
          message: `=== 开始一键采购金鱼竿: ${token.name} ===`,
          type: "info",
        });

        await ensureConnection(tokenId);

        let bought = 0;
        let rounds = 0;

        while (!shouldStop.value && rounds < MAX_ROD_ROUNDS) {
          rounds++;

          const listResp = await safeSend(tokenId, "store_goodslist", { storeId: 1 }, 8000);
          await new Promise((r) => setTimeout(r, delayConfig.action));

          const goods = extractGoods(listResp);
          if (!goods.length) {
            dumpRaw(token.name, "黑市商品列表为空或结构未识别, 原始响应", listResp);
            break;
          }

          const rods = goods.filter(isRod);
          const refreshUsed = getRefreshUsed(listResp);
          addLog({
            time: new Date().toLocaleTimeString(),
            message:
              `${token.name} 第 ${rounds} 轮: 黑市 ${goods.length} 件商品, 其中金鱼竿 ${rods.length} 件` +
              (refreshUsed !== undefined ? `, 今日已刷新 ${refreshUsed} 次` : ""),
            type: "info",
          });
          if (!rods.length) {
            // goodsId→道具 是客户端本地配置映射, 识别不到说明 ROD_GOODS_IDS 还没填对
            addLog({
              time: new Date().toLocaleTimeString(),
              message: `${token.name} 黑市槽位中未识别到金鱼竿, 请确认 ROD_GOODS_IDS 配置 (槽位号见游戏黑市)`,
              type: "warning",
            });
            break;
          }

          let goldRunOut = false;
          for (const g of rods) {
            if (shouldStop.value) break;
            // 买指定商品必须用 store_buy; store_purchase 是"一键采购"(空参数, goodsId
            // 被忽略) — 之前误用导致返回成功但实际没买金鱼竿 (2026-09-16 游戏源码确认)
            const res = await safeSend(tokenId, "store_buy", { goodsId: getGoodsId(g) }, 8000);
            await new Promise((r) => setTimeout(r, delayConfig.action));
            if (res?.error) {
              addLog({
                time: new Date().toLocaleTimeString(),
                message: `${token.name} 购买金鱼竿失败: ${res.error}`,
                type: "warning",
              });
              if (/金砖|不足|限购|1300030/.test(String(res.error))) {
                goldRunOut = true;
                break;
              }
            } else {
              // GoodsConf: goodsId=12 一份 = 5 根金鱼竿
              bought += RODS_PER_BUY;
              addLog({
                time: new Date().toLocaleTimeString(),
                message: `${token.name} 已购买金鱼竿 x${RODS_PER_BUY}, 累计 ${bought} 根`,
                type: "info",
              });
            }
          }
          if (goldRunOut || shouldStop.value) break;

          const refreshResp = await safeSend(tokenId, "store_refresh", { storeId: 1 }, 8000);
          await new Promise((r) => setTimeout(r, delayConfig.action));
          if (refreshResp?.error) {
            const msg = String(refreshResp.error);
            // 1300030 = 今日刷新次数用尽, 属正常结束而非故障 (2026-09-15 实测确认)
            addLog({
              time: new Date().toLocaleTimeString(),
              message: /1300030/.test(msg)
                ? `${token.name} 黑市今日刷新次数已用尽, 采购结束`
                : `${token.name} 黑市刷新结束: ${msg}`,
              type: "info",
            });
            break;
          }
          addLog({
            time: new Date().toLocaleTimeString(),
            message: `${token.name} 黑市已刷新 (第 ${rounds} 轮)`,
            type: "info",
          });
        }

        addLog({
          time: new Date().toLocaleTimeString(),
          message: `${token.name} 一键采购金鱼竿完成: 共购买 ${bought} 根, ${rounds} 轮`,
          type: bought > 0 ? "success" : "warning",
        });
        tokenStatus.value[tokenId] = "completed";
      } catch (error) {
        addLog({
          time: new Date().toLocaleTimeString(),
          message: `${token.name} 一键采购金鱼竿出错: ${error.message}`,
          type: "error",
        });
        tokenStatus.value[tokenId] = "failed";
      } finally {
        releaseConnectionSlot();
        addLog({
          time: new Date().toLocaleTimeString(),
          message: `${token.name} 任务完成  (队列: ${connectionQueue.active}/${batchSettings.maxActive})`,
          type: "info",
        });
      }
    });

    await Promise.all(taskPromises);

    currentRunningTokenId.value = null;
    isRunning.value = false;
    shouldStop.value = false;
  };

  return {
    legion_storebuygoods,
    legionStoreBuySkinCoins,
    store_purchase,
    store_purchase_gold_rod,
    collection_claimfreereward,
  };
}
