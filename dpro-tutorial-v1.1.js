/* DPRO TUTORIAL STANDARD V1.1 / TAX / R3
   Accepted First10 exactly 10. Tutorial-attributable business mutation: 0. */
(() => {
  "use strict";

  const VERSION = "DPRO-TUTORIAL-TAX-V1.1-R3-20260830";
  const STORAGE_STEP = "dpro_tutorial_tax_first10_step";
  const STORAGE_STATE = "dpro_tutorial_tax_first10_state";
  const GUIDE_URL = "guide-center.html";

  const STEPS = Object.freeze([
    {id:"TAX-T01",title:"LINE窓口の全体像",copy:"まず、税務・会計の連絡をまとめる顧問先サポート窓口の役割を確認します。",primary:".hero h1",fallback:["main#main"],safety:"静的見出しのみを確認します。業務操作は行いません。"},
    {id:"TAX-T02",title:"この窓口でできること",copy:"資料確認、進捗共有、面談希望、相談履歴など、主な利用範囲を確認します。",primary:".hero-panel",fallback:[".hero"],safety:"静的な機能案内だけをハイライトします。"},
    {id:"TAX-T03",title:"面談予約の入口",copy:"面談予約では、相談内容・希望日・希望時間などを確認して希望を送る流れです。",primary:"#booking",fallback:["main#main"],safety:"予約フォームは送信しません。セクション位置だけを確認します。"},
    {id:"TAX-T04",title:"相談内容を選ぶ場所",copy:"ここで面談したい相談内容を選びます。チュートリアルは選択内容を変更しません。",primary:"#booking-service",fallback:["#booking"],safety:"selectはハイライトのみ。focus・input・change・送信を発火しません。"},
    {id:"TAX-T05",title:"希望日を確認する場所",copy:"面談の希望日を指定する欄です。チュートリアルは日付を自動入力しません。",primary:"#booking-date",fallback:["#booking"],safety:"date inputはハイライトのみ。値の変更や入力イベントを発火しません。"},
    {id:"TAX-T06",title:"希望時間の表示位置",copy:"相談内容と希望日を選ぶと、この付近に希望時間の候補が表示されます。",primary:"#slot-message",fallback:["#booking"],safety:"時間候補や業務ボタンを自動クリックしません。"},
    {id:"TAX-T07",title:"税務・会計相談の入口",copy:"税務・会計の相談を記録して送るための相談フォームの位置を確認します。",primary:"#inquiry",fallback:["main#main"],safety:"相談フォームは送信しません。セクション位置だけを確認します。"},
    {id:"TAX-T08",title:"機密情報を送らない",copy:"マイナンバー、暗証番号、パスワード、秘密鍵などの機密情報は入力しないことを確認します。",primary:"#inquiry-form .security-notice",fallback:["#inquiry"],safety:"静的な安全案内のみを確認します。"},
    {id:"TAX-T09",title:"相談区分を確認する場所",copy:"税務相談、資料、面談、契約、料金などの相談区分を選ぶ欄です。チュートリアルは選択を変更しません。",primary:"#inquiry-category",fallback:["#inquiry"],safety:"selectはハイライトのみ。input・change・送信を発火しません。"},
    {id:"TAX-T10",title:"資料提出時の安全確認",copy:"資料提出時も、マイナンバーや暗証番号、パスワードが写った資料を送らないことを最後に確認します。",primary:"#security-notice-text",fallback:[".section-tight .security-notice"],safety:"静的な安全案内のみ。アップロードや外部遷移は行いません。"}
  ]);

  const state = {
    active:false,
    index:0,
    cardX:16,
    cardY:16,
    lastFocus:null,
    drag:null,
    resolvedTarget:null,
    resizeTimer:0
  };

  let root, launcher, launcherButton, shield, highlight, card, dragHandle, titleEl, stepEl, copyEl, safeEl, progressBar, progressText, backBtn, nextBtn, closeBtn, skipBtn, guideLink, statusEl;

  const parseStoredState = () => {
    try { return JSON.parse(localStorage.getItem(STORAGE_STATE) || "{}"); }
    catch (_) { return {}; }
  };

  const storeProgress = (index, extra={}) => {
    const safeIndex = Math.max(0, Math.min(STEPS.length - 1, Number(index) || 0));
    localStorage.setItem(STORAGE_STEP, String(safeIndex + 1));
    const prev = parseStoredState();
    localStorage.setItem(STORAGE_STATE, JSON.stringify({
      version:VERSION,
      index:safeIndex,
      completed:false,
      skipped:false,
      updatedAt:new Date().toISOString(),
      ...prev,
      ...extra,
      index:safeIndex
    }));
    updateLauncherLabel();
  };

  const markFinished = (skipped=false) => {
    const prev = parseStoredState();
    localStorage.setItem(STORAGE_STEP, String(STEPS.length));
    localStorage.setItem(STORAGE_STATE, JSON.stringify({
      ...prev,
      version:VERSION,
      index:STEPS.length - 1,
      completed:true,
      skipped:Boolean(skipped),
      updatedAt:new Date().toISOString()
    }));
    updateLauncherLabel();
  };

  const getResumeIndex = () => {
    const saved = parseStoredState();
    if (saved && Number.isInteger(saved.index)) return Math.max(0, Math.min(STEPS.length - 1, saved.index));
    const raw = Number(localStorage.getItem(STORAGE_STEP));
    return Number.isFinite(raw) && raw >= 1 ? Math.min(STEPS.length - 1, raw - 1) : 0;
  };

  const updateLauncherLabel = () => {
    if (!launcherButton) return;
    const saved = parseStoredState();
    launcherButton.textContent = saved.completed ? "操作ガイドをもう一度" : (localStorage.getItem(STORAGE_STEP) ? "操作ガイドを続ける" : "操作ガイド");
  };

  const isRenderable = (el) => {
    if (!(el instanceof Element)) return false;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || cs.visibility === "collapse") return false;
    if (el.hasAttribute("hidden")) return false;
    const rects = el.getClientRects();
    return rects.length > 0 && Array.from(rects).some(r => r.width > 0 && r.height > 0);
  };

  const resolveTarget = (step) => {
    const selectors = [step.primary, ...step.fallback];
    for (const selector of selectors) {
      let el = null;
      try { el = document.querySelector(selector); } catch (_) { el = null; }
      if (el && isRenderable(el)) return {el, selector, fallback:selector !== step.primary};
    }
    const main = document.querySelector("main") || document.body;
    return {el:main, selector:"main/body emergency read-only fallback", fallback:true};
  };

  const safeScrollTarget = (target) => {
    if (!target || !target.el) return;
    const rect = target.el.getBoundingClientRect();
    const margin = 90;
    if (rect.top < margin || rect.bottom > window.innerHeight - margin) {
      target.el.scrollIntoView({block:"center",inline:"nearest",behavior:matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"});
    }
  };

  const clamp = (value,min,max) => Math.min(Math.max(value,min),Math.max(min,max));

  const clampCard = () => {
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const pad = 8;
    const maxX = window.innerWidth - rect.width - pad;
    const maxY = window.innerHeight - rect.height - pad;
    state.cardX = clamp(state.cardX,pad,maxX);
    state.cardY = clamp(state.cardY,pad,maxY);
    card.style.left = `${Math.round(state.cardX)}px`;
    card.style.top = `${Math.round(state.cardY)}px`;
  };

  const placeCardDefault = () => {
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const pad = 12;
    state.cardX = Math.max(pad, window.innerWidth - rect.width - pad);
    state.cardY = pad;
    clampCard();
  };

  const updateHighlight = () => {
    if (!state.active || !highlight || !state.resolvedTarget?.el) return;
    if (!document.contains(state.resolvedTarget.el) || !isRenderable(state.resolvedTarget.el)) {
      state.resolvedTarget = resolveTarget(STEPS[state.index]);
    }
    const r = state.resolvedTarget.el.getBoundingClientRect();
    const pad = 6;
    const left = clamp(r.left - pad, 2, window.innerWidth - 4);
    const top = clamp(r.top - pad, 2, window.innerHeight - 4);
    const right = clamp(r.right + pad, 4, window.innerWidth - 2);
    const bottom = clamp(r.bottom + pad, 4, window.innerHeight - 2);
    highlight.style.left = `${Math.round(left)}px`;
    highlight.style.top = `${Math.round(top)}px`;
    highlight.style.width = `${Math.max(2,Math.round(right-left))}px`;
    highlight.style.height = `${Math.max(2,Math.round(bottom-top))}px`;
  };

  const announce = (text) => {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.hidden = false;
    clearTimeout(statusEl._timer);
    statusEl._timer = setTimeout(() => { statusEl.hidden = true; }, 1800);
  };

  const render = ({focus=true}={}) => {
    if (!state.active) return;
    state.index = Math.max(0,Math.min(STEPS.length-1,state.index));
    const step = STEPS[state.index];
    state.resolvedTarget = resolveTarget(step);
    stepEl.textContent = `${step.id} / STEP ${state.index+1} OF ${STEPS.length}${state.resolvedTarget.fallback ? " / SAFE FALLBACK" : ""}`;
    titleEl.textContent = step.title;
    copyEl.textContent = step.copy;
    safeEl.innerHTML = `<strong>安全設計：</strong>${step.safety}`;
    progressText.textContent = `${state.index+1} / ${STEPS.length}`;
    progressBar.style.width = `${((state.index+1)/STEPS.length)*100}%`;
    backBtn.disabled = state.index === 0;
    backBtn.setAttribute("aria-disabled", String(state.index === 0));
    nextBtn.textContent = state.index === STEPS.length-1 ? "完了" : "次へ";
    storeProgress(state.index,{completed:false,skipped:false});
    safeScrollTarget(state.resolvedTarget);
    requestAnimationFrame(() => {
      updateHighlight();
      clampCard();
      if (focus) nextBtn.focus({preventScroll:true});
    });
    setTimeout(updateHighlight, 220);
  };

  const openTutorial = (mode="resume") => {
    if (state.active) return;
    const saved = parseStoredState();
    state.lastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : launcherButton;
    state.active = true;
    if (mode === "start" || mode === "replay" || saved.completed) state.index = 0;
    else state.index = getResumeIndex();
    shield.hidden = false;
    highlight.hidden = false;
    card.hidden = false;
    placeCardDefault();
    render({focus:true});
    announce(mode === "replay" || saved.completed ? "Step 1から再生します" : (state.index ? `Step ${state.index+1}から再開します` : "Step 1を開始します"));
  };

  const closeTutorial = ({finished=false,skipped=false}={}) => {
    if (!state.active) return;
    if (finished) markFinished(skipped);
    else storeProgress(state.index);
    state.active = false;
    shield.hidden = true;
    highlight.hidden = true;
    card.hidden = true;
    state.resolvedTarget = null;
    // R3 LIVE QA focus recovery: once the Tutorial UI is hidden, always
    // return keyboard focus to the read-only Tutorial launcher immediately.
    // A next-frame retry covers browser paint/focus timing without touching
    // any underlying business control.
    state.lastFocus = null;
    launcherButton?.focus?.({preventScroll:true});
    requestAnimationFrame(() => launcherButton?.focus?.({preventScroll:true}));
  };

  const next = () => {
    if (!state.active) return;
    if (state.index >= STEPS.length-1) {
      closeTutorial({finished:true,skipped:false});
      announce("操作ガイドを完了しました。ReplayでStep 1から再確認できます。 ");
      return;
    }
    state.index += 1;
    render();
  };

  const back = () => {
    if (!state.active || state.index === 0) return;
    state.index -= 1;
    render();
  };

  const skip = () => {
    if (!state.active) return;
    closeTutorial({finished:true,skipped:true});
    announce("操作ガイドをスキップしました。ReplayでStep 1から再確認できます。 ");
  };

  const replay = () => {
    if (state.active) {
      state.index = 0;
      render();
      announce("Step 1から再生します");
    } else {
      openTutorial("replay");
    }
  };

  const onDragStart = (ev) => {
    if (!state.active || ev.button > 0) return;
    if (ev.target.closest("button,a,input,select,textarea") && !ev.target.closest(".dpro-tutorial-drag")) return;
    const rect = card.getBoundingClientRect();
    state.drag = {pointerId:ev.pointerId,offsetX:ev.clientX-rect.left,offsetY:ev.clientY-rect.top};
    try { dragHandle.setPointerCapture?.(ev.pointerId); } catch (_) { /* synthetic/test pointers may not be capturable */ }
    ev.preventDefault();
  };

  const onDragMove = (ev) => {
    if (!state.drag || ev.pointerId !== state.drag.pointerId) return;
    state.cardX = ev.clientX - state.drag.offsetX;
    state.cardY = ev.clientY - state.drag.offsetY;
    clampCard();
    ev.preventDefault();
  };

  const onDragEnd = (ev) => {
    if (!state.drag || ev.pointerId !== state.drag.pointerId) return;
    try { dragHandle.releasePointerCapture?.(ev.pointerId); } catch (_) {}
    state.drag = null;
    clampCard();
  };

  const onViewportChange = () => {
    if (!state.active) return;
    clearTimeout(state.resizeTimer);
    state.resizeTimer = setTimeout(() => { clampCard(); updateHighlight(); }, 16);
  };

  const build = () => {
    if (document.getElementById("dpro-tutorial-tax-root")) return;
    root = document.createElement("div");
    root.id = "dpro-tutorial-tax-root";
    root.innerHTML = `
      <div class="dpro-tutorial-launcher">
        <button type="button" class="dpro-tutorial-launcher__button" aria-haspopup="dialog">操作ガイド</button>
      </div>
      <div class="dpro-tutorial-shield" hidden aria-hidden="true"></div>
      <div class="dpro-tutorial-highlight" hidden aria-hidden="true"></div>
      <section class="dpro-tutorial-card" hidden role="dialog" aria-modal="true" aria-labelledby="dpro-tutorial-title" aria-describedby="dpro-tutorial-copy">
        <div class="dpro-tutorial-drag" data-dpro-tutorial-drag-handle tabindex="0" aria-label="操作ガイドカードのドラッグ専用ハンドル">
          <span class="dpro-tutorial-drag__label">DPRO 操作ガイド</span><span class="dpro-tutorial-drag__grip" aria-hidden="true">⋮⋮</span>
        </div>
        <div class="dpro-tutorial-card__body">
          <p class="dpro-tutorial-step"></p>
          <h2 id="dpro-tutorial-title"></h2>
          <p id="dpro-tutorial-copy" class="dpro-tutorial-copy"></p>
          <div class="dpro-tutorial-safe"></div>
          <div class="dpro-tutorial-progress" aria-label="進捗"><div class="dpro-tutorial-progress__bar"><span></span></div><span class="dpro-tutorial-progress__text"></span></div>
          <div class="dpro-tutorial-actions">
            <button type="button" class="dpro-tutorial-secondary" data-action="back">戻る</button>
            <button type="button" class="dpro-tutorial-primary" data-action="next">次へ</button>
            <button type="button" class="dpro-tutorial-quiet" data-action="close">閉じる</button>
            <button type="button" class="dpro-tutorial-quiet" data-action="skip">スキップ</button>
          </div>
          <div class="dpro-tutorial-meta"><span>Esc：閉じる / 業務操作なし</span><span><button type="button" data-action="replay">Replay</button> · <a href="${GUIDE_URL}" data-dpro-guide-link>Guide Center</a></span></div>
        </div>
      </section>
      <div class="dpro-tutorial-status" role="status" aria-live="polite" hidden></div>`;
    document.body.appendChild(root);

    launcher = root.querySelector(".dpro-tutorial-launcher");
    launcherButton = root.querySelector(".dpro-tutorial-launcher__button");
    shield = root.querySelector(".dpro-tutorial-shield");
    highlight = root.querySelector(".dpro-tutorial-highlight");
    card = root.querySelector(".dpro-tutorial-card");
    dragHandle = root.querySelector("[data-dpro-tutorial-drag-handle]");
    titleEl = root.querySelector("#dpro-tutorial-title");
    stepEl = root.querySelector(".dpro-tutorial-step");
    copyEl = root.querySelector("#dpro-tutorial-copy");
    safeEl = root.querySelector(".dpro-tutorial-safe");
    progressBar = root.querySelector(".dpro-tutorial-progress__bar span");
    progressText = root.querySelector(".dpro-tutorial-progress__text");
    backBtn = root.querySelector('[data-action="back"]');
    nextBtn = root.querySelector('[data-action="next"]');
    closeBtn = root.querySelector('[data-action="close"]');
    skipBtn = root.querySelector('[data-action="skip"]');
    guideLink = root.querySelector("[data-dpro-guide-link]");
    statusEl = root.querySelector(".dpro-tutorial-status");

    launcherButton.addEventListener("click", () => openTutorial("resume"));
    backBtn.addEventListener("click", back);
    nextBtn.addEventListener("click", next);
    closeBtn.addEventListener("click", () => closeTutorial());
    skipBtn.addEventListener("click", skip);
    root.querySelector('[data-action="replay"]').addEventListener("click", replay);

    dragHandle.addEventListener("pointerdown", onDragStart);
    dragHandle.addEventListener("pointermove", onDragMove);
    dragHandle.addEventListener("pointerup", onDragEnd);
    dragHandle.addEventListener("pointercancel", onDragEnd);

    document.addEventListener("keydown", (ev) => {
      if (!state.active) return;
      if (ev.key === "Escape") {
        ev.preventDefault();
        closeTutorial();
      }
    }, true);

    window.addEventListener("scroll", onViewportChange, {passive:true});
    window.addEventListener("resize", onViewportChange, {passive:true});
    window.visualViewport?.addEventListener("resize", onViewportChange, {passive:true});
    window.visualViewport?.addEventListener("scroll", onViewportChange, {passive:true});

    updateLauncherLabel();
    window.DPRO_TAX_TUTORIAL_V11 = Object.freeze({
      version:VERSION,
      count:STEPS.length,
      ids:STEPS.map(s=>s.id),
      start:()=>openTutorial("start"),
      resume:()=>openTutorial("resume"),
      replay,
      close:()=>closeTutorial(),
      getState:()=>({active:state.active,index:state.index,stepId:STEPS[state.index]?.id||null,stored:parseStoredState()})
    });
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build, {once:true});
  else build();
})();
