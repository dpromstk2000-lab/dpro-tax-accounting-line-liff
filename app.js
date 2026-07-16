(() => {
  "use strict";

  const CONFIG = window.DPRO_TAX_CONFIG;
  const page = document.body.dataset.page;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const params = new URLSearchParams(location.search);
  const isDemo = params.get("demo") === "1";
  const lineUserId = params.get("line_user_id") || (isDemo ? CONFIG.DEMO_LINE_USER_ID : "");
  const apiBase = location.hostname === "terminal.local" ? "/tax-api" : CONFIG.API_BASE;

  const labels = {
    corporation: "法人", sole_proprietor: "個人事業", individual: "個人", spot: "スポット",
    onboarding: "初期登録", active: "契約中", paused: "休止", ended: "終了",
    received: "受付", checking: "確認中", waiting_client: "顧問先待ち", waiting_documents: "資料待ち",
    in_progress: "対応中", staff_review: "担当確認", final_review: "最終確認", completed: "完了",
    on_hold: "保留", cancelled: "取消", requested: "依頼中", partial: "一部提出", reviewing: "確認中",
    rejected: "差戻し", not_notified: "未通知", not_required: "不要", missing: "未提出", accepted: "確認済み",
    new: "新着", quarantined: "隔離", deleted: "削除済み", confirmed: "確定", change_requested: "変更希望",
    cancel_requested: "取消希望", no_show: "無断欠席", open: "対応中", waiting_office: "事務所対応待ち",
    resolved: "解決", closed: "終了", todo: "未着手", waiting_staff: "職員待ち",
    low: "低", normal: "通常", high: "高", urgent: "至急",
    owner: "代表", manager: "管理者", reviewer: "確認者", staff: "担当者",
    in_person: "事務所", online: "オンライン", phone: "電話",
    tax_consultation: "税務相談", documents: "資料", appointment: "面談", contract: "契約", billing: "料金・請求", other: "その他",
    monthly_documents: "月次資料", corporate_tax_return: "法人税申告", individual_tax_return: "確定申告",
    consumption_tax: "消費税", year_end_adjustment: "年末調整", depreciable_assets: "償却資産",
    statutory_reports: "法定調書", new_engagement: "新規契約", tax_audit_support: "税務調査", tax_return: "申告",
    monthly: "月次", closing: "決算", consultation: "相談", document_check: "資料確認", reply: "返信",
    review: "確認開始", accept: "確認済み", reject: "差戻し", upload: "提出", view: "閲覧", download: "ダウンロード", quarantine: "隔離", delete: "削除",
    client_contact: "顧問先担当者", system: "システム", deadline: "期限", follow_up: "フォロー",
  };

  function esc(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
  }

  function label(value) { return labels[value] || value || "－"; }

  function tone(value) {
    if (["active", "accepted", "completed", "confirmed", "resolved"].includes(value)) return "success";
    if (["urgent", "rejected", "cancelled", "quarantined", "deleted"].includes(value)) return "danger";
    if (["high", "waiting_client", "waiting_documents", "change_requested", "cancel_requested", "partial"].includes(value)) return "warning";
    if (["new", "requested", "checking", "in_progress", "reviewing", "open"].includes(value)) return "info";
    return "default";
  }

  function badge(value) { return `<span class="status" data-tone="${tone(value)}">${esc(label(value))}</span>`; }

  function formatDate(value, withTime = false) {
    if (!value) return "－";
    const date = new Date(value.length === 10 ? `${value}T00:00:00+09:00` : value);
    if (Number.isNaN(date.getTime())) return esc(value);
    return new Intl.DateTimeFormat("ja-JP", {
      timeZone: CONFIG.TIMEZONE, year: "numeric", month: "numeric", day: "numeric", weekday: "short",
      ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    }).format(date);
  }

  function toIso(localValue) {
    if (!localValue) return null;
    const value = String(localValue);
    return new Date(value.length === 16 ? `${value}:00+09:00` : value).toISOString();
  }

  function formatBytes(value) {
    const bytes = Number(value || 0);
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  }

  function normalizePhone(value) {
    let text = String(value || "").normalize("NFKC").replace(/[^0-9+]/g, "");
    if (text.startsWith("+81")) text = `0${text.slice(3)}`;
    return text.replace(/\D/g, "");
  }

  function empty(message) { return `<div class="empty">${esc(message)}</div>`; }

  function alertBox(message, type = "error") {
    return `<div class="alert alert-${type}">${esc(message)}</div>`;
  }

  function toast(message, type = "success") {
    const stack = $("#toast-stack");
    if (!stack) return;
    const node = document.createElement("div");
    node.className = `toast ${type === "error" ? "error" : ""}`;
    node.textContent = message;
    stack.append(node);
    setTimeout(() => node.remove(), 4300);
  }

  function setButtonBusy(button, busy, labelText = "処理中...") {
    if (!button) return;
    if (busy) {
      button.dataset.originalText = button.textContent;
      button.disabled = true;
      button.innerHTML = `<span class="spinner" style="width:18px;height:18px"></span>${esc(labelText)}`;
    } else {
      button.disabled = false;
      button.textContent = button.dataset.originalText || "完了";
    }
  }

  async function api(path, { method = "GET", body, adminKey, lineId, formData } = {}) {
    const headers = { Accept: "application/json" };
    if (adminKey) headers["X-Admin-Key"] = adminKey;
    if (lineId) headers["X-Line-User-Id"] = lineId;
    if (!formData && body !== undefined) headers["Content-Type"] = "application/json";
    const response = await fetch(`${apiBase}${path}`, {
      method,
      headers,
      body: formData || (body !== undefined ? JSON.stringify(body) : undefined),
    });
    const text = await response.text();
    let data;
    try { data = text ? JSON.parse(text) : {}; } catch { data = { message: text }; }
    if (!response.ok || data.ok === false) {
      const error = new Error(data.message || `通信エラー（${response.status}）`);
      error.status = response.status;
      error.code = data.error;
      error.data = data;
      throw error;
    }
    return data;
  }

  function formObject(form) {
    const result = {};
    for (const [key, value] of new FormData(form).entries()) {
      if (typeof value === "string") result[key] = value.trim();
    }
    return result;
  }

  function openModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.hidden = false;
    document.body.style.overflow = "hidden";
    setTimeout(() => $("input, select, textarea, button", modal)?.focus(), 0);
  }

  function closeModal(modal) {
    const target = typeof modal === "string" ? document.getElementById(modal) : modal?.closest?.(".modal-backdrop") || modal;
    if (target) target.hidden = true;
    document.body.style.overflow = "";
  }

  function bindModals() {
    document.addEventListener("click", (event) => {
      const opener = event.target.closest("[data-open-modal]");
      if (opener) openModal(opener.dataset.openModal);
      if (event.target.closest("[data-close-modal]")) closeModal(event.target);
      if (event.target.classList.contains("modal-backdrop")) closeModal(event.target);
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") $$(".modal-backdrop:not([hidden])").forEach(closeModal);
    });
  }

  function todayJst() {
    return new Intl.DateTimeFormat("en-CA", { timeZone: CONFIG.TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  }

  async function initPublic() {
    const officeData = await api("/api/public/office");
    const office = officeData.office;
    const serviceSelect = $("#booking-service");
    serviceSelect.innerHTML = `<option value="">選択してください</option>${officeData.services.map((service) => `<option value="${esc(service.id)}" data-duration="${service.duration_minutes}" data-channels="${esc((service.channel_options || []).join(","))}">${esc(service.service_name)}（${service.duration_minutes}分）</option>`).join("")}`;
    $("#security-notice-text").textContent = office.security_notice;
    const dateInput = $("#booking-date");
    dateInput.min = todayJst();
    const max = new Date(`${todayJst()}T12:00:00+09:00`);
    max.setDate(max.getDate() + Number(office.booking_open_days || 90));
    dateInput.max = new Intl.DateTimeFormat("en-CA", { timeZone: CONFIG.TIMEZONE }).format(max);

    async function loadSlots() {
      const serviceId = serviceSelect.value;
      const date = dateInput.value;
      $("#booking-start").value = "";
      $("#slot-grid").innerHTML = "";
      if (!serviceId || !date) { $("#slot-message").textContent = "相談内容と希望日を選択してください。"; return; }
      $("#slot-message").textContent = "空き時間を確認中...";
      try {
        const data = await api(`/api/public/slots?date=${encodeURIComponent(date)}&service_id=${encodeURIComponent(serviceId)}`);
        $("#slot-message").textContent = data.slots.length ? "希望時間を選択してください。" : "この日は予約可能な時間がありません。別の日を選択してください。";
        $("#slot-grid").innerHTML = data.slots.map((slot) => `<button class="slot-button" type="button" data-slot="${esc(slot.start_at)}" ${slot.available ? "" : "disabled"}>${esc(slot.local_time)}</button>`).join("");
      } catch (error) {
        $("#slot-message").textContent = error.message;
      }
    }
    serviceSelect.addEventListener("change", () => {
      const option = serviceSelect.selectedOptions[0];
      const allowed = String(option?.dataset.channels || "").split(",").filter(Boolean);
      $$("#appointment-channel option").forEach((node) => { node.hidden = allowed.length && !allowed.includes(node.value); });
      if (allowed.length && !allowed.includes($("#appointment-channel").value)) $("#appointment-channel").value = allowed[0];
      loadSlots();
    });
    dateInput.addEventListener("change", loadSlots);
    $("#slot-grid").addEventListener("click", (event) => {
      const button = event.target.closest("[data-slot]");
      if (!button) return;
      $$(".slot-button", $("#slot-grid")).forEach((node) => node.classList.toggle("selected", node === button));
      $("#booking-start").value = button.dataset.slot;
    });

    $("#booking-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const submit = $("button[type=submit]", form);
      const values = formObject(form);
      if (!values.requested_start_at) { $("#public-alert").innerHTML = alertBox("希望時間を選択してください。"); return; }
      delete values.booking_date;
      if (lineUserId) values.line_user_id = lineUserId;
      try {
        setButtonBusy(submit, true, "送信中...");
        const data = await api("/api/public/appointments", { method: "POST", body: values, lineId: lineUserId });
        $("#public-alert").innerHTML = alertBox(data.message, "success");
        form.reset(); $("#slot-grid").innerHTML = ""; $("#slot-message").textContent = "相談内容と希望日を選択してください。";
        scrollTo({ top: $("#booking").offsetTop - 90, behavior: "smooth" });
      } catch (error) { $("#public-alert").innerHTML = alertBox(error.message); }
      finally { setButtonBusy(submit, false); }
    });

    $("#inquiry-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget; const submit = $("button[type=submit]", form); const values = formObject(form);
      if (lineUserId) values.line_user_id = lineUserId;
      try {
        setButtonBusy(submit, true, "送信中...");
        const data = await api("/api/public/inquiries", { method: "POST", body: values, lineId: lineUserId });
        toast(data.message); form.reset();
      } catch (error) { toast(error.message, "error"); }
      finally { setButtonBusy(submit, false); }
    });

    $("#register-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget; const submit = $("button[type=submit]", form); const values = formObject(form);
      values.privacy_consent = $("input[name=privacy_consent]", form).checked;
      values.terms_consent = $("input[name=terms_consent]", form).checked;
      values.line_user_id = lineUserId || (isDemo ? `demo_tax_new_${Date.now()}` : "");
      if (!values.line_user_id) { toast("初回登録はLINEメニューから開いてください。", "error"); return; }
      try {
        setButtonBusy(submit, true, "登録中...");
        const data = await api("/api/public/register", { method: "POST", body: values, lineId: values.line_user_id });
        toast(data.message); closeModal("register-modal"); form.reset();
      } catch (error) { toast(error.message, "error"); }
      finally { setButtonBusy(submit, false); }
    });
  }

  async function initMember() {
    $("#member-version").textContent = CONFIG.VERSION;
    if (!lineUserId) {
      $("#member-loading").hidden = true;
      $("#member-alert").innerHTML = alertBox("LINE連携情報がありません。LINEメニューからマイページを開いてください。");
      return;
    }
    let home;
    let documents;
    async function loadMember() {
      [home, documents] = await Promise.all([
        api("/api/member", { lineId: lineUserId }),
        api("/api/member/documents", { lineId: lineUserId }),
      ]);
      renderMember();
    }
    function renderMember() {
      const contact = home.contact; const client = home.client;
      $("#member-name").textContent = contact.full_name;
      $("#member-position").textContent = contact.position_title || "顧問先ご担当者";
      $("#member-avatar").textContent = contact.full_name.slice(0, 1);
      $("#client-name").textContent = `${client.legal_name} 様`;
      $("#client-meta").textContent = `${client.client_code} ／ ${label(client.client_type)} ／ ${label(client.status)}`;
      $("#member-security-notice").textContent = home.office.security_notice;
      const activeCases = home.cases.filter((item) => !["completed", "cancelled"].includes(item.status));
      const missing = documents.requests.reduce((sum, request) => sum + request.items.filter((item) => item.status === "missing" && item.is_required).length, 0);
      const future = home.appointments.filter((item) => !["completed", "cancelled", "no_show"].includes(item.status) && new Date(item.confirmed_start_at || item.requested_start_at) > new Date());
      const openInquiries = home.inquiries.filter((item) => !["resolved", "closed"].includes(item.status));
      $("#summary-cases").textContent = activeCases.length;
      $("#summary-documents").textContent = missing;
      $("#summary-appointments").textContent = future.length;
      $("#summary-inquiries").textContent = openInquiries.length;
      $("#case-list").innerHTML = home.cases.length ? home.cases.map((item) => `<article class="list-item"><div class="list-item-head"><div><h3>${esc(item.title)}</h3><div class="meta-row"><span>${esc(label(item.case_type))}</span><span>案件番号：${esc(item.case_code)}</span></div></div>${badge(item.status)}</div><p>${esc(item.public_summary || item.client_status_label || "事務所で確認を進めています。")}</p><div class="progress"><span style="width:${Number(item.progress_percent || 0)}%"></span></div><div class="meta-row"><span>進捗 ${Number(item.progress_percent || 0)}%</span><span>期限：${formatDate(item.deadline_date)}</span>${item.next_action ? `<span>次：${esc(item.next_action)}</span>` : ""}</div></article>`).join("") : empty("表示できる案件はありません。");
      $("#document-request-list").innerHTML = documents.requests.length ? documents.requests.map((request) => `<article class="list-item"><div class="list-item-head"><div><h3>${esc(request.title)}</h3><div class="meta-row"><span>${esc(request.target_period_label || label(request.request_category))}</span><span>期限：${formatDate(request.due_on)}</span></div></div>${badge(request.status)}</div><p>${esc(request.public_message || "必要な資料をご確認ください。")}</p><div class="list" style="margin-top:15px">${request.items.map((item) => { const submitted = (request.submissions || []).filter((file) => file.request_item_id === item.id); return `<div class="list-item" style="padding:15px"><div class="list-item-head"><div><strong>${esc(item.item_name)}</strong>${item.is_required ? '<span class="required">必須</span>' : ""}<div class="small muted">${esc(item.description || "")}</div></div><div class="button-row">${badge(item.status)}${home.permissions.can_submit_documents && !["accepted", "not_required"].includes(item.status) ? `<button class="btn btn-primary btn-sm" type="button" data-upload-request="${esc(request.id)}" data-upload-item="${esc(item.id)}" data-upload-name="${esc(item.item_name)}">${submitted.length ? "再提出" : "提出"}</button>` : ""}</div></div>${submitted.length ? `<div class="submission-history">${submitted.map((file) => `<div class="submission-row"><div><strong>${esc(file.original_filename)}</strong><small>${formatDate(file.submitted_at, true)} ／ ${formatBytes(file.file_size_bytes)} ／ ${esc(file.submission_code)}</small>${file.rejection_reason ? `<small class="required">差戻し理由：${esc(file.rejection_reason)}</small>` : ""}</div><div class="button-row">${badge(file.status)}${file.storage_path && !file.is_demo_placeholder ? `<button class="btn btn-secondary btn-sm" type="button" data-member-document-view="${esc(file.id)}">確認</button>` : ""}</div></div>`).join("")}</div>` : ""}</div>`; }).join("")}</div></article>`).join("") : empty("現在、提出依頼はありません。");
      $("#appointment-list").innerHTML = home.appointments.length ? home.appointments.map((item) => `<article class="list-item"><div class="list-item-head"><div><h3>${formatDate(item.confirmed_start_at || item.requested_start_at, true)}</h3><div class="meta-row"><span>${esc(label(item.appointment_channel))}</span><span>${Number(item.duration_minutes)}分</span><span>${esc(item.appointment_code)}</span></div></div>${badge(item.status)}</div><p>${esc(item.public_message || "")}</p>${["requested", "confirmed", "change_requested", "cancel_requested"].includes(item.status) ? `<div class="button-row" style="margin-top:14px"><button class="btn btn-secondary btn-sm" type="button" data-appointment-action="change" data-appointment-id="${esc(item.id)}">変更希望</button><button class="btn btn-danger btn-sm" type="button" data-appointment-action="cancel" data-appointment-id="${esc(item.id)}">取消希望</button></div>` : ""}</article>`).join("") : empty("面談予約はありません。");
      $("#inquiry-list").innerHTML = home.inquiries.length ? home.inquiries.map((item) => `<article class="list-item"><div class="list-item-head"><div><h3>${esc(item.subject)}</h3><div class="meta-row"><span>${esc(label(item.category))}</span><span>${formatDate(item.created_at, true)}</span></div></div>${badge(item.status)}</div><p>${esc(item.body)}</p></article>`).join("") : empty("相談履歴はありません。");
      $("#member-loading").hidden = true;
    }

    document.addEventListener("click", (event) => {
      const tab = event.target.closest("[data-member-tab]");
      if (tab) {
        $$("[data-member-tab]").forEach((node) => node.classList.toggle("active", node === tab));
        $$("[data-member-panel]").forEach((node) => { node.hidden = node.dataset.memberPanel !== tab.dataset.memberTab; });
      }
      const upload = event.target.closest("[data-upload-request]");
      if (upload) {
        $("#upload-request-id").value = upload.dataset.uploadRequest;
        $("#upload-item-id").value = upload.dataset.uploadItem;
        $("#upload-title").textContent = `${upload.dataset.uploadName}を提出`;
        $("#upload-file-info").hidden = true; $("#upload-file-info").classList.remove("error"); $("#upload-file").value = "";
        openModal("upload-modal");
      }
      const documentView = event.target.closest("[data-member-document-view]");
      if (documentView) viewMemberDocument(documentView.dataset.memberDocumentView);
      const appointmentAction = event.target.closest("[data-appointment-action]");
      if (appointmentAction) {
        $("#appointment-action-id").value = appointmentAction.dataset.appointmentId;
        $("#appointment-action-type").value = appointmentAction.dataset.appointmentAction;
        $("#appointment-change-field").hidden = appointmentAction.dataset.appointmentAction === "cancel";
        $("#appointment-action-title").textContent = appointmentAction.dataset.appointmentAction === "cancel" ? "予約取消の希望" : "予約変更の希望";
        openModal("appointment-modal");
      }
    });

    $("#upload-file").addEventListener("change", (event) => {
      const file = event.currentTarget.files[0]; const info = $("#upload-file-info"); info.classList.remove("error");
      if (!file) { info.hidden = true; return; }
      const allowed = documents.allowed_mime_types || []; const limit = Number(documents.max_file_bytes || 10485760); const errors = [];
      if (!allowed.includes(String(file.type || "").toLowerCase())) errors.push("対応していないファイル形式です。");
      if (file.size <= 0 || file.size > limit) errors.push(`ファイル容量は${Math.floor(limit / 1048576)}MB以下にしてください。`);
      info.hidden = false; info.classList.toggle("error", errors.length > 0); info.textContent = errors.length ? errors.join(" ") : `${file.name}（${formatBytes(file.size)}）を選択しました。`;
    });

    async function viewMemberDocument(id) {
      try { const data = await api(`/api/member/documents/${id}/signed-url`, { lineId: lineUserId }); window.open(data.signed_url, "_blank", "noopener,noreferrer"); }
      catch (error) { toast(error.message, "error"); }
    }

    $("#upload-form").addEventListener("submit", async (event) => {
      event.preventDefault(); const form = event.currentTarget; const button = $("button[type=submit]", form);
      const file = $("#upload-file").files[0]; const allowed = documents.allowed_mime_types || []; const limit = Number(documents.max_file_bytes || 10485760);
      if (!file || !allowed.includes(String(file.type || "").toLowerCase()) || file.size <= 0 || file.size > limit) { toast("提出可能な形式・容量のファイルを選択してください。", "error"); return; }
      const data = new FormData(); data.set("file", file); data.set("request_id", $("#upload-request-id").value); data.set("request_item_id", $("#upload-item-id").value); data.set("sensitive_data_confirmed", String($("#sensitive-confirm").checked));
      try { setButtonBusy(button, true, "提出中..."); const result = await api("/api/member/documents/upload", { method: "POST", lineId: lineUserId, formData: data }); toast(result.message); closeModal("upload-modal"); form.reset(); await loadMember(); }
      catch (error) { toast(error.message, "error"); } finally { setButtonBusy(button, false); }
    });

    $("#member-inquiry-form").addEventListener("submit", async (event) => {
      event.preventDefault(); const form = event.currentTarget; const button = $("button[type=submit]", form);
      try { setButtonBusy(button, true, "送信中..."); const result = await api("/api/public/inquiries", { method: "POST", body: { ...formObject(form), line_user_id: lineUserId }, lineId: lineUserId }); toast(result.message); closeModal("inquiry-modal"); form.reset(); await loadMember(); }
      catch (error) { toast(error.message, "error"); } finally { setButtonBusy(button, false); }
    });

    $("#appointment-action-form").addEventListener("submit", async (event) => {
      event.preventDefault(); const form = event.currentTarget; const button = $("button[type=submit]", form); const id = $("#appointment-action-id").value; const type = $("#appointment-action-type").value; const body = { message: $("#appointment-action-message").value, line_user_id: lineUserId };
      if (type === "change") body.change_requested_start_at = toIso($("#appointment-change-at").value);
      try { setButtonBusy(button, true, "送信中..."); const result = await api(`/api/member/appointments/${id}/${type}`, { method: "PATCH", body, lineId: lineUserId }); toast(result.message); closeModal("appointment-modal"); form.reset(); await loadMember(); }
      catch (error) { toast(error.message, "error"); } finally { setButtonBusy(button, false); }
    });

    try { await loadMember(); } catch (error) { $("#member-loading").hidden = true; $("#member-alert").innerHTML = alertBox(error.message); }
  }

  const adminState = { key: "", dashboard: null, clients: [], cases: [], requests: [], documents: [], appointments: [], inquiries: [], tasks: [], staff: [], settings: null };

  function clientName(id) { return adminState.clients.find((item) => item.id === id)?.legal_name || "－"; }
  function staffName(id) { return adminState.staff.find((item) => item.id === id)?.display_name || "未割当"; }

  async function loadAdminData() {
    const key = adminState.key;
    const [dashboard, clients, cases, requests, documents, appointments, inquiries, tasks, staff, settings, officePublic] = await Promise.all([
      api("/api/admin/dashboard", { adminKey: key }), api("/api/admin/clients?limit=500", { adminKey: key }),
      api("/api/admin/cases?limit=500", { adminKey: key }), api("/api/admin/document-requests?limit=500", { adminKey: key }),
      api("/api/admin/documents?limit=500", { adminKey: key }), api("/api/admin/appointments?limit=500", { adminKey: key }),
      api("/api/admin/inquiries?limit=500", { adminKey: key }), api("/api/admin/tasks?limit=500", { adminKey: key }),
      api("/api/admin/staff?limit=500", { adminKey: key }), api("/api/admin/settings", { adminKey: key }), api("/api/public/office"),
    ]);
    Object.assign(adminState, { dashboard, clients: clients.clients, cases: cases.cases, requests: requests.document_requests, documents: documents.documents, appointments: appointments.appointments, inquiries: inquiries.inquiries, tasks: tasks.tasks, staff: staff.staff, settings, services: officePublic.services });
  }

  function fillAdminOptions() {
    const clientOptions = `<option value="">選択してください</option>${adminState.clients.filter((item) => item.status !== "ended").map((item) => `<option value="${esc(item.id)}">${esc(item.legal_name)}（${esc(item.client_code)}）</option>`).join("")}`;
    $$('[data-client-options]').forEach((select) => { select.innerHTML = clientOptions; });
    const serviceOptions = `<option value="">選択してください</option>${(adminState.services || []).map((item) => `<option value="${esc(item.id)}">${esc(item.service_name)}（${item.duration_minutes}分）</option>`).join("")}`;
    $$('[data-service-options]').forEach((select) => { select.innerHTML = serviceOptions; });
    const staffOptions = `<option value="">担当者を指定しない</option>${adminState.staff.filter((item) => item.is_active).map((item) => `<option value="${esc(item.id)}">${esc(item.display_name)}（${esc(label(item.role))}）</option>`).join("")}`;
    $$('[data-staff-options]').forEach((select) => { select.innerHTML = staffOptions; });
  }

  function renderOwner() {
    const counts = adminState.dashboard.counts || {};
    $("#metric-clients").textContent = counts.clients ?? adminState.clients.length;
    $("#metric-cases").textContent = counts.open_cases ?? adminState.cases.filter((item) => !["completed", "cancelled"].includes(item.status)).length;
    $("#metric-documents").textContent = counts.new_documents ?? adminState.documents.filter((item) => item.status === "new").length;
    $("#metric-inquiries").textContent = counts.open_inquiries ?? adminState.inquiries.filter((item) => !["resolved", "closed"].includes(item.status)).length;
    $("#dashboard-date").textContent = `${formatDate(new Date().toISOString())} の業務状況`;
    $("#owner-office-name").textContent = adminState.dashboard.office?.office_name || "DPRO税理士・会計事務所";
    const dc = adminState.dashboard.urgent_cases || [];
    $("#dashboard-cases").innerHTML = dc.length ? dc.slice(0, 5).map((item) => `<div class="list-item"><div class="list-item-head"><strong>${esc(item.title)}</strong>${badge(item.priority)}</div><div class="meta-row"><span>${esc(clientName(item.client_id))}</span><span>期限：${formatDate(item.deadline_date)}</span><span>進捗 ${item.progress_percent}%</span></div></div>`).join("") : empty("優先案件はありません。");
    const dt = adminState.dashboard.due_tasks || [];
    $("#dashboard-tasks").innerHTML = dt.length ? dt.slice(0, 6).map((item) => `<div class="list-item"><div class="list-item-head"><strong>${esc(item.title)}</strong>${badge(item.priority)}</div><div class="meta-row"><span>${formatDate(item.due_at, true)}</span><span>${esc(staffName(item.assigned_staff_id))}</span></div></div>`).join("") : empty("未完了タスクはありません。");
    const dd = adminState.dashboard.documents_to_review || [];
    $("#dashboard-documents").innerHTML = dd.length ? dd.slice(0, 5).map((item) => `<div class="list-item"><div class="list-item-head"><strong>${esc(item.original_filename)}</strong>${badge(item.status)}</div><div class="meta-row"><span>${esc(clientName(item.client_id))}</span><span>${formatDate(item.submitted_at, true)}</span></div></div>`).join("") : empty("確認待ち書類はありません。");
    const contactWork = [...(adminState.dashboard.active_appointments || []).slice(0, 3).map((item) => ({ title: `${formatDate(item.confirmed_start_at || item.requested_start_at, true)} ${item.requester_name}`, status: item.status })), ...(adminState.dashboard.open_inquiries || []).slice(0, 3).map((item) => ({ title: item.subject, status: item.status }))];
    $("#dashboard-contact-work").innerHTML = contactWork.length ? contactWork.map((item) => `<div class="list-item"><div class="list-item-head"><strong>${esc(item.title)}</strong>${badge(item.status)}</div></div>`).join("") : empty("対応中の面談・相談はありません。");
    renderClients(); renderCases(); renderDocuments(); renderAppointments(); renderInquiries(); renderTasks(); renderStaff(); renderSettings(); fillAdminOptions();
  }

  function renderClients() {
    const q = normalizePhone($("#client-search")?.value) || $("#client-search")?.value?.toLowerCase() || "";
    const status = $("#client-status-filter")?.value || "";
    const list = adminState.clients.filter((item) => (!status || item.status === status) && (!q || [item.client_code, item.legal_name, item.trade_name, item.representative_name, item.phone_normalized, item.phone, item.email].some((value) => String(value || "").normalize("NFKC").toLowerCase().includes(q))));
    $("#clients-table-body").innerHTML = list.length ? list.map((item) => `<tr><td><strong>${esc(item.legal_name)}</strong><div class="small muted">${esc(item.client_code)}${item.representative_name ? ` ／ ${esc(item.representative_name)}` : ""}</div></td><td>${esc(label(item.client_type))}</td><td>${esc(item.phone || "－")}</td><td>${esc(staffName(item.assigned_staff_id))}</td><td>${badge(item.status)}</td><td><div class="table-actions"><button class="btn btn-secondary btn-sm" data-client-detail="${item.id}" type="button">詳細</button><button class="btn btn-danger btn-sm" data-soft-delete="client" data-id="${item.id}" type="button">終了</button></div></td></tr>`).join("") : `<tr><td colspan="6">${empty("一致する顧問先がありません。")}</td></tr>`;
  }

  function renderCases() {
    const q = $("#case-search")?.value?.toLowerCase() || ""; const status = $("#case-status-filter")?.value || "";
    const list = adminState.cases.filter((item) => (!status || item.status === status) && (!q || [item.case_code, item.title, item.next_action, item.public_summary].some((value) => String(value || "").toLowerCase().includes(q))));
    $("#cases-table-body").innerHTML = list.length ? list.map((item) => `<tr><td><strong>${esc(item.title)}</strong><div class="small muted">${esc(item.case_code)} ／ ${esc(label(item.case_type))}</div></td><td>${esc(clientName(item.client_id))}</td><td>${formatDate(item.deadline_date)}${item.deadline_is_confirmed ? " ✓" : ""}</td><td><div style="min-width:110px"><strong>${item.progress_percent}%</strong><div class="progress"><span style="width:${item.progress_percent}%"></span></div></div></td><td>${badge(item.status)}</td><td><div class="table-actions"><button class="btn btn-secondary btn-sm" data-case-progress="${item.id}" type="button">進捗更新</button><button class="btn btn-danger btn-sm" data-soft-delete="case" data-id="${item.id}" type="button">取消</button></div></td></tr>`).join("") : `<tr><td colspan="6">${empty("案件がありません。")}</td></tr>`;
  }

  function renderDocuments() {
    const status = $("#document-status-filter")?.value || ""; const query = ($("#document-search")?.value || "").trim().normalize("NFKC").toLowerCase();
    const list = adminState.documents.filter((item) => (!status || item.status === status) && (!query || [item.original_filename, item.submission_code, item.mime_type, clientName(item.client_id)].some((value) => String(value || "").normalize("NFKC").toLowerCase().includes(query))));
    $("#documents-table-body").innerHTML = list.length ? list.map((item) => `<tr><td>${formatDate(item.submitted_at, true)}</td><td>${esc(clientName(item.client_id))}</td><td><strong>${esc(item.original_filename)}</strong><div class="small muted">${esc(item.submission_code)} ／ ${formatBytes(item.file_size_bytes)}</div></td><td>${badge(item.status)}${item.reviewed_at ? `<div class="small muted">${formatDate(item.reviewed_at, true)}</div>` : ""}</td><td><button class="btn ${["new", "reviewing"].includes(item.status) ? "btn-primary" : "btn-secondary"} btn-sm" data-document-review-open="${item.id}" type="button">確認画面</button></td></tr>`).join("") : `<tr><td colspan="5">${empty("条件に一致する提出書類がありません。")}</td></tr>`;
    $("#requests-table-body").innerHTML = adminState.requests.length ? adminState.requests.map((item) => `<tr><td><strong>${esc(item.title)}</strong><div class="small muted">${esc(item.request_code)} ／ ${item.items?.length || 0}項目</div></td><td>${esc(clientName(item.client_id))}</td><td>${formatDate(item.due_on)}</td><td>${badge(item.status)}</td><td><button class="btn btn-danger btn-sm" data-soft-delete="request" data-id="${item.id}" type="button">終了</button></td></tr>`).join("") : `<tr><td colspan="5">${empty("資料依頼がありません。")}</td></tr>`;
  }

  function renderAppointments() {
    const status = $("#appointment-status-filter")?.value || ""; const list = adminState.appointments.filter((item) => !status || item.status === status);
    $("#appointments-table-body").innerHTML = list.length ? list.map((item) => `<tr><td><strong>${formatDate(item.confirmed_start_at || item.requested_start_at, true)}</strong><div class="small muted">${item.duration_minutes}分${item.change_requested_start_at ? ` ／ 変更希望 ${formatDate(item.change_requested_start_at, true)}` : ""}</div></td><td>${esc(item.requester_name)}<div class="small muted">${esc(item.requester_phone || item.requester_email || "")}</div></td><td>${esc(label(item.appointment_channel))}</td><td>${esc(staffName(item.assigned_staff_id))}</td><td>${badge(item.status)}</td><td><div class="table-actions"><button class="btn btn-secondary btn-sm" data-appointment-edit="${item.id}" type="button">日時変更</button><button class="btn btn-primary btn-sm" data-appointment-status="confirmed" data-id="${item.id}" type="button">確定</button><button class="btn btn-secondary btn-sm" data-appointment-status="completed" data-id="${item.id}" type="button">完了</button><button class="btn btn-danger btn-sm" data-soft-delete="appointment" data-id="${item.id}" type="button">取消</button></div></td></tr>`).join("") : `<tr><td colspan="6">${empty("予約がありません。")}</td></tr>`;
  }

  function renderInquiries() {
    const status = $("#inquiry-status-filter")?.value || ""; const list = adminState.inquiries.filter((item) => !status || item.status === status);
    $("#inquiries-table-body").innerHTML = list.length ? list.map((item) => `<tr><td>${formatDate(item.created_at, true)}</td><td><strong>${esc(item.subject)}</strong><div class="small muted" style="max-width:360px">${esc(item.body)}</div></td><td>${esc(label(item.category))}</td><td>${badge(item.priority)}</td><td>${badge(item.status)}</td><td><div class="table-actions"><button class="btn btn-secondary btn-sm" data-inquiry-status="open" data-id="${item.id}" type="button">対応中</button><button class="btn btn-primary btn-sm" data-inquiry-status="resolved" data-id="${item.id}" type="button">解決</button><button class="btn btn-danger btn-sm" data-soft-delete="inquiry" data-id="${item.id}" type="button">終了</button></div></td></tr>`).join("") : `<tr><td colspan="6">${empty("相談がありません。")}</td></tr>`;
  }

  function renderTasks() {
    $("#tasks-table-body").innerHTML = adminState.tasks.length ? adminState.tasks.map((item) => `<tr><td>${formatDate(item.due_at, true)}</td><td><strong>${esc(item.title)}</strong><div class="small muted">${esc(label(item.task_type))}</div></td><td>${esc(clientName(item.client_id))}</td><td>${badge(item.priority)}</td><td>${badge(item.status)}</td><td><div class="table-actions"><button class="btn btn-primary btn-sm" data-task-complete="${item.id}" type="button">完了</button><button class="btn btn-danger btn-sm" data-soft-delete="task" data-id="${item.id}" type="button">取消</button></div></td></tr>`).join("") : `<tr><td colspan="6">${empty("タスクがありません。")}</td></tr>`;
  }

  function renderStaff() {
    $("#staff-table-body").innerHTML = adminState.staff.length ? adminState.staff.map((item) => `<tr><td><strong>${esc(item.display_name)}</strong><div class="small muted">${esc(item.staff_code)}</div></td><td>${esc(label(item.role))}</td><td>${esc(item.email || item.phone || "－")}</td><td>${item.can_review_documents ? "可" : "不可"}</td><td>${badge(item.is_active ? "active" : "ended")}</td><td><button class="btn btn-danger btn-sm" data-soft-delete="staff" data-id="${item.id}" type="button">無効化</button></td></tr>`).join("") : `<tr><td colspan="6">${empty("職員がいません。")}</td></tr>`;
  }

  function renderSettings() {
    const office = adminState.settings?.office; if (!office) return;
    $("#setting-office-name").value = office.office_name || ""; $("#setting-phone").value = office.phone || ""; $("#setting-email").value = office.email || ""; $("#setting-booking-days").value = office.booking_open_days || 90; $("#setting-postal-code").value = office.postal_code || ""; $("#setting-address").value = office.address || ""; $("#setting-subtitle").value = office.subtitle || ""; $("#setting-security").value = office.security_notice || "";
    const services = adminState.settings?.services || [];
    $("#settings-services").innerHTML = services.length ? services.map((item) => `<div class="list-item"><div class="list-item-head"><strong>${esc(item.service_name)}</strong><span class="status" data-tone="${item.is_active !== false ? "success" : "default"}">${item.is_active !== false ? "有効" : "無効"}</span></div><div class="meta-row"><span>${Number(item.duration_minutes)}分</span><span>${esc((item.channel_options || []).map(label).join("・"))}</span><span>${item.is_public !== false ? "顧客画面に表示" : "内部用"}</span></div><div class="table-actions settings-item-actions"><button class="btn btn-secondary btn-sm" type="button" data-edit-service="${esc(item.id)}">編集</button>${item.is_active !== false ? `<button class="btn btn-danger btn-sm" type="button" data-disable-service="${esc(item.id)}">無効化</button>` : ""}</div></div>`).join("") : empty("面談メニューがありません。");
    const dayNames = ["日", "月", "火", "水", "木", "金", "土"];
    const hourMap = new Map((adminState.settings?.business_hours || []).map((item) => [Number(item.day_of_week), item]));
    $("#business-hours-editor").innerHTML = dayNames.map((day, index) => {
      const item = hourMap.get(index) || { day_of_week: index, is_closed: index === 0 || index === 6, open_time: "09:00", close_time: "17:00" };
      return `<div class="hours-row" data-business-day="${index}"><strong>${day}曜日</strong><label class="hours-closed"><input type="checkbox" data-hour-closed ${item.is_closed ? "checked" : ""}> 休業</label><select aria-label="${day}曜日の開始" data-hour-open ${item.is_closed ? "disabled" : ""}>${halfHourOptions(String(item.open_time || "09:00").slice(0, 5))}</select><span>～</span><select aria-label="${day}曜日の終了" data-hour-close ${item.is_closed ? "disabled" : ""}>${halfHourOptions(String(item.close_time || "17:00").slice(0, 5))}</select></div>`;
    }).join("");
    const closed = (adminState.settings?.closed_dates || []).filter((item) => item.closed_date >= todayJst());
    $("#closed-date-value").min = todayJst();
    $("#closed-date-list").innerHTML = closed.length ? closed.map((item) => `<div class="closed-date-row"><div><strong>${formatDate(item.closed_date)}</strong><span>${esc(item.reason || (item.is_closed_all_day ? "終日休業" : "特別受付"))}</span>${item.is_closed_all_day ? "" : `<small>${esc(String(item.open_time || "").slice(0, 5))}～${esc(String(item.close_time || "").slice(0, 5))}</small>`}</div><button class="btn btn-danger btn-sm" type="button" data-delete-closed-date="${esc(item.id)}">削除</button></div>`).join("") : `<div class="empty compact-empty">今後の休業日・特別時間はありません。</div>`;
  }

  function halfHourOptions(selected = "") {
    const values = [];
    for (let hour = 0; hour < 24; hour += 1) for (const minute of ["00", "30"]) values.push(`${String(hour).padStart(2, "0")}:${minute}`);
    return values.map((value) => `<option value="${value}" ${value === selected ? "selected" : ""}>${value}</option>`).join("");
  }

  function showAdminView(view) {
    $$("[data-admin-view]").forEach((node) => node.classList.toggle("active", node.dataset.adminView === view));
    $$("[data-admin-panel]").forEach((node) => { node.hidden = node.dataset.adminPanel !== view; });
    const button = $(`[data-admin-view="${view}"]`); $("#admin-view-title").textContent = button?.textContent.trim() || "管理画面"; $("#admin-sidebar").classList.remove("open");
  }

  async function refreshOwner() {
    $("#owner-loading").hidden = false; $("#owner-content").hidden = true;
    try {
      await loadAdminData(); renderOwner(); $("#owner-content").hidden = false;
    } finally {
      $("#owner-loading").hidden = true;
    }
  }

  async function initOwner() {
    const auth = $("#owner-auth"); const app = $("#owner-app"); const code = $("#owner-admin-code");
    const appointmentDateInput = $('#admin-appointment-form input[name="requested_start_at"]'); if (appointmentDateInput) appointmentDateInput.min = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    if (isDemo) code.value = CONFIG.DEFAULT_ADMIN_CODE;
    $("#owner-code-clear").addEventListener("click", () => { code.value = ""; code.focus(); });
    async function login(key) {
      adminState.key = key; await api("/api/admin/dashboard", { adminKey: key }); await refreshOwner(); sessionStorage.setItem("dpro_tax_admin", key); auth.hidden = true; app.hidden = false;
    }
    $("#owner-login-form").addEventListener("submit", async (event) => { event.preventDefault(); const button = $("button[type=submit]", event.currentTarget); try { setButtonBusy(button, true, "確認中..."); await login(code.value); } catch (error) { $("#owner-login-alert").innerHTML = alertBox(error.message); } finally { setButtonBusy(button, false); } });
    const stored = isDemo ? CONFIG.DEFAULT_ADMIN_CODE : sessionStorage.getItem("dpro_tax_admin");
    if (stored) { try { code.value = stored; await login(stored); } catch (error) { sessionStorage.removeItem("dpro_tax_admin"); adminState.key = ""; app.hidden = true; auth.hidden = false; $("#owner-login-alert").innerHTML = alertBox(`${error.message} 再度ログインしてください。`); } }
    $("#owner-logout").addEventListener("click", () => { sessionStorage.removeItem("dpro_tax_admin"); location.reload(); });
    $("#sidebar-toggle").addEventListener("click", () => $("#admin-sidebar").classList.toggle("open"));
    document.addEventListener("click", async (event) => {
      const nav = event.target.closest("[data-admin-view]"); if (nav) showAdminView(nav.dataset.adminView);
      const go = event.target.closest("[data-go-view]"); if (go) showAdminView(go.dataset.goView);
      if (event.target.closest("[data-refresh-admin]")) { try { await refreshOwner(); toast("最新情報に更新しました。"); } catch (error) { toast(error.message, "error"); } }
      const detail = event.target.closest("[data-client-detail]"); if (detail) await showClientDetail(detail.dataset.clientDetail);
      const progress = event.target.closest("[data-case-progress]"); if (progress) await updateCaseProgress(progress.dataset.caseProgress);
      const review = event.target.closest("[data-document-review-open]"); if (review) await openDocumentReview(review.dataset.documentReviewOpen);
      const view = event.target.closest("[data-document-view]"); if (view) await viewDocument(view.dataset.documentView);
      const appointment = event.target.closest("[data-appointment-status]"); if (appointment) await patchAdmin(`/api/admin/appointments/${appointment.dataset.id}`, { status: appointment.dataset.appointmentStatus }, "予約を更新しました。");
      const appointmentEdit = event.target.closest("[data-appointment-edit]"); if (appointmentEdit) await editAppointmentDate(appointmentEdit.dataset.appointmentEdit);
      const inquiry = event.target.closest("[data-inquiry-status]"); if (inquiry) await patchAdmin(`/api/admin/inquiries/${inquiry.dataset.id}`, { status: inquiry.dataset.inquiryStatus }, "相談状態を更新しました。");
      const task = event.target.closest("[data-task-complete]"); if (task) await patchAdmin(`/api/admin/tasks/${task.dataset.taskComplete}`, { status: "completed" }, "タスクを完了しました。");
      const del = event.target.closest("[data-soft-delete]"); if (del) await softDeleteAdmin(del.dataset.softDelete, del.dataset.id);
      const editService = event.target.closest("[data-edit-service]"); if (editService) openServiceEditor(editService.dataset.editService);
      const newService = event.target.closest("[data-new-service]"); if (newService) resetServiceEditor();
      const disableService = event.target.closest("[data-disable-service]"); if (disableService) await disableConsultationService(disableService.dataset.disableService);
      const deleteClosed = event.target.closest("[data-delete-closed-date]"); if (deleteClosed) await deleteClosedDate(deleteClosed.dataset.deleteClosedDate);
    });
    $("#client-search-button").addEventListener("click", renderClients); $("#client-search").addEventListener("input", renderClients); $("#client-status-filter").addEventListener("change", renderClients);
    $("#case-search-button").addEventListener("click", renderCases); $("#case-search").addEventListener("input", renderCases); $("#case-status-filter").addEventListener("change", renderCases);
    $("#appointment-filter-button").addEventListener("click", renderAppointments); $("#inquiry-filter-button").addEventListener("click", renderInquiries);
    $("#document-filter-button").addEventListener("click", renderDocuments); $("#document-search").addEventListener("input", renderDocuments); $("#document-status-filter").addEventListener("change", renderDocuments);
    $$('[data-document-tab]').forEach((button) => button.addEventListener("click", () => { $$('[data-document-tab]').forEach((node) => node.classList.toggle("active", node === button)); $("#document-submission-table").hidden = button.dataset.documentTab !== "submissions"; $("#document-request-table").hidden = button.dataset.documentTab !== "requests"; }));
    bindOwnerForms();
  }

  async function showClientDetail(id) {
    try {
      $("#client-detail-content").innerHTML = '<div class="loading"><span class="spinner"></span></div>'; openModal("client-detail-modal");
      const data = await api(`/api/admin/clients/${id}`, { adminKey: adminState.key }); const client = data.client;
      $("#client-detail-content").innerHTML = `<div class="list"><div class="list-item"><h3>${esc(client.legal_name)}</h3><div class="meta-row"><span>${esc(client.client_code)}</span><span>${esc(label(client.client_type))}</span>${badge(client.status)}</div><p>代表者：${esc(client.representative_name || "－")}<br>電話：${esc(client.phone || "－")}<br>メール：${esc(client.email || "－")}</p></div><div class="list-item"><h3>連絡先</h3>${data.contacts.length ? data.contacts.map((item) => `<p>${esc(item.full_name)} ／ ${esc(item.position_title || "")} ／ ${esc(item.phone || "")}</p>`).join("") : "<p>登録なし</p>"}</div><div class="summary-grid"><div class="summary-card"><div class="label">案件</div><div class="value">${data.cases.length}</div></div><div class="summary-card"><div class="label">資料依頼</div><div class="value">${data.document_requests.length}</div></div><div class="summary-card"><div class="label">予約</div><div class="value">${data.appointments.length}</div></div><div class="summary-card"><div class="label">相談</div><div class="value">${data.inquiries.length}</div></div></div></div>`;
    } catch (error) { toast(error.message, "error"); closeModal("client-detail-modal"); }
  }

  async function updateCaseProgress(id) {
    const item = adminState.cases.find((row) => row.id === id); const input = prompt("進捗率を0～100で入力してください。", String(item?.progress_percent || 0)); if (input === null) return; const progress = Number(input); if (!Number.isInteger(progress) || progress < 0 || progress > 100) { toast("0～100の整数で入力してください。", "error"); return; }
    const status = progress === 100 ? "completed" : item.status === "received" ? "in_progress" : item.status; await patchAdmin(`/api/admin/cases/${id}`, { progress_percent: progress, status }, "案件進捗を更新しました。");
  }

  async function editAppointmentDate(id) {
    const item = adminState.appointments.find((row) => row.id === id); if (!item) return;
    const current = new Date(item.change_requested_start_at || item.confirmed_start_at || item.requested_start_at);
    const offset = current.getTimezoneOffset() * 60000; const initial = new Date(current.getTime() - offset).toISOString().slice(0, 16);
    const input = prompt("新しい予約日時を入力してください（30分単位）。", initial); if (input === null) return;
    const date = new Date(input); if (Number.isNaN(date.getTime()) || ![0, 30].includes(date.getMinutes()) || date.getSeconds() !== 0) { toast("日時は30分単位で入力してください。", "error"); return; }
    if (date <= new Date()) { toast("過去日時は指定できません。", "error"); return; }
    await patchAdmin(`/api/admin/appointments/${id}`, { requested_start_at: date.toISOString(), confirmed_start_at: date.toISOString(), status: "confirmed" }, "予約日時を変更して確定しました。");
  }

  let documentReviewDetail = null;
  async function openDocumentReview(id) {
    openModal("document-review-modal"); $("#document-review-loading").hidden = false; $("#document-review-content").hidden = true;
    try {
      const data = await api(`/api/admin/documents/${id}`, { adminKey: adminState.key }); documentReviewDetail = data; const item = data.document;
      $("#document-review-id").value = item.id; $("#document-review-title").textContent = item.original_filename;
      $("#document-review-summary").innerHTML = `<div class="review-file-card"><div><span class="status" data-tone="info">${esc(item.submission_code)}</span><h3>${esc(item.original_filename)}</h3><p>${esc(data.client?.legal_name || "－")} ／ ${formatBytes(item.file_size_bytes)} ／ ${esc(item.mime_type || "形式不明")}</p></div>${badge(item.status)}</div><div class="review-context-grid"><span>提出者<strong>${esc(data.contact?.full_name || label(item.submitted_by_type))}</strong></span><span>提出日時<strong>${formatDate(item.submitted_at, true)}</strong></span><span>資料依頼<strong>${esc(data.request?.title || "指定なし")}</strong></span><span>資料項目<strong>${esc(data.request_item?.item_name || "指定なし")}</strong></span></div>`;
      $("#document-reviewer").innerHTML = data.reviewers.map((staff) => `<option value="${esc(staff.id)}" ${staff.id === item.reviewed_by ? "selected" : ""}>${esc(staff.display_name)}（${esc(label(staff.role))}）</option>`).join("");
      $("#document-review-note").value = item.rejection_reason || "";
      const fileAvailable = Boolean(data.file?.available);
      const openButton = $("#document-review-open"); const fileHelp = openButton.nextElementSibling;
      openButton.hidden = false; openButton.disabled = !fileAvailable;
      openButton.textContent = fileAvailable ? "実ファイルを安全に開く" : "実ファイルなし（デモ）";
      if (fileHelp) fileHelp.textContent = fileAvailable ? `閲覧時だけ${data.file.signed_url_expires_in || 120}秒間有効なURLを発行し、操作履歴を記録します。` : "この書類は画面確認用サンプルです。実際に提出された書類では閲覧ボタンが有効になります。";
      $("#document-review-history").innerHTML = data.access_logs.length ? data.access_logs.map((log) => `<div class="timeline-row"><span class="timeline-dot"></span><div><strong>${esc(label(log.action))}</strong><small>${formatDate(log.created_at, true)} ／ ${esc(label(log.actor_type))}</small></div></div>`).join("") : `<div class="compact-empty">履歴はありません。</div>`;
      $("#document-review-content").hidden = false;
    } catch (error) { toast(error.message, "error"); closeModal("document-review-modal"); }
    finally { $("#document-review-loading").hidden = true; }
  }

  async function submitDocumentReview(event) {
    event.preventDefault(); const button = event.submitter; const status = button?.dataset.reviewStatus; if (!status) return; const note = $("#document-review-note").value.trim();
    if (status === "rejected" && !note) { toast("差戻し理由を入力してください。", "error"); $("#document-review-note").focus(); return; }
    const body = { status, reviewed_by: $("#document-reviewer").value, rejection_reason: note || null };
    try { setButtonBusy(button, true, "更新中..."); await api(`/api/admin/documents/${$("#document-review-id").value}/review`, { method: "PATCH", body, adminKey: adminState.key }); toast(status === "accepted" ? "書類を確認済みにしました。" : status === "rejected" ? "書類を差し戻しました。" : "書類を確認中にしました。"); closeModal("document-review-modal"); await refreshOwner(); showAdminView("documents"); }
    catch (error) { toast(error.message, "error"); } finally { setButtonBusy(button, false); }
  }

  async function viewDocument(id) {
    const previewWindow = window.open("about:blank", "_blank");
    if (!previewWindow) { toast("ブラウザのポップアップを許可してから、もう一度お試しください。", "error"); return; }
    try {
      previewWindow.document.title = "書類を安全に準備しています";
      previewWindow.document.body.innerHTML = '<p style="font:16px system-ui;padding:32px;color:#17324d">非公開書類を安全に準備しています…</p>';
      const data = await api(`/api/admin/documents/${id}/signed-url`, { adminKey: adminState.key });
      previewWindow.location.replace(data.signed_url);
      toast(`実ファイルを開きました。URLは${data.expires_in || 120}秒後に無効になります。`);
    }
    catch (error) { previewWindow.close(); toast(error.message, "error"); }
  }

  async function patchAdmin(path, body, message) {
    try { await api(path, { method: "PATCH", body, adminKey: adminState.key }); toast(message); await refreshOwner(); }
    catch (error) { toast(error.message, "error"); }
  }

  async function softDeleteAdmin(type, id) {
    const config = {
      client: ["/api/admin/clients/", "この顧問先を終了状態にしますか？"], case: ["/api/admin/cases/", "この案件を取消状態にしますか？"],
      request: ["/api/admin/document-requests/", "この資料依頼を終了しますか？"], appointment: ["/api/admin/appointments/", "この予約を取り消しますか？"],
      inquiry: ["/api/admin/inquiries/", "この相談を終了しますか？"], task: ["/api/admin/tasks/", "このタスクを取り消しますか？"], staff: ["/api/admin/staff/", "この職員を無効化しますか？"],
    }[type];
    if (!config || !confirm(config[1])) return;
    try { await api(`${config[0]}${id}`, { method: "DELETE", adminKey: adminState.key }); toast("安全に無効化・取消しました。"); await refreshOwner(); }
    catch (error) { toast(error.message, "error"); }
  }

  function bindOwnerForms() {
    $("#document-review-form").addEventListener("submit", submitDocumentReview);
    $("#document-review-open").addEventListener("click", () => { if (documentReviewDetail?.document?.id) viewDocument(documentReviewDetail.document.id); });
    const forms = [
      ["#client-create-form", "/api/admin/clients", (v) => v, "顧問先を登録しました。"],
      ["#case-create-form", "/api/admin/cases", (v) => v, "案件を登録しました。"],
      ["#request-create-form", "/api/admin/document-requests", (v) => ({ ...v, status: "requested", items: [] }), "資料依頼を登録しました。"],
      ["#task-create-form", "/api/admin/tasks", (v) => ({ ...v, due_at: v.due_at ? toIso(v.due_at) : null }), "タスクを登録しました。"],
      ["#staff-create-form", "/api/admin/staff", (v) => ({ ...v, can_review_documents: true, is_active: true }), "職員を登録しました。"],
      ["#admin-appointment-form", "/api/admin/appointments", (v) => ({ ...v, requested_start_at: toIso(v.requested_start_at) }), "予約を登録しました。"],
    ];
    forms.forEach(([selector, path, transform, message]) => $(selector).addEventListener("submit", async (event) => {
      event.preventDefault(); const form = event.currentTarget; const button = $("button[type=submit]", form);
      try { setButtonBusy(button, true, "登録中..."); await api(path, { method: "POST", body: transform(formObject(form)), adminKey: adminState.key }); toast(message); closeModal(form); form.reset(); if (selector === "#admin-appointment-form") clearAppointmentClientSelection(); await refreshOwner(); }
      catch (error) { toast(error.message, "error"); } finally { setButtonBusy(button, false); }
    }));
    $("#settings-form").addEventListener("submit", async (event) => { event.preventDefault(); const form = event.currentTarget; const button = $("button[type=submit]", form); const body = formObject(form); body.booking_open_days = Number(body.booking_open_days); try { setButtonBusy(button, true, "保存中..."); await api("/api/admin/settings", { method: "PATCH", body, adminKey: adminState.key }); $("#settings-save-status").textContent = `保存しました：${formatDate(new Date().toISOString(), true)}`; toast("事務所・予約設定を保存しました。"); await refreshOwner(); } catch (error) { toast(error.message, "error"); } finally { setButtonBusy(button, false); } });
    $("#appointment-client-search").addEventListener("input", (event) => {
      const normalized = normalizePhone(event.currentTarget.value);
      $("#appointment-phone-normalized").textContent = normalized.length >= 10 ? `検索用電話番号：${normalized}` : "";
    });
    $("#appointment-client-search").addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); $("#appointment-client-search-button").click(); } });
    $("#appointment-client-search-button").addEventListener("click", () => {
      const raw = $("#appointment-client-search").value.trim();
      if (!raw) { $("#appointment-client-results").innerHTML = alertBox("名前・電話番号・顧問先コードのいずれかを入力してください。"); return; }
      const normalized = normalizePhone(raw); const q = (normalized.length >= 10 ? normalized : raw.normalize("NFKC")).toLowerCase();
      const results = adminState.clients.filter((item) => item.status !== "ended" && [item.legal_name, item.trade_name, item.representative_name, item.client_code, item.phone, item.phone_normalized, item.email].some((value) => String(value || "").normalize("NFKC").toLowerCase().includes(q))).slice(0, 8);
      $("#appointment-client-results").innerHTML = results.length ? results.map((item) => `<button class="client-result" type="button" data-select-appointment-client="${item.id}"><span><strong>${esc(item.legal_name)}</strong><small>${esc(item.client_code)} ／ ${esc(item.representative_name || "代表者未登録")}</small></span><span class="client-result-phone">${esc(item.phone || "電話未登録")}</span></button>`).join("") : `<div class="empty">一致する顧問先がありません。未登録の相談者として予約者情報を入力できます。</div>`;
    });
    $("#appointment-client-results").addEventListener("click", async (event) => {
      const target = event.target.closest("[data-select-appointment-client]"); if (!target) return;
      await selectAppointmentClient(target.dataset.selectAppointmentClient);
    });
    $("#appointment-selected-client").addEventListener("click", (event) => {
      if (event.target.closest("[data-clear-appointment-client]")) { clearAppointmentClientSelection(); return; }
      const target = event.target.closest("[data-select-appointment-contact]"); if (!target) return;
      const contact = adminState.appointmentClientDetail?.contacts?.find((item) => item.id === target.dataset.selectAppointmentContact); if (!contact) return;
      $("#appointment-contact-id").value = contact.id; $("#admin-requester-name").value = contact.full_name || ""; $("#admin-requester-phone").value = contact.phone || ""; $("#admin-requester-email").value = contact.email || ""; toast(`${contact.full_name}さんを予約者に選択しました。`);
    });
    $("#business-hours-editor").addEventListener("change", (event) => {
      const closed = event.target.closest("[data-hour-closed]"); if (!closed) return; const row = closed.closest("[data-business-day]"); $$('select', row).forEach((select) => { select.disabled = closed.checked; });
    });
    $("#business-hours-form").addEventListener("submit", saveBusinessHours);
    $("#closed-date-type").addEventListener("change", (event) => { $("#closed-date-time-fields").hidden = event.currentTarget.value !== "special"; });
    $$('[data-half-hour-options]').forEach((select) => { select.innerHTML = halfHourOptions(select.id.includes("close") ? "17:00" : "09:00"); });
    $("#closed-date-form").addEventListener("submit", saveClosedDate);
    $("#service-edit-form").addEventListener("submit", saveConsultationService);
  }

  function resetServiceEditor() {
    const form = $("#service-edit-form"); form.reset(); $("#service-edit-id").value = ""; $("#service-edit-title").textContent = "面談メニューを追加"; $$('[name="channel_options"]', form).forEach((item) => { item.checked = true; }); $("#service-edit-public").checked = true; $("#service-edit-active").checked = true;
  }

  function openServiceEditor(id) {
    const item = adminState.settings?.services?.find((row) => row.id === id); if (!item) return;
    resetServiceEditor(); $("#service-edit-id").value = item.id; $("#service-edit-title").textContent = "面談メニューを編集"; $("#service-edit-name").value = item.service_name || ""; $("#service-edit-duration").value = String(item.duration_minutes || 30); $("#service-edit-booking-type").value = item.booking_type || "both"; $("#service-edit-description").value = item.description || ""; $("#service-edit-public").checked = item.is_public !== false; $("#service-edit-active").checked = item.is_active !== false; $$('[name="channel_options"]', $("#service-edit-form")).forEach((checkbox) => { checkbox.checked = (item.channel_options || []).includes(checkbox.value); }); openModal("service-edit-modal");
  }

  async function saveConsultationService(event) {
    event.preventDefault(); const form = event.currentTarget; const button = $("button[type=submit]", form); const id = $("#service-edit-id").value;
    const channels = $$('[name="channel_options"]:checked', form).map((item) => item.value); if (!channels.length) { toast("対応方法を1つ以上選択してください。", "error"); return; }
    const body = { service_name: $("#service-edit-name").value.trim(), duration_minutes: Number($("#service-edit-duration").value), booking_type: $("#service-edit-booking-type").value, description: $("#service-edit-description").value.trim(), channel_options: channels, is_public: $("#service-edit-public").checked, is_active: $("#service-edit-active").checked };
    try { setButtonBusy(button, true, "保存中..."); await api(id ? `/api/admin/consultation-services/${id}` : "/api/admin/consultation-services", { method: id ? "PATCH" : "POST", body, adminKey: adminState.key }); toast("面談メニューを保存しました。"); closeModal("service-edit-modal"); await refreshOwner(); showAdminView("settings"); }
    catch (error) { toast(error.message, "error"); } finally { setButtonBusy(button, false); }
  }

  async function disableConsultationService(id) {
    if (!confirm("この面談メニューを無効化しますか？既存予約は残ります。")) return;
    try { await api(`/api/admin/consultation-services/${id}`, { method: "DELETE", adminKey: adminState.key }); toast("面談メニューを無効化しました。"); await refreshOwner(); showAdminView("settings"); } catch (error) { toast(error.message, "error"); }
  }

  async function saveBusinessHours(event) {
    event.preventDefault(); const form = event.currentTarget; const button = $("button[type=submit]", form);
    const items = $$('[data-business-day]', form).map((row) => { const isClosed = $('[data-hour-closed]', row).checked; return { day_of_week: Number(row.dataset.businessDay), is_closed: isClosed, open_time: isClosed ? null : $('[data-hour-open]', row).value, close_time: isClosed ? null : $('[data-hour-close]', row).value }; });
    if (items.some((item) => !item.is_closed && item.close_time <= item.open_time)) { toast("終了時間は開始時間より後にしてください。", "error"); return; }
    try { setButtonBusy(button, true, "保存中..."); await api("/api/admin/business-hours", { method: "PATCH", body: { items }, adminKey: adminState.key }); toast("曜日別受付時間を保存しました。"); await refreshOwner(); showAdminView("settings"); }
    catch (error) { toast(error.message, "error"); } finally { setButtonBusy(button, false); }
  }

  async function saveClosedDate(event) {
    event.preventDefault(); const form = event.currentTarget; const button = $("button[type=submit]", form); const special = $("#closed-date-type").value === "special";
    const body = { closed_date: $("#closed-date-value").value, reason: $("#closed-date-reason").value.trim(), is_closed_all_day: !special, ...(special ? { open_time: $("#closed-date-open").value, close_time: $("#closed-date-close").value } : {}) };
    if (special && body.close_time <= body.open_time) { toast("終了時間は開始時間より後にしてください。", "error"); return; }
    try { setButtonBusy(button, true, "登録中..."); await api("/api/admin/closed-dates", { method: "POST", body, adminKey: adminState.key }); toast(special ? "特別受付時間を登録しました。" : "休業日を登録しました。"); form.reset(); $("#closed-date-time-fields").hidden = true; await refreshOwner(); showAdminView("settings"); }
    catch (error) { toast(error.message, "error"); } finally { setButtonBusy(button, false); }
  }

  async function deleteClosedDate(id) {
    if (!confirm("この休業日・特別時間を削除しますか？")) return;
    try { await api(`/api/admin/closed-dates/${id}`, { method: "DELETE", adminKey: adminState.key }); toast("休業日・特別時間を削除しました。"); await refreshOwner(); showAdminView("settings"); } catch (error) { toast(error.message, "error"); }
  }

  function clearAppointmentClientSelection() {
    $("#appointment-client-id").value = ""; $("#appointment-contact-id").value = ""; $("#appointment-client-search").value = ""; $("#appointment-phone-normalized").textContent = ""; $("#appointment-client-results").innerHTML = ""; $("#appointment-selected-client").innerHTML = ""; $("#appointment-selected-client").hidden = true; adminState.appointmentClientDetail = null;
  }

  async function selectAppointmentClient(id) {
    const selected = $("#appointment-selected-client");
    try {
      selected.hidden = false; selected.innerHTML = '<div class="loading"><span class="spinner" role="status" aria-label="顧問先情報を読み込み中"></span></div>';
      const data = await api(`/api/admin/clients/${id}`, { adminKey: adminState.key }); const client = data.client; adminState.appointmentClientDetail = data;
      $("#appointment-client-id").value = client.id; $("#appointment-contact-id").value = ""; $("#admin-requester-name").value = client.representative_name || client.legal_name; $("#admin-requester-phone").value = client.phone || ""; $("#admin-requester-email").value = client.email || "";
      const activeCases = data.cases.filter((item) => !["completed", "cancelled"].includes(item.status));
      const contacts = data.contacts.length ? `<div class="contact-choice"><strong>予約者を連絡先から選択</strong><div class="button-row">${data.contacts.map((item) => `<button class="btn btn-secondary btn-sm" type="button" data-select-appointment-contact="${item.id}">${esc(item.full_name)}${item.position_title ? `（${esc(item.position_title)}）` : ""}</button>`).join("")}</div></div>` : "";
      selected.innerHTML = `<div class="selected-client-head"><div><span class="status" data-tone="success">既存顧問先</span><h3>${esc(client.legal_name)}</h3><p class="small muted">${esc(client.client_code)} ／ ${esc(client.representative_name || "代表者未登録")} ／ ${esc(client.phone || "電話未登録")}</p></div><button class="btn btn-secondary btn-sm" type="button" data-clear-appointment-client>選択解除</button></div><div class="selected-client-metrics"><span>進行中案件 <strong>${activeCases.length}</strong></span><span>資料依頼 <strong>${data.document_requests.length}</strong></span><span>予約履歴 <strong>${data.appointments.length}</strong></span><span>相談履歴 <strong>${data.inquiries.length}</strong></span></div>${contacts}`;
      $("#appointment-client-results").innerHTML = "";
    } catch (error) { selected.hidden = true; toast(error.message, "error"); }
  }

  async function initIpad() {
    const auth = $("#ipad-auth"); const app = $("#ipad-app"); const code = $("#ipad-admin-code"); if (isDemo) code.value = CONFIG.DEFAULT_ADMIN_CODE;
    $("#ipad-code-clear").addEventListener("click", () => { code.value = ""; code.focus(); });
    async function load() {
      const data = await api("/api/admin/dashboard", { adminKey: adminState.key }); adminState.dashboard = data; renderIpad();
    }
    async function login(key) { adminState.key = key; await load(); sessionStorage.setItem("dpro_tax_ipad_admin", key); auth.hidden = true; app.hidden = false; }
    $("#ipad-login-form").addEventListener("submit", async (event) => { event.preventDefault(); const button = $("button[type=submit]", event.currentTarget); try { setButtonBusy(button, true, "確認中..."); await login(code.value); } catch (error) { $("#ipad-login-alert").innerHTML = alertBox(error.message); } finally { setButtonBusy(button, false); } });
    const stored = sessionStorage.getItem("dpro_tax_ipad_admin"); if (stored) { try { code.value = stored; await login(stored); } catch { sessionStorage.removeItem("dpro_tax_ipad_admin"); } }
    $("#ipad-refresh").addEventListener("click", async () => { try { await load(); toast("最新情報に更新しました。"); } catch (error) { toast(error.message, "error"); } });
    $("#ipad-logout").addEventListener("click", () => { sessionStorage.removeItem("dpro_tax_ipad_admin"); location.reload(); });
    $("#ipad-app").addEventListener("click", async (event) => {
      const button = event.target.closest("button[data-ipad-action]"); if (!button) return;
      const action = button.dataset.ipadAction; const id = button.dataset.id;
      try {
        setButtonBusy(button, true, "処理中...");
        if (action === "appointment-confirm") await api(`/api/admin/appointments/${id}`, { method: "PATCH", body: { status: "confirmed" }, adminKey: adminState.key });
        if (action === "appointment-complete") { if (!confirm("この面談を完了にしますか？")) return; await api(`/api/admin/appointments/${id}`, { method: "PATCH", body: { status: "completed" }, adminKey: adminState.key }); }
        if (action === "document-view") await viewDocument(id);
        if (action === "document-review") await api(`/api/admin/documents/${id}/review`, { method: "PATCH", body: { status: "reviewing" }, adminKey: adminState.key });
        if (action === "inquiry-open") await api(`/api/admin/inquiries/${id}`, { method: "PATCH", body: { status: "open" }, adminKey: adminState.key });
        if (action === "inquiry-resolve") { if (!confirm("この相談を解決済みにしますか？")) return; await api(`/api/admin/inquiries/${id}`, { method: "PATCH", body: { status: "resolved" }, adminKey: adminState.key }); }
        if (action === "task-complete") { if (!confirm("このタスクを完了にしますか？")) return; await api(`/api/admin/tasks/${id}`, { method: "PATCH", body: { status: "completed" }, adminKey: adminState.key }); }
        if (action !== "document-view") { toast("更新しました。"); await load(); }
      } catch (error) { toast(error.message, "error"); } finally { setButtonBusy(button, false); }
    });
  }

  function renderIpad() {
    const data = adminState.dashboard; $("#ipad-date").textContent = formatDate(new Date().toISOString());
    $("#ipad-metric-appointments").textContent = data.active_appointments.length; $("#ipad-metric-documents").textContent = data.documents_to_review.length; $("#ipad-metric-inquiries").textContent = data.open_inquiries.length; $("#ipad-metric-tasks").textContent = data.due_tasks.length;
    $("#ipad-appointments").innerHTML = data.active_appointments.length ? data.active_appointments.slice(0, 8).map((item) => `<div class="list-item"><div class="list-item-head"><strong>${formatDate(item.confirmed_start_at || item.requested_start_at, true)}<br>${esc(item.requester_name)}</strong>${badge(item.status)}</div><div class="meta-row"><span>${esc(label(item.appointment_channel))}</span><span>${item.duration_minutes}分</span></div><div class="ipad-item-actions">${item.status !== "confirmed" ? `<button class="btn btn-primary ipad-action" type="button" data-ipad-action="appointment-confirm" data-id="${item.id}">予約を確定</button>` : ""}<button class="btn btn-secondary ipad-action" type="button" data-ipad-action="appointment-complete" data-id="${item.id}">面談完了</button></div></div>`).join("") : empty("対応する予約はありません。");
    $("#ipad-documents").innerHTML = data.documents_to_review.length ? data.documents_to_review.slice(0, 8).map((item) => { const hasFile = Boolean(item.storage_path && !item.is_demo_placeholder); return `<div class="list-item"><div class="list-item-head"><div><strong>${esc(item.original_filename)}</strong><div class="small muted">${formatDate(item.submitted_at, true)}</div></div>${badge(item.status)}</div><div class="ipad-item-actions"><button class="btn btn-secondary ipad-action" type="button" data-ipad-action="document-view" data-id="${item.id}" ${hasFile ? "" : "disabled"}>${hasFile ? "安全に開く" : "実ファイルなし（デモ）"}</button>${item.status !== "reviewing" ? `<button class="btn btn-primary ipad-action" type="button" data-ipad-action="document-review" data-id="${item.id}">確認を開始</button>` : ""}</div><p class="small muted ipad-safety-note">最終承認・差戻しはPC管理画面で行います。</p></div>`; }).join("") : empty("新着書類はありません。");
    $("#ipad-inquiries").innerHTML = data.open_inquiries.length ? data.open_inquiries.slice(0, 8).map((item) => `<div class="list-item"><div class="list-item-head"><strong>${esc(item.subject)}</strong>${badge(item.status)}</div><div class="meta-row"><span>${esc(label(item.category))}</span><span>${formatDate(item.created_at, true)}</span></div><div class="ipad-item-actions">${item.status === "new" ? `<button class="btn btn-primary ipad-action" type="button" data-ipad-action="inquiry-open" data-id="${item.id}">対応を開始</button>` : ""}<button class="btn btn-secondary ipad-action" type="button" data-ipad-action="inquiry-resolve" data-id="${item.id}">解決済み</button></div></div>`).join("") : empty("未対応相談はありません。");
    $("#ipad-tasks").innerHTML = data.due_tasks.length ? data.due_tasks.slice(0, 8).map((item) => `<div class="list-item"><div class="list-item-head"><strong>${esc(item.title)}</strong>${badge(item.priority)}</div><div class="meta-row"><span>${formatDate(item.due_at, true)}</span></div><div class="ipad-item-actions"><button class="btn btn-primary ipad-action" type="button" data-ipad-action="task-complete" data-id="${item.id}">タスク完了</button></div></div>`).join("") : empty("期限タスクはありません。");
  }

  async function initSystemCheck() {
    const code = $("#check-admin-code"); if (isDemo) code.value = CONFIG.DEFAULT_ADMIN_CODE; $("#check-code-clear").addEventListener("click", () => { code.value = ""; code.focus(); }); $("#system-version").textContent = CONFIG.VERSION;
    const base = CONFIG.PAGES_BASE; $("#url-index").textContent = `${base}index.html`; $("#url-member").textContent = `${base}member.html?demo=1&line_user_id=${CONFIG.DEMO_LINE_USER_ID}`; $("#url-owner").textContent = `${base}owner.html?demo=1`; $("#url-ipad").textContent = `${base}owner-ipad.html?demo=1`;
    function setCheck(name, ok, message) { const icon = $(`#check-${name}-icon`); icon.className = `check-indicator ${ok ? "ok" : "ng"}`; icon.textContent = ok ? "✓" : "×"; $(`#check-${name}-text`).textContent = message; }
    $("#run-system-check").addEventListener("click", async (event) => {
      const button = event.currentTarget; const key = code.value; if (!key) { $("#check-alert").innerHTML = alertBox("管理コードを入力してください。"); return; }
      try {
        setButtonBusy(button, true, "確認中..."); $("#check-alert").innerHTML = "";
        const [healthResult, systemResult, phoneResult, pagesResult] = await Promise.allSettled([
          api("/api/health"), api("/api/admin/system-check", { adminKey: key }), api("/api/admin/phone-normalize-check", { adminKey: key }),
          Promise.all(["index.html", "member.html", "owner.html", "owner-ipad.html"].map((file) => fetch(file, { cache: "no-store" }).then((response) => response.ok))),
        ]);
        if (healthResult.status === "fulfilled") { setCheck("api", true, `${healthResult.value.version}／応答正常`); setCheck("db", healthResult.value.database?.ok === true, `${healthResult.value.database?.schema_version || "DB未確認"}／顧問先${healthResult.value.database?.counts?.clients ?? "－"}件`); setCheck("demo", healthResult.value.database?.office?.is_demo === true, `案件${healthResult.value.database?.counts?.cases ?? "－"}件・資料依頼${healthResult.value.database?.counts?.document_requests ?? "－"}件`); } else { setCheck("api", false, healthResult.reason.message); setCheck("db", false, "API確認後に再実行してください"); setCheck("demo", false, "未確認"); }
        if (systemResult.status === "fulfilled") setCheck("storage", systemResult.value.storage?.ok && systemResult.value.storage?.public === false, systemResult.value.storage?.public === false ? "非公開バケット・正常" : "公開設定を確認してください"); else setCheck("storage", false, systemResult.reason.message);
        if (phoneResult.status === "fulfilled") setCheck("phone", phoneResult.value.ok, phoneResult.value.ok ? "4形式すべて09011112201へ一致" : "不一致があります"); else setCheck("phone", false, phoneResult.reason.message);
        if (pagesResult.status === "fulfilled") setCheck("pages", pagesResult.value.every(Boolean), pagesResult.value.every(Boolean) ? "主要4画面・読込正常" : "読込できない画面があります"); else setCheck("pages", false, pagesResult.reason.message);
        const allOk = [healthResult, systemResult, phoneResult, pagesResult].every((result) => result.status === "fulfilled"); $("#check-alert").innerHTML = alertBox(allOk ? "一括チェックが完了しました。各項目を確認してください。" : "一部の確認に失敗しました。赤い項目をご確認ください。", allOk ? "success" : "error");
      } finally { setButtonBusy(button, false); }
    });
    $("#prepare-demo").addEventListener("click", async (event) => { if (!code.value) { toast("管理コードを入力してください。", "error"); return; } if (!confirm("デモデータを再準備しますか？本番データには使用しないでください。")) return; const button = event.currentTarget; try { setButtonBusy(button, true, "準備中..."); const data = await api("/api/admin/demo-prepare", { method: "POST", body: { confirm: "PREPARE_DEMO" }, adminKey: code.value }); $("#demo-result").textContent = `準備完了：${JSON.stringify(data.result)}`; toast("デモデータを準備しました。"); } catch (error) { toast(error.message, "error"); } finally { setButtonBusy(button, false); } });
  }

  bindModals();
  const boot = { public: initPublic, member: initMember, owner: initOwner, ipad: initIpad, "system-check": initSystemCheck }[page];
  if (boot) boot().catch((error) => { console.error(error); toast(error.message || "画面の初期化に失敗しました。", "error"); const loading = $(".loading"); if (loading) loading.innerHTML = alertBox(error.message || "読み込みに失敗しました。"); });
})();
