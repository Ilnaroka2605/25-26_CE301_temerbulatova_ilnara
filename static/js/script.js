document.addEventListener("DOMContentLoaded", () => {
  // GET REFERENCES TO HTML ELEMENTS
  const chatbox = document.getElementById("chatbox");
  let greeting = document.getElementById("greeting");
  const input = document.getElementById("input");
  const sendBtn = document.getElementById("send");
  const voiceBtn = document.getElementById("voice");
  const sidebar = document.getElementById("sidebar");
  const toggleSidebar = document.getElementById("toggleSidebar");
  const newChatBtn = document.getElementById("newChatBtn");
  const savedMsgBtn = document.getElementById("savedMsgBtn");
  const chatHistoryList = document.getElementById("chatHistory");
  const telegramBtn = document.getElementById("telegramBtn");
  const calendarBtn = document.getElementById("calendarBtn");
  const emailBtn = document.getElementById("emailBtn");

  // Wow-feature elements
  const voiceToggle = document.getElementById("voiceToggle");
  const attachBtn = document.getElementById("attachBtn");
  const fileInput = document.getElementById("fileInput");
  const attachmentPreview = document.getElementById("attachmentPreview");
  const slashMenu = document.getElementById("slashMenu");

  // Auth / account menu
  const authModal = document.getElementById("authModal");
  const closeAuth = document.getElementById("closeAuth");
  const userAccountBtn = document.getElementById("userAccountBtn");

  const accountMenuBtn = document.getElementById("accountMenuBtn");
  const accountMenu = document.getElementById("accountMenu");
  const accountLoginBtn = document.getElementById("accountLoginBtn");
  const accountSettingsBtn = document.getElementById("accountSettingsBtn");
  const accountLogoutBtn = document.getElementById("accountLogoutBtn");

  // Chat history by conversations
  let chats = JSON.parse(localStorage.getItem("auraChats")) || [];
  let currentChatId = null;
  let currentView = "chat";

  // Wow-feature state
  let voiceEnabled = localStorage.getItem("auraVoiceEnabled") === "true";
  let pendingAttachment = null; // { data: base64, mime_type, name, previewUrl }

  // ----------------------------------------------------
  // Emotion-reactive orb: a lightweight client-side heuristic.
  // This is NOT real sentiment analysis — just keyword matching
  // to give the orb a "mood" that roughly tracks the conversation.
  // Good enough for ambiance; not meant to be clinically accurate.
  // ----------------------------------------------------
  const WARM_WORDS = ["great", "awesome", "love", "amazing", "congrat", "yay", "exciting", "happy", "wonderful", "🎉", "!"];
  const SERIOUS_WORDS = ["sorry", "error", "problem", "issue", "sad", "unfortunately", "difficult", "worried", "concern", "fail", "died", "death", "urgent"];

  function detectMood(text) {
    const lower = text.toLowerCase();
    let warmScore = 0;
    let seriousScore = 0;
    WARM_WORDS.forEach(w => { if (lower.includes(w)) warmScore++; });
    SERIOUS_WORDS.forEach(w => { if (lower.includes(w)) seriousScore++; });

    if (seriousScore > warmScore && seriousScore > 0) return "serious";
    if (warmScore > 0) return "warm";
    return "calm";
  }

  function applyMood(text) {
    const mood = detectMood(text);
    document.body.dataset.mood = mood;
  }

  // ----------------------------------------------------
  // Voice replies (text-to-speech). Strips markdown syntax so
  // the assistant doesn't read out asterisks, hashes, etc.
  // ----------------------------------------------------
  function speakText(text) {
    if (!("speechSynthesis" in window)) return;
    const clean = text
      .replace(/```[\s\S]*?```/g, "")
      .replace(/[*_#`]/g, "")
      .replace(/\[(.*?)\]\(.*?\)/g, "$1")
      .trim();
    if (!clean) return;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.rate = 1.0;
    window.speechSynthesis.speak(utterance);
  }

  function updateVoiceToggleUI() {
    if (!voiceToggle) return;
    voiceToggle.textContent = voiceEnabled ? "🔊" : "🔇";
    voiceToggle.classList.toggle("active", voiceEnabled);
  }

  voiceToggle?.addEventListener("click", () => {
    voiceEnabled = !voiceEnabled;
    localStorage.setItem("auraVoiceEnabled", voiceEnabled);
    updateVoiceToggleUI();
    if (!voiceEnabled) window.speechSynthesis?.cancel();
  });
  updateVoiceToggleUI();

  // ----------------------------------------------------
  // Slash commands
  // ----------------------------------------------------
  const SLASH_COMMANDS = [
    { cmd: "/summarize", desc: "Summarize the text you paste after this command", template: "/summarize " },
    { cmd: "/translate", desc: "Translate text — e.g. /translate to Russian: hello", template: "/translate to " },
    { cmd: "/remind", desc: "Set a browser reminder — e.g. /remind in 10 minutes: stretch", template: "/remind in " },
    { cmd: "/image", desc: "Generate an image from a description", template: "/image " }
  ];

  let slashSelectedIndex = 0;

  function renderSlashMenu(filter) {
    const matches = SLASH_COMMANDS.filter(c => c.cmd.startsWith(filter));
    if (!matches.length) {
      slashMenu.classList.add("hidden");
      return;
    }
    slashSelectedIndex = 0;
    slashMenu.innerHTML = "";
    matches.forEach((c, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      if (i === slashSelectedIndex) btn.classList.add("selected");
      btn.innerHTML = `<span class="cmd-name">${c.cmd}</span><span class="cmd-desc">${c.desc}</span>`;
      btn.addEventListener("click", () => {
        input.value = c.template;
        input.focus();
        slashMenu.classList.add("hidden");
      });
      slashMenu.appendChild(btn);
    });
    slashMenu.classList.remove("hidden");
  }

  input?.addEventListener("input", () => {
    const val = input.value;
    if (val.startsWith("/") && !val.includes(" ")) {
      renderSlashMenu(val);
    } else {
      slashMenu.classList.add("hidden");
    }
  });

  // Parses a leading slash command out of the user's message.
  // Returns { type: "summarize"|"translate"|"remind"|"image"|null, rest }
  function parseSlashCommand(text) {
    const lower = text.toLowerCase();
    if (lower.startsWith("/summarize ")) return { type: "summarize", rest: text.slice(11).trim() };
    if (lower.startsWith("/translate ")) return { type: "translate", rest: text.slice(11).trim() };
    if (lower.startsWith("/remind ")) return { type: "remind", rest: text.slice(8).trim() };
    if (lower.startsWith("/image ")) return { type: "image", rest: text.slice(7).trim() };
    return { type: null, rest: text };
  }

  // Very lightweight parser for "/remind in <duration>: <message>"
  function handleRemindCommand(rest) {
    const match = rest.match(/^(\d+)\s*(second|minute|hour)s?\s*:\s*(.+)$/i);
    if (!match) {
      appendMessage("bot", "To set a reminder, use the format: `/remind in 10 minutes: stretch your legs`");
      return;
    }
    const [, amountStr, unit, message] = match;
    const amount = parseInt(amountStr, 10);
    const multiplier = unit.toLowerCase().startsWith("hour") ? 3600000 : unit.toLowerCase().startsWith("minute") ? 60000 : 1000;
    const delay = amount * multiplier;

    if ("Notification" in window && Notification.permission !== "granted") {
      Notification.requestPermission();
    }

    setTimeout(() => {
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification("AURA reminder", { body: message });
      } else {
        alert(`⏰ AURA reminder: ${message}`);
      }
    }, delay);

    appendMessage("bot", `⏰ Got it — I'll remind you in ${amount} ${unit}${amount > 1 ? "s" : ""}: "${message}". Keep this tab open for the reminder to fire.`);
  }

  async function handleImageCommand(prompt) {
    appendMessage("user", `/image ${prompt}`);
    const typing = showTypingIndicator();

    try {
      const response = await fetch("/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt })
      });
      const data = await response.json();
      typing.remove();

      if (data.image) {
        appendMessage("bot", data.text || "Here's what I generated:");
        const imgDiv = document.createElement("div");
        imgDiv.className = "bot message";
        imgDiv.innerHTML = `
          <div class="msg-avatar aura-orb" aria-hidden="true"></div>
          <div class="bubble msg-attachment">
            <img src="data:${data.mime_type};base64,${data.image}" alt="Generated image">
          </div>
        `;
        chatbox.appendChild(imgDiv);
        chatbox.scrollTop = chatbox.scrollHeight;
      } else {
        appendMessage("bot", `⚠️ ${data.error || "Couldn't generate an image."}`);
      }
    } catch {
      typing.remove();
      appendMessage("bot", "⚠️ Error: Unable to reach the image generation endpoint.");
    }
  }

  // ----------------------------------------------------
  // Drag & drop / file attachment
  // ----------------------------------------------------
  function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function setAttachment(file) {
    if (!file) return;
    const base64 = await readFileAsBase64(file);
    const previewUrl = file.type.startsWith("image/") ? URL.createObjectURL(file) : null;

    pendingAttachment = { data: base64, mime_type: file.type || "application/octet-stream", name: file.name, previewUrl };

    attachmentPreview.innerHTML = "";
    if (previewUrl) {
      const img = document.createElement("img");
      img.src = previewUrl;
      attachmentPreview.appendChild(img);
    }
    const label = document.createElement("span");
    label.textContent = file.name;
    attachmentPreview.appendChild(label);

    const removeBtn = document.createElement("button");
    removeBtn.className = "remove-attachment";
    removeBtn.textContent = "✕";
    removeBtn.onclick = () => clearAttachment();
    attachmentPreview.appendChild(removeBtn);

    attachmentPreview.classList.remove("hidden");
  }

  function clearAttachment() {
    pendingAttachment = null;
    attachmentPreview.classList.add("hidden");
    attachmentPreview.innerHTML = "";
    fileInput.value = "";
  }

  attachBtn?.addEventListener("click", () => fileInput.click());
  fileInput?.addEventListener("change", (e) => setAttachment(e.target.files[0]));

  chatbox?.addEventListener("dragover", (e) => {
    e.preventDefault();
    chatbox.classList.add("drag-over");
  });
  chatbox?.addEventListener("dragleave", () => chatbox.classList.remove("drag-over"));
  chatbox?.addEventListener("drop", (e) => {
    e.preventDefault();
    chatbox.classList.remove("drag-over");
    const file = e.dataTransfer.files[0];
    if (file) setAttachment(file);
  });

  function showTypingIndicator() {
    const typing = document.createElement("div");
    typing.className = "bot message";
    typing.id = "typing-indicator";
    typing.innerHTML = `
      <div class="mini-orb" aria-hidden="true"></div>
      <div class="typing-bubble">AURA is thinking…</div>
    `;
    chatbox.appendChild(typing);
    chatbox.scrollTop = chatbox.scrollHeight;
    return typing;
  }

  // ----------------------------------------------------
  // Follow-up suggestion chips
  // ----------------------------------------------------
  function renderSuggestionChips(suggestions) {
    if (!suggestions || !suggestions.length) return;

    const wrap = document.createElement("div");
    wrap.className = "suggestion-chips";

    suggestions.forEach(s => {
      const chip = document.createElement("button");
      chip.className = "suggestion-chip";
      chip.type = "button";
      chip.textContent = s;
      chip.addEventListener("click", () => {
        input.value = s;
        sendMessage();
      });
      wrap.appendChild(chip);
    });

    chatbox.appendChild(wrap);
    chatbox.scrollTop = chatbox.scrollHeight;
  }

  function generateChatId() {
    return "chat_" + Date.now() + "_" + Math.floor(Math.random() * 10000);
  }

  function getEmptyChat() {
    return {
      id: generateChatId(),
      title: "New Chat",
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  function saveChatsToStorage() {
    localStorage.setItem("auraChats", JSON.stringify(chats));
  }

  function getCurrentChat() {
    return chats.find(chat => chat.id === currentChatId) || null;
  }

  function ensureCurrentChat() {
    let chat = getCurrentChat();

    if (!chat) {
      chat = getEmptyChat();
      chats.unshift(chat);
      currentChatId = chat.id;
      saveChatsToStorage();
    }

    return chat;
  }

  function makeChatTitle(text) {
    if (!text) return "New Chat";
    return text.length > 30 ? text.slice(0, 30) + "..." : text;
  }

  function updateCurrentChatTitle(firstUserMessage) {
    const chat = getCurrentChat();
    if (!chat) return;

    if (chat.title === "New Chat" || chat.messages.length <= 2) {
      chat.title = makeChatTitle(firstUserMessage);
      chat.updatedAt = new Date().toISOString();
      saveChatsToStorage();
      renderHistory();
    }
  }

  function addMessageToCurrentChat(sender, text) {
    const chat = ensureCurrentChat();

    chat.messages.push({ sender, text });
    chat.updatedAt = new Date().toISOString();

    saveChatsToStorage();
    renderHistory();
  }

  function openChat(chatId) {
    const chat = chats.find(c => c.id === chatId);
    if (!chat) return;

    currentChatId = chat.id;
    currentView = "chat";
    chatbox.innerHTML = "";

    if (!chat.messages.length) {
      showEmptyChatScreen();
      return;
    }

    chat.messages.forEach(msg => {
      appendMessage(msg.sender, msg.text, false);
    });
  }

  // ----------------------------------------------------
  // History grouping: buckets chats into Today / Yesterday /
  // Previous 7 Days / Older, the way most modern chat UIs do.
  // ----------------------------------------------------
  function getHistoryGroup(dateStr) {
    const date = new Date(dateStr);
    const now = new Date();

    const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const today = startOfDay(now);
    const chatDay = startOfDay(date);
    const diffDays = Math.round((today - chatDay) / (1000 * 60 * 60 * 24));

    if (diffDays <= 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays <= 7) return "Previous 7 Days";
    return "Older";
  }

  function renderHistory() {
    chatHistoryList.innerHTML = "";

    if (!chats.length) {
      const li = document.createElement("li");
      li.textContent = "No chats yet";
      li.style.opacity = "0.7";
      chatHistoryList.appendChild(li);
      return;
    }

    const sorted = [...chats].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    const groupOrder = ["Today", "Yesterday", "Previous 7 Days", "Older"];
    const grouped = {};
    sorted.forEach(chat => {
      const group = getHistoryGroup(chat.updatedAt);
      if (!grouped[group]) grouped[group] = [];
      grouped[group].push(chat);
    });

    groupOrder.forEach(groupName => {
      const chatsInGroup = grouped[groupName];
      if (!chatsInGroup || !chatsInGroup.length) return;

      const label = document.createElement("li");
      label.className = "history-group-label";
      label.textContent = groupName;
      label.style.listStyle = "none";
      chatHistoryList.appendChild(label);

      chatsInGroup.forEach(chat => {
        const li = document.createElement("li");
        li.className = "chat-history-item";
        if (chat.id === currentChatId) {
          li.classList.add("active-chat");
        }

        const title = document.createElement("span");
        title.className = "chat-history-title";
        title.textContent = chat.title || "Untitled Chat";

        title.addEventListener("click", () => {
          openChat(chat.id);
          renderHistory();
        });

        const actions = document.createElement("div");
        actions.className = "chat-history-actions";

        const menuBtn = document.createElement("button");
        menuBtn.className = "chat-options-btn";
        menuBtn.type = "button";
        menuBtn.textContent = "⋮";

        const menu = document.createElement("div");
        menu.className = "chat-options-menu hidden";

        const deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.className = "danger";
        deleteBtn.textContent = "Delete chat";

        menuBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          const isHidden = menu.classList.contains("hidden");
          closeAllChatMenus();
          if (isHidden) {
            menu.classList.remove("hidden");
          }
        });

        deleteBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          deleteChat(chat.id);
        });

        actions.addEventListener("click", (e) => {
          e.stopPropagation();
        });

        menu.appendChild(deleteBtn);
        actions.appendChild(menuBtn);
        actions.appendChild(menu);
        li.appendChild(title);
        li.appendChild(actions);
        chatHistoryList.appendChild(li);
      });
    });
  }

  function deleteChat(chatId) {
    chats = chats.filter(chat => chat.id !== chatId);
    localStorage.setItem("auraChats", JSON.stringify(chats));

    if (currentChatId === chatId) {
      if (chats.length > 0) {
        currentChatId = chats[0].id;
        openChat(currentChatId);
      } else {
        currentChatId = null;
        startNewChat();
      }
    }

    renderHistory();
  }

  function closeAllChatMenus() {
    document.querySelectorAll(".chat-options-menu").forEach(menu => {
      menu.classList.add("hidden");
    });
  }

  function showEmptyChatScreen() {
    chatbox.innerHTML = `
      <div class="bot message">
        <div id="greeting" class="greeting">
          <div class="aura-orb" aria-hidden="true"></div>

          <h2 class="greeting-title">How can I help you?</h2>
          <p class="greeting-subtitle">Ask me anything — I'm here to assist.</p>

          <div class="greeting-cards">
            <button class="bubble" data-prompt="Write an email for me">
              Write an email for me
            </button>
            <button class="bubble" data-prompt="What is weather in ...">
              What is weather in ...
            </button>
          </div>
        </div>
      </div>
    `;

    attachGreetingEvents();
  }

  function startNewChat() {
    const newChat = getEmptyChat();
    chats.unshift(newChat);
    currentChatId = newChat.id;
    currentView = "chat";

    saveChatsToStorage();
    renderHistory();
    showEmptyChatScreen();
  }

  // Returns the initial to show in the user's avatar circle
  function getUserInitial() {
    const name = document.getElementById("userName")?.textContent?.trim();
    if (!name || name === "Guest User") return "U";
    return name.charAt(0).toUpperCase();
  }

  // appendMessage() is the core function for showing any message
  // in the chatbox — used for both user and bot messages.
  function appendMessage(sender, text, persist = true, attachmentInfo = null) {
    const messageDiv = document.createElement("div");
    messageDiv.className = `${sender} message`;

    // Avatar glyph — orb for AURA, initials for the user
    const avatar = document.createElement("div");
    avatar.className = "msg-avatar";
    avatar.textContent = sender === "bot" ? "" : getUserInitial();
    if (sender === "bot") avatar.classList.add("aura-orb");

    const bubble = document.createElement("div");
    bubble.className = "bubble";

    if (attachmentInfo && attachmentInfo.previewUrl) {
      const attWrap = document.createElement("div");
      attWrap.className = "msg-attachment";
      const img = document.createElement("img");
      img.src = attachmentInfo.previewUrl;
      attWrap.appendChild(img);
      bubble.appendChild(attWrap);
    }

    const textDiv = document.createElement("div");
    textDiv.innerHTML = marked.parse(text);
    bubble.appendChild(textDiv);

    bubble.querySelectorAll("pre code").forEach(el => hljs.highlightElement(el));

    bubble.querySelectorAll("pre").forEach(pre => {
      const btn = document.createElement("button");
      btn.className = "copy-btn";
      btn.textContent = "Copy";
      btn.onclick = () => {
        navigator.clipboard.writeText(pre.querySelector("code").innerText);
        btn.textContent = "Copied!";
        setTimeout(() => btn.textContent = "Copy", 2000);
      };
      pre.style.position = "relative";
      pre.appendChild(btn);
    });

    // Bot messages get "Save" and "Listen" actions
    if (sender === "bot") {
      const actions = document.createElement("div");
      actions.className = "bubble-actions";

      const saveBtn = document.createElement("button");
      saveBtn.className = "save-btn";
      saveBtn.textContent = "Save";
      saveBtn.addEventListener("click", () => saveMessage(text));
      actions.appendChild(saveBtn);

      const listenBtn = document.createElement("button");
      listenBtn.className = "save-btn";
      listenBtn.textContent = "🔊 Listen";
      listenBtn.addEventListener("click", () => speakText(text));
      actions.appendChild(listenBtn);

      bubble.appendChild(actions);
    }

    messageDiv.appendChild(avatar);
    messageDiv.appendChild(bubble);
    chatbox.appendChild(messageDiv);
    chatbox.scrollTop = chatbox.scrollHeight;

    if (persist) {
      addMessageToCurrentChat(sender, text);
    }
  }

  // The main function — runs when user clicks send or presses Enter.
  async function sendMessage() {
    const text = input.value.trim();
    if (!text && !pendingAttachment) return;
    hideGreetingSmoothly();
    slashMenu.classList.add("hidden");

    // Route slash commands before anything else
    const parsed = parseSlashCommand(text);

    if (parsed.type === "remind") {
      appendMessage("user", text);
      input.value = "";
      handleRemindCommand(parsed.rest);
      return;
    }

    if (parsed.type === "image") {
      input.value = "";
      await handleImageCommand(parsed.rest);
      return;
    }

    ensureCurrentChat();

    // /summarize and /translate are just rewritten into a clearer
    // instruction and sent through the normal chat pipeline.
    let outgoingText = text;
    if (parsed.type === "summarize") outgoingText = `Summarize the following:\n\n${parsed.rest}`;
    if (parsed.type === "translate") outgoingText = `Translate the following: ${parsed.rest}`;

    const attachmentToSend = pendingAttachment;
    appendMessage("user", text, true, attachmentToSend);
    updateCurrentChatTitle(text);
    input.value = "";
    clearAttachment();

    const typing = showTypingIndicator();

    if (text.toLowerCase().includes("news") && !attachmentToSend) {
      const query = text.replace(/news/gi, "").trim() || "latest";
      const news = await fetchNews(query);
      typing.remove();
      appendMessage("bot", news);
      return;
    }

    const chat = getCurrentChat();
    const history = chat ? chat.messages.slice(-6) : [];

    try {
      const body = { message: outgoingText, history };
      if (attachmentToSend) {
        body.attachment = { data: attachmentToSend.data, mime_type: attachmentToSend.mime_type };
      }

      const response = await fetch("/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = await response.json();
      typing.remove();
      appendMessage("bot", data.reply);
      applyMood(data.reply);
      if (voiceEnabled) speakText(data.reply);
      renderSuggestionChips(data.suggestions);
    } catch {
      typing.remove();
      appendMessage("bot", "⚠️ Error: Unable to connect to the server.");
    }
  }

  async function fetchNews(query) {
    try {
      const response = await fetch("/news", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query })
      });

      const data = await response.json();
      return data.news;
    } catch {
      return "⚠️ Error: Unable to connect to the server.";
    }
  }

  function hideGreetingSmoothly() {
    greeting = document.getElementById("greeting");
    if (!greeting) return;
    if (greeting.classList.contains("hide")) return;

    greeting.classList.add("hide");

    setTimeout(() => {
      const currentGreeting = document.getElementById("greeting");
      if (currentGreeting) {
        currentGreeting.remove();
      }
    }, 320);
  }

  function attachGreetingEvents() {
    document.querySelectorAll(".greeting .bubble[data-prompt]").forEach((btn) => {
      btn.onclick = () => {
        input.value = btn.getAttribute("data-prompt") || btn.textContent.trim();
        input.focus();
      };
    });
  }

  // Send message
  sendBtn.addEventListener("click", sendMessage);

  input.addEventListener("keypress", (e) => {
    if (e.key === "Enter") sendMessage();
  });

  // Voice recognition
  if ("webkitSpeechRecognition" in window) {
    const recognition = new webkitSpeechRecognition();
    recognition.lang = "en-US";
    recognition.continuous = false;

    voiceBtn.onclick = () => recognition.start();

    recognition.onresult = (event) => {
      input.value = event.results[0][0].transcript;
      sendMessage();
    };
  } else {
    voiceBtn.disabled = true;
  }

  document.addEventListener("click", (e) => {
    if (!slashMenu.contains(e.target) && e.target !== input) {
      slashMenu.classList.add("hidden");
    }
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") slashMenu.classList.add("hidden");
  });

  // Sidebar
  toggleSidebar.addEventListener("click", () => {
    sidebar.classList.toggle("collapsed");
  });

  document.addEventListener("click", () => {
    closeAllChatMenus();
  });

  // New chat button
  newChatBtn.addEventListener("click", () => {
    startNewChat();
  });

  // Saved messages button
  savedMsgBtn.addEventListener("click", () => {
    currentView = "saved";

    const savedMessages = JSON.parse(localStorage.getItem("savedMessages")) || [];

    if (savedMessages.length === 0) {
      chatbox.innerHTML = `
        <div class="bot message">
          <div class="msg-avatar aura-orb" aria-hidden="true"></div>
          <div class="bubble">
            <strong>No saved messages yet.</strong>
          </div>
        </div>
      `;
      return;
    }
    chatbox.innerHTML = `
      <div class="bot message">
        <div class="msg-avatar aura-orb" aria-hidden="true"></div>
        <div class="bubble"><strong>Saved messages</strong></div>
      </div>
    `;

    savedMessages.forEach((msg, index) => {
      const date = new Date(msg.savedAt).toLocaleString();

      const msgDiv = document.createElement("div");
      msgDiv.className = "saved-item";

      msgDiv.innerHTML = `
        <div class="bot message">
          <div class="msg-avatar aura-orb" aria-hidden="true"></div>
          <div class="bubble">
            <div class="saved-top" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; opacity:0.6; font-size:12px;">
              <small>📅 ${date}</small>
              <span class="delete-btn" data-index="${index}">Delete</span>
            </div>
            ${marked.parse(msg.text)}
          </div>
        </div>
      `;

      chatbox.appendChild(msgDiv);
    });

    document.querySelectorAll(".delete-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const index = e.target.dataset.index;
        deleteSavedMessage(index);
      });
    });
  });

  // These functions update the sidebar to reflect whether a user is logged in
  function setLoggedOutUI() {
    document.getElementById("userName").textContent = "Guest User";
    document.getElementById("userStatus").textContent = "Not connected";
    document.getElementById("userAvatar").textContent = "👤";
    accountLoginBtn?.classList.remove("hidden");
    accountLogoutBtn?.classList.add("hidden");
    accountMenu?.classList.add("hidden");
  }

  function setLoggedInUI(name = "User") {
    document.getElementById("userName").textContent = name;
    document.getElementById("userStatus").textContent = "Connected";
    document.getElementById("userAvatar").textContent = name.charAt(0).toUpperCase();
    accountLoginBtn?.classList.add("hidden");
    accountLogoutBtn?.classList.remove("hidden");
  }

  window.__setLoggedInUI = setLoggedInUI;

  // Telegram
  telegramBtn?.addEventListener("click", () => {
    window.open("https://t.me/iokachat_bot", "_blank");
  });

  userAccountBtn?.addEventListener("click", () => {
    authModal.classList.remove("hidden");
  });

  closeAuth?.addEventListener("click", () => {
    authModal.classList.add("hidden");
  });

  accountMenuBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    accountMenu?.classList.toggle("hidden");
  });

  accountLoginBtn?.addEventListener("click", () => {
    accountMenu?.classList.add("hidden");
    authModal.classList.remove("hidden");
  });

  accountSettingsBtn?.addEventListener("click", () => {
    accountMenu?.classList.add("hidden");
    alert("Settings panel will be added in the next step.");
  });

  accountLogoutBtn?.addEventListener("click", async () => {
    try {
      const res = await fetch("/logout", { method: "GET" });

      if (res.ok) {
        setLoggedOutUI();
      } else {
        appendMessage("bot", "⚠️ Logout failed.");
      }
    } catch {
      appendMessage("bot", "⚠️ Logout failed.");
    }
  });

  document.addEventListener("click", (e) => {
    const clickedInsideMenu = accountMenu?.contains(e.target);
    const clickedMenuButton = accountMenuBtn?.contains(e.target);

    if (!clickedInsideMenu && !clickedMenuButton) {
      accountMenu?.classList.add("hidden");
    }
  });

  function isUserConnected() {
    const status = document.getElementById("userStatus");
    return status && status.textContent.trim().toLowerCase() === "connected";
  }

  emailBtn?.addEventListener("click", () => {
    if (!isUserConnected()) {
      authModal.classList.remove("hidden");
      return;
    }
    window.open("https://mail.google.com/mail/u/0/#inbox", "_blank", "noopener,noreferrer");
  });

  calendarBtn?.addEventListener("click", () => {
    if (!isUserConnected()) {
      authModal.classList.remove("hidden");
      return;
    }
    window.open("https://calendar.google.com/calendar/u/0/r", "_blank", "noopener,noreferrer");
  });

  // Initial load
  if (chats.length > 0) {
    currentChatId = chats[0].id;
    renderHistory();
    openChat(currentChatId);
  } else {
    startNewChat();
  }
});

function saveMessage(text) {
  const savedMessages = JSON.parse(localStorage.getItem("savedMessages")) || [];

  const newSavedMessage = {
    text,
    savedAt: new Date().toISOString()
  };

  savedMessages.push(newSavedMessage);
  localStorage.setItem("savedMessages", JSON.stringify(savedMessages));
}

function deleteSavedMessage(index) {
  const savedMessages = JSON.parse(localStorage.getItem("savedMessages")) || [];
  savedMessages.splice(index, 1);
  localStorage.setItem("savedMessages", JSON.stringify(savedMessages));

  document.getElementById("savedMsgBtn").click();
}