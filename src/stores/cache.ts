// Stub: cache moved to server
const noop = () => {};
export const $CacheManager = {
  getCache: () => ({ get: noop, del: noop, clean: noop, feach: noop }),
  delCache: noop,
  clear: noop,
};
export const Content = class {};
export const CacheManager = class {};
export const Cache = class {};
export const install = noop;