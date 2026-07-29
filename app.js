(function () {
  const config = window.SITE_CONFIG || {};

  function normalize(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/长洲/g, "常州")
      .replace(/常纺学院|常纺院校/g, "常州纺织服装职业技术学院")
      .replace(/[^\p{L}\p{N}]+/gu, "");
  }

  function bigrams(value) {
    const text = normalize(value);
    if (!text) return [];
    if (text.length === 1) return [text];
    const result = [];
    for (let index = 0; index < text.length - 1; index += 1) {
      result.push(text.slice(index, index + 2));
    }
    return result;
  }

  function diceSimilarity(left, right) {
    const a = bigrams(left);
    const b = bigrams(right);
    if (!a.length || !b.length) return 0;
    const counts = new Map();
    a.forEach((item) => counts.set(item, (counts.get(item) || 0) + 1));
    let overlap = 0;
    b.forEach((item) => {
      const remaining = counts.get(item) || 0;
      if (remaining > 0) {
        overlap += 1;
        counts.set(item, remaining - 1);
      }
    });
    return (2 * overlap) / (a.length + b.length);
  }

  function phraseScore(query, phrase) {
    const cleanQuery = normalize(query);
    const cleanPhrase = normalize(phrase);
    if (!cleanQuery || !cleanPhrase) return 0;
    if (cleanQuery === cleanPhrase) return 1;

    const shorter = Math.min(cleanQuery.length, cleanPhrase.length);
    if (shorter >= 4 && (cleanQuery.includes(cleanPhrase) || cleanPhrase.includes(cleanQuery))) {
      return 0.9 + 0.08 * (shorter / Math.max(cleanQuery.length, cleanPhrase.length));
    }

    return diceSimilarity(cleanQuery, cleanPhrase);
  }

  function findKnowledge(text) {
    const ranked = (config.knowledge || [])
      .map((item) => {
        const phrases = [item.question].concat(item.synonyms || []);
        const score = Math.max.apply(null, phrases.map((phrase) => phraseScore(text, phrase)));
        return { item, score };
      })
      .sort((left, right) => right.score - left.score);

    const best = ranked[0];
    const runnerUp = ranked[1];
    if (!best || best.score < 0.44) return null;
    if (best.score < 0.72 && runnerUp && best.score - runnerUp.score < 0.035) return null;
    return best.item;
  }

  function answerFor(text) {
    const hit = findKnowledge(text);
    return hit ? hit.answer : config.fallbackAnswer;
  }

  window.NEW_STUDENT_QA = { answerFor, findKnowledge, normalize };
  if (typeof document === "undefined") return;

  const $ = (id) => document.getElementById(id);
  const setText = (id, value) => {
    const node = $(id);
    if (node) node.textContent = value || "";
  };
  const setSrc = (id, value) => {
    const node = $(id);
    if (node) node.src = value || "";
  };

  document.title = config.title ? config.title + " | 新生答疑助手" : "新生答疑助手";

  setText("headerName", config.title);
  setText("profileName", config.title);
  setText("headerStatus", config.status);
  setText("schoolName", config.school);
  setText("subtitle", config.subtitle);
  setText("serviceLine", config.serviceLine);
  setText("admissionPhone", config.admissionPhone);
  setText("consultPhone", config.consultPhone);
  setText("notice", config.notice);
  setText("wechatLabel", config.wechatLabel);
  setText("inputTip", config.inputTip);
  setText("disclaimer", config.disclaimer);
  setSrc("headerAvatar", config.avatar);
  setSrc("heroAvatar", config.avatar);
  setSrc("wechatQr", config.wechatQr);
  setSrc("dialogQr", config.wechatQr);

  const input = $("questionInput");
  const sendBtn = $("sendBtn");
  const chatArea = $("chatArea");
  const welcomePanel = $("welcomePanel");
  const grid = $("questionGrid");

  input.placeholder = config.inputPlaceholder || "请输入你的问题";

  // 视图层级：home（首页 / welcome 面板） | chat（对话层）
  // 返回键的作用是在应用内「返回上一级」，而非退回浏览器历史（那样会离开站点）。
  let view = "home";
  function updateBackBtn() {
    const btn = $("backBtn");
    if (btn) btn.style.display = view === "chat" ? "" : "none";
  }

  function goHome() {
    welcomePanel.classList.remove("compact");
    chatArea.querySelectorAll(".message-row").forEach((node) => node.remove());
    chatArea.scrollTop = 0;
    input.value = "";
    sendBtn.disabled = true;
    view = "home";
    updateBackBtn();
  }

  function addMessage(text, role, options) {
    welcomePanel.classList.add("compact");
    const row = document.createElement("div");
    row.className = "message-row " + role;
    const bubble = document.createElement("div");
    bubble.className = "bubble";
    const messageText = document.createElement("div");
    messageText.className = "bubble-text";
    messageText.textContent = text;
    bubble.appendChild(messageText);

    if (options && options.showQr) {
      const qrButton = document.createElement("button");
      qrButton.className = "fallback-qr-card";
      qrButton.type = "button";
      qrButton.setAttribute("aria-label", config.fallbackQrLabel || "添加学长微信");

      const qrImage = document.createElement("img");
      qrImage.className = "fallback-qr-image";
      qrImage.src = config.wechatQr;
      qrImage.alt = "学长微信二维码";

      const qrCaption = document.createElement("span");
      qrCaption.className = "fallback-qr-caption";
      qrCaption.textContent = config.fallbackQrLabel || "长按识别二维码，添加学长微信";

      qrButton.append(qrImage, qrCaption);
      qrButton.addEventListener("click", () => $("qrDialog").showModal());
      bubble.appendChild(qrButton);
    }
    row.appendChild(bubble);
    chatArea.appendChild(row);
    chatArea.scrollTop = chatArea.scrollHeight;
  }

  function ask(text) {
    const clean = String(text || "").trim();
    if (!clean) return;
    view = "chat";
    updateBackBtn();
    addMessage(clean, "user");
    input.value = "";
    sendBtn.disabled = true;
    const knowledgeHit = findKnowledge(clean);
    const answer = knowledgeHit ? knowledgeHit.answer : config.fallbackAnswer;
    window.setTimeout(
      () => addMessage(answer, "assistant", { showQr: !knowledgeHit }),
      260,
    );
  }

  (config.questions || []).forEach((item) => {
    const button = document.createElement("button");
    button.className = "question-btn";
    button.type = "button";
    const icon = document.createElement("span");
    const label = document.createElement("span");
    icon.textContent = item.icon || "•";
    label.textContent = item.text;
    button.append(icon, label);
    button.addEventListener("click", () => ask(item.text));
    grid.appendChild(button);
  });

  input.addEventListener("input", () => {
    sendBtn.disabled = input.value.trim().length === 0;
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 120) + "px";
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      ask(input.value);
    }
  });

  $("askForm").addEventListener("submit", (event) => {
    event.preventDefault();
    ask(input.value);
  });

  $("downloadBtn").addEventListener("click", () => {
    if (config.downloadUrl) {
      window.open(config.downloadUrl, "_blank", "noopener");
      return;
    }
    addMessage(config.fallbackAnswer, "assistant", { showQr: true });
    $("qrDialog").showModal();
  });

  $("backBtn").addEventListener("click", () => {
    if (view === "chat") goHome();
  });
  updateBackBtn();
  $("wechatBtn").addEventListener("click", () => $("qrDialog").showModal());
  $("qrPreview").addEventListener("click", () => $("qrDialog").showModal());
  $("closeDialog").addEventListener("click", () => $("qrDialog").close());
})();
