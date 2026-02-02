import { startSplashFx } from "./splashfx.js";

window.addEventListener("load", () => {
  const splash = document.getElementById("splash");
  const canvas = document.getElementById("splashFx");
  const enterBtn = document.getElementById("enterBtn");
  if (!splash || !canvas || !enterBtn) return;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fx = startSplashFx(canvas, {
    infinite: true,
    fadeInMs: 0,
    reduceMotion,
  });

  const closeSplash = () => {
    fx.stop();
    splash.classList.add("is-out");
    setTimeout(() => {
      splash.remove();
      window.location.hash = "#home";
    }, 420);
  };

  enterBtn.addEventListener("click", closeSplash, { once: true });
});
const state = {
  userText: "",
  homeModelResult: null,
  q1Selected: [],
  q2Selected: "",
  agentResult: null,
  microMode: null,
  microInstruction: "",
  exitReason: "",
  exitResult: null,
};

const routes = ["home", "agent", "micro", "exit"];
let activeRoute = "home";
let timerId = null;
let timerRemaining = 0;
let cardOrder = [];
let cardIndex = 0;
let carouselTick = false;
let dragState = null;

const q1Options = [
  "安静环境",
  "明确目标",
  "足够时间",
  "心情稳定",
  "精力充足",
  "没有打扰",
];

const q2Options = [
  "感觉没意义",
  "读不懂会焦虑",
  "做不到就会沮丧",
  "太慢浪费时间",
  "怕被打断",
];

const systemPrompts = {
  home: `你是一个温柔但很懂用户的阅读陪伴者。输出严格 JSON：
{
  "blocker": "疲劳/情绪扰动/无聊刺激不足/畏难/完美主义/分心/时间稀缺",
  "insight": "≤22字，避免'这不是…而是…'句式",
  "micro_choices": [
    {"minutes":2, "title":"无脑读", "instruction":"≤28字"},
    {"minutes":5, "title":"放松读", "instruction":"≤28字"},
    {"minutes":10, "title":"稍认真", "instruction":"≤28字"}
  ],
  "agent_cta": "≤16字，例如：想更清楚为什么卡住？"
}
规则：短句、具体、轻，不说教，不科普，不出现“这不是…而是…”。只返回 JSON。
用户输入：`,
  agent: `你是凯根式反思智能体。输出严格 JSON：
{
  "cards_order": ["behavior","hidden_commitment","belief","big_assumption"],
  "cards": {
    "behavior": {"title":"相反行为","content":"≤50字"},
    "hidden_commitment": {"title":"隐藏承诺","content":"≤50字"},
    "belief": {"title":"信念","content":"≤60字"},
    "big_assumption": {"title":"大前提","content":"≤60字"}
  },
  "reframe":"≤22字，温柔",
  "micro_reading":[
    {"minutes":2, "title":"无脑读", "instruction":"≤28字"},
    {"minutes":5, "title":"放松读", "instruction":"≤28字"},
    {"minutes":10, "title":"稍认真", "instruction":"≤28字"}
  ],
  "swap_hint":"≤12字，例如：换个角度试试"
}
规则：不要长段解释，不讲理论，只给可呈现内容。只返回 JSON。
用户输入与回答：`,
  exit: `你是退出缓冲助手。输出严格 JSON：
{
  "insight":"≤18字，短句",
  "options":[
    {"id":"lighter","text":"看一小段（更轻）"},
    {"id":"move","text":"换个地方"},
    {"id":"leave","text":"可以走"}
  ],
  "mode_suggestion": 2
}
规则：短句、具体、轻。只返回 JSON。
用户输入：`,
};

