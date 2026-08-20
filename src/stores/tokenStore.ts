import { computed, ref } from 'vue';
import { useTokensStore, type ApiToken } from './tokens';

export const gameTokens = computed<ApiToken[]>(() => useTokensStore().tokens);
export const hasTokens = computed(() => useTokensStore().hasTokens);
export const selectedTokenId = computed<string>({
  get: () => useTokensStore().selectedTokenId,
  set: (v) => useTokensStore().setSelectedToken(v),
});
export const selectedToken = computed(() => useTokensStore().selectedToken);
export const tokenGroups = ref<unknown[]>([]);
export { useTokensStore as useTokenStore };

export type { ApiToken };