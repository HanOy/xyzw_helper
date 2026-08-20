import { api } from '../api';
import { useTokensStore } from '../stores/tokens';

export class WsAgent {
  constructor() {
    throw new Error('WsAgent 已废弃, 请使用 api.tokens.command');
  }
}