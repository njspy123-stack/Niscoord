import { getSessionUser } from "../../_lib/auth.js";
import { error, json } from "../../_lib/http.js";

export async function onRequestGet(context) {
  const user = await getSessionUser(context.env, context.request);

  if (!user) {
    return error("Not signed in.", 401);
  }

  return json({
    ok: true,
    user,
  });
}
