import { sendLoginAlertEmail, sendTestNotificationEmail } from "./email.js";

export async function maybeSendLoginAlert(env, request, user) {
  if (!user.email_verified) {
    return null;
  }

  const preferencesRow = await env.DB.prepare(
    "SELECT security_alerts FROM notification_preferences WHERE user_id = ?1"
  )
    .bind(user.id)
    .first();

  if (!preferencesRow?.security_alerts) {
    return null;
  }

  try {
    return await sendLoginAlertEmail(env, request, user);
  } catch (error) {
    return null;
  }
}

export async function sendAccountTestNotification(env, request, user) {
  if (!user.email_verified) {
    throw new Error("Verify your email before sending a test notification.");
  }

  return sendTestNotificationEmail(env, request, user);
}
