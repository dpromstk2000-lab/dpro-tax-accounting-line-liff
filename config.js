window.DPRO_TAX_CONFIG = Object.freeze({
  APP_NAME: "DPRO 税理士・会計事務所 LINE",
  VERSION: "TAX-R10.5-STAGING-READONLY-INTEGRATION-20261011",
  API_BASE: "https://dpro-tax-accounting-line-r7-staging.dpromstk2000.workers.dev",
  OFFICE_CODE: "dpro_taxacc_demo",
  // R7: LIFF ID is public configuration, not the LINE channel secret.
  LIFF_ID: "", // Requires the actual LIFF app ID before production release
  ENABLE_DEMO_UI: false, // Production must remain false
  // R8.6 STAGING ONLY: separate read-only demo preview, never a production CRM API.
  TAX_R85_PREVIEW_ENABLED: true,
  // R9: not connected to staff authentication or an approval-writing API.
  TAX_R9_FORMAL_APPROVAL_ENABLED: false,
  // Staging owner UI gateway only: does NOT merge the admin-code and staff-auth sessions.
  TAX_R98_REVIEW_NAV_ENABLED: true,
  TAX_R98_REVIEW_URL: "https://dpro-tax-accounting-r84-preview.dpromstk2000.workers.dev/review-staging",
  // R10.3: public URL to a separate origin with Supabase staff Auth. Never pass owner admin code/token.
  TAX_R103_STATUS_GATEWAY_ENABLED: true,
  TAX_R103_STATUS_URL: "https://dpro-tax-accounting-r102-staff-review.dpromstk2000.workers.dev/staff-review.html",
  // FRONTEND SAFETY GUARD ONLY. Does not substitute for SQL/API gate.
  TAX_R103_BLOCK_LEGACY_MONTHLY_FORM: true,
  // R10.5 GitHub staging is browser-read-only until shared-DB server-side guards pass separate QA.
  // Frontend protection is not a security boundary; do not release any real CRM API on this basis.
  TAX_R105_STAGING_READ_ONLY: true,
  TAX_R9_BATCH_SEND_ENABLED: false,
  TAX_R85_PREVIEW_URL: "https://dpro-tax-accounting-r84-preview.dpromstk2000.workers.dev/preview",
  DEMO_LINE_USER_ID: "demo_tax_line_001",
  DEMO_CLIENT_CODE: "TXC-000001",
  TIMEZONE: "Asia/Tokyo",
  REPOSITORY: "dpro-tax-accounting-line-liff",
  PAGES_BASE: "https://dpromstk2000-lab.github.io/dpro-tax-accounting-line-liff/",
});

/* DPRO TUTORIAL STANDARD V1.1 / TAX R3 loader. Public index only. */
(() => {
  const boot = () => {
    if (!document.body || document.body.dataset.page !== "public") return;
    if (document.querySelector('script[data-dpro-tutorial-tax-v11]')) return;
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "dpro-tutorial-v1.1.css";
    css.dataset.dproTutorialTaxV11 = "style";
    document.head.appendChild(css);
    const script = document.createElement("script");
    script.src = "dpro-tutorial-v1.1.js";
    script.defer = true;
    script.dataset.dproTutorialTaxV11 = "script";
    document.head.appendChild(script);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
