import {
  defaultPreferences,
  ensureSchema,
  getPreferences,
  getRecentNotifications,
  getUserById,
  getUserByEmail,
  getUserWithAuthById,
  setPreferences,
} from "./db.js";

const encoder = new TextEncoder();
const PASSWORD_ITERATIONS = 120000;

function bytesToBase64(bytes) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function toBase64Url(bytes) {
  return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function createId(prefix = "id") {
  return `${prefix}_${toBase64Url(crypto.getRandomValues(new Uint8Array(18)))}`;
}

export function nowIso() {
  return new Date().toISOString();
}

export function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60_000).toISOString();
}

export function addDays(date, days) {
  return new Date(date.getTime() + days * 86_400_000).toISOString();
}

export async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return bytesToBase64(new Uint8Array(digest));
}

export async function hashPassword(password, salt = null, iterations = PASSWORD_ITERATIONS) {
  const actualSalt = salt || bytesToBase64(crypto.getRandomValues(new Uint8Array(16)));
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: base64ToBytes(actualSalt),
      iterations,
    },
    keyMaterial,
    256
  );

  return {
    hash: bytesToBase64(new Uint8Array(derivedBits)),
    salt: actualSalt,
    iterations,
  };
}

export async function verifyPassword(password, user) {
  const computed = await hashPassword(password, user.password_salt, user.password_iterations);
  return computed.hash === user.password_hash;
}

export function cookieName(env) {
  return env.SESSION_COOKIE_NAME || "niscoord_session";
}

export function parseCookies(request) {
  const raw = request.headers.get("Cookie") || "";
  return raw.split(";").reduce((accumulator, pair) => {
    const [name, ...rest] = pair.trim().split("=");
    if (!name) {
      return accumulator;
    }

    accumulator[name] = decodeURIComponent(rest.join("="));
    return accumulator;
  }, {});
}

export async function createSession(env, request, userId) {
  await ensureSchema(env);
  const token = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const tokenHash = await sha256(token);
  const createdAt = nowIso();
  const expiresAt = addDays(new Date(), Number(env.SESSION_TTL_DAYS || 30));

  await env.DB.prepare(
    `INSERT INTO sessions (
      id, user_id, token_hash, expires_at, created_at, last_seen_at, user_agent, ip_address
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
  )
    .bind(
      createId("sess"),
      userId,
      tokenHash,
      expiresAt,
      createdAt,
      createdAt,
      request.headers.get("User-Agent"),
      request.headers.get("CF-Connecting-IP")
    )
    .run();

  return {
    token,
    expiresAt,
  };
}

export function buildSessionCookie(env, request, token, expiresAt) {
  const secure = new URL(request.url).protocol === "https:";
  const parts = [
    `${cookieName(env)}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Expires=${new Date(expiresAt).toUTCString()}`,
  ];

  if (secure) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

export function clearSessionCookie(env, request) {
  const secure = new URL(request.url).protocol === "https:";
  const parts = [
    `${cookieName(env)}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
  ];

  if (secure) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

export async function destroySession(env, request) {
  await ensureSchema(env);
  const cookies = parseCookies(request);
  const token = cookies[cookieName(env)];

  if (!token) {
    return;
  }

  const tokenHash = await sha256(token);
  await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?1").bind(tokenHash).run();
}

export async function getSessionUser(env, request) {
  await ensureSchema(env);
  const cookies = parseCookies(request);
  const token = cookies[cookieName(env)];

  if (!token) {
    return null;
  }

  const tokenHash = await sha256(token);
  const session = await env.DB.prepare(
    `SELECT s.user_id, s.id, s.expires_at, u.email_verified
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ?1`
  )
    .bind(tokenHash)
    .first();

  if (!session) {
    return null;
  }

  if (new Date(session.expires_at).getTime() <= Date.now()) {
    await env.DB.prepare("DELETE FROM sessions WHERE id = ?1").bind(session.id).run();
    return null;
  }

  await env.DB.prepare(
    "UPDATE sessions SET last_seen_at = ?2 WHERE id = ?1"
  )
    .bind(session.id, nowIso())
    .run();

  return getAppUser(env, session.user_id);
}

export async function getAppUser(env, userId) {
  const user = await getUserById(env, userId);
  if (!user) {
    return null;
  }

  const preferences =
    (await getPreferences(env, userId)) ||
    (await setPreferences(env, userId, defaultPreferences()));

  const recentNotifications = await getRecentNotifications(env, userId);

  return {
    id: user.id,
    email: user.email,
    username: user.username,
    emailVerified: Boolean(user.email_verified),
    emailVerifiedAt: user.email_verified_at,
    createdAt: user.created_at,
    preferences,
    recentNotifications,
  };
}

export async function createUser(env, request, { email, username, password }) {
  await ensureSchema(env);
  const existingEmail = await getUserByEmail(env, email);
  if (existingEmail) {
    throw new Error("That email is already in use.");
  }

  const existingUsername = await env.DB.prepare(
    "SELECT id FROM users WHERE username = ?1"
  )
    .bind(username)
    .first();
  if (existingUsername) {
    throw new Error("That username is already taken.");
  }

  const createdAt = nowIso();
  const credentials = await hashPassword(password);
  const userId = createId("user");

  await env.DB.prepare(
    `INSERT INTO users (
      id, email, username, password_hash, password_salt, password_iterations, email_verified, created_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, ?7)`
  )
    .bind(
      userId,
      email,
      username,
      credentials.hash,
      credentials.salt,
      credentials.iterations,
      createdAt
    )
    .run();

  await setPreferences(env, userId, defaultPreferences());
  const session = await createSession(env, request, userId);

  return {
    user: await getAppUser(env, userId),
    session,
  };
}

export async function loginUser(env, request, { email, password }) {
  await ensureSchema(env);
  const user = await getUserByEmail(env, email);
  if (!user) {
    throw new Error("Incorrect email or password.");
  }

  const passwordOk = await verifyPassword(password, user);
  if (!passwordOk) {
    throw new Error("Incorrect email or password.");
  }

  const session = await createSession(env, request, user.id);
  return {
    user: await getAppUser(env, user.id),
    session,
    authUser: user,
  };
}

export async function getAuthenticatedAuthUser(env, request) {
  const appUser = await getSessionUser(env, request);
  if (!appUser) {
    return null;
  }

  return getUserWithAuthById(env, appUser.id);
}
