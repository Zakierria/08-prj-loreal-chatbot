/* DOM elements */
const chatForm = document.getElementById("chatForm");
const userInput = document.getElementById("userInput");
const chatWindow = document.getElementById("chatWindow");
const historyWindow = document.getElementById("historyWindow");
const chatTab = document.getElementById("chatTab");
const historyTab = document.getElementById("historyTab");
const chatPanel = document.getElementById("chatPanel");
const historyPanel = document.getElementById("historyPanel");

const SYSTEM_PROMPT =
  "You are a L'Oréal beauty advisor. Answer only questions about L'Oréal products, beauty routines, and product recommendations. Keep answers concise, practical, and tailored to the user's needs. Use relevant details the user has shared earlier, such as their name, preferences, and products discussed, to make follow-up answers natural. Do not assume details the user has not shared. If a question is unrelated, politely say you can only help with those topics. Do not invent product details; say when you are unsure.";
const WORKER_URL = "https://lorealchatbot.palmorezakierria.workers.dev/";
const STORAGE_KEY = "loreal-chat-conversation";
const MAX_HISTORY_MESSAGES = 40;
let restoreFailed = false;
let storageWarningShown = false;
const conversation = loadConversation();

// Restore saved messages so context continues after a page refresh.
chatWindow.textContent = "";
if (conversation.length) {
  conversation.slice(-2).forEach(({ role, content }) => {
    appendMessage(role === "user" ? "user" : "ai", content);
  });
} else {
  chatWindow.textContent = "👋 Hello! How can I help you today?";
}
if (restoreFailed) {
  appendMessage(
    "ai",
    "I couldn't restore your previous chat, so this conversation will start fresh.",
  );
}
renderHistory();

chatTab.addEventListener("click", () => selectTab(chatTab));
historyTab.addEventListener("click", () => selectTab(historyTab));

document.querySelector('[role="tablist"]').addEventListener("keydown", (event) => {
  const tabs = [chatTab, historyTab];
  const currentIndex = tabs.indexOf(document.activeElement);
  let nextIndex;

  if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
    nextIndex = (currentIndex + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length;
  } else if (event.key === "Home") {
    nextIndex = 0;
  } else if (event.key === "End") {
    nextIndex = tabs.length - 1;
  } else {
    return;
  }

  event.preventDefault();
  tabs[nextIndex].focus();
  selectTab(tabs[nextIndex]);
});

// Send each message to the Cloudflare Worker, which forwards it to OpenAI.
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const message = userInput.value.trim();
  if (!message) return;

  chatWindow.textContent = "";
  appendMessage("user", message);
  userInput.value = "";
  const sendButton = chatForm.querySelector('button[type="submit"]');
  sendButton.disabled = true;
  userInput.disabled = true;

  const loadingMessage = appendMessage("ai", "Thinking...");

  try {
    const response = await fetch(WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...conversation,
          { role: "user", content: message },
        ],
      }),
    });

    const data = await response.json();
    if (data.error) {
      throw new Error(data.error.message || "The API returned an error.");
    }
    if (!response.ok) {
      throw new Error(data.error?.message || `Request failed (${response.status}).`);
    }

    const reply = data.choices?.[0]?.message?.content;
    if (typeof reply !== "string" || !reply.trim()) {
      throw new Error("The API returned an empty or invalid response.");
    }

    conversation.push(
      { role: "user", content: message },
      { role: "assistant", content: reply },
    );
    if (conversation.length > MAX_HISTORY_MESSAGES) {
      conversation.splice(0, conversation.length - MAX_HISTORY_MESSAGES);
    }
    renderHistory();
    saveConversation();
    loadingMessage.textContent = reply;
  } catch (error) {
    loadingMessage.textContent = `Sorry, I couldn't get a response. ${error.message}`;
  } finally {
    sendButton.disabled = false;
    userInput.disabled = false;
    userInput.focus();
    chatWindow.scrollTop = chatWindow.scrollHeight;
  }
});

function appendMessage(role, text) {
  const messageElement = document.createElement("div");
  messageElement.className = `msg ${role}`;
  messageElement.textContent = text;
  chatWindow.appendChild(messageElement);
  chatWindow.scrollTop = chatWindow.scrollHeight;
  return messageElement;
}

function selectTab(selectedTab) {
  const showChat = selectedTab === chatTab;

  chatTab.classList.toggle("active", showChat);
  chatTab.setAttribute("aria-selected", String(showChat));
  chatTab.tabIndex = showChat ? 0 : -1;
  chatPanel.hidden = !showChat;

  historyTab.classList.toggle("active", !showChat);
  historyTab.setAttribute("aria-selected", String(!showChat));
  historyTab.tabIndex = showChat ? -1 : 0;
  historyPanel.hidden = showChat;
}

function renderHistory() {
  historyWindow.textContent = "";
  if (!conversation.length) {
    historyWindow.textContent = "Your conversation history will appear here.";
    return;
  }

  conversation.forEach(({ role, content }) => {
    const entry = document.createElement("div");
    entry.className = `history-entry ${role}`;

    const label = document.createElement("span");
    label.className = "history-role";
    label.textContent = role === "user" ? "You" : "L'Oréal Advisor";

    const message = document.createElement("div");
    message.textContent = content;

    entry.append(label, message);
    historyWindow.appendChild(entry);
  });
}

function loadConversation() {
  try {
    const savedConversation = localStorage.getItem(STORAGE_KEY);
    if (!savedConversation) return [];

    const parsedConversation = JSON.parse(savedConversation);
    if (
      !Array.isArray(parsedConversation) ||
      !parsedConversation.every(
        (message) =>
          (message.role === "user" || message.role === "assistant") &&
          typeof message.content === "string",
      )
    ) {
      throw new Error("Saved conversation has an invalid format.");
    }
    return parsedConversation.slice(-MAX_HISTORY_MESSAGES);
  } catch (error) {
    console.error("Could not restore the saved conversation:", error);
    restoreFailed = true;
    return [];
  }
}

function saveConversation() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversation));
  } catch (error) {
    console.error("Could not save the conversation:", error);
    if (!storageWarningShown) {
      storageWarningShown = true;
      appendMessage(
        "ai",
        "I couldn't save this chat in your browser, so its context may not be available after you leave or refresh.",
      );
    }
  }
}