const dom = {
  navBack: document.getElementById("navBack"),
  navAction: document.getElementById("navAction"),
  progressDots: Array.from(document.querySelectorAll(".dot")),
  homeInput: document.getElementById("homeInput"),
  homeHelpBtn: document.getElementById("homeHelpBtn"),
  homeStatus: document.getElementById("homeStatus"),
  homeError: document.getElementById("homeError"),
  homeResult: document.getElementById("homeResult"),
  homeBlocker: document.getElementById("homeBlocker"),
  homeInsight: document.getElementById("homeInsight"),
  homeChoices: document.getElementById("homeChoices"),
  homeAgentBtn: document.getElementById("homeAgentBtn"),
  homeHint: document.getElementById("homeHint"),
  agentStep1: document.getElementById("agentStep1"),
  agentStep2: document.getElementById("agentStep2"),
  agentStep1Chips: document.getElementById("agentStep1Chips"),
  agentStep2Chips: document.getElementById("agentStep2Chips"),
  agentStep1NextBtn: document.getElementById("agentStep1NextBtn"),
  agentStep2NextBtn: document.getElementById("agentStep2NextBtn"),
  agentCards: document.getElementById("agentCards"),
  agentCardIndex: document.getElementById("agentCardIndex"),
  cardCarousel: document.getElementById("cardCarousel"),
  microActions: document.getElementById("microActions"),
  agentReframe: document.getElementById("agentReframe"),
  agentSwapHint: document.getElementById("agentSwapHint"),
  agentError: document.getElementById("agentError"),
  microMode: document.getElementById("microMode"),
  microInstruction: document.getElementById("microInstruction"),
  microFallback: document.getElementById("microFallback"),
  microTextInput: document.getElementById("microTextInput"),
  timerDisplay: document.getElementById("timerDisplay"),
  timerStartBtn: document.getElementById("timerStartBtn"),
  timerPauseBtn: document.getElementById("timerPauseBtn"),
  timerResetBtn: document.getElementById("timerResetBtn"),
  microExitBtn: document.getElementById("microExitBtn"),
  exitReasonList: document.getElementById("exitReasonList"),
  exitSubmitBtn: document.getElementById("exitSubmitBtn"),
  exitStatus: document.getElementById("exitStatus"),
  exitError: document.getElementById("exitError"),
  exitResult: document.getElementById("exitResult"),
  exitInsight: document.getElementById("exitInsight"),
  exitOptions: document.getElementById("exitOptions"),
};

function setRoute(route) {
  if (!routes.includes(route)) {
    route = "home";
  }
  activeRoute = route;
  window.location.hash = `#${route}`;
  renderRoute();
}

function renderRoute() {
  const pages = document.querySelectorAll(".page");
  pages.forEach((page) => {
    const isActive = page.dataset.route === activeRoute;
    page.classList.toggle("active", isActive);
    requestAnimationFrame(() => {
      page.classList.toggle("ready", isActive);
    });
  });

  dom.progressDots.forEach((dot) => {
    dot.classList.toggle("is-active", dot.dataset.step === activeRoute);
  });

  dom.navBack.classList.toggle("is-hidden", activeRoute === "home");
  dom.navAction.classList.toggle("is-hidden", activeRoute !== "agent");
}

function setStatus(element, message) {
  if (!element) return;
  element.textContent = message;
}

function setError(element, message) {
  if (!element) return;
  if (!message) {
    element.textContent = "";
    element.classList.add("hidden");
    return;
  }
  element.textContent = message;
  element.classList.remove("hidden");
}

function setLoading(button, text) {
  if (!button) return;
  button.dataset.originalText = button.textContent;
  button.textContent = text;
  button.disabled = true;
}

function clearLoading(button) {
  if (!button) return;
  button.textContent = button.dataset.originalText || button.textContent;
  button.disabled = false;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function tryParseJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return null;
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

function renderChoices(container, choices, onSelect) {
  container.innerHTML = "";
  choices.forEach((choice) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "choice";
    button.innerHTML = `
      <span class="choice-title">${escapeHtml(choice.title)}</span>
      <span class="choice-sub">${escapeHtml(choice.instruction)}</span>
    `;
    button.addEventListener("click", () => onSelect(choice));
    container.appendChild(button);
  });
}

function normalizeChoices(rawChoices) {
  if (!Array.isArray(rawChoices)) {
    return [
      { minutes: 2, title: "无脑读", instruction: "先让眼睛停在字上。" },
      { minutes: 5, title: "放松读", instruction: "轻轻扫过，不必记住。" },
      { minutes: 10, title: "稍认真", instruction: "读一段，画一个点。" },
    ];
  }
  return rawChoices.map((choice, index) => ({
    minutes: Number(choice.minutes) || [2, 5, 10][index] || 2,
    title: choice.title || "微阅读",
    instruction: choice.instruction || "先读一句。",
  }));
}

function updateHomeResult(result) {
  dom.homeResult.classList.remove("hidden");
  dom.homeBlocker.textContent = result.blocker || "";
  dom.homeInsight.textContent = result.insight || "";
  dom.homeAgentBtn.textContent = "也许你可以和智能体聊一聊为什么不想读";
  renderChoices(dom.homeChoices, result.micro_choices, (choice) => {
    state.microMode = choice.minutes;
    state.microInstruction = choice.instruction;
    setRoute("micro");
    renderMicro();
  });
}

function buildHomePrompt(text) {
  return `${systemPrompts.home}${text}`;
}

