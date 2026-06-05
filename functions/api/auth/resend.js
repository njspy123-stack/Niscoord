import { createId, getAuthenticatedAuthUser, nowIso, sha256 } from "../../_lib/auth.js";
import { ensureSchema } from "../../_lib/db.js";
import { sendVerificationCodeEmail } from "../../_lib/email.js";
import { error, json, readJson, sanitizeVerificationCode } from "../../_lib/http.js";

async function issueVerificationCode(env, userId) {
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
    const user = await getAuthenticatedAuthUser(context.env, context.request);
    if (!user) {
      return error("Sign in before requesting a verification code.", 401);
    }

    const body = await readJson(context.request);
    if (body.purpose && body.purpose !== "email_verification") {
      return error("Unsupported verification purpose.");
    }

    const code = await issueVerificationCode(context.env, user.id);
    const delivery = await sendVerificationCodeEmail(context.env, context.request, user, code);

    return json({
      ok: true,
      deliveryMode: delivery.provider,
      devVerificationCode: delivery.provider === "dev" ? sanitizeVerificationCode(code) : null,
    });
  } catch (requestError) {
    return error(requestError.message || "Could not resend the code.");
  }
}
