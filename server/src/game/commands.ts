// @ts-nocheck

const registry = new Map();

const reg = (name, impl) => {
  registry.set(name, impl);
};

reg("lx", null);
reg("x", null);
reg("xtm", null);

export const commands = {
  // 角色/系统
  role_getroleinfo: {
    clientVersion: "2.21.2-fa918e1997301834-wx",
    inviteUid: 0,
    platform: "hortor",
    platformExt: "mix",
    scene: "",
  },
  system_getdatabundlever: { isAudit: false },
  system_buygold: { buyNum: 1 },
  system_claimhangupreward: {},
  system_signinreward: {},
  system_mysharecallback: { isSkipShareCard: true, type: 2 },
  system_custom: { key: "", value: 0 },
  system_sendchatmessage: {},

  // 任务
  task_claimdailypoint: { taskId: 1 },
  task_claimdailyreward: { rewardId: 0 },
  task_claimweekreward: { rewardId: 0 },

  // 好友/招募
  friend_batch: { friendId: 0 },
  hero_recruit: { byClub: false, recruitNumber: 1, recruitType: 3 },
  item_openbox: { itemId: 2001, number: 10 },
  item_batchclaimboxpointreward: {},
  item_openpack: {},
  rank_getserverrank: {},
  rank_getroleinfo: {},

  // 竞技场
  arena_startarea: {},
  fight_startlevel: {},
  arena_getareatarget: { refresh: false },
  arena_getarearank: {},
  fight_startareaarena: {},

  // 商店
  store_goodslist: { storeId: 1 },
  store_buy: { goodsId: 1 },
  store_purchase: { goodsId: 1 },
  store_refresh: { storeId: 1 },

  // 军团
  legion_getinfo: {},
  legion_signin: {},
  legion_getwarrank: {},
  legionwar_getdetails: {},
  legion_storebuygoods: {},
  legion_kickout: {},
  legion_applylist: {},
  legion_approveapply: {},
  legion_refuseapply: {},
  legion_agree: {},
  legion_ignore: {},
  legion_research: {},
  legion_resetresearch: {},
  legion_getinfobyid: {},
  legion_getarearank: {},
  saltroad_getsaltroadwartotalrank: {},
  legionwar_getgoldmonthwarrank: {},
  legion_getopponent: {},
  legion_getbattlefield: {},
  legion_claimpayloadtask: {},
  legion_claimpayloadtaskprogress: {},
  saltroad_getwartype: {},
  saltroad_getsaltroadwargrouprank: {},
  league_getbattlefield: {},
  league_getgroupopponent: {},
  legion_signup: {},

  // 邮件
  mail_getlist: { category: [0, 4, 5], lastId: 0, size: 60 },
  mail_claimallattachment: { category: 0 },
  mail_getmtlinfo: {},
  mail_getmtlshortinfo: {},

  // 学习问答
  study_startgame: {},
  study_answer: {},
  study_claimreward: { rewardId: 1 },

  // 战斗
  fight_starttower: {},
  fight_startboss: {},
  fight_startlegionboss: {},
  fight_startdungeon: {},
  fight_startpvp: {},

  // 怪异咸将塔
  evotower_getinfo: {},
  evotower_fight: {},
  evotower_getlegionjoinmembers: {},
  evotower_readyfight: {},
  evotower_claimreward: {},
  mergebox_getinfo: {},
  mergebox_claimfreeenergy: {},
  mergebox_openbox: {},
  mergebox_automergeitem: { actType: 1 },
  mergebox_mergeitem: { actType: 1 },
  mergebox_claimcostprogress: { actType: 1 },
  mergebox_claimmergeprogress: { actType: 1 },
  evotower_claimtask: { taskId: 1 },

  // 瓶子机器人
  bottlehelper_claim: {},
  bottlehelper_start: { bottleType: -1 },
  bottlehelper_stop: { bottleType: -1 },

  // 军团匹配和签到
  legionmatch_rolesignup: {},
  legion_signin_: {},

  // 钓鱼
  artifact_lottery: { lotteryNumber: 1, newFree: true, type: 1 },
  artifact_exchange: {},

  // 灯神
  genie_sweep: { genieId: 1 },
  genie_buysweep: {},

  // 礼包
  discount_claimreward: { discountId: 1 },
  collection_claimfreereward: {},
  card_claimreward: { cardId: 1 },

  // 爬塔
  tower_getinfo: {},
  tower_claimreward: {},

  // 队伍
  presetteam_getinfo: {},
  presetteam_setteam: {},
  presetteam_saveteam: { teamId: 1 },
  role_gettargetteam: {},
  hero_exchange: {},
  hero_gointobattle: {},
  hero_gobackbattle: {},
  artifact_load: {},
  artifact_unload: {},
  lordweapon_changedefaultweapon: {},
  pearl_replaceskill: {},
  pearl_exchangeskill: {},
  pearl_unloadskill: {},

  // 武将升级
  hero_heroupgradelevel: {},
  hero_heroupgradeorder: {},
  hero_rebirth: {},
  hero_heroupgradestar: {},
  book_upgrade: {},
  book_claimpointreward: {},

  // 梦魇
  nightmare_getroleinfo: {},
  dungeon_selecthero: {},
  bosstower_gethelprank: {},
  dungeon_buymerchant: {},

  // 活动/任务
  activity_get: {},
  activity_recyclewarorderrewardclaim: {},
  legion_getpayloadtask: {},
  legion_getpayloadkillrecord: {},
  legion_getpayloadbf: {},
  legion_getpayloadrecord: {},
  warguess_getrank: {},
  warguess_startguess: {},
  warguess_getguesscoinreward: {},
  legion_payloadsignup: {},

  // 珍宝阁
  collection_goodslist: {},

  // 扭蛋
  gacha_drawreward: { num: 1, isGroup: false },

  // 车辆
  car_getrolecar: {},
  car_refresh: { carId: 0 },
  car_claim: { carId: 0 },
  car_send: { carId: 0, helperId: 0, text: "" },
  car_getmemberhelpingcnt: {},
  car_getmemberrank: {},
  car_research: {},
  car_claimpartconsumereward: {},

  // 功法
  legacy_getinfo: {},
  legacy_claimhangup: {},
  legacy_gift_getlist: {},
  legacy_gift_send: { recipientId: 0, itemId: 0, quantity: 0 },
  legacy_gift_received: {},
  role_commitpassword: { password: "", passwordType: 1 },
  legacy_sendgift: { itemCnt: 0, legacyUIDs: [], targetId: 0 },

  // 装备淬炼
  equipment_confirm: { heroId: 0, part: 0, quenchId: 0, quenches: {} },
  equipment_quench: {
    heroId: 0,
    part: 0,
    quenchId: 0,
    quenches: {},
    seed: 0,
    skipOrange: false,
  },
  equipment_updatequenchlock: { heroId: 0, part: 0, slot: 0, isLocked: false },

  // 咸王宝库
  matchteam_getroleteaminfo: {},
  bosstower_getinfo: {},
  bosstower_startboss: {},
  bosstower_startbox: {},
  discount_getdiscountinfo: {},

  // 换皮闯关
  towers_getinfo: {},
  towers_start: {},
  towers_fight: {},

  // 盐杯竞猜
  saltcup26_getbetinfo: {},
  saltcup26_placebet: { matchId: "", pick: 0 },
  activity_startactegame: { actId: 0 },
};