function buildAgentPrompt(text, q1Selected, q2Selected, hint) {
  const q1Text = q1Selected.length ? q1Selected.join("、") : "没有选中";
  const q2Text = q2Selected || "未选择";
  const swapHint = hint ? `换一个角度提示：${hint}\n` : "";
  return `${systemPrompts.agent}\n${swapHint}用户输入：${text}\n条件：${q1Text}\n最担心：${q2Text}`;
}

function buildExitPrompt(text, reason) {
  return `${systemPrompts.exit}${text}\n原因：${reason}`;
}

const API_BASE = (window.__CONFIG__ && window.__CONFIG__.API_BASE_URL)
  ? String(window.__CONFIG__.API_BASE_URL).replace(/\/$/, "")
  : "";
const AGENT_URL = API_BASE ? `${API_BASE}/api/agent` : "/api/agent";

async function callAgent(promptText) {
  const response = await fetch(AGENT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({ text: promptText }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const message = errorData.error || "Request failed.";
    throw new Error(message);
  }

  const data = await response.json();
  return (data.suggestion || "").trim();
}

function renderChips(container, items, multi, selected, onChange) {
  container.innerHTML = "";
  items.forEach((item) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "option-chip";
    const isActive = multi ? selected.includes(item) : selected === item;
    chip.classList.toggle("is-active", isActive);
    chip.textContent = item;
    chip.addEventListener("click", () => {
      if (multi) {
        const exists = selected.includes(item);
        const next = exists
          ? selected.filter((val) => val !== item)
          : [...selected, item];
        onChange(next);
      } else {
        onChange(item);
      }
    });
    container.appendChild(chip);
  });
}

function renderStep1Chips() {
  renderChips(dom.agentStep1Chips, q1Options, true, state.q1Selected, (next) => {
    state.q1Selected = next;
    renderStep1Chips();
  });
}

function renderStep2Chips() {
  renderChips(dom.agentStep2Chips, q2Options, false, state.q2Selected, (next) => {
    state.q2Selected = next;
    renderStep2Chips();
  });
}

async function handleHome() {
  const text = dom.homeInput.value.trim();
  if (!text) return;

  state.userText = text;
  setError(dom.homeError, "");
  setStatus(dom.homeStatus, "正在生成洞察...");
  dom.homeHint.textContent = "";
  dom.homeResult.classList.add("hidden");
  setLoading(dom.homeHelpBtn, "生成中...");

  try {
    const suggestion = await callAgent(buildHomePrompt(text));
    const parsed = tryParseJson(suggestion);
    const result = parsed || {
      blocker: "疲劳",
      insight: suggestion || "今天的你适合更轻一点。",
      micro_choices: normalizeChoices(),
      agent_cta: "我想更清楚为什么卡住",
    };
    result.micro_choices = normalizeChoices(result.micro_choices);
    state.homeModelResult = result;
    updateHomeResult(result);
    dom.homeHint.textContent = "";
  } catch (error) {
    console.error(error);
    setError(dom.homeError, error.message || "请求失败");
  } finally {
    clearLoading(dom.homeHelpBtn);
    setStatus(dom.homeStatus, "");
  }
}

function initAgentFlow() {
  setError(dom.agentError, "");
  dom.agentStep1.classList.remove("hidden");
  dom.agentStep2.classList.add("hidden");
  dom.agentCards.classList.add("hidden");
  state.q1Selected = [];
  state.q2Selected = "";
  renderStep1Chips();
  renderStep2Chips();
}

function goToStep2() {
  if (!state.q1Selected.length) {
    setError(dom.agentError, "先选几项条件");
    return;
  }
  setError(dom.agentError, "");
  dom.agentStep1.classList.add("hidden");
  dom.agentStep2.classList.remove("hidden");
}

async function generateAgentCards() {
  if (!state.q2Selected) {
    setError(dom.agentError, "先选一个担心");
    return;
  }

  setError(dom.agentError, "");
  setLoading(dom.agentStep2NextBtn, "生成中...");
  try {
    const suggestion = await callAgent(
      buildAgentPrompt(state.userText, state.q1Selected, state.q2Selected),
    );
    const parsed = tryParseJson(suggestion);
    if (!parsed || !parsed.cards) {
      throw new Error("智能体返回格式不正确");
    }
    state.agentResult = parsed;
    renderKeganCards(parsed);
  } catch (error) {
    setError(dom.agentError, error.message || "请求失败");
  } finally {
    clearLoading(dom.agentStep2NextBtn);
  }
}

