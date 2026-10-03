(() => {
  const KEY = "rmcti_ai_history_v1";
  const messagesEl = document.querySelector("[data-ai-messages]");
  const input = document.querySelector("[data-ai-input]");
  const send = document.querySelector("[data-ai-send]");
  const typing = document.querySelector("[data-ai-typing]");
  if (!messagesEl || !input || !send) return;

  let history = [];
  try { history = JSON.parse(sessionStorage.getItem(KEY) || "[]"); } catch {}
  if (!Array.isArray(history)) history = [];

  const esc = (v) => U?.esc ? U.esc(String(v)) : String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const renderText = (text) => {
    // Keep assistant output safe. Preserve simple line breaks and bullets.
    return esc(text).replace(/\n/g, "<br>");
  };
  const scroll = () => { messagesEl.scrollTop = messagesEl.scrollHeight; };

  function addMessage(role, text) {
    const row = document.createElement("div");
    row.className = `ai-message ${role}`;
    row.innerHTML = `<div class="ai-avatar">${role === "assistant" ? "✦" : "A"}</div><div class="ai-bubble">${renderText(text)}</div>`;
    messagesEl.appendChild(row);
    scroll();
  }

  function restore() {
    if (!history.length) return;
    messagesEl.innerHTML = "";
    history.forEach(m => addMessage(m.role, m.content));
  }
  restore();

  function save() {
    sessionStorage.setItem(KEY, JSON.stringify(history.slice(-16)));
  }

  async function ask(text) {
    text = String(text || "").trim();
    if (!text || send.disabled) return;
    addMessage("user", text);
    history.push({role:"user", content:text});
    save();
    input.value = "";
    send.disabled = true;
    typing.hidden = false;
    scroll();
    try {
      const data = await Api.post("/admin/ai-assistant", {messages: history.slice(-16)});
      const answer = data?.message || "I couldn't produce a response.";
      addMessage("assistant", answer);
      history.push({role:"assistant", content:answer});
      save();
    } catch (error) {
      addMessage("assistant", `I couldn't complete that request. ${error.message || "Please try again."}`);
    } finally {
      typing.hidden = true;
      send.disabled = false;
      input.focus();
    }
  }

  send.addEventListener("click", () => ask(input.value));
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      ask(input.value);
    }
  });
  document.querySelectorAll("[data-ai-prompt]").forEach(btn => {
    btn.addEventListener("click", () => ask(btn.dataset.aiPrompt));
  });
  document.querySelector("[data-ai-clear]")?.addEventListener("click", () => {
    history = [];
    sessionStorage.removeItem(KEY);
    messagesEl.innerHTML = `<div class="ai-message assistant"><div class="ai-avatar">✦</div><div class="ai-bubble"><b>Chat cleared.</b><p>What would you like me to do?</p></div></div>`;
    input.focus();
  });
})();
