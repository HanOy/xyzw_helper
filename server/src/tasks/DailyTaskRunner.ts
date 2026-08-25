import { connectionPool } from '../game/poolSingleton.js';
import { tokenService } from '../token/TokenService.js';
import { createRun, taskLog, taskProgress, updateRun, isCancelled } from './runState.js';
import { logger } from '../logger.js';

const log = logger.child({ mod: 'daily' });

function pickArenaTargetId(targets: any): string | number | null {
  if (!targets) return null;
  if (Array.isArray(targets)) {
    const candidate = targets[0];
    return candidate?.roleId ?? candidate?.id ?? candidate?.targetId ?? null;
  }
  const candidate =
    targets?.rankList?.[0] ??
    targets?.roleList?.[0] ??
    targets?.targets?.[0] ??
    targets?.targetList?.[0] ??
    targets?.list?.[0];
  if (candidate) {
    if (candidate.roleId) return candidate.roleId;
    if (candidate.id) return candidate.id;
    if (candidate.targetId) return candidate.targetId;
  }
  return targets?.roleId ?? targets?.id ?? targets?.targetId ?? null;
}

function isTodayAvailable(statisticsTime: unknown): boolean {
  if (!statisticsTime) return true;
  const today = new Date().toDateString();
  const recordDate = new Date((Number(statisticsTime) || 0) * 1000).toDateString();
  return today !== recordDate;
}

const DAY_BOSS_MAP = [9904, 9905, 9901, 9902, 9903, 9904, 9905];

export interface DailyTaskSettings {
  arenaFormation?: number;
  bossFormation?: number;
  bossTimes?: number;
  claimBottle?: boolean;
  payRecruit?: boolean;
  openBox?: boolean;
  arenaEnable?: boolean;
  claimHangUp?: boolean;
  claimEmail?: boolean;
  blackMarketPurchase?: boolean;
  freeGachaEnable?: boolean;
  commandDelay?: number;
  taskDelay?: number;
}

const DEFAULT_SETTINGS: Required<DailyTaskSettings> = {
  arenaFormation: 1,
  bossFormation: 1,
  bossTimes: 2,
  claimBottle: true,
  payRecruit: true,
  openBox: true,
  arenaEnable: true,
  claimHangUp: true,
  claimEmail: true,
  blackMarketPurchase: true,
  freeGachaEnable: true,
  commandDelay: 500,
  taskDelay: 500,
};

async function execCmd(
  runId: string,
  tokenId: string,
  cmd: string,
  params: Record<string, unknown>,
  description: string,
  timeout = 8000,
): Promise<unknown> {
  taskLog({ runId, tokenId, level: 'info', message: `执行: ${description}` });
  try {
    const result = await connectionPool.send(tokenId, cmd, params, timeout);
    await sleep(500);
    taskLog({ runId, tokenId, level: 'info', message: `${description} - 成功` });
    return result;
  } catch (err) {
    const token = tokenService.get(tokenId);
    const name = token?.name ?? tokenId;
    taskLog({
      runId,
      tokenId,
      level: 'error',
      message: `[${name}] ${description} - 失败: ${(err as Error).message}`,
    });
    throw err;
  }
}

