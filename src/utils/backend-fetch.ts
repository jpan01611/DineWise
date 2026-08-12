type FetchWithRetryOptions = {
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
};

// The first request to a cold backend (or a slow upstream like the theme lookup's
// LLM+search call) can exceed the timeout even though the server is healthy, so
// retry transparently before surfacing an error to the user.
export async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  { timeoutMs = 10000, retries = 1, retryDelayMs = 300 }: FetchWithRetryOptions = {}
): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timer);
      return response;
    } catch (error) {
      clearTimeout(timer);
      lastError = error;
      if (attempt === retries) break;
      if (retryDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      }
    }
  }

  throw lastError;
}
