async function parseResponse(res: Response) {
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message = data?.message || data?.error || `Request failed with ${res.status}`;
    throw new Error(message);
  }
  return data;
}

function readCookie(name: string) {
  const prefix = `${name}=`;
  const cookie = document.cookie.split('; ').find((item) => item.startsWith(prefix));
  return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : null;
}

function csrfHeaders(): Record<string, string> {
  const token = readCookie('atlas_csrf');
  return token ? { 'x-atlas-csrf': token } : {};
}

export async function apiGet(path: string) {
  const res = await fetch(`/api${path}`, { credentials: 'include' });
  return parseResponse(res);
}

export async function apiJson(path: string, method: string, body?: unknown) {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'include',
    headers:
      body === undefined ? csrfHeaders() : { 'content-type': 'application/json', ...csrfHeaders() },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return parseResponse(res);
}

export async function apiForm(path: string, formData: FormData) {
  const res = await fetch(`/api${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: csrfHeaders(),
    body: formData,
  });
  return parseResponse(res);
}
