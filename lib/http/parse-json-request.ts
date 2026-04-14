export async function parseJsonRequest(request: Request) {
  const raw = await request.text()

  if (!raw.trim()) {
    return {
      ok: false as const,
      error: 'Corpo JSON não enviado na requisição.',
      body: null,
    }
  }

  try {
    return {
      ok: true as const,
      error: null,
      body: JSON.parse(raw) as unknown,
    }
  } catch {
    return {
      ok: false as const,
      error: 'JSON inválido no corpo da requisição.',
      body: null,
    }
  }
}
