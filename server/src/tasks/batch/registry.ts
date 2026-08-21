import { BatchContext } from './context.js';
import { createTasksBottle } from './tasksBottle.js';
import { createTasksItem } from './tasksItem.js';
import { createTasksHangUp } from './tasksHangUp.js';
import { createTasksTower } from './tasksTower.js';
import { createTasksCar } from './tasksCar.js';
import { createTasksDungeon } from './tasksDungeon.js';
import { createTasksArena } from './tasksArena.js';
import { createTasksStore } from './tasksStore.js';
import { createTasksLegacy } from './tasksLegacy.js';
import { createTasksFootball } from './tasksFootball.js';

/**
 * 将 selectedTasks 的 value 分发到对应工厂方法（单账号，ctx 已绑定当前 token）。
 * 各工厂方法只针对 ctx.tokenId 运行，token 循环与连接由 executor 负责。
 */
export async function dispatchSelectedTasks(ctx: BatchContext, selectedTasks: string[]): Promise<void> {
  const factories = {
    item: createTasksItem(ctx),
    hangUp: createTasksHangUp(ctx),
    bottle: createTasksBottle(ctx),
    tower: createTasksTower(ctx),
    car: createTasksCar(ctx),
    dungeon: createTasksDungeon(ctx),
    arena: createTasksArena(ctx),
    store: createTasksStore(ctx),
    legacy: createTasksLegacy(ctx),
    football: createTasksFootball(ctx),
  };

  const methodMap: Record<string, (() => Promise<void>) | undefined> = {
    // item
    batchOpenBox: factories.item.batchOpenBox,
    batchOpenBoxByPoints: factories.item.batchOpenBoxByPoints,
    batchClaimBoxPointReward: factories.item.batchClaimBoxPointReward,
    batchFish: factories.item.batchFish,
    batchRecruit: factories.item.batchRecruit,
    batchClaimPeachTasks: factories.item.batchClaimPeachTasks,
    batchGenieSweep: factories.item.batchGenieSweep,
    // hangUp
    claimHangUpRewards: factories.hangUp.claimHangUpRewards,
    batchAddHangUpTime: factories.hangUp.batchAddHangUpTime,
    batchStudy: factories.hangUp.batchStudy,
    batchclubsign: factories.hangUp.batchclubsign,
    // bottle
    resetBottles: factories.bottle.resetBottles,
    batchlingguanzi: factories.bottle.batchlingguanzi,
    // tower
    climbTower: factories.tower.climbTower,
    climbWeirdTower: factories.tower.climbWeirdTower,
    batchClaimFreeEnergy: factories.tower.batchClaimFreeEnergy,
    skinChallenge: factories.tower.skinChallenge,
    batchUseItems: factories.tower.batchUseItems,
    batchMergeItems: factories.tower.batchMergeItems,
    // car
    batchSmartSendCar: factories.car.batchSmartSendCar,
    batchClaimCars: factories.car.batchClaimCars,
    // dungeon
    batchbaoku13: factories.dungeon.batchbaoku13,
    batchbaoku45: factories.dungeon.batchbaoku45,
    batchmengjing: factories.dungeon.batchmengjing,
    batchBuyDreamItems: factories.dungeon.batchBuyDreamItems,
    // arena
    batcharenafight: factories.arena.batcharenafight,
    batchTopUpFish: factories.arena.batchTopUpFish,
    batchTopUpArena: factories.arena.batchTopUpArena,
    // store
    legion_storebuygoods: factories.store.legion_storebuygoods,
    store_purchase: factories.store.store_purchase,
    collection_claimfreereward: factories.store.collection_claimfreereward,
    // legacy
    batchLegacyClaim: factories.legacy.batchLegacyClaim,
    batchLegacyGiftSendEnhanced: factories.legacy.batchLegacyGiftSendEnhanced,
    // football
    batchFootballBet: factories.football.batchFootballBet,
  };

  for (const value of selectedTasks) {
    if (ctx.shouldStop) break;
    const fn = methodMap[value];
    if (!fn) {
      ctx.log('warn', `未找到操作: ${value}，跳过`);
      continue;
    }
    try {
      ctx.log('info', `执行: ${value}`);
      await fn();
    } catch (e) {
      ctx.log('error', `${value} 执行失败: ${(e as Error).message}`);
    }
  }
}
