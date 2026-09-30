/**
 * STRATA AI Chat Controller
 * Manages floating chat drawer, chip suggestions, and real-time SSE token streaming
 */

import { streamChat } from './api.js';
import { getCurrentForgeContext } from './forge.js';

let chatOpen = false;
let chatHistory = [];
const MAX_MSG_LEN = 2000;
const MAX_HISTORY = 30;

export function initChat() {
  const btn = document.getElementById('ai-chat-btn');
  const closeBtn = document.getElementById('ai-close');
  const sendBtn = document.getElementById('ai-send');
  const input = document.getElementById('ai-input');
  if (!btn) return;

  btn.addEventListener('click', toggleChat);
  if (closeBtn) closeBtn.addEventListener('click', toggleChat);

  if (sendBtn && input) {
    sendBtn.addEventListener('click', () => sendChat(input.value));
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendChat(input.value);
      }
    });
  }

  document.querySelectorAll('.ai-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      sendChat(chip.dataset.q);
    });
  });
}

export function toggleChat() {
  chatOpen = !chatOpen;
  const panel = document.getElementById('ai-chat-panel');
  const btn = document.getElementById('ai-chat-btn');
  if (panel) panel.classList.toggle('show', chatOpen);
  if (btn) btn.classList.toggle('open', chatOpen);

  if (chatOpen) {
    updateAiCtxLabel();
    const input = document.getElementById('ai-input');
    if (input) input.focus();
  }
}

function updateAiCtxLabel() {
  const ctxLabel = document.getElementById('ai-ctx-label');
  if (!ctxLabel) return;
  const ctx = getCurrentForgeContext();
  if (ctx) {
    const firstLine = ctx.split('\n')[0] || '';
    ctxLabel.textContent = `Active Forge: ${firstLine}`;
  } else {
    ctxLabel.textContent = 'Reads your current Forge state';
  }
}

function escHtml(s) {
  return s.replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;');
}

function appendMsg(role, text) {
  const container = document.getElementById('ai-messages');
  if (!container) return null;

  const div = document.createElement('div');
  div.className = `ai-msg ${role}`;
  div.innerHTML = escHtml(text)
    .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
    .replace(/\n/g, '<br>');

  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  return div;
}

export async function sendChat(userText) {
  if (!userText || !userText.trim()) return;
  userText = userText.trim().slice(0, MAX_MSG_LEN);

  const input = document.getElementById('ai-input');
  const sendBtn = document.getElementById('ai-send');
  const chips = document.getElementById('ai-chips');
  const messagesContainer = document.getElementById('ai-messages');

  if (input) input.value = '';
  if (sendBtn) sendBtn.disabled = true;
  if (chips) chips.style.display = 'none';

  appendMsg('user', userText);

  // Streaming response bubble
  const modelBubble = document.createElement('div');
  modelBubble.className = 'ai-msg model';
  modelBubble.textContent = '...';
  messagesContainer.appendChild(modelBubble);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;

  chatHistory.push({ role: 'user', content: userText });
  if (chatHistory.length > MAX_HISTORY) chatHistory.splice(0, 2);

  let accumulatedText = '';
  const forgeCtx = getCurrentForgeContext();

  await streamChat(
    chatHistory,
    forgeCtx,
    (token) => {
      accumulatedText += token;
      modelBubble.innerHTML = escHtml(accumulatedText)
        .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
        .replace(/\n/g, '<br>');
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    },
    () => {
      // Completed
      if (sendBtn) sendBtn.disabled = false;
      if (accumulatedText) {
        chatHistory.push({ role: 'model', content: accumulatedText });
      }
    },
    (err) => {
      // Error
      if (sendBtn) sendBtn.disabled = false;
      modelBubble.className = 'ai-msg error';
      modelBubble.textContent = `Error: ${err}`;
      chatHistory.pop();
    }
  );
}

