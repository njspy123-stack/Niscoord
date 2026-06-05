const state = {
  user: null,
  lastDevCode: null,
};

const elements = {
  signupForm: document.querySelector("#signup-form"),
  loginForm: document.querySelector("#login-form"),
  verifyForm: document.querySelector("#verify-form"),
  preferencesForm: document.querySelector("#preferences-form"),
  authPanel: document.querySelector(".auth-panel"),
  dashboard: document.querySelector("#dashboard"),
  accountTitle: document.querySelector("#account-title"),
  accountEmail: document.querySelector("#account-email"),
  accountVerification: document.querySelector("#account-verification"),
  accountCreated: document.querySelector("#account-created"),
  verificationHelp: document.querySelector("#verification-help"),
  activityList: document.querySelector("#activity-list"),
  toast: document.querySelector("#toast"),
  logoutButton: document.querySelector("#logout-button"),
  resendButton: document.querySelector("#resend-button"),
  testEmailButton: document.querySelector("#test-email-button"),
};

let toastTimer = null;

function showToast(message) {
  if (!elements.toast) {
    return;
  }

  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    elements.toast.classList.remove("show");
  }, 2600);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  let payload = null;

  try {
    payload = await response.json();
  } catch (error) {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(payload?.error || "Request failed.");
  }

  return payload;
}

function toLocalDate(isoValue) {
  if (!isoValue) {
    return "-";
  }

  const date = new Date(isoValue);
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function renderActivity(events) {
  if (!elements.activityList) {
    return;
  }

  if (!events?.length) {
    elements.activityList.innerHTML = "<li>No email activity yet.</li>";
    return;
  }

  elements.activityList.innerHTML = events
    .map(
      (event) => `
        <li>
          <strong>${event.subject}</strong>
          <span>${event.type} via ${event.provider} • ${event.status} • ${toLocalDate(event.createdAt)}</span>
        </li>
      `
    )
    .join("");
}

function renderUser() {
  const { user } = state;
  if (!user) {
    elements.authPanel?.classList.remove("hidden");
    elements.dashboard?.classList.add("hidden");
    elements.accountTitle.textContent = "Signed out";
    elements.accountEmail.textContent = "-";
    elements.accountVerification.textContent = "-";
    elements.accountCreated.textContent = "-";
    renderActivity([]);
    return;
  }

  elements.authPanel?.classList.add("hidden");
  elements.dashboard?.classList.remove("hidden");
  elements.accountTitle.textContent = `@${user.username}`;
  elements.accountEmail.textContent = user.email;
  elements.accountVerification.textContent = user.emailVerified
    ? "Verified"
    : "Awaiting verification";
  elements.accountCreated.textContent = toLocalDate(user.createdAt);
  elements.verificationHelp.textContent = user.emailVerified
    ? "Your email is verified. You can still resend a code if you ever need to re-check delivery."
    : "Enter the 6-digit code from your inbox. If email delivery is in dev mode, the code will also be shown here.";

  if (state.lastDevCode && !user.emailVerified) {
    elements.verificationHelp.textContent = `${elements.verificationHelp.textContent} Dev code: ${state.lastDevCode}`;
  }

  const prefs = user.preferences || {};
  elements.preferencesForm.securityAlerts.checked = Boolean(prefs.securityAlerts);
  elements.preferencesForm.productUpdates.checked = Boolean(prefs.productUpdates);
  elements.preferencesForm.friendActivity.checked = Boolean(prefs.friendActivity);
  elements.preferencesForm.serverInvites.checked = Boolean(prefs.serverInvites);

  renderActivity(user.recentNotifications || []);
}

async function refreshSession() {
  try {
    const payload = await api("/api/auth/me");
    state.user = payload.user;
  } catch (error) {
    state.user = null;
  }

  renderUser();
}

async function handleSignup(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);

  try {
    const payload = await api("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({
        username: form.get("username"),
        email: form.get("email"),
        password: form.get("password"),
      }),
    });

    state.user = payload.user;
    state.lastDevCode = payload.devVerificationCode || null;
    renderUser();
    event.currentTarget.reset();
    showToast("Account created. Check your email for the verification code.");
  } catch (error) {
    showToast(error.message);
  }
}

async function handleLogin(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);

  try {
    const payload = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: form.get("email"),
        password: form.get("password"),
      }),
    });

    state.user = payload.user;
    state.lastDevCode = null;
    renderUser();
    event.currentTarget.reset();
    showToast("Signed in.");
  } catch (error) {
    showToast(error.message);
  }
}

async function handleVerify(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);

  try {
    const payload = await api("/api/auth/verify", {
      method: "POST",
      body: JSON.stringify({
        code: form.get("code"),
      }),
    });

    state.user = payload.user;
    state.lastDevCode = null;
    renderUser();
    event.currentTarget.reset();
    showToast("Email verified.");
  } catch (error) {
    showToast(error.message);
  }
}

async function handleResend() {
  try {
    const payload = await api("/api/auth/resend", {
      method: "POST",
      body: JSON.stringify({ purpose: "email_verification" }),
    });

    state.lastDevCode = payload.devVerificationCode || null;
    renderUser();
    showToast("A fresh verification code is on the way.");
  } catch (error) {
    showToast(error.message);
  }
}

async function handlePreferences(event) {
  event.preventDefault();

  try {
    const payload = await api("/api/notifications/preferences", {
      method: "PUT",
      body: JSON.stringify({
        securityAlerts: elements.preferencesForm.securityAlerts.checked,
        productUpdates: elements.preferencesForm.productUpdates.checked,
        friendActivity: elements.preferencesForm.friendActivity.checked,
        serverInvites: elements.preferencesForm.serverInvites.checked,
      }),
    });

    state.user = {
      ...state.user,
      preferences: payload.preferences,
    };
    renderUser();
    showToast("Preferences saved.");
  } catch (error) {
    showToast(error.message);
  }
}

async function handleTestEmail() {
  try {
    const payload = await api("/api/notifications/test", {
      method: "POST",
    });

    state.lastDevCode = payload.devVerificationCode || state.lastDevCode;
    await refreshSession();
    showToast("Test notification sent.");
  } catch (error) {
    showToast(error.message);
  }
}

async function handleLogout() {
  try {
    await api("/api/auth/logout", { method: "POST" });
    state.user = null;
    state.lastDevCode = null;
    renderUser();
    showToast("Signed out.");
  } catch (error) {
    showToast(error.message);
  }
}

elements.signupForm?.addEventListener("submit", handleSignup);
elements.loginForm?.addEventListener("submit", handleLogin);
elements.verifyForm?.addEventListener("submit", handleVerify);
elements.preferencesForm?.addEventListener("submit", handlePreferences);
elements.logoutButton?.addEventListener("click", handleLogout);
elements.resendButton?.addEventListener("click", handleResend);
elements.testEmailButton?.addEventListener("click", handleTestEmail);

refreshSession();