function renderKeganCards(data) {
  dom.agentStep1.classList.add("hidden");
  dom.agentStep2.classList.add("hidden");
  dom.agentCards.classList.remove("hidden");

  cardOrder = ["behavior", "hidden_commitment", "belief", "big_assumption"];
  cardIndex = 0;
  dom.agentReframe.textContent = data.reframe || "";
  dom.agentSwapHint.textContent = data.swap_hint || "";
  dom.microActions.hidden = true;

  dom.cardCarousel.innerHTML = "";
  cardOrder.forEach((key, index) => {
    const card = data.cards[key] || { title: "", content: "" };
    const article = document.createElement("article");
    article.className = "kcard";
    article.dataset.index = String(index);
    article.innerHTML = `
      <div class="kcard-top">${escapeHtml(card.title)}</div>
      <div class="kcard-body">${escapeHtml(card.content)}</div>
    `;
    dom.cardCarousel.appendChild(article);
  });

  requestAnimationFrame(() => {
    dom.cardCarousel.scrollTo({ left: 0, behavior: "smooth" });
    updateActiveCard();
  });
}

function updateActiveCard() {
  const cards = Array.from(dom.cardCarousel.querySelectorAll(".kcard"));
  if (!cards.length) return;
  const rect = dom.cardCarousel.getBoundingClientRect();
  const center = rect.left + rect.width / 2;
  let minDist = Infinity;
  let active = 0;

  cards.forEach((card, index) => {
    const cardRect = card.getBoundingClientRect();
    const cardCenter = cardRect.left + cardRect.width / 2;
    const dist = Math.abs(cardCenter - center);
    if (dist < minDist) {
      minDist = dist;
      active = index;
    }
  });

  cards.forEach((card, index) => {
    card.classList.remove("is-left", "is-right");
    if (index < active) {
      card.classList.add("is-left");
    } else if (index > active) {
      card.classList.add("is-right");
    }
    card.classList.toggle("is-active", index === active);
  });

  dom.agentCardIndex.textContent = `第 ${active + 1}/${cards.length} 张`;
  dom.microActions.hidden = active !== cards.length - 1;
}

function onCarouselScroll() {
  if (carouselTick) return;
  carouselTick = true;
  requestAnimationFrame(() => {
    carouselTick = false;
    updateActiveCard();
  });
}

async function swapAgent() {
  if (!state.userText) return;
  setLoading(dom.navAction, "换一换...");
  try {
    const suggestion = await callAgent(
      buildAgentPrompt(state.userText, state.q1Selected, state.q2Selected, "换一个角度"),
    );
    const parsed = tryParseJson(suggestion);
    if (!parsed || !parsed.cards) {
      throw new Error("智能体返回格式不正确");
    }
    state.agentResult = parsed;
    renderKeganCards(parsed);
  } catch (error) {
    setError(dom.agentError, error.message || "请求失败");
  } finally {
    clearLoading(dom.navAction);
  }
}

function renderMicro() {
  dom.microMode.textContent = `${state.microMode}分钟 · ${state.microMode === 2 ? "无脑读" : state.microMode === 5 ? "放松读" : "稍认真"}`;
  dom.microInstruction.textContent = state.microInstruction || "先读一句。";
  dom.microFallback.classList.toggle(
    "hidden",
    Boolean(dom.microTextInput.value.trim()),
  );
  resetTimer();
}

function setTimer(seconds) {
  timerRemaining = seconds;
  renderTimer();
}

function renderTimer() {
  const minutes = Math.floor(timerRemaining / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (timerRemaining % 60)
    .toString()
    .padStart(2, "0");
  dom.timerDisplay.textContent = `${minutes}:${seconds}`;
}

function startTimer() {
  if (timerId) return;
  timerId = setInterval(() => {
    if (timerRemaining <= 0) {
      clearInterval(timerId);
      timerId = null;
      return;
    }
    timerRemaining -= 1;
    renderTimer();
  }, 1000);
}

function pauseTimer() {
  if (!timerId) return;
  clearInterval(timerId);
  timerId = null;
}

function resetTimer() {
  pauseTimer();
  const seconds = (state.microMode || 2) * 60;
  setTimer(seconds);
}

function handleExitReason(event) {
  if (!(event.target instanceof HTMLElement)) return;
  const reason = event.target.dataset.reason;
  if (!reason) return;
  state.exitReason = reason;
  dom.exitReasonList.querySelectorAll(".exit-item").forEach((item) => {
    item.classList.toggle("is-active", item === event.target);
  });
}

async function submitExit() {
  if (!state.exitReason) {
    setError(dom.exitError, "先选一个原因");
    return;
  }

  setError(dom.exitError, "");
  setStatus(dom.exitStatus, "正在生成...");
  setLoading(dom.exitSubmitBtn, "生成中...");

  try {
    const suggestion = await callAgent(
      buildExitPrompt(state.userText, state.exitReason),
    );
    const parsed = tryParseJson(suggestion);
    if (!parsed || !parsed.options) {
      throw new Error("退出缓冲返回格式不正确");
    }
    state.exitResult = parsed;
    renderExitResult(parsed);
  } catch (error) {
    setError(dom.exitError, error.message || "请求失败");
  } finally {
    clearLoading(dom.exitSubmitBtn);
    setStatus(dom.exitStatus, "");
  }
}

function renderExitResult(result) {
  dom.exitResult.classList.remove("hidden");
  dom.exitInsight.textContent = result.insight || "你已经很努力了。";
  dom.exitOptions.innerHTML = "";
  result.options.forEach((option) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "choice";
    button.textContent = option.text;
    button.addEventListener("click", () => {
      if (option.id === "lighter") {
        state.microMode = result.mode_suggestion || 2;
        state.microInstruction = state.microInstruction || "先读一句。";
        setRoute("micro");
        renderMicro();
      }
      if (option.id === "move") {
        state.microMode = state.microMode || 5;
        state.microInstruction = "换个段落或位置，再读两分钟。";
        setRoute("micro");
        renderMicro();
      }
      if (option.id === "leave") {
        setRoute("home");
        dom.homeHint.textContent = "下次也可以只读30秒。";
      }
    });
    dom.exitOptions.appendChild(button);
  });
}

