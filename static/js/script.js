document.addEventListener("DOMContentLoaded", () => {
  // GET REFERENCES TO HTML ELEMENTS
  // document.getElementById() finds an element by its id=""
  // attribute in index.html. We store them in variables so
  // we don't have to search the DOM every time we use them.
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
  // We store all chats in the browser's localStorage so they
  // survive page refreshes. localStorage only holds strings,
  // so we JSON.stringify() to save and JSON.parse() to load.
  // chats = array of chat objects (each has id, title, messages[])
  // currentChatId = which chat is open right now
  // currentView = "chat" or "saved" — controls what's shown
  let chats = JSON.parse(localStorage.getItem("auraChats")) || [];
  let currentChatId = null;
  let currentView = "chat";

  // Generates a unique ID for each chat session.
  // Uses current timestamp + a random number to avoid collisions
  // even if two chats are created in the same millisecond.
  function generateChatId() {
    return "chat_" + Date.now() + "_" + Math.floor(Math.random() * 10000);
  }

  // Returns a blank chat object with an auto-generated ID.
  // This is the structure every chat follows throughout the app.
  function getEmptyChat() {
    return {
      id: generateChatId(),
      title: "New Chat",
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  // Saves the entire chats array to localStorage.
  // Called after every change so data is never lost on refresh.
  function saveChatsToStorage() {
    localStorage.setItem("auraChats", JSON.stringify(chats));
  }

  // Finds and returns the currently open chat object.
  // Array.find() searches the chats array and returns the first match,
  // or null if no chat matches the currentChatId.
  function getCurrentChat() {
    return chats.find(chat => chat.id === currentChatId) || null;
  }

  // Guarantees there is always an active chat to write to.
  // If no chat is selected (e.g. on first ever load), it creates one.
  // unshift() adds it to the FRONT of the array so it appears at the top of the sidebar.
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
  // Trims the chat title to 30 characters for display in the sidebar.
  // Adds "..." if the message was longer than 30 characters.
  function makeChatTitle(text) {
    if (!text) return "New Chat";
    return text.length > 30 ? text.slice(0, 30) + "..." : text;
  }

  // Sets the sidebar title of the current chat to the user's first message.
  // Only runs if the title is still "New Chat" or messages are few,
  // so it doesn't overwrite a title that was already set.
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
  // Loads a specific chat by ID into the chatbox.
  // Clears the current chatbox, then replays all messages
  // by calling appendMessage() for each one.
  // persist=false means don't re-save them
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

  // Rebuilds the entire sidebar chat list from scratch each time.
  // Sorted by most recently updated so newest chats appear first.
  function renderHistory() {
    chatHistoryList.innerHTML = "";

    if (!chats.length) {
      // Show placeholder text if there are no chats yet
      const li = document.createElement("li");
      li.textContent = "No chats yet";
      li.style.opacity = "0.7";
      chatHistoryList.appendChild(li);
      return;
    }
    // Sort chats: most recently updated appears first in sidebar
    chats
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
      .forEach((chat) => {
        const li = document.createElement("li");
        li.className = "chat-history-item";
        // Highlight the currently open chat in the sidebar
        if (chat.id === currentChatId) {
          li.classList.add("active-chat");
        }
        // The clickable chat title text
        const title = document.createElement("span");
        title.className = "chat-history-title";
        title.textContent = chat.title || "Untitled Chat";

        title.addEventListener("click", () => {
          openChat(chat.id);
          renderHistory();
        });
        // Container for the ⋮ options button and its dropdown
        const actions = document.createElement("div");
        actions.className = "chat-history-actions";
        // ⋮ three-dot button that opens the per-chat dropdown menu
        const menuBtn = document.createElement("button");
        menuBtn.className = "chat-options-btn";
        menuBtn.type = "button";
        menuBtn.textContent = "⋮";
        // The dropdown menu that appears when ⋮ is clicked
        const menu = document.createElement("div");
        menu.className = "chat-options-menu hidden";
        // "Delete chat" button inside the dropdown
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
        // Delete this chat when the delete button is clicked
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
  }

  // Removes a chat from the chats array and updates localStorage.
  // If the deleted chat was the currently open one, either switches
  // to the next available chat or starts a fresh new one.
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
  // Closes all per-chat dropdown menus by adding the "hidden" class.
  // Called whenever the user clicks anywhere outside a menu.
  function closeAllChatMenus() {
    document.querySelectorAll(".chat-options-menu").forEach(menu => {
      menu.classList.add("hidden");
    });
  }
  // The welcome screen shown when a chat has no messages yet.
  // It's injected as HTML so it reappears after "New Chat" is clicked.
  function showEmptyChatScreen() {
    chatbox.innerHTML = `
      <div class="bot message">
        <div id="greeting" class="greeting">
          <div class="greeting-logo">✦</div>

          <h2 class="greeting-title">How can I help you?</h2>
          <p class="greeting-subtitle">Ask me anything — I’m here to assist.</p>

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
  // Creates a new empty chat, adds it to the front of the list
  // saves it, re-renders the sidebar, and shows the greeting screen.
  function startNewChat() {
    const newChat = getEmptyChat();
    chats.unshift(newChat);
    currentChatId = newChat.id;
    currentView = "chat";

    saveChatsToStorage();
    renderHistory();
    showEmptyChatScreen();
  }
  // appendMessage() is the core function for showing any message
  // in the chatbox — used for both user and bot messages.
  function appendMessage(sender, text, persist = true) {
    const messageDiv = document.createElement("div");
    messageDiv.className = `${sender} message`;

    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.innerHTML = marked.parse(text);

    bubble.querySelectorAll("pre code").forEach(el => hljs.highlightElement(el));

    bubble.querySelectorAll("pre").forEach(pre => {
      const btn = document.createElement("button");
      btn.textContent = "Copy";
      btn.style.cssText = `
        position: absolute; top: 8px; right: 8px;
        font-size: 11px; padding: 3px 10px;
        background: rgba(255,255,255,0.1);
        border: 1px solid rgba(255,255,255,0.2);
        border-radius: 5px; color: #fff;
        cursor: pointer;
      `;
      btn.onclick = () => {
        navigator.clipboard.writeText(pre.querySelector("code").innerText);
        btn.textContent = "Copied!";
        setTimeout(() => btn.textContent = "Copy", 2000);
      };
      pre.style.position = "relative";
      pre.appendChild(btn);
    });
    // Only bot messages get a "save" button users don't need to save their own messages
    if (sender === "bot") {
      const saveBtn = document.createElement("button");
      saveBtn.className = "save-btn";
      saveBtn.textContent = "save";

      saveBtn.addEventListener("click", () => {
        saveMessage(text);
      });

      bubble.appendChild(saveBtn);
    }

    messageDiv.appendChild(bubble);
    chatbox.appendChild(messageDiv);
    chatbox.scrollTop = chatbox.scrollHeight;

    if (persist) {
      addMessageToCurrentChat(sender, text);
    }
  }
  // The main function — runs when user clicks send or presses Enter.
  // It handles news requests separately from general AI chat.
  async function sendMessage() {
    const text = input.value.trim();
    if (!text) return;
    hideGreetingSmoothly();
    ensureCurrentChat();

    appendMessage("user", text);
    updateCurrentChatTitle(text);
    input.value = "";

    // Show typing indicator
    const typing = document.createElement("div");
    typing.className = "bot message";
    typing.id = "typing-indicator";
    typing.innerHTML = `<div class="bubble" style="opacity:0.5; font-style:italic;">AURA is thinking...</div>`;
    chatbox.appendChild(typing);
    chatbox.scrollTop = chatbox.scrollHeight;
    
    // If user asks for news, check if the message contains the word "news"
    if (text.toLowerCase().includes("news")) {
      const query = text.replace(/news/gi, "").trim() || "latest";
      const news = await fetchNews(query);
      document.getElementById("typing-indicator")?.remove();
      appendMessage("bot", news);
      return;
    }

    // Get conversation history for memory
    const chat = getCurrentChat();
    const history = chat ? chat.messages.slice(-6) : [];

    try {
      // fetch() sends an HTTP request — await pauses until the response arrives
      const response = await fetch("/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history })
      });
      const data = await response.json();
      document.getElementById("typing-indicator")?.remove();
      appendMessage("bot", data.reply);
    } catch {
      document.getElementById("typing-indicator")?.remove();
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

  // Hide greeting smoothly
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
  // Two ways to send a message: clicking the button or pressing Enter
  sendBtn.addEventListener("click", sendMessage);

  input.addEventListener("keypress", (e) => {
    if (e.key === "Enter") sendMessage();
  });

  // Voice recognition
  if ("webkitSpeechRecognition" in window) {
    const recognition = new webkitSpeechRecognition();
    recognition.lang = "en-US";
    recognition.continuous = false; // stop after first pause

    voiceBtn.onclick = () => recognition.start();

    recognition.onresult = (event) => {
      input.value = event.results[0][0].transcript;
      sendMessage();
    };
  } else {
    voiceBtn.disabled = true;
  }
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
// Saved messages are stored separately in localStorage under
  savedMsgBtn.addEventListener("click", () => {
    currentView = "saved";

  const savedMessages = JSON.parse(localStorage.getItem("savedMessages")) || [];

  if (savedMessages.length === 0) {
    chatbox.innerHTML = `
      <div class="bot message">
        <div class="bubble">
          <strong>No saved messages yet.</strong>
        </div>
      </div>
    `;
    return;
  }
  chatbox.innerHTML = `<div class="bot message"><div class="bubble"><strong>Saved messages</strong></div></div>`;

  savedMessages.forEach((msg, index) => {
    const date = new Date(msg.savedAt).toLocaleString();

    const msgDiv = document.createElement("div");
    msgDiv.className = "saved-item";

    msgDiv.innerHTML = `
      <div class="bot message">
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
  // delete functionality
  document.querySelectorAll(".delete-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const index = e.target.dataset.index;
      deleteSavedMessage(index);
    });
  });
});

function saveMessage(text) {
  const savedMessages = JSON.parse(localStorage.getItem("savedMessages")) || [];

  const newSavedMessage = {
    text,
    savedAt: new Date().toISOString()
  };

  savedMessages.push(newSavedMessage);
  localStorage.setItem("savedMessages", JSON.stringify(savedMessages));

  alert("Message saved");
}

function deleteSavedMessage(index) {
  const savedMessages = JSON.parse(localStorage.getItem("savedMessages")) || [];
  savedMessages.splice(index, 1);
  localStorage.setItem("savedMessages", JSON.stringify(savedMessages));

  // refresh view
  savedMsgBtn.click();
}

  // These functions update the sidebar to reflect whether a user
  // is logged in or not. They don't handle authentication —
  // that's done by the Google OAuth flow in index.html.
  function setLoggedOutUI() {
    document.getElementById("userName").textContent = "Guest User";
    document.getElementById("userStatus").textContent = "Not connected";
    accountLoginBtn?.classList.remove("hidden");
    accountLogoutBtn?.classList.add("hidden");
    accountMenu?.classList.add("hidden");
  }

  function setLoggedInUI(name = "User") {
    document.getElementById("userName").textContent = name;
    document.getElementById("userStatus").textContent = "Connected";
    accountLoginBtn?.classList.add("hidden");
    accountLogoutBtn?.classList.remove("hidden");
  }

  // expose for index.html login callback
  window.__setLoggedInUI = setLoggedInUI;

  // Telegram
  telegramBtn?.addEventListener("click", () => {
    window.open("https://t.me/iokachat_bot", "_blank");
  });

  // Open auth modal by clicking profile card
  userAccountBtn?.addEventListener("click", () => {
    authModal.classList.remove("hidden");
  });

  closeAuth?.addEventListener("click", () => {
    authModal.classList.add("hidden");
  });

  // Toggle bottom dropdown
  accountMenuBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    accountMenu?.classList.toggle("hidden");
  });

  // Login button inside dropdown
  accountLoginBtn?.addEventListener("click", () => {
    accountMenu?.classList.add("hidden");
    authModal.classList.remove("hidden");
  });

  // Settings button placeholder
  accountSettingsBtn?.addEventListener("click", () => {
    accountMenu?.classList.add("hidden");
    alert("Settings panel will be added in the next step.");
  });

  // Logout button inside dropdown
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

  // Close dropdown when clicking outside
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

  // OPEN GMAIL
  emailBtn?.addEventListener("click", () => {
    if (!isUserConnected()) {
      authModal.classList.remove("hidden");
      return;
    }

    window.open("https://mail.google.com/mail/u/0/#inbox", "_blank", "noopener,noreferrer");
  });

  // OPEN GOOGLE CALENDAR
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
