// Stub: events 现在由服务端 SSE 推送
export const $emit = { on: () => {}, off: () => {}, emit: () => {} };
export const events = new Set();
export const onSome = () => {};
export const emitPlus = () => false;
export default { $emit, events, onSome, emitPlus };