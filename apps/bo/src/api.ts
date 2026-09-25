export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(path: string, body?: object): Promise<T> {
  const response = await fetch(`/api/v1/bo${path}`, {
    credentials: 'same-origin',
    ...(body
      ? {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const result = await response.json();
  if (!response.ok)
    throw new ApiError(result.error?.message ?? '요청을 처리하지 못했습니다.', response.status);
  return result.data;
}
