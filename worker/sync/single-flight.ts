import { WorkerError } from '../errors';

export function createSingleFlight<TArgs extends unknown[], TResult>(
  operation: (...args: TArgs) => Promise<TResult>,
): (...args: TArgs) => Promise<TResult> {
  let active = false;
  return async (...args) => {
    if (active) throw new WorkerError('SYNC_IN_PROGRESS');
    active = true;
    try {
      return await operation(...args);
    } finally {
      active = false;
    }
  };
}
