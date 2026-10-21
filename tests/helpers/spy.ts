import type { SqlExecutor, SqlParam } from '../../src/core/types.js';

/** Record caller-transaction statements without importing a driver. */
export function createSpyExecutor(delegate?: SqlExecutor) {
  const statements: { text: string; params: readonly SqlParam[] }[] = [];
  const executor: SqlExecutor = {
    query: async (text, params) => {
      statements.push({ text, params: [...params] });
      return delegate ? delegate.query(text, params) : [];
    },
  };
  return { executor, statements };
}
