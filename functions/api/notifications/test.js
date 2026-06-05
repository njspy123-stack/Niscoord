import { getAuthenticatedAuthUser } from "../../_lib/auth.js";
import { error, json } from "../../_lib/http.js";
import { sendAccountTestNotification } from "../../_lib/notifications.js";

export async function onRequestPost(context) {
  try {
    const user = await getAuthenticatedAuthUser(context.env, context.request);
    if (!user) {
      return error("Sign in before sending a test email.", 401);
    }

    const delivery = await sendAccountTestNotification(context.env, context.request, user);

    return json({
      ok: true,
      deliveryMode: delivery.provider,
    });
  } catch (requestError) {
    return error(requestError.message || "Could not send test email.");
  }
}
