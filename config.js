window.DPRO_TAX_CONFIG = Object.freeze({
  APP_NAME: "DPRO 税理士・会計事務所 LINE",
  VERSION: "TAX-R7-LIFF-AUTH-STAGING-20261010",
  API_BASE: "https://dpro-tax-accounting-line-api.dpromstk2000.workers.dev",
  OFFICE_CODE: "dpro_taxacc_demo",
  // R7: LIFF ID is public configuration, not the LINE channel secret.
  LIFF_ID: "", // Requires the actual LIFF app ID before production release
  ENABLE_DEMO_UI: false, // Production must remain false
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