export function getDefaultBody(cmd: string): Record<string, unknown> {
  const cfg = (commands as Record<string, unknown>)[cmd];
  if (cfg && typeof cfg === "object") return { ...(cfg as Record<string, unknown>) };
  return {};
}

// respCmd → originalCmd(s) mapping for promise resolution
export const responseToCommandMap: Record<string, string | string[]> = {
  fight_startpvpresp: "fight_startpvp",
  activity_getresp: "activity_get",
  collection_goodslistresp: "collection_goodslist",
  collection_claimfreerewardresp: "collection_claimfreereward",
  legion_getarearankresp: "legion_getarearank",
  legionwar_getgoldmonthwarrankresp: "legionwar_getgoldmonthwarrank",
  nightmare_getroleinforesp: "nightmare_getroleinfo",
  studyresp: "study_startgame",
  role_getroleinforesp: "role_getroleinfo",
  hero_recruitresp: "hero_recruit",
  friend_batchresp: "friend_batch",
  system_claimhanguprewardresp: "system_claimhangupreward",
  item_openboxresp: ["item_openbox", "item_batchclaimboxpointreward"],
  bottlehelper_claimresp: "bottlehelper_claim",
  bottlehelper_startresp: "bottlehelper_start",
  bottlehelper_stopresp: "bottlehelper_stop",
  legion_signinresp: "legion_signin",
  fight_startbossresp: "fight_startboss",
  fight_startlegionbossresp: "fight_startlegionboss",
  fight_startareaarenaresp: "fight_startareaarena",
  arena_startarearesp: "arena_startarea",
  arena_getareatargetresp: "arena_getareatarget",
  arena_getarearankresp: "arena_getarearank",
  presetteam_saveteamresp: "presetteam_saveteam",
  presetteam_getinforesp: "presetteam_getinfo",
  mail_claimallattachmentresp: "mail_claimallattachment",
  store_buyresp: "store_purchase",
  system_getdatabundleverresp: "system_getdatabundlever",
  tower_claimrewardresp: "tower_claimreward",
  fight_starttowerresp: "fight_starttower",
  evotowerinforesp: "evotower_getinfo",
  evotower_fightresp: "evotower_fight",
  evotower_getlegionjoinmembersresp: "evotower_getlegionjoinmembers",
  mergeboxinforesp: "mergebox_getinfo",
  mergebox_claimfreeenergyresp: "mergebox_claimfreeenergy",
  mergebox_openboxresp: "mergebox_openbox",
  mergebox_automergeitemresp: "mergebox_automergeitem",
  mergebox_mergeitemresp: "mergebox_mergeitem",
  mergebox_claimcostprogressresp: "mergebox_claimcostprogress",
  mergebox_claimmergeprogressresp: "mergebox_claimmergeprogress",
  evotower_claimtaskresp: "evotower_claimtask",
  item_openpackresp: "item_openpack",
  equipment_quenchresp: "equipment_quench",
  rank_getserverrankresp: "rank_getserverrank",
  legion_claimpayloadtaskresp: "legion_claimpayloadtask",
  legion_claimpayloadtaskprogressresp: "legion_claimpayloadtaskprogress",
  saltroad_getwartyperesp: "saltroad_getwartype",
  saltroad_getsaltroadwartotalrankresp: "saltroad_getsaltroadwartotalrank",
  warguess_getrankresp: "warguess_getrank",
  warguess_startguessresp: "warguess_startguess",
  warguess_getguesscoinrewardresp: "warguess_getguesscoinreward",
  league_getbattlefieldresp: "league_getbattlefield",
  league_getgroupopponentresp: "league_getgroupopponent",
  legion_signupresp: "legion_signup",
  legion_payloadsignupresp: "legion_payloadsignup",
  pearl_replaceskillresp: "pearl_replaceskill",
  pearl_exchangeskillresp: "pearl_exchangeskill",
  pearl_unloadskillresp: "pearl_unloadskill",
  matchteam_getroleteaminforesp: "matchteam_getroleteaminfo",
  bosstower_getinforesp: "bosstower_getinfo",
  bosstower_startbossresp: "bosstower_startboss",
  bosstower_startboxresp: "bosstower_startbox",
  discount_getdiscountinforesp: "discount_getdiscountinfo",
  hero_heroupgradestarresp: "hero_heroupgradestar",
  hero_heroupgradelevelresp: "hero_heroupgradelevel",
  hero_heroupgradeorderresp: "hero_heroupgradeorder",
  book_upgraderesp: "book_upgrade",
  book_claimpointrewardresp: "book_claimpointreward",
  legion_getinforesp: "legion_getinfo",
  legion_getinforresp: "legion_getinfo",
  car_getrolecarresp: "car_getrolecar",
  car_refreshresp: "car_refresh",
  car_claimresp: "car_claim",
  car_sendresp: "car_send",
  car_getmemberhelpingcntresp: "car_getmemberhelpingcnt",
  car_getmemberrankresp: "car_getmemberrank",
  car_researchresp: "car_research",
  car_claimpartconsumerewardresp: "car_claimpartconsumereward",
  role_gettargetteamresp: "role_gettargetteam",
  activity_warorderclaimresp: "activity_recyclewarorderrewardclaim",
  arena_getarearankresp: "arena_getarearank",
  bosstower_gethelprankresp: "bosstower_gethelprank",
  legacy_getinforesp: "legacy_getinfo",
  legacy_claimhangupresp: "legacy_claimhangup",
  legacy_sendgiftresp: "legacy_sendgift",
  legacy_getgiftsresp: "legacy_getgifts",
  saltcup26_getbetinforesp: "saltcup26_getbetinfo",
  saltcup26_placebetresp: "saltcup26_placebet",
  activity_takeegamerewardresp: "activity_startactegame",
  towers_getinforesp: "towers_getinfo",
  towers_startresp: "towers_start",
  towers_fightresp: "towers_fight",
  task_claimdailyrewardresp: "task_claimdailyreward",
  task_claimweekrewardresp: "task_claimweekreward",
  legion_researchresp: ["legion_research", "legion_resetresearch"],
  syncresp: [
    "system_mysharecallback",
    "task_claimdailypoint",
    "role_commitpassword",
    "hero_gointobattle",
    "hero_gobackbattle",
    "lordweapon_changedefaultweapon",
  ],
  syncrewardresp: [
    "system_buygold",
    "discount_claimreward",
    "card_claimreward",
    "artifact_lottery",
    "genie_sweep",
    "genie_buysweep",
    "system_signinreward",
    "dungeon_selecthero",
    "artifact_exchange",
    "hero_exchange",
    "hero_rebirth",
  ],
};

