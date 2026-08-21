import { BatchContext } from './context.js';

/**
 * 功法类任务（单账号版）
 */
export function createTasksLegacy(ctx: BatchContext) {
  const batchLegacyClaim = async (): Promise<void> => {
    if (ctx.shouldStop) return;
    try {
      ctx.log('info', `=== 开始领取功法残卷: ${ctx.tokenId} ===`);

      const resp = await ctx.send("legacy_claimhangup", {}, 5000);
      ctx.log('success', `=== ${ctx.tokenId} 成功领取功法残卷${(resp as any).reward[0].value}，共有${(resp as any).role.items[37007].quantity}个 ===`);
    } catch (error) {
      ctx.log('error', `=== ${ctx.tokenId} 领取功法残卷失败: ${(error as Error).message || "未知错误"} ===`);
      throw error;
    }
  };

  const batchLegacyGiftSendEnhanced = async (isScheduledTask = false): Promise<void> => {
    if (ctx.shouldStop) return;

    const recipientId = isScheduledTask
      ? (ctx.batchSettings as any).receiverId ?? ctx.receiverId
      : ctx.receiverId;
    const password = isScheduledTask
      ? (ctx.batchSettings as any).password ?? ctx.securityPassword
      : ctx.securityPassword;

    const giftConfig: any = {
      recipientId: Number(recipientId),
      itemId: 37007,
      quantity: Math.min(ctx.giftQuantity, 9999) || 0,
      serverName: "",
      name: "",
    };

    if (!isScheduledTask) {
      if (!giftConfig.recipientId || giftConfig.recipientId <= 0) {
        ctx.log('error', `请输入有效的接收者ID`);
        return;
      }
      if (giftConfig.quantity <= 0 || giftConfig.quantity > 9999) {
        ctx.log('error', `赠送数量必须在1-9999之间`);
        return;
      }
    }

    try {
      let consecutiveErrors = 0;
      const maxRetries = 2;

      while (consecutiveErrors <= maxRetries && !ctx.shouldStop) {
        try {
          ctx.log('info', `=== 开始赠送功法残卷: ${ctx.tokenId} (尝试 ${consecutiveErrors + 1}/${maxRetries + 1}) ===`);

          const roleInfo = await ctx.send("role_getroleinfo", {}, 5000);
          const legacyFragmentCount =
            Math.min(
              (roleInfo as any)?.role?.items?.[giftConfig.itemId]?.quantity,
              9999,
            ) || 0;

          if (isScheduledTask) {
            if (legacyFragmentCount === 0) {
              ctx.log('error', `=== ${ctx.tokenId} 功法残卷不足，当前拥有: 0 ===`);
              return;
            }
            const rankroleinfo = await ctx.send("rank_getroleinfo", {
              bottleType: 0,
              includeBottleTeam: false,
              isSearch: false,
              roleId: giftConfig.recipientId,
            }, 5000);
            giftConfig.serverName = (rankroleinfo as any)?.roleInfo?.serverName || "";
            giftConfig.name = (rankroleinfo as any)?.roleInfo?.name || "";
            if (!(rankroleinfo as any)?.roleInfo?.roleId) {
              ctx.log('error', `=== ${ctx.tokenId} 赠送功法残卷失败: 接收者${giftConfig.recipientId}不存在 ===`);
              return;
            }
            giftConfig.quantity = legacyFragmentCount;
          }

          if (legacyFragmentCount < giftConfig.quantity) {
            ctx.log('error', `=== ${ctx.tokenId} 功法残卷不足，当前拥有: ${legacyFragmentCount}，需要: ${giftConfig.quantity} ===`);
            return;
          }

          ctx.log('info', `=== 开始解除安全密码验证 ===`);

          const commitPasswordResp = await ctx.send("role_commitpassword", {
            password: password,
            passwordType: 1,
          }, 5000);

          if (!commitPasswordResp) {
            throw new Error("安全密码验证请求无响应");
          }
          if (!(commitPasswordResp as any).role?.statistics?.["que:wh:tm"]) {
            ctx.log('error', `${ctx.tokenId} === 密码解除失败,请检查密码是否配置正确 ===`);
            return;
          }
          ctx.log('success', `=== 安全密码验证成功 ===`);

          ctx.log('info', `${ctx.tokenId} === 开始赠送功法残卷${giftConfig.quantity}个,目标:[${giftConfig.serverName}] ID:${giftConfig.recipientId} ${giftConfig.name} ===`);

          const legacySendGiftResp = await ctx.send("legacy_sendgift", {
            itemCnt: giftConfig.quantity,
            legacyUIds: [],
            targetId: giftConfig.recipientId,
          }, 5000);

          if (!legacySendGiftResp) {
            throw new Error("赠送请求无响应");
          }

          await ctx.sendNoAck("role_getroleinfo");

          ctx.log('success', `=== ${ctx.tokenId} 成功赠送功法残卷${giftConfig.quantity}个给[${giftConfig.serverName}] ID:${giftConfig.recipientId} ${giftConfig.name} ===`);
          return;
        } catch (error) {
          consecutiveErrors++;
          let errorMsg = (error as Error).message || "未知错误";
          let errorType = "error";

          if (errorMsg.includes("200160")) {
            errorMsg = "模块未开启";
          } else if (errorMsg.includes("timeout")) {
            errorMsg = "请求超时";
            errorType = "warning";
          } else if (errorMsg.includes("网络")) {
            errorMsg = "网络错误";
            errorType = "warning";
          }

          if (consecutiveErrors <= maxRetries && !ctx.shouldStop) {
            ctx.log('warn', `=== ${ctx.tokenId} 赠送功法残卷失败: ${errorMsg}，将在3秒后重试 ===`);
            await ctx.sleep((ctx.delayConfig as any).long);
          } else {
            ctx.log('error', `=== ${ctx.tokenId} 赠送功法残卷失败: ${errorMsg}，已达最大重试次数 ===`);
            throw error;
          }
        }
      }
    } catch (error) {
      ctx.log('error', `批量赠送功法残卷失败: ${(error as Error).message || "未知错误"}`);
      throw error;
    }
  };

  return {
    batchLegacyClaim,
    batchLegacyGiftSendEnhanced,
  };
}
