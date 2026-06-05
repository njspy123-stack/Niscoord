export function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...(init.headers || {}),
    },
  });
}

export function error(message, status = 400, extras = {}) {
  return json(
    {
      error: message,
      ...extras,
    },
    { status }
  );
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch (readError) {
    throw new Error("Invalid JSON request body.");
  }
}

export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export function cleanUsername(username) {
  return String(username || "").trim();
}

export function sanitizeVerificationCode(code) {
  return String(code || "").replace(/\D/g, "").slice(0, 6);
}
