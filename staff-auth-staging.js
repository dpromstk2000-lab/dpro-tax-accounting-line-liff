(() => {
  "use strict";
  // A project-scoped publishable key is designed to be public. Never add service_role here.
  const ORIGIN = "https://cbknucemarcpbscirzyv.supabase.co";
  const PUBLISHABLE = "sb_publishable_cT4vj0FoU1MtjFayuk7HVw_YcuSMR5J";
  const form = document.querySelector("#login-form");
  const emailField = document.querySelector("#test-email");
  const passwordField = document.querySelector("#test-password");
  const loginButton = document.querySelector("#login-button");
  const logoutButton = document.querySelector("#logout-button");
  const status = document.querySelector("#status");
  let token = null;
  let expiryTimer = null;
  let busy = false;

  function tell(message, kind = "neutral") {
    status.className = `status ${kind}`;
    status.textContent = message;
  }
  function clearToken() {
    token = null;
    if (expiryTimer !== null) clearTimeout(expiryTimer);
    expiryTimer = null;
    logoutButton.disabled = true;
  }
  async function authFetch(path, init) {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 15000);
    try {
      return await fetch(`${ORIGIN}${path}`, {
        ...init,
        redirect: "error",
        cache: "no-store",
        credentials: "omit",
        signal: ctrl.signal,
        headers: { "apikey": PUBLISHABLE, ...(init?.headers || {}) },
      });
    } finally { clearTimeout(timeout); }
  }
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy) return;
    const email = emailField.value.trim();
    const password = passwordField.value;
    if (!email || !emailField.checkValidity() || password.length < 8) {
      tell("テスト用メールアドレスと8文字以上のパスワードを入力してください。", "error");
      return;
    }
    busy = true;
    loginButton.disabled = true;
    clearToken();
    tell("Supabase Authで本人確認中です。", "neutral");
    try {
      const response = await authFetch("/auth/v1/token?grant_type=password", {
        method: "POST", headers: {"content-type": "application/json"},
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) {
        tell("本人確認に失敗しました。テスト用アカウントの状態を確認してください。", "error");
        return;
      }
      const payload = await response.json();
      if (typeof payload.access_token !== "string" || !payload.access_token) {
        tell("認証応答が不完全でした。", "error");
        return;
      }
      token = payload.access_token;
      const checked = await authFetch("/auth/v1/user", {
        method: "GET",headers: {authorization: `Bearer ${token}`},
      });
      if (!checked.ok) {
        clearToken();
        tell("本人確認トークンを検証できませんでした。", "error");
        return;
      }
      const user = await checked.json();
      if (typeof user.id !== "string" || !user.id) {
        clearToken();
        tell("本人確認の応答が不完全でした。", "error");
        return;
      }
      passwordField.value = "";
      logoutButton.disabled = false;
      const ttl = Math.min(3600, Math.max(60, Number(payload.expires_in) || 3600));
      expiryTimer = setTimeout(() => {
        clearToken();
        tell("本人確認の有効時間が終了しました。再ログインしてください。", "neutral");
      }, ttl * 1000);
      tell("Supabase本人確認に成功しました。DPRO TAXのスタッフ権限・承認権限はまだ未確認です。", "success");
    } catch (_) {
      clearToken();
      tell("認証サーバーとの通信が完了しませんでした。接続環境を確認してください。", "error");
    } finally {
      passwordField.value = "";
      busy = false;
      loginButton.disabled = false;
    }
  });
  logoutButton.addEventListener("click", async () => {
    if (busy) return;
    busy = true;
    const oldToken = token;
    clearToken();
    passwordField.value = "";
    tell("ログアウトしました。この画面にトークンは残しません。", "neutral");
    try {
      if (oldToken) await authFetch("/auth/v1/logout", {
        method:"POST", headers:{ authorization:`Bearer ${oldToken}` },
      });
    } catch (_) { /* Remote logout failure never retains a local token. */ }
    finally { busy = false; }
  });
})();
