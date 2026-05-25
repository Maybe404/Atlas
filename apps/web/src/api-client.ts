async function parseResponse(res: Response) {
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message = data?.message || data?.error || `Request failed with ${res.status}`;
    throw new Error(message);
  }
  return data;
}

export async function apiGet(path: string) {
  const res = await fetch(`/api${path}`, { credentials: 'include' });
  return parseResponse(res);
}

export async function apiJson(path: string, method: string, body?: unknown) {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'include',
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return parseResponse(res);
}

export async function apiForm(path: string, formData: FormData) {
  const res = await fetch(`/api${path}`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });
  return parseResponse(res);
}
