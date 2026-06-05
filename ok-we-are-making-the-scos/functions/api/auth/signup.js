import { buildSessionCookie, createId, createUser, nowIso, sha256 } from "../../_lib/auth.js";
import { ensureSchema } from "../../_lib/db.js";
import { sendVerificationCodeEmail } from "../../_lib/email.js";
import { cleanUsername, error, json, normalizeEmail, readJson, sanitizeVerificationCode } from "../../_lib/http.js";

async function createVerificationCode(env, userId) {
  const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 900000 + 100000);
  const expiresAt = new Date(Date.now() + Number(env.VERIFICATION_CODE_TTL_MINUTES || 10) * 60_000).toISOString();

  await env.DB.prepare(
    "UPDATE verification_codes SET used_at = ?2 WHERE user_id = ?1 AND purpose = 'email_verification' AND used_at IS NULL"
  )
    .bind(userId, nowIso())
    .run();

  await env.DB.prepare(
    `INSERT INTO verification_codes (
      id, user_id, purpose, code_hash, expires_at, created_at
    ) VALUES (?1, ?2, 'email_verification', ?3, ?4, ?5)`
  )
    .bind(createId("verify"), userId, await sha256(code), expiresAt, nowIso())
    .run();

  return code;
}

export async function onRequestPost(context) {
  try {
    await ensureSchema(context.env);
    const body = await readJson(context.request);
    const username = cleanUsername(body.username);
    const email = normalizeEmail(body.email);
    const password = String(body.password || "");

    if (!/^[a-zA-Z0-9_]{3,24}$/.test(username)) {
      return error("Username must be 3-24 characters using letters, numbers, or underscores.");
    }

    if (!email || !email.includes("@")) {
      return error("Enter a valid email address.");
    }

    if (password.length < 8) {
      return error("Password must be at least 8 characters.");
    }

    const { user, session } = await createUser(context.env, context.request, {
      username,
      email,
      password,
    });

    const code = await createVerificationCode(context.env, user.id);
    const delivery = await sendVerificationCodeEmail(context.env, context.request, user, code);

    return json(
      {
        ok: true,
        user,
        deliveryMode: delivery.provider,
        devVerificationCode: delivery.provider === "dev" ? sanitizeVerificationCode(code) : null,
      },
      {
        headers: {
          "Set-Cookie": buildSessionCookie(context.env, context.request, session.token, session.expiresAt),
        },
      }
    );
  } catch (requestError) {
    return error(requestError.message || "Could not create account.");
  }
}
