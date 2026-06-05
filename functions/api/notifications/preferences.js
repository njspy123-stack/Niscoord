import { getSessionUser } from "../../_lib/auth.js";
import { ensureSchema, setPreferences } from "../../_lib/db.js";
import { error, json, readJson } from "../../_lib/http.js";

export async function onRequestPut(context) {
  try {
    await ensureSchema(context.env);
    const user = await getSessionUser(context.env, context.request);
    if (!user) {
      return error("Sign in before updating preferences.", 401);
    }

    const body = await readJson(context.request);
    const preferences = await setPreferences(context.env, user.id, {
      securityAlerts: Boolean(body.securityAlerts),
      productUpdates: Boolean(body.productUpdates),
      friendActivity: Boolean(body.friendActivity),
      serverInvites: Boolean(body.serverInvites),
    });

    return json({
      ok: true,
      preferences,
    });
  } catch (requestError) {
    return error(requestError.message || "Could not save preferences.");
  }
}
