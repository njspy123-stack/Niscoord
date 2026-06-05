const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_iterations INTEGER NOT NULL,
  email_verified INTEGER NOT NULL DEFAULT 0,
  email_verified_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id TEXT PRIMARY KEY,
  security_alerts INTEGER NOT NULL DEFAULT 1,
  product_updates INTEGER NOT NULL DEFAULT 1,
  friend_activity INTEGER NOT NULL DEFAULT 0,
  server_invites INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  user_agent TEXT,
  ip_address TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS verification_codes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  purpose TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS notification_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  channel TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_preview TEXT NOT NULL,
  status TEXT NOT NULL,
  provider TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_verification_codes_user_id ON verification_codes(user_id, purpose, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_events_user_id ON notification_events(user_id, created_at DESC);
`;

let schemaPromise = null;

export async function ensureSchema(env) {
  if (!schemaPromise) {
    schemaPromise = env.DB.exec(SCHEMA_SQL);
  }

  return schemaPromise;
}

export async function getUserByEmail(env, email) {
  return env.DB.prepare(
    `SELECT id, email, username, password_hash, password_salt, password_iterations,
            email_verified, email_verified_at, created_at
     FROM users
     WHERE email = ?1`
  )
    .bind(email.toLowerCase())
    .first();
}

export async function getUserById(env, userId) {
  return env.DB.prepare(
    `SELECT id, email, username, email_verified, email_verified_at, created_at
     FROM users
     WHERE id = ?1`
  )
    .bind(userId)
    .first();
}

export async function getUserWithAuthById(env, userId) {
  return env.DB.prepare(
    `SELECT id, email, username, password_hash, password_salt, password_iterations,
            email_verified, email_verified_at, created_at
     FROM users
     WHERE id = ?1`
  )
    .bind(userId)
    .first();
}

export async function getPreferences(env, userId) {
  const record = await env.DB.prepare(
    `SELECT security_alerts, product_updates, friend_activity, server_invites, updated_at
     FROM notification_preferences
     WHERE user_id = ?1`
  )
    .bind(userId)
    .first();

  if (!record) {
    return null;
  }

  return mapPreferences(record);
}

export async function setPreferences(env, userId, preferences) {
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO notification_preferences (
        user_id, security_alerts, product_updates, friend_activity, server_invites, updated_at
      )
      VALUES (?1, ?2, ?3, ?4, ?5, ?6)
      ON CONFLICT(user_id) DO UPDATE SET
        security_alerts = excluded.security_alerts,
        product_updates = excluded.product_updates,
        friend_activity = excluded.friend_activity,
        server_invites = excluded.server_invites,
        updated_at = excluded.updated_at`
  )
    .bind(
      userId,
      preferences.securityAlerts ? 1 : 0,
      preferences.productUpdates ? 1 : 0,
      preferences.friendActivity ? 1 : 0,
      preferences.serverInvites ? 1 : 0,
      now
    )
    .run();

  return {
    ...preferences,
    updatedAt: now,
  };
}

export async function getRecentNotifications(env, userId, limit = 6) {
  const result = await env.DB.prepare(
    `SELECT type, channel, subject, body_preview, status, provider, created_at
     FROM notification_events
     WHERE user_id = ?1
     ORDER BY created_at DESC
     LIMIT ?2`
  )
    .bind(userId, limit)
    .all();

  return (result.results || []).map((row) => ({
    type: row.type,
    channel: row.channel,
    subject: row.subject,
    bodyPreview: row.body_preview,
    status: row.status,
    provider: row.provider,
    createdAt: row.created_at,
  }));
}

export async function recordNotificationEvent(env, event) {
  await env.DB.prepare(
    `INSERT INTO notification_events (
      id, user_id, type, channel, subject, body_preview, status, provider, created_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`
  )
    .bind(
      event.id,
      event.userId,
      event.type,
      event.channel,
      event.subject,
      event.bodyPreview,
      event.status,
      event.provider,
      event.createdAt
    )
    .run();
}

export function mapPreferences(record) {
  return {
    securityAlerts: Boolean(record.security_alerts),
    productUpdates: Boolean(record.product_updates),
    friendActivity: Boolean(record.friend_activity),
    serverInvites: Boolean(record.server_invites),
    updatedAt: record.updated_at,
  };
}

export function defaultPreferences() {
  return {
    securityAlerts: true,
    productUpdates: true,
    friendActivity: false,
    serverInvites: true,
  };
}
