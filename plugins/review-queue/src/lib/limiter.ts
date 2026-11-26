export type Limiter = <T>(task: () => Promise<T>) => Promise<T>;

/** Runs at most `concurrency` tasks at once; the others wait their turn. */
export function createLimiter(concurrency: number): Limiter {
  let active = 0;
  const queue: (() => void)[] = [];

  const next = () => {
    active--;
    queue.shift()?.();
  };

  return <T>(task: () => Promise<T>) =>
    new Promise<T>((resolve, reject) => {
      const run = () => {
        active++;
        task().then(resolve, reject).finally(next);
      };
      if (active < concurrency) {
        run();
      } else {
        queue.push(run);
      }
    });
}
