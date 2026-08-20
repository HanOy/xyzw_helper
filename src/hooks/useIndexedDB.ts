// Stub: IndexedDB no longer used server-side
export default function useIndexedDB() {
  return {
    getArrayBuffer: async () => null,
    storeArrayBuffer: async () => {},
    deleteArrayBuffer: async () => {},
    clearAll: async () => {},
  };
}