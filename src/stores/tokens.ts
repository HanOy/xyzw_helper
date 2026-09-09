import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { useLocalStorage } from '@vueuse/core';
import { api, setStoredToken, getStoredToken, type ApiToken } from '../api';
import { useSseStream } from '../composables/useSseStream';
import { isInCurrentWeek } from '../utils/base';

export interface TokenGroup {
  id: string;
  name: string;
  color: string;
  tokenIds: string[];
  createdAt?: string;
  updatedAt?: string;
}

export const tokenGroups = useLocalStorage<TokenGroup[]>('tokenGroups', []);

// ===== 查询命令缓存(sessionStorage, 关页面即失效) =====
const READ_ONLY_CMDS = new Set([
  'role_getroleinfo',
  'presetteam_getinfo',
  'presetteam_getteaminfo',
  'tower_getinfo',
  'evotower_getinfo',
  'legion_getinfo',
  'legion_getarearank',
  'store_goodslist',
  'activity_get',
]);

const READ_CACHE_PREFIX = 'read-cache:';
const READ_CACHE_LRU_MAX = 20;

// role_getroleinfo 全局快照: 所有 token 共享, 用于阻断前端任何循环导致的反复 POST
// (无论有多少个组件/卡片调 sendMessageWithPromise('role_getroleinfo'), 都直接返回这份快照,
//  且任何"写快照"的动作 (routeGameEvent/真实网络响应) 都会更新它)
let roleInfoSnapshot: { data: unknown; at: number } | null = null;
const ROLE_INFO_SNAPSHOT_TTL_MS = 30_000;

function readCacheKey(
  tokenId: string,
  cmd: string,
  params?: Record<string, unknown>,
): string {
  // role_getroleinfo 全局共享一个缓存 key
  const keyId = cmd === 'role_getroleinfo' ? '__global__' : tokenId;
  return `${READ_CACHE_PREFIX}${keyId}:${cmd}:${JSON.stringify(params ?? {})}`;
}

