import { createId, nowIso } from "./auth.js";
import { recordNotificationEvent } from "./db.js";

function getBaseUrl(env, request) {
  return env.APP_BASE_URL || new URL(request.url).origin;
}

function getDeliveryMode(env) {
  if (env.EMAIL_DELIVERY_MODE) {
    return env.EMAIL_DELIVERY_MODE;
  }

  if (env.RESEND_API_KEY && env.EMAIL_FROM) {
    return "resend";
  }

  return "dev";
}

function renderShell({ title, intro, contentLines, footer }) {
  const lines = contentLines.map((line) => `<p style="margin:0 0 12px;">${line}</p>`).join("");
  return `
    <div style="font-family:Arial,sans-serif;background:#0a1020;padding:24px;color:#edf1ff;">
      <div style="max-width:560px;margin:0 auto;background:#131b33;border-radius:18px;padding:28px;border:1px solid #273256;">
        <p style="margin:0 0 8px;color:#7ce2d8;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;">Niscoord</p>
        <h1 style="margin:0 0 12px;font-size:28px;">${title}</h1>
        <p style="margin:0 0 18px;color:#b0bcdd;">${intro}</p>
        ${lines}
        <p style="margin:18px 0 0;color:#8d99bb;font-size:13px;">${footer}</p>
      </div>
    </div>
  `;
}

async function sendWithResend(env, message) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [message.to],
      subject: message.subject,
      html: message.html,
      text: message.text,
    }),
  });

  if (!response.ok) {
    const failureText = await response.text();
    throw new Error(`Email delivery failed: ${failureText}`);
  }

  return {
    provider: "resend",
    status: "sent",
  };
}

async function sendInDevMode(message) {
  return {
    provider: "dev",
    status: "logged",
    devPreview: message.devPreview || null,
  };
}

export async function sendEmail(env, request, user, message) {
  const mode = getDeliveryMode(env);
  const prepared = {
    ...message,
    appBaseUrl: getBaseUrl(env, request),
  };

  let deliveryResult;

  if (mode === "resend") {
    deliveryResult = await sendWithResend(env, prepared);
  } else {
    deliveryResult = await sendInDevMode(prepared);
  }

  await recordNotificationEvent(env, {
    id: createId("notify"),
    userId: user.id,
    type: message.type,
    channel: "email",
    subject: message.subject,
    bodyPreview: message.preview,
    status: deliveryResult.status,
    provider: deliveryResult.provider,
    createdAt: nowIso(),
  });

  return deliveryResult;
}

export async function sendVerificationCodeEmail(env, request, user, code) {
  const html = renderShell({
    title: "Verify your Niscoord account",
    intro: "Use the code below to verify your email address and unlock the rest of your account setup.",
    contentLines: [
      `<strong style="display:inline-block;font-size:32px;letter-spacing:0.3em;">${code}</strong>`,
      "This code expires in 10 minutes.",
      `Open Niscoord here: ${getBaseUrl(env, request)}`,
    ],
    footer: "If you did not create this account, you can safely ignore this message.",
  });

  return sendEmail(env, request, user, {
    to: user.email,
    subject: "Your Niscoord verification code",
    text: `Your Niscoord verification code is ${code}. It expires in 10 minutes.`,
    html,
    type: "email_verification",
    preview: `Verification code ${code}`,
    devPreview: code,
  });
}

export async function sendLoginAlertEmail(env, request, user) {
  const html = renderShell({
    title: "New sign-in to Niscoord",
    intro: "We noticed a fresh login on your account.",
    contentLines: [
      `Time: ${new Date().toUTCString()}`,
      `Manage your account here: ${getBaseUrl(env, request)}`,
    ],
    footer: "If this was not you, rotate your password once password reset exists in a later phase.",
  });

  return sendEmail(env, request, user, {
    to: user.email,
    subject: "Niscoord login alert",
    text: "A new sign-in was detected on your Niscoord account.",
    html,
    type: "security_alert",
    preview: "New sign-in detected.",
  });
}

export async function sendTestNotificationEmail(env, request, user) {
  const html = renderShell({
    title: "Niscoord test notification",
    intro: "Your notification setup is working.",
    contentLines: [
      "This is a test email from the first Niscoord account system build.",
      `You can now move on to building servers, channels, and messaging on top of this foundation.`,
    ],
    footer: "This message was triggered from the account dashboard.",
  });

  return sendEmail(env, request, user, {
    to: user.email,
    subject: "Niscoord test notification",
    text: "Your Niscoord notification setup is working.",
    html,
    type: "test_notification",
    preview: "Your notification setup is working.",
  });
}
