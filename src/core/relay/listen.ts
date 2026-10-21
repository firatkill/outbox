import type { DriverAdapter, ListenHandle } from '../types.js';

/** Own a relay subscription and retry failed openings while polling continues. */
export function createListener<TDb, TTx>(
  adapter: DriverAdapter<TDb, TTx>,
  channel: string,
  wake: () => void,
  onError: (error: unknown) => void,
) {
  let closed = false;
  let handle: ListenHandle | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: Promise<void> | undefined;
  let backoff = 1000;
  const isClosed = () => closed;
  async function open(): Promise<void> {
    let reported = false;
    const wasReported = () => reported;
    try {
      const next = await adapter.listen?.(channel, wake, wake, (error) => {
        reported = true;
        onError(error);
      });
      if (isClosed()) await next?.close();
      else {
        handle = next;
        if (backoff > 1000) wake();
      }
    } catch (error) {
      if (!wasReported()) onError(error);
      if (isClosed()) return;
      timer = setTimeout(() => {
        timer = undefined;
        pending = open();
      }, backoff);
      backoff = Math.min(30000, backoff * 2);
      timer.unref();
    }
  }
  return {
    start() {
      pending = open();
      return pending;
    },
    async close() {
      closed = true;
      clearTimeout(timer);
      await pending;
      try {
        await handle?.close();
      } catch (error) {
        onError(error);
      }
      handle = undefined;
    },
  };
}