export const errorCodeMap: Record<number, string> = {
  700010: "任务未达成完成条件",
  1400010: "没有购买该月卡,不能领取每日奖励",
  12000116: "今日已领取免费奖励",
  3300060: "扫荡条件不满足",
  1300050: "请修改您的采购次数",
  200020: "出了点小问题，请尝试重启游戏解决～",
  200160: "模块未开启",
  7500140: "请先输入密码",
  7500100: "密码输入错误",
  7500120: "密码输入错误次数已达上限",
  200400: "操作太快，请稍后再试",
  200760: "您当前看到的界面已发生变化，请重新登录",
  2300190: "今天已经签到过了",
  2300370: "俱乐部商品购买数量超出上限",
  400000: "物品不存在",
  1500020: "能量不足",
  2300070: "未加入俱乐部",
  3500020: "没有可领取的奖励",
  12000050: "今日发车次数已达上限",
  12000060: "不在发车时间内",
  400190: "没有可领取的签到奖励",
  1000020: "今天已经领取过奖励了",
  3300050: "购买数量超出限制",
  700020: "已经领取过这个任务",
  12400000: "挂机奖励领取过于频繁",
  2300250: "俱乐部BOSS今日攻打次数已用完",
  400010: "物品数量不足",
  7900023: "已达到使用次数上限",
  12300040: "没有空格子了",
  12300080: "未达到解锁条件",
  200330: "无效的ID",
  1500040: "上座塔的奖励未领取",
  1500010: "已经全部通关",
};

export const cmdDebounceMap: Record<string, number> = {
  role_getroleinfo: 1000,
  system_claimhangupreward: 1000,
  system_getdatabundlever: 1000,
};