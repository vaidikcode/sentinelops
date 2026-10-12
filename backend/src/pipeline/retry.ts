export const MAX_RECEIVE_COUNT = 3;

export function shouldRetry(receiveCount: number): boolean {
  return receiveCount < MAX_RECEIVE_COUNT;
}