async function switchFormation(
  runId: string,
  tokenId: string,
  targetFormation: number,
  formationName: string,
): Promise<boolean> {
  taskLog({ runId, tokenId, level: 'info', message: `检查${formationName}配置...` });
  try {
    const teamInfo = (await execCmd(
      runId,
      tokenId,
      'presetteam_getinfo',
      {},
      '获取阵容信息',
    )) as any;
    const currentFormation = teamInfo?.presetTeamInfo?.useTeamId;
    taskLog({ runId, tokenId, level: 'info', message: `当前阵容: ${currentFormation}` });
    if (currentFormation === targetFormation) {
      taskLog({
        runId,
        tokenId,
        level: 'info',
        message: `当前已是${formationName}${targetFormation}，无需切换`,
      });
      return false;
    }
    taskLog({
      runId,
      tokenId,
      level: 'info',
      message: `当前阵容: ${currentFormation}, 目标阵容: ${targetFormation}，开始切换...`,
    });
    await execCmd(runId, tokenId, 'presetteam_saveteam', { teamId: targetFormation }, `切换到${formationName}${targetFormation}`);
    taskLog({ runId, tokenId, level: 'info', message: `成功切换到${formationName}${targetFormation}` });
    return true;
  } catch (err) {
    taskLog({
      runId,
      tokenId,
      level: 'warn',
      message: `阵容检查失败，尝试强制切换: ${(err as Error).message}`,
    });
    try {
      await execCmd(runId, tokenId, 'presetteam_saveteam', { teamId: targetFormation }, `强制切换到${formationName}${targetFormation}`);
      return true;
    } catch (err2) {
      taskLog({ runId, tokenId, level: 'error', message: `强制切换也失败: ${(err2 as Error).message}` });
      throw err2;
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function runDailyTasks(tokenId: string, customSettings?: DailyTaskSettings): Promise<string> {
  const runId = createRun({ type: 'daily', tokenId, settings: { ...(customSettings ?? {}) } });
  const settings = { ...DEFAULT_SETTINGS, ...(customSettings ?? {}) };
  updateRun(runId, { status: 'running', startedAt: new Date().toISOString(), total: 0 });

  try {
    const meta = tokenService.toConnectionMeta(tokenId);
    if (!meta) throw new Error('token 不存在');
    await connectionPool.ensureConnection(meta);

    taskLog({ runId, tokenId, level: 'info', message: '正在获取角色信息...' });
    const roleInfoResp = (await connectionPool.send(tokenId, 'role_getroleinfo', {}, 8000)) as any;
    taskLog({ runId, tokenId, level: 'info', message: '角色信息获取成功' });

    const roleData = roleInfoResp?.role;
    if (!roleData) throw new Error('角色数据不存在');

    taskLog({ runId, tokenId, level: 'info', message: '开始执行每日任务补差' });

    let originalFormation: number | null = null;
    try {
      taskLog({ runId, tokenId, level: 'info', message: '读取当前阵容信息...' });
      const teamInfo = (await execCmd(runId, tokenId, 'presetteam_getinfo', {}, '获取当前阵容信息')) as any;
      originalFormation = teamInfo?.presetTeamInfo?.useTeamId ?? null;
      taskLog({ runId, tokenId, level: 'info', message: `当前阵容: ${originalFormation}` });
    } catch (err) {
      taskLog({ runId, tokenId, level: 'warn', message: `读取当前阵容失败: ${(err as Error).message}` });
    }

    const completedTasks = roleData.dailyTask?.complete ?? {};
    const isTaskCompleted = (taskId: number) => completedTasks[taskId] === -1;
    const statistics = roleData.statistics ?? {};
    const statisticsTime = roleData.statisticsTime ?? {};

    type Step = { name: string; run: () => Promise<unknown> };
    const steps: Step[] = [];

    if (!isTaskCompleted(2)) {
      steps.push({
        name: '分享一次游戏',
        run: () =>
          execCmd(runId, tokenId, 'system_mysharecallback', { isSkipShareCard: true, type: 2 }, '分享游戏'),
      });
    }
    if (!isTaskCompleted(3)) {
      steps.push({
        name: '赠送好友金币',
        run: () => execCmd(runId, tokenId, 'friend_batch', {}, '赠送好友金币'),
      });
    }
    if (!isTaskCompleted(4)) {
      steps.push({
        name: '免费招募',
        run: () =>
          execCmd(runId, tokenId, 'hero_recruit', { recruitType: 3, recruitNumber: 1 }, '免费招募'),
      });
      if (settings.payRecruit) {
        steps.push({
          name: '付费招募',
          run: () =>
            execCmd(runId, tokenId, 'hero_recruit', { recruitType: 1, recruitNumber: 1 }, '付费招募'),
        });
      }
    }
    if (!isTaskCompleted(6) && isTodayAvailable(statisticsTime['buy:gold'])) {
      for (let i = 0; i < 3; i++) {
        steps.push({
          name: `免费点金 ${i + 1}/3`,
          run: () => execCmd(runId, tokenId, 'system_buygold', { buyNum: 1 }, `免费点金 ${i + 1}`),
        });
      }
    }
    if (!isTaskCompleted(5) && settings.claimHangUp) {
      steps.push({
        name: '领取挂机奖励',
        run: () => execCmd(runId, tokenId, 'system_claimhangupreward', {}, '领取挂机奖励'),
      });
      for (let i = 0; i < 4; i++) {
        steps.push({
          name: `挂机加钟 ${i + 1}/4`,
          run: () =>
            execCmd(runId, tokenId, 'system_mysharecallback', { isSkipShareCard: true, type: 2 }, `挂机加钟 ${i + 1}`),
        });
      }
    }
    if (!isTaskCompleted(7) && settings.openBox) {
      steps.push({
        name: '开启木质宝箱',
        run: () => execCmd(runId, tokenId, 'item_openbox', { itemId: 2001, number: 10 }, '开启木质宝箱10个'),
      });
    }

    steps.push({
      name: '停止盐罐计时',
      run: () => execCmd(runId, tokenId, 'bottlehelper_stop', {}, '停止盐罐计时'),
    });
    steps.push({
      name: '开始盐罐计时',
      run: () => execCmd(runId, tokenId, 'bottlehelper_start', {}, '开始盐罐计时'),
    });
    if (!isTaskCompleted(14) && settings.claimBottle) {
      steps.push({
        name: '领取盐罐奖励',
        run: () => execCmd(runId, tokenId, 'bottlehelper_claim', {}, '领取盐罐奖励'),
      });
    }

    if (!isTaskCompleted(13) && settings.arenaEnable) {
      steps.push({
        name: '竞技场战斗',
        run: async () => {
          taskLog({ runId, tokenId, level: 'info', message: '开始竞技场战斗流程' });
          const hour = new Date().getHours();
          if (hour < 6 || hour > 22) {
            taskLog({ runId, tokenId, level: 'warn', message: '当前时间不在竞技场战斗时段' });
            return;
          }
          await switchFormation(runId, tokenId, settings.arenaFormation!, '竞技场阵容');
          await execCmd(runId, tokenId, 'arena_startarea', {}, '开始竞技场');
          let battleVersion = 240475;
          try {
            const levelRes = (await execCmd(
              runId,
              tokenId,
              'fight_startlevel',
              {},
              '获取战斗版本',
              8000,
            )) as { battleData?: { version?: number } } | null;
            if (levelRes?.battleData?.version) battleVersion = levelRes.battleData.version;
          } catch {}

          for (let i = 1; i <= 3; i++) {
            taskLog({ runId, tokenId, level: 'info', message: `竞技场战斗 ${i}/3` });
            let targets: unknown;
            try {
              targets = await execCmd(runId, tokenId, 'arena_getareatarget', {}, `获取竞技场目标${i}`);
            } catch (err) {
              taskLog({ runId, tokenId, level: 'error', message: `获取对手失败: ${(err as Error).message}` });
              break;
            }
            const targetId = pickArenaTargetId(targets);
            if (targetId !== null && targetId !== undefined) {
              await execCmd(runId, tokenId, 'fight_startareaarena', { targetId, battleVersion }, `竞技场战斗${i}`, 10000);
            } else {
              taskLog({ runId, tokenId, level: 'warn', message: `未找到目标` });
            }
            await sleep(1000);
          }
        },
      });
    }

    if (settings.bossTimes! > 0) {
      let alreadyLegionBoss = statistics['legion:boss'] ?? 0;
      if (isTodayAvailable(statisticsTime['legion:boss'])) {
        alreadyLegionBoss = 0;
      }
      const remainingLegionBoss = Math.max(settings.bossTimes! - alreadyLegionBoss, 0);
      if (remainingLegionBoss > 0) {
        steps.push({
          name: '军团BOSS阵容检查',
          run: () => switchFormation(runId, tokenId, settings.bossFormation!, 'BOSS阵容'),
        });
        for (let i = 0; i < remainingLegionBoss; i++) {
          steps.push({
            name: `军团BOSS ${i + 1}/${remainingLegionBoss}`,
            run: () => execCmd(runId, tokenId, 'fight_startlegionboss', {}, `军团BOSS ${i + 1}`, 12000),
          });
        }
      }
    }

    const todayBossId = DAY_BOSS_MAP[new Date().getDay()];
    steps.push({
      name: '每日BOSS阵容检查',
      run: () => switchFormation(runId, tokenId, settings.bossFormation!, 'BOSS阵容'),
    });
    for (let i = 0; i < 3; i++) {
      steps.push({
        name: `每日BOSS ${i + 1}/3`,
        run: () => execCmd(runId, tokenId, 'fight_startboss', { bossId: todayBossId }, `每日BOSS ${i + 1}`, 12000),
      });
    }

    const fixedRewards = [
      { name: '福利签到', cmd: 'system_signinreward' },
      { name: '俱乐部', cmd: 'legion_signin' },
      { name: '领取每日礼包', cmd: 'discount_claimreward' },
      { name: '领取每日免费奖励', cmd: 'collection_claimfreereward' },
      { name: '领取免费礼包', cmd: 'card_claimreward' },
      { name: '领取永久卡礼包', cmd: 'card_claimreward', params: { cardId: 4003 } },
    ];
    if (settings.claimEmail) {
      fixedRewards.push({ name: '领取邮件奖励', cmd: 'mail_claimallattachment' });
    }
    for (const r of fixedRewards) {
      steps.push({
        name: r.name,
        run: () => execCmd(runId, tokenId, r.cmd, (r as any).params ?? {}, r.name),
      });
    }

    steps.push({ name: '珍宝阁商品列表', run: () => execCmd(runId, tokenId, 'collection_goodslist', {}, '珍宝阁商品列表') });
    steps.push({ name: '珍宝阁免费礼包', run: () => execCmd(runId, tokenId, 'collection_claimfreereward', {}, '珍宝阁免费礼包') });

    if (settings.freeGachaEnable !== false && isTodayAvailable(statisticsTime['gacha:free'])) {
      steps.push({
        name: '免费扭蛋',
        run: () => execCmd(runId, tokenId, 'gacha_drawreward', { num: 1, isGroup: false }, '免费扭蛋'),
      });
    }

    if (isTodayAvailable(statistics['artifact:normal:lottery:time'])) {
      for (let i = 0; i < 3; i++) {
        steps.push({
          name: `免费钓鱼 ${i + 1}/3`,
          run: () => execCmd(runId, tokenId, 'artifact_lottery', { lotteryNumber: 1, newFree: true, type: 1 }, `免费钓鱼 ${i + 1}`),
        });
      }
    }

    const kingdoms = ['魏国', '蜀国', '吴国', '群雄'];
    for (let gid = 1; gid <= 4; gid++) {
      if (isTodayAvailable(statisticsTime[`genie:daily:free:${gid}`])) {
        steps.push({
          name: `${kingdoms[gid - 1]}灯神免费扫荡`,
          run: () => execCmd(runId, tokenId, 'genie_sweep', { genieId: gid }, `${kingdoms[gid - 1]}灯神免费扫荡`),
        });
      }
    }

    for (let i = 0; i < 3; i++) {
      steps.push({
        name: `领取免费扫荡卷 ${i + 1}/3`,
        run: () => execCmd(runId, tokenId, 'genie_buysweep', {}, `领取免费扫荡卷 ${i + 1}`),
      });
    }

    if (!isTaskCompleted(12) && settings.blackMarketPurchase) {
      steps.push({
        name: '黑市购买1次物品',
        run: () => execCmd(runId, tokenId, 'store_purchase', { goodsId: 1 }, '黑市购买1次物品'),
      });
    }

    const mengyandayOfWeek = new Date().getDay();
    if ([0, 1, 3, 4].includes(mengyandayOfWeek)) {
      const mjbattleTeam = { 0: 107 };
      steps.push({
        name: '咸王梦境',
        run: () => execCmd(runId, tokenId, 'dungeon_selecthero', { battleTeam: mjbattleTeam }, '咸王梦境'),
      });
    }

    if (mengyandayOfWeek === 1 && isTodayAvailable(statisticsTime['genie:daily:free:5'])) {
      steps.push({
        name: '深海灯神',
        run: () => execCmd(runId, tokenId, 'genie_sweep', { genieId: 5, sweepCnt: 1 }, '深海灯神'),
      });
    }

    if (originalFormation !== null) {
      steps.push({
        name: '阵容还原',
        run: () => switchFormation(runId, tokenId, originalFormation!, '初始阵容'),
      });
    }

    for (let taskId = 1; taskId <= 10; taskId++) {
      steps.push({
        name: `领取任务奖励${taskId}`,
        run: () => execCmd(runId, tokenId, 'task_claimdailypoint', { taskId }, `领取任务奖励${taskId}`, 5000),
      });
    }

    steps.push({ name: '领取日常任务奖励', run: () => execCmd(runId, tokenId, 'task_claimdailyreward', {}, '领取日常任务奖励') });
    steps.push({ name: '领取周常任务奖励', run: () => execCmd(runId, tokenId, 'task_claimweekreward', {}, '领取周常任务奖励') });
    steps.push({
      name: '领取通行证奖励',
      run: () => execCmd(runId, tokenId, 'activity_recyclewarorderrewardclaim', { actId: 1 }, '领取通行证奖励'),
    });

    updateRun(runId, { total: steps.length });
    taskLog({ runId, tokenId, level: 'info', message: `共有 ${steps.length} 个任务待执行` });

    for (let i = 0; i < steps.length; i++) {
      if (isCancelled(runId)) {
        taskLog({ runId, tokenId, level: 'warn', message: '任务被取消' });
        updateRun(runId, { status: 'cancelled', finishedAt: new Date().toISOString() });
        return runId;
      }
      const step = steps[i];
      try {
        await step.run();
        taskProgress(runId, i + 1, steps.length, step.name);
      } catch (err) {
        taskLog({ runId, tokenId, level: 'error', message: `任务执行失败: ${step.name} - ${(err as Error).message}` });
      }
      await sleep(settings.taskDelay!);
    }

    taskProgress(runId, steps.length, steps.length);
    taskLog({ runId, tokenId, level: 'info', message: '所有任务执行完成' });
    updateRun(runId, { status: 'success', finishedAt: new Date().toISOString() });
  } catch (err) {
    log.error({ err: (err as Error).message }, 'daily run failed');
    taskLog({ runId, tokenId, level: 'error', message: (err as Error).message });
    updateRun(runId, { status: 'failed', finishedAt: new Date().toISOString(), error: (err as Error).message });
  }
  return runId;
}