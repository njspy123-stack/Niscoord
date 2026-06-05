import { getAppUser, getAuthenticatedAuthUser, nowIso, sha256 } from "../../_lib/auth.js";
import { ensureSchema } from "../../_lib/db.js";
import { error, json, readJson, sanitizeVerificationCode } from "../../_lib/http.js";

export async function onRequestPost(context) {
  try {
    await ensureSchema(context.env);
    const authUser = await getAuthenticatedAuthUser(context.env, context.request);
    if (!authUser) {
      return error("Sign in before verifying your email.", 401);
    }

    const body = await readJson(context.request);
    const code = sanitizeVerificationCode(body.code);
    if (code.length !== 6) {
      return error("Enter a valid 6-digit verification code.");
    }

    const record = await context.env.DB.prepare(
      `SELECT id, code_hash, expires_at, used_at
       FROM verification_codes
       WHERE user_id = ?1 AND purpose = 'email_verification'
       ORDER BY created_at DESC
       LIMIT 1`
    )
      .bind(authUser.id)
      .first();

    if (!record) {
      return error("No verification code was found. Request a new one.");
    }

    if (record.used_at) {
      return error("That verification code was already used. Request a new one.");
    }

    if (new Date(record.expires_at).getTime() <= Date.now()) {
      return error("That verification code expired. Request a new one.");
    }

    if ((await sha256(code)) !== record.code_hash) {
      return error("Incorrect verification code.");
    }

    const verifiedAt = nowIso();

    await context.env.DB.batch([
      context.env.DB.prepare(
        "UPDATE verification_codes SET used_at = ?2 WHERE id = ?1"
      ).bind(record.id, verifiedAt),
      context.env.DB.prepare(
        "UPDATE users SET email_verified = 1, email_verified_at = ?2 WHERE id = ?1"
      ).bind(authUser.id, verifiedAt),
    ]);

    return json({
      ok: true,
      user: await getAppUser(context.env, authUser.id),
    });
  } catch (requestError) {
    return error(requestError.message || "Could not verify email.");
  }
}