function handleHashChange() {
  const target = window.location.hash.replace("#", "") || "home";
  activeRoute = target;
  renderRoute();
}

function init() {
  dom.navBack.addEventListener("click", () => {
    if (activeRoute === "agent") {
      setRoute("home");
      return;
    }
    if (activeRoute === "micro") {
      setRoute("agent");
      return;
    }
    if (activeRoute === "exit") {
      setRoute("micro");
    }
  });

  dom.navAction.addEventListener("click", () => {
    if (activeRoute === "agent") {
      swapAgent();
    }
  });

  dom.homeHelpBtn.addEventListener("click", handleHome);
  dom.homeAgentBtn.addEventListener("click", () => {
    setRoute("agent");
    initAgentFlow();
  });

  dom.agentStep1NextBtn.addEventListener("click", goToStep2);
  dom.agentStep2NextBtn.addEventListener("click", generateAgentCards);

  dom.cardCarousel.addEventListener("scroll", onCarouselScroll, { passive: true });
  dom.cardCarousel.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "mouse") return;
    dragState = {
      startX: event.clientX,
      scrollLeft: dom.cardCarousel.scrollLeft,
      pointerId: event.pointerId,
    };
    dom.cardCarousel.setPointerCapture(event.pointerId);
  });
  dom.cardCarousel.addEventListener("pointermove", (event) => {
    if (!dragState || event.pointerType !== "mouse") return;
    const dx = event.clientX - dragState.startX;
    dom.cardCarousel.scrollLeft = dragState.scrollLeft - dx;
    event.preventDefault();
  });
  dom.cardCarousel.addEventListener("pointerup", (event) => {
    if (!dragState || event.pointerType !== "mouse") return;
    dom.cardCarousel.releasePointerCapture(dragState.pointerId);
    dragState = null;
  });
  dom.cardCarousel.addEventListener("pointercancel", (event) => {
    if (!dragState || event.pointerType !== "mouse") return;
    dom.cardCarousel.releasePointerCapture(dragState.pointerId);
    dragState = null;
  });

  dom.microActions.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const button = target.closest(".micro-btn");
    if (!button) return;
    const minutes = Number(button.dataset.min);
    const choice = (state.agentResult?.micro_reading || []).find(
      (item) => Number(item.minutes) === minutes,
    );
    state.microMode = minutes || 2;
    state.microInstruction = choice?.instruction || "先读一句。";
    setRoute("micro");
    renderMicro();
  });

  dom.timerStartBtn.addEventListener("click", startTimer);
  dom.timerPauseBtn.addEventListener("click", pauseTimer);
  dom.timerResetBtn.addEventListener("click", resetTimer);

  dom.microTextInput.addEventListener("input", () => {
    dom.microFallback.classList.toggle(
      "hidden",
      Boolean(dom.microTextInput.value.trim()),
    );
  });

  dom.microExitBtn.addEventListener("click", () => {
    setRoute("exit");
  });

  dom.exitReasonList.addEventListener("click", handleExitReason);
  dom.exitSubmitBtn.addEventListener("click", submitExit);

  window.addEventListener("hashchange", handleHashChange);
  if (!window.location.hash) {
    window.location.hash = "#home";
  }
  handleHashChange();
}

init();
