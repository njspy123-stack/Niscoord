import { buildSessionCookie, getAppUser, loginUser } from "../../_lib/auth.js";
import { ensureSchema } from "../../_lib/db.js";
import { error, json, normalizeEmail, readJson } from "../../_lib/http.js";
import { maybeSendLoginAlert } from "../../_lib/notifications.js";

export async function onRequestPost(context) {
  try {
    await ensureSchema(context.env);
    const body = await readJson(context.request);
    const email = normalizeEmail(body.email);
    const password = String(body.password || "");

    if (!email || !password) {
      return error("Email and password are required.");
    }

    const result = await loginUser(context.env, context.request, {
      email,
      password,
    });

    await maybeSendLoginAlert(context.env, context.request, result.authUser);

    return json(
      {
        ok: true,
        user: await getAppUser(context.env, result.user.id),
      },
      {
        headers: {
          "Set-Cookie": buildSessionCookie(
            context.env,
            context.request,
            result.session.token,
            result.session.expiresAt
          ),
        },
      }
    );
  } catch (requestError) {
    return error(requestError.message || "Could not sign in.", 401);
  }
}
