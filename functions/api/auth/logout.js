import { clearSessionCookie, destroySession } from "../../_lib/auth.js";
import { json } from "../../_lib/http.js";

export async function onRequestPost(context) {
  await destroySession(context.env, context.request);

  return json(
    { ok: true },
    {
      headers: {
        "Set-Cookie": clearSessionCookie(context.env, context.request),
      },
    }
  );
}