function getCachedRead(
  tokenId: string,
  cmd: string,
  params?: Record<string, unknown>,
): unknown | null {
  if (!READ_ONLY_CMDS.has(cmd)) return null;
  try {
    const raw = sessionStorage.getItem(readCacheKey(tokenId, cmd, params));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function setCachedRead(
  tokenId: string,
  cmd: string,
  params: Record<string, unknown> | undefined,
  data: unknown,
): void {
  if (!READ_ONLY_CMDS.has(cmd) || data === undefined) return;
  const k = readCacheKey(tokenId, cmd, params);
  try {
    sessionStorage.setItem(k, JSON.stringify(data));
    // role_getroleinfo 走全局 bucket, 用 __global__ 标识
    const cacheKey = cmd === 'role_getroleinfo' ? '__global__' : tokenId;
    const prefix = `${READ_CACHE_PREFIX}${cacheKey}:`;
    const matched = Object.keys(sessionStorage).filter((x) => x.startsWith(prefix));
    if (matched.length > READ_CACHE_LRU_MAX) {
      matched
        .slice(0, matched.length - READ_CACHE_LRU_MAX)
        .forEach((x) => sessionStorage.removeItem(x));
    }
  } catch {
    // ignore quota / serialization errors
  }
}

/** 清除指定 token 的查询缓存; 不传 tokenId 则清除全部 */
export function clearReadCache(tokenId?: string): void {
  if (tokenId) {
    const prefix = `${READ_CACHE_PREFIX}${tokenId}:`;
    Object.keys(sessionStorage)
      .filter((k) => k.startsWith(prefix))
      .forEach((k) => sessionStorage.removeItem(k));
  } else {
    Object.keys(sessionStorage)
      .filter((k) => k.startsWith(READ_CACHE_PREFIX))
      .forEach((k) => sessionStorage.removeItem(k));
  }
}

const inflightReads = new Map<string, Promise<unknown>>();
const inflightKeyOf = (
  tokenId: string,
  cmd: string,
  params?: Record<string, unknown>,
): string => `${tokenId}:${cmd}:${JSON.stringify(params ?? {})}`;

export const useTokensStore = defineStore('tokens', () => {
  const tokens = ref<ApiToken[]>([]);
  const selectedTokenId = ref<string>(localStorage.getItem('selectedTokenId') ?? '');
  const loading = ref(false);
  const connectionStatus = ref<Record<string, string>>({});
  const logs = ref<Array<{ id: number; runId: string; tokenId?: string; level: string; message: string; ts: string }>>([]);
  const wsConnections = ref<Record<string, { status: string; lastError: unknown }>>({});
  const battleVersion = ref<unknown>(null);
  const gameDataByToken = ref<Record<string, Record<string, unknown>>>({});

  // 游戏数据按 token 分桶, gameData 恒为「当前选中账号」的切片
  const gameData = computed<Record<string, unknown>>(
    () => gameDataByToken.value[selectedTokenId.value] ?? {},
  );

  function ensureGameData(tokenId: string): Record<string, unknown> {
    let slot = gameDataByToken.value[tokenId];
    if (!slot) {
      slot = {};
      gameDataByToken.value[tokenId] = slot;
    }
    return slot;
  }

  const hasTokens = computed(() => tokens.value.length > 0);
  const gameTokens = computed<ApiToken[]>(() => tokens.value);
  const selectedToken = computed(() => tokens.value.find((t) => t.id === selectedTokenId.value) ?? null);
  const selectedTokenRoleInfo = computed(() => gameData.value.roleInfo ?? null);

  const { lastEvent } = useSseStream({
    onEvent: (evt) => {
      if (evt.type === 'ws.status') {
        connectionStatus.value[evt.tokenId] = evt.status;
        const cur = (wsConnections.value[evt.tokenId] ??= { status: 'disconnected', lastError: null });
        cur.status = evt.status;
        if (evt.status === 'error') cur.lastError = evt.error ?? new Error('连接错误');
        const t = tokens.value.find((x) => x.id === evt.tokenId);
        if (t) t.status = evt.status as ApiToken['status'];
      } else if (evt.type === 'game.event') {
        const msg = evt.msg as Record<string, unknown>;
        routeGameEvent(evt.tokenId, msg);
        // 游戏服主动推送意味着该 token 状态变化, 清掉查询缓存让下次主动拉取拿到最新数据
        clearReadCache(evt.tokenId);
      } else if (evt.type === 'task.log') {
        logs.value.push({
          id: logs.value.length + 1,
          runId: evt.runId,
          tokenId: evt.tokenId,
          level: evt.level,
          message: evt.message,
          ts: evt.ts,
        });
        if (logs.value.length > 1000) logs.value.splice(0, 100);
      } else if (evt.type === 'token.refresh_suggested') {
        // 后端检测到该 token 续期需要 (例如握手失败), 触发自动续期
        void attemptTokenRefresh(evt.tokenId);
      }
    },
  });

  function setSelectedToken(id: string): void {
    selectedTokenId.value = id;
    // 用 sessionStorage: 关页面即失效, 不会跨日/跨页面反复触发对同一 token 的命令
    sessionStorage.setItem('selectedTokenId', id);
  }

  async function refresh(): Promise<void> {
    loading.value = true;
    try {
      const resp = await api.tokens.list();
      tokens.value = resp.data ?? [];
      for (const t of tokens.value) {
        if (t.status) connectionStatus.value[t.id] = t.status;
        if (t.status) (wsConnections.value[t.id] ??= { status: t.status, lastError: null }).status = t.status;
      }
    } finally {
      loading.value = false;
    }
  }

  async function importToken(payload: unknown): Promise<ApiToken[]> {
    const resp = await api.tokens.create(payload);
    await refresh();
    return resp.data;
  }

  async function removeToken(id: string): Promise<void> {
    await api.tokens.delete(id);
    if (selectedTokenId.value === id) setSelectedToken('');
    await refresh();
  }

  async function updateToken(id: string, patch: Record<string, unknown>): Promise<void> {
    await api.tokens.update(id, patch);
    await refresh();
  }

  async function connect(id: string): Promise<void> {
    await api.tokens.connect(id);
    await refresh();
  }

  async function disconnect(id: string): Promise<void> {
    await api.tokens.disconnect(id);
    await refresh();
  }

  async function refreshTokenByUrl(id: string): Promise<void> {
    await api.tokens.refresh(id);
    await refresh();
  }

  function getWebSocketStatus(id: string): string {
    return connectionStatus.value[id] ?? 'disconnected';
  }

  function createTokenGroup(name: string, color = '#1677ff'): TokenGroup {
    const group: TokenGroup = {
      id: 'group_' + Date.now() + Math.random().toString(36).slice(2),
      name,
      color,
      tokenIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    tokenGroups.value.push(group);
    return group;
  }

  function deleteTokenGroup(groupId: string): void {
    const index = tokenGroups.value.findIndex((g) => g.id === groupId);
    if (index !== -1) tokenGroups.value.splice(index, 1);
  }

  function updateTokenGroup(groupId: string, updates: Partial<TokenGroup>): void {
    const group = tokenGroups.value.find((g) => g.id === groupId);
    if (group) Object.assign(group, updates, { updatedAt: new Date().toISOString() });
  }

  function addTokenToGroup(groupId: string, tokenId: string): void {
    const group = tokenGroups.value.find((g) => g.id === groupId);
    if (group && !group.tokenIds.includes(tokenId)) {
      group.tokenIds.push(tokenId);
      group.updatedAt = new Date().toISOString();
    }
  }

  function removeTokenFromGroup(groupId: string, tokenId: string): void {
    const group = tokenGroups.value.find((g) => g.id === groupId);
    if (group) {
      const index = group.tokenIds.indexOf(tokenId);
      if (index !== -1) {
        group.tokenIds.splice(index, 1);
        group.updatedAt = new Date().toISOString();
      }
    }
  }

  function getTokenGroups(tokenId: string): TokenGroup[] {
    return tokenGroups.value.filter((g) => g.tokenIds.includes(tokenId));
  }

  function getGroupTokenIds(groupId: string): string[] {
    const group = tokenGroups.value.find((g) => g.id === groupId);
    return group ? group.tokenIds : [];
  }

  function getValidGroupTokenIds(groupId: string): string[] {
    const valid = new Set(tokens.value.map((t) => t.id));
    return getGroupTokenIds(groupId).filter((id) => valid.has(id));
  }

  function cleanupInvalidTokens(): void {
    const valid = new Set(tokens.value.map((t) => t.id));
    tokenGroups.value.forEach((group) => {
      group.tokenIds = group.tokenIds.filter((id) => valid.has(id));
    });
  }

  function initTokenStore(): Promise<void> {
    return refresh();
  }

  async function createWebSocketConnection(_id: string, _token?: string, _wsUrl?: string): Promise<void> {
    await connect(_id);
  }

  async function closeWebSocketConnection(id: string): Promise<void> {
    await disconnect(id).catch(() => undefined);
  }

  // 点击仅切换选中, 连接/断开一律走显式入口(按钮/控制台跳转/批量流程)
  function selectToken(id: string): boolean {
    setSelectedToken(id);
    return true;
  }

  function upgradeTokenToPermanent(_id: string): boolean {
    return true;
  }

  function exportTokens(): ApiToken[] {
    return [...tokens.value];
  }

  async function importTokens(data: unknown[]): Promise<{ success: boolean; message: string }> {
    let n = 0;
    for (const raw of data ?? []) {
      const item = raw as Record<string, unknown>;
      if (!item || typeof item !== 'object') continue;
      const url = item.sourceUrl as string | undefined;
      if (!url) continue;
      try {
        await importToken({
          method: 'url',
          name: String(item.name ?? `token_${n + 1}`),
          url,
          server: (item.server as string) ?? undefined,
          wsUrl: (item.wsUrl as string) ?? undefined,
        });
        n++;
      } catch {
        // skip failed items
      }
    }
    return {
      success: n > 0,
      message: n > 0 ? `已导入 ${n} 个Token` : '没有可导入的Token',
    };
  }

  const tokenRefreshThrottle = ref<Record<string, number>>({});
  const TOKEN_REFRESH_COOLDOWN_MS = 10_000;

  function emitToast(level: 'info' | 'success' | 'warning' | 'error', message: string): void {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { level, message } }));
    }
  }

  /**
   * 尝试自动续期 Token
   * - URL 类型: 后端 fetch sourceUrl 重新转换 (自动)
   * - bin / wxQrcode: 没有原始 bin, 无法自动续期, 提示重新导入
   * 10s 冷却保护: 每 token 10s 内最多一次
   */
  async function attemptTokenRefresh(tokenId: string): Promise<boolean> {
    const now = Date.now();
    const last = tokenRefreshThrottle.value[tokenId] ?? 0;
    if (now - last < TOKEN_REFRESH_COOLDOWN_MS) return false;
    tokenRefreshThrottle.value[tokenId] = now;

    const t = tokens.value.find((x) => x.id === tokenId);
    if (!t) return false;
    const tokenName = t.name;

    emitToast('info', `${tokenName} 正在尝试自动续期...`);
    try {
      if (t.importMethod !== 'url') {
        emitToast('warning', `${tokenName} 凭证已过期, 请重新扫码导入 (该类型暂支持手动续期)`);
        return false;
      }
      const data = await api.tokens.refresh(tokenId);
      if (!data?.success || !data?.data) {
        emitToast('error', `${tokenName} 续期失败: ${data?.message ?? '未知错误'}`);
        return false;
      }
      await refresh();
      await connect(tokenId).catch(() => undefined);
      emitToast('success', `${tokenName} 已自动续期并重新连接`);
      return true;
    } catch (err) {
      emitToast('error', `${tokenName} 续期异常: ${(err as Error).message ?? err}`);
      return false;
    }
  }

  async function clearAllTokens(): Promise<void> {
    for (const t of [...tokens.value]) {
      await removeToken(t.id).catch(() => undefined);
    }
  }

  async function importBase64Token(
    name: string,
    _token: string,
    opts: { server?: string; wsUrl?: string; sourceUrl?: string; importMethod?: string } = {},
  ): Promise<{ success: boolean; tokenName?: string; token?: ApiToken; message?: string }> {
    if (!opts.sourceUrl) {
      return { success: false, message: '不再支持直接导入原始Token，请使用扫码或BIN方式导入' };
    }
    try {
      const rows = await importToken({
        method: 'url',
        name,
        url: opts.sourceUrl,
        server: opts.server,
        wsUrl: opts.wsUrl,
      });
      const t = rows[0];
      return { success: true, tokenName: t.name, token: t };
    } catch (e) {
      return { success: false, message: (e as Error).message ?? '导入失败' };
    }
  }

  async function sendMessage(tokenId: string, cmd: string, params?: Record<string, unknown>): Promise<void> {
    try {
      await api.tokens.command(tokenId, cmd, params ?? {}, 8000);
    } catch {
      // fire-and-forget
    }
  }

  async function sendMessageWithPromise(
    tokenId: string,
    cmd: string,
    params?: Record<string, unknown>,
    timeoutMs?: number,
  ): Promise<unknown> {
    // 查询类命令走 sessionStorage 缓存 + in-flight 去重
    if (READ_ONLY_CMDS.has(cmd)) {
      // role_getroleinfo 额外走"全局快照"短路: 任何组件调它都直接返回最近一份内存对象,
      // 避免前端有未知循环时高频 POST 触发游戏服 200400
      if (cmd === 'role_getroleinfo') {
        if (
          roleInfoSnapshot &&
          Date.now() - roleInfoSnapshot.at < ROLE_INFO_SNAPSHOT_TTL_MS
        ) {
          return roleInfoSnapshot.data;
        }
      }
      const cached = getCachedRead(tokenId, cmd, params);
      if (cached !== null) {
        // 回填全局快照 (即使来自 sessionStorage, 也让所有 token 共享同一份)
        if (cmd === 'role_getroleinfo') {
          roleInfoSnapshot = { data: cached, at: Date.now() };
        }
        return cached;
      }
      // role_getroleinfo 走全局 in-flight 去重 (不分 token), 防止多 token 并发各自发一次
      const key =
        cmd === 'role_getroleinfo'
          ? `__global__:role_getroleinfo`
          : inflightKeyOf(tokenId, cmd, params);
      let p = inflightReads.get(key);
      if (!p) {
        p = (async () => {
          try {
            const resp = await api.tokens.command(
              tokenId,
              cmd,
              params ?? {},
              timeoutMs ?? 8000,
            );
            setCachedRead(tokenId, cmd, params, resp.data);
            if (cmd === 'role_getroleinfo') {
              roleInfoSnapshot = { data: resp.data, at: Date.now() };
            }
            return resp.data;
          } finally {
            inflightReads.delete(key);
          }
        })();
        inflightReads.set(key, p);
      }
      return p;
    }
    const resp = await api.tokens.command(tokenId, cmd, params ?? {}, timeoutMs ?? 8000);
    return resp.data;
  }

  async function sendMessageToLegion(tokenId: string, content: string): Promise<unknown> {
    const resp = await api.tokens.command(
      tokenId,
      'system_sendchatmessage',
      { channel: 'legion', content },
      8000,
    );
    return resp.data;
  }

  function setBattleVersion(version: unknown): void {
    battleVersion.value = version;
  }

  async function sendGetRoleInfo(tokenId: string, params: Record<string, unknown> = {}): Promise<unknown> {
    try {
      const roleInfo = await sendMessageWithPromise(tokenId, 'role_getroleinfo', params, 15000);
      if (roleInfo) {
        const slot = ensureGameData(tokenId);
        slot.roleInfo = roleInfo as Record<string, unknown>;
        slot.lastUpdated = new Date().toISOString();
      }
      return roleInfo;
    } catch {
      return null;
    }
  }

  function sendGameMessage(tokenId: string, cmd: string, params?: Record<string, unknown>): void {
    sendMessage(tokenId, cmd, params ?? {});
  }

  function sendHeartbeat(tokenId: string): void {
    sendMessage(tokenId, 'heart_beat', {});
  }

  function getWebSocketClient(tokenId: string): {
    send: (cmd: string, params?: Record<string, unknown>) => void;
    debounceSend: (cmd: string, params?: Record<string, unknown>) => void;
    status: string;
  } {
    return {
      send: (cmd, params) => sendMessage(tokenId, cmd, params ?? {}),
      debounceSend: (cmd, params) => {
        setTimeout(() => sendMessage(tokenId, cmd, params ?? {}), 300);
      },
      status: getWebSocketStatus(tokenId),
    };
  }

  function routeGameEvent(tokenId: string, msg: Record<string, unknown>): void {
    const cmd = String(msg.cmd ?? (msg._raw as Record<string, unknown> | undefined)?.cmd ?? '').toLowerCase();
    const body = (msg as { body?: unknown }).body ?? msg;
    const gd = ensureGameData(tokenId);

    if (cmd === 'role_getroleinforesp' || cmd === 'role_getroleinfo') {
      gd.roleInfo = body;
      // 更新全局快照, 让前端任何调 sendMessageWithPromise('role_getroleinfo') 都能在 5s 内短路
      roleInfoSnapshot = { data: body, at: Date.now() };
      const study = (body as { role?: { study?: { maxCorrectNum?: number; beginTime?: number } } })?.role?.study;
      if (study?.maxCorrectNum !== undefined) {
        const isCompleted = study.maxCorrectNum >= 10 && isInCurrentWeek((study.beginTime ?? 0) * 1000);
        gd.studyStatus = {
          ...((gd.studyStatus as Record<string, unknown> | undefined) ?? {}),
          thisWeek: isCompleted,
          isCompleted,
          maxCorrectNum: study.maxCorrectNum,
        };
      }
      gd.lastUpdated = new Date().toISOString();
      return;
    }

    if (cmd.startsWith('legion_getinfo') || cmd.startsWith('legion_getinfor')) {
      gd.legionInfo = body;
      gd.lastUpdated = new Date().toISOString();
      return;
    }

    if (
      ['team_getteaminfo', 'team_getteaminforesp', 'role_gettargetteam', 'role_gettargetteamresp',
        'presetteam_setteam', 'presetteam_setteamresp', 'presetteam_saveteam', 'presetteam_saveteamresp',
      ].includes(cmd)
    ) {
      const presetTeam = ((gd.presetTeam as Record<string, unknown> | undefined) ?? {}) as Record<string, unknown>;
      Object.assign(presetTeam, (body ?? {}) as Record<string, unknown>);
      if (body && typeof body === 'object' && 'presetTeamInfo' in (body as Record<string, unknown>)) {
        presetTeam.presetTeamInfo = (body as Record<string, unknown>).presetTeamInfo;
      }
      gd.presetTeam = presetTeam;
      gd.lastUpdated = new Date().toISOString();
      return;
    }

    if (cmd === 'bosstower_getinforesp' || cmd === 'bosstower_getinfo') {
      gd.bossTowerInfo = body;
      gd.lastUpdated = new Date().toISOString();
      return;
    }

    if (cmd === 'evotowerinforesp' || cmd === 'evotower_getinforesp' || cmd === 'evotower_getinfo') {
      gd.evoTowerInfo = body;
      gd.lastUpdated = new Date().toISOString();
      return;
    }

    if (cmd === 'fight_starttower' || cmd === 'fight_starttowerresp') {
      const battleData = (body as { battleData?: { options?: { towerId?: number }; result?: { sponsor?: { ext?: { curHP?: number } } } } } | undefined)?.battleData;
      if (battleData) {
        const towerId = battleData.options?.towerId;
        const curHP = battleData.result?.sponsor?.ext?.curHP;
        gd.towerResult = { success: (curHP ?? 0) > 0, curHP, towerId, timestamp: Date.now() };
        gd.lastUpdated = new Date().toISOString();
        if (towerId !== undefined && towerId % 10 === 0) {
          const rewardFloor = Math.floor(towerId / 10);
          const roleInfo = gd.roleInfo as { role?: { tower?: { reward?: Record<string, unknown> } } } | undefined;
          const towerRewards = roleInfo?.role?.tower?.reward;
          if (towerRewards && !towerRewards[rewardFloor]) {
            setTimeout(() => {
              sendMessage(tokenId, 'tower_claimreward', { rewardId: rewardFloor });
              setTimeout(() => sendMessage(tokenId, 'role_getroleinfo', {}), 1000);
            }, 1500);
          }
        }
      }
      return;
    }

    if (cmd === 'tower_claimreward' || cmd === 'tower_claimrewardresp') {
      setTimeout(() => sendMessage(tokenId, 'role_getroleinfo', {}), 500);
      return;
    }

    if (cmd === 'study' || cmd === 'studyresp' || cmd === 'study_startgame' || cmd === 'study_startgameresp') {
      const questionList = (body as { questionList?: unknown[] } | undefined)?.questionList;
      const studyId = (body as { role?: { study?: { id?: unknown } } } | undefined)?.role?.study?.id;
      if (Array.isArray(questionList) && questionList.length && studyId !== undefined) {
        gd.studyStatus = {
          isAnswering: true,
          questionCount: questionList.length,
          answeredCount: 0,
          status: 'answering',
          timestamp: Date.now(),
        };
        gd.lastUpdated = new Date().toISOString();
        void answerStudy(tokenId, questionList, Number(studyId));
      }
      return;
    }

    if (
      cmd === 'system_claimhangupreward' || cmd === 'system_claimhanguprewardresp'
      || cmd === 'syncresp' || cmd === 'system_mysharecallback'
    ) {
      setTimeout(() => sendMessage(tokenId, 'role_getroleinfo', {}), 600);
    }
  }

  async function answerStudy(tokenId: string, questionList: unknown[], studyId: number): Promise<void> {
    try {
      const { findAnswer } = await import('../utils/studyQuestionsFromJSON');
      const gd = ensureGameData(tokenId);
      for (let i = 0; i < questionList.length; i++) {
        const q = (questionList[i] ?? {}) as { question?: string; id?: unknown };
        const questionText = String(q.question ?? '');
        const questionId = q.id;
        let answer = await findAnswer(questionText);
        if (answer === null || answer === undefined) answer = 1;
        await sendMessage(tokenId, 'study_answer', { id: studyId, option: [answer], questionId: [questionId] });
        const st = gd.studyStatus as { answeredCount?: number } | undefined;
        if (st) st.answeredCount = i + 1;
        await new Promise((r) => setTimeout(r, 300));
      }
      await new Promise((r) => setTimeout(r, 1500));
      if (gd.studyStatus) (gd.studyStatus as Record<string, unknown>).status = 'claiming_rewards';
      for (let rewardId = 1; rewardId <= 10; rewardId++) {
        await sendMessage(tokenId, 'study_claimreward', { rewardId });
        await new Promise((r) => setTimeout(r, 200));
      }
      if (gd.studyStatus) (gd.studyStatus as Record<string, unknown>).status = 'completed';
      await new Promise((r) => setTimeout(r, 1000));
      gd.studyStatus = { isAnswering: false, questionCount: 0, answeredCount: 0, status: '', timestamp: null };
      sendMessage(tokenId, 'role_getroleinfo', {});
    } catch {
      // ignore auto-answer errors
    }
  }

  async function addToken(t: {
    name?: string;
    token?: string;
    server?: string;
    wsUrl?: string;
    sourceUrl?: string;
  }): Promise<ApiToken[]> {
    if (t.sourceUrl) {
      return importToken({
        method: 'url',
        name: t.name ?? 'URL导入',
        url: t.sourceUrl,
        server: t.server,
        wsUrl: t.wsUrl,
      });
    }
    return importToken({
      method: 'manual',
      name: t.name ?? '手动导入',
      bin: t.token ?? '',
      server: t.server,
      wsUrl: t.wsUrl,
    });
  }

  async function login(password: string): Promise<void> {
    const resp = await api.auth.login(password);
    const token = (resp.data as { token: string })?.token;
    if (!token) throw new Error('login failed');
    setStoredToken(token);
  }

  function logout(): void {
    setStoredToken(null);
  }

  function isAuthed(): boolean {
    return !!getStoredToken();
  }

  return {
    tokens,
    selectedTokenId,
    selectedToken,
    selectedTokenRoleInfo,
    hasTokens,
    gameTokens,
    loading,
    connectionStatus,
    gameData,
    logs,
    wsConnections,
    battleVersion,
    lastEvent,
    setSelectedToken,
    refresh,
    importToken,
    removeToken,
    updateToken,
    connect,
    disconnect,
    refreshTokenByUrl,
    login,
    logout,
    isAuthed,
    /** 读取指定 token 的角色业务 ID (来自 roleInfo.role.roleId), 没有则回退到 tokenId */
    getRoleIdByTokenId(tokenId: string): string | null {
      const slot = gameDataByToken.value[tokenId];
      const id = slot?.roleInfo?.role?.roleId;
      if (id != null) return String(id);
      const tk = tokens.value.find((t) => t.id === tokenId);
      return tk ? tk.id : null;
    },
    getWebSocketStatus,
    getWebSocketClient,
    initTokenStore,
    createWebSocketConnection,
    closeWebSocketConnection,
    selectToken,
    upgradeTokenToPermanent,
    exportTokens,
    importTokens,
    clearAllTokens,
    importBase64Token,
    sendMessage,
    sendMessageWithPromise,
    sendMessageToLegion,
    sendGameMessage,
    sendHeartbeat,
    sendGetRoleInfo,
    setBattleVersion,
    addToken,
    tokenGroups,
    createTokenGroup,
    deleteTokenGroup,
    updateTokenGroup,
    addTokenToGroup,
    removeTokenFromGroup,
    getTokenGroups,
    getGroupTokenIds,
    getValidGroupTokenIds,
    cleanupInvalidTokens,
    attemptTokenRefresh,
  };
});