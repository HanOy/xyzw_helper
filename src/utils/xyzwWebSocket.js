export const errorCodeMap = {};
export const CmdDebounceMap = {};

export class XyzwWebSocketClient {
  constructor() {
    throw new Error('XyzwWebSocketClient 已废弃, 请使用 api.tokens.command');
  }
}

export class CommandRegistry {
  constructor() {
    throw new Error('CommandRegistry 已废弃');
  }
}

export function registerDefaultCommands() {
  throw new Error('registerDefaultCommands 已废弃');
}