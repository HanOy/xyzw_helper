import { computed, ref } from 'vue';
import {
  useTokensStore,
  tokenGroups,
  type ApiToken,
  type TokenGroup,
} from './tokens';

export const gameTokens = computed<ApiToken[]>(() => useTokensStore().tokens);
export const hasTokens = computed(() => useTokensStore().hasTokens);
export const selectedTokenId = computed<string>({
  get: () => useTokensStore().selectedTokenId,
  set: (v) => useTokensStore().setSelectedToken(v),
});
export const selectedToken = computed(() => useTokensStore().selectedToken);
export { tokenGroups };
export { useTokensStore as useTokenStore };

export type { ApiToken, TokenGroup };