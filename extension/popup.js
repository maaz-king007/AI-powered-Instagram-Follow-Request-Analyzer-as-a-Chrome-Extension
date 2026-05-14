// popup.js

const $ = (id) => document.getElementById(id);

// ─── DOM references ───────────────────────────────────────────────────────────
const statusDot     = $("statusDot");
const backendUrl    = $("backendUrl");
const enabledToggle = $("enabledToggle");
const autoAccept    = $("autoAccept");
const autoReject    = $("autoReject");
const acceptSlider  = $("acceptThreshold");
const rejectSlider  = $("rejectThreshold");
const acceptVal     = $("acceptVal");
const rejectVal     = $("rejectVal");
const saveBtn       = $("saveBtn");
const saveMsg       = $("saveMsg");
const testBtn       = $("testBtn");
const testResult    = $("testResult");
const historyList   = $("historyList");
const historyCount  = $("historyCount");
const clearHistory  = $("clearHistory");

// ─── Load settings on open ────────────────────────────────────────────────────
chrome.runtime.sendMessage({ type: "GET_SETTINGS" }, ({ settings }) => {
  backendUrl.value        = settings.backendUrl || "http://localhost:3000";
  enabledToggle.checked   = settings.enabled !== false;
  autoAccept.checked      = !!settings.autoAccept;
  autoReject.checked      = !!settings.autoReject;
  acceptSlider.value      = settings.acceptThreshold ?? 70;
  rejectSlider.value      = settings.rejectThreshold ?? 40;
  acceptVal.textContent   = acceptSlider.value;
  rejectVal.textContent   = rejectSlider.value;
  checkBackendStatus(settings.backendUrl);
});

// ─── Load history ─────────────────────────────────────────────────────────────
chrome.runtime.sendMessage({ type: "GET_HISTORY" }, ({ history }) => {
  renderHistory(history || []);
});

// ─── Slider live update ───────────────────────────────────────────────────────
acceptSlider.addEventListener("input", () => { acceptVal.textContent = acceptSlider.value; });
rejectSlider.addEventListener("input", () => { rejectVal.textContent = rejectSlider.value; });

// ─── Save settings ─────────────────────────────────────────────────────────────
saveBtn.addEventListener("click", () => {
  const newSettings = {
    backendUrl: backendUrl.value.trim().replace(/\/$/, ""),
    enabled: enabledToggle.checked,
    autoAccept: autoAccept.checked,
    autoReject: autoReject.checked,
    acceptThreshold: parseInt(acceptSlider.value),
    rejectThreshold: parseInt(rejectSlider.value),
  };

  chrome.runtime.sendMessage({ type: "SAVE_SETTINGS", settings: newSettings }, () => {
    saveMsg.textContent = "✅ Saved!";
    setTimeout(() => { saveMsg.textContent = ""; }, 2000);
    checkBackendStatus(newSettings.backendUrl);
  });
});

// ─── Test backend connection ──────────────────────────────────────────────────
testBtn.addEventListener("click", () => {
  checkBackendStatus(backendUrl.value.trim().replace(/\/$/, ""), true);
});

async function checkBackendStatus(url, showFeedback = false) {
  try {
    const res = await fetch(`${url}/`, { method: "GET", signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      statusDot.className = "status-dot online";
      if (showFeedback) {
        testResult.textContent = "✅ Connected";
        testResult.style.color = "#22c55e";
      }
    } else {
      throw new Error("Non-200");
    }
  } catch {
    statusDot.className = "status-dot offline";
    if (showFeedback) {
      testResult.textContent = "❌ Failed";
      testResult.style.color = "#ef4444";
    }
  }
  if (showFeedback) {
    setTimeout(() => { testResult.textContent = ""; }, 3000);
  }
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));
    tab.classList.add("active");
    $(`tab-${tab.dataset.tab}`).classList.add("active");

    if (tab.dataset.tab === "history") {
      chrome.runtime.sendMessage({ type: "GET_HISTORY" }, ({ history }) => {
        renderHistory(history || []);
      });
    }
  });
});

// ─── History rendering ────────────────────────────────────────────────────────
function renderHistory(history) {
  historyCount.textContent = `${history.length} analys${history.length === 1 ? "is" : "es"}`;

  if (history.length === 0) {
    historyList.innerHTML = `<div class="empty-state">No analyses yet.<br/>Visit your Instagram follow requests page.</div>`;
    return;
  }

  historyList.innerHTML = history.slice(0, 30).map((item) => {
    const ago = timeAgo(item.timestamp);
    const scoreColor = item.score >= 70 ? "#15803d" : item.score >= 40 ? "#854d0e" : "#b91c1c";
    return `
      <div class="history-item">
        <div class="history-item-header">
          <span class="h-username">@${item.username}</span>
          <span class="h-score h-decision-${item.decision}" style="color:${scoreColor}">
            ${item.decision} (${item.score})
          </span>
        </div>
        ${item.summary ? `<div class="h-summary">${item.summary}</div>` : ""}
        <div class="h-time">${ago}</div>
      </div>
    `;
  }).join("");
}

clearHistory.addEventListener("click", () => {
  chrome.storage.local.set({ analysisHistory: [] }, () => {
    renderHistory([]);
  });
});

function timeAgo(ts) {
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
