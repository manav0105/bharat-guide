// Retry only the two temporary HTTP failures. The caller owns the request,
// credentials and a fresh timeout for each attempt; retries do not charge quota.
export async function retryServiceCall<T extends { status: number }>(
  request: () => Promise<T>,
  wait: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms)),
): Promise<T> {
  const delays = [1000, 2000, 4000];
  for (let attempt = 0; ; attempt++) {
    const response = await request();
    if (![503, 429].includes(response.status) || attempt === delays.length) return response;
    await wait(delays[attempt]);
  }
}
