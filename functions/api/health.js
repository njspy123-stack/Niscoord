import { ensureSchema } from "../_lib/db.js";
import { json } from "../_lib/http.js";

export async function onRequestGet(context) {
  await ensureSchema(context.env);

  return json({
    ok: true,
    app: context.env.APP_NAME || "Niscoord",
    time: new Date().toISOString(),
  });
}
