// @ts-nocheck
/**
 * 微信扫码登录服务端实现（不再依赖浏览器游戏模块）。
 * 流程: WeChat code -> hortor comb-login-server -> combUser -> bin -> serverlist(角色列表)
 */
import axios from 'axios';
import { g_utils } from './bonProtocol.js';
import { getServerList } from '../token/authUser.js';

const HORTOR_LOGIN_URL =
  'https://comb-platform.hortorgames.com/comb-login-server/api/v1/login';

const LOGIN_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Linux; Android 12; 23117RK66C Build/V417IR; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/95.0.4638.74 Mobile Safari/537.36',
  Accept: '*/*',
  Host: 'comb-platform.hortorgames.com',
  Connection: 'keep-alive',
  'Content-Type': 'text/plain; charset=utf-8',
  Origin: 'https://open.weixin.qq.com',
  Referer: 'https://open.weixin.qq.com/',
};

// 与原脚本保持一致的加密字符表
export const cipherTable = "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";

const DEVICE_ID = 'DID-a38175b7-14ce-4b36-aa89-3e092ea03ea6';
const PACKAGE_NAME = 'com.hortor.games.xyzw';

export interface LoginRole {
  roleId: string;
  name: string;
  serverId: number;
  server: string;
  roleIndex: number;
  power?: number;
}

/**
 * 用微信扫码得到的 code 换取 combUser
 */
export async function loginWithWechatCode(code: string): Promise<Record<string, unknown>> {
  const payload = {
    gameId: 'xyzwapp',
    code,
    gameTp: 'app',
    sysInfo:
      '{"system":"Android","hortorSDKVersion":"4.0.6-cn","model":"22081212C","brand":"Redmi"}',
    channel: 'android',
    appFrom: 'com.tencent.mm',
    noLogin: '2',
    distinctId: DEVICE_ID,
    state: 'hortor',
    packageName: PACKAGE_NAME,
    tp: 'app-we',
    signPrint: 'E6:F7:FE:A9:EC:8E:24:D0:4F:2A:32:50:28:78:E1:C5:5E:70:81:13',
  };

  const encoded = encodePayload(JSON.stringify(payload));
  const qs = new URLSearchParams({
    gameId: 'xyzwapp',
    timestamp: String(Date.now()),
    version: 'android-4.2.1-cn-release',
    cryptVersion: '1.1.0',
    gameTp: 'app',
    system: 'android',
    deviceUniqueId: DEVICE_ID,
    packageName: PACKAGE_NAME,
  }).toString();

  const resp = await axios.post(`${HORTOR_LOGIN_URL}?${qs}`, encoded, {
    headers: LOGIN_HEADERS,
    timeout: 15_000,
    responseType: 'text',
    validateStatus: () => true,
  });

  let json: Record<string, any>;
  try {
    json = JSON.parse(resp.data);
  } catch {
    throw new Error(`登录响应解析失败: ${String(resp.data).slice(0, 200)}`);
  }

  if (json.meta?.errCode !== 0) {
    throw new Error(`登录失败：${json.meta?.errMsg ?? '未知错误'}`);
  }
  const combUser = json.data?.combUser;
  if (!combUser) throw new Error('登录响应结构异常: 缺少 combUser');
  return combUser as Record<string, unknown>;
}

/**
 * 用 combUser 生成登录 bin（等价于原前端 encMsg + lz4XorEncode）
 */
export function buildLoginBin(combUser: Record<string, unknown>): Buffer {
  return Buffer.from(
    g_utils.encode(
      {
        platform: 'hortor',
        platformExt: 'mix',
        info: combUser,
        serverId: null,
        scene: 0,
        referrerInfo: '',
      },
      'lx',
    ),
  );
}

/**
 * 生成 master bin 并拉取该账号下所有角色
 */
export async function getLoginRoles(
  combUser: Record<string, unknown>,
): Promise<{ bin: Buffer; roles: LoginRole[] }> {
  const bin = buildLoginBin(combUser);
  const raw = await getServerList(bin);
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object'
      ? Object.values(raw)
      : [];
  return { bin, roles: (list as Array<Record<string, any>>).map((r) => normalizeRole(r)) };
}

function normalizeRole(r: Record<string, any>): LoginRole {
  const serverId = Number(r.serverId ?? r.zoneId ?? r.server ?? 0);
  const roleIndex = serverId >= 2000000 ? 2 : serverId >= 1000000 ? 1 : 0;
  const adjSid = serverId >= 2000000 ? serverId - 2000000 : serverId >= 1000000 ? serverId - 1000000 : serverId;
  const server = `${adjSid - 27}服`;
  return {
    roleId: String(r.roleId ?? r.id ?? ''),
    name: String(r.name ?? r.nickName ?? ''),
    serverId,
    server,
    roleIndex,
    power: Number(r.power ?? 0),
  };
}

// ---------- 原前端 encodePayload 加密实现 ----------

const encodeBase64 = (text: string): string =>
  Buffer.from(text, 'utf8').toString('base64');

const transCode = (str: string, times: number): string | null => {
  if (times <= 0) return str;
  if (str.length % 2 !== 0) return null;
  const right = str.substring(Math.floor(str.length / 2));
  const left = str.substring(0, Math.floor(str.length / 2));
  return transCode(right, times - 1) + transCode(left, times - 1);
};

const getCodeKey = (str: string, step: number): string => {
  const chars = str.split('');
  const result: string[] = [];
  const count = Math.floor(str.length / step);
  for (let i = 0; i < count; i++) result.push(chars[i * step]);
  return result.join('');
};

const dealWithString = (src: string, key: string, shift: number): string | null => {
  if (!src || !key) return null;
  const v = src.split('');
  const w = key.split('');
  const out = new Array<string>(v.length);
  let idx = w.length >> shift;
  for (let i = 0; i < v.length; i++) {
    if (idx >= w.length) idx = 0;
    out[i] = String.fromCharCode(v[i].charCodeAt(0) ^ w[idx].charCodeAt(0));
    idx++;
  }
  return out.join('');
};

const codeBase64 = (
  text: string,
  table: string,
  shuffleTimes: number,
  step: number,
  xorShift: number,
): string | null => {
  const base64Text = encodeBase64(text);
  if (table) {
    const shuffled = transCode(table, shuffleTimes);
    const key = getCodeKey(shuffled as string, step);
    return dealWithString(base64Text, key, xorShift);
  }
  return null;
};

export function encodePayload(text: string): string {
  const xorShift = 1;
  const shuffleTimes = 6;
  const step = 3;
  const mid = codeBase64(text, cipherTable, shuffleTimes, step, xorShift);
  return encodeBase64(mid as string);
}