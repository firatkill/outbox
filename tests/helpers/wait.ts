export async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  { timeoutMs = 3000, intervalMs = 20 }: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<void> {
  const deadline = performance.now() + timeoutMs;
  while (!(await predicate())) {
    const remaining = deadline - performance.now();
    if (remaining <= 0) throw new Error(`Condition not met within ${String(timeoutMs)} ms`);
    await new Promise<void>((resolve) => setTimeout(resolve, Math.min(intervalMs, remaining)));
  }
}

/** Typed with the relay event map once the Relay interface is introduced. */
export function waitForEvent<T>(
  relay: { on(event: string, listener: (payload: T) => void): () => void },
  name: string,
  filter: (payload: T) => boolean = () => true,
  timeoutMs = 3000,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const unsubscribe = relay.on(name, (payload) => {
      if (!filter(payload)) return;
      clearTimeout(timer);
      unsubscribe();
      resolve(payload);
    });
    const timer = setTimeout(() => {
      unsubscribe();
      reject(new Error(`Event ${name} not received within ${String(timeoutMs)} ms`));
    }, timeoutMs);
  });
}

export function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
