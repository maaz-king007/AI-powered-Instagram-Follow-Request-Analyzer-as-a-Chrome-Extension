// content.js — Instagram AI Agent
// Option B: Click "🔍 Deep Analyze" per card for real profile scraping + hybrid AI

(function () {
  "use strict";

  const BACKEND_URL = "http://localhost:3000";
  let settings = null;

  init();

  async function init() {
    settings = await getSettings();
    if (!settings.enabled) return;
    console.log("[AI Agent] Initialized on Instagram");
    watchForFollowRequestsPage();
  }

  async function getSettings() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "GET_SETTINGS" }, (res) => {
        resolve(res?.settings || {
          backendUrl: BACKEND_URL,
          autoAccept: false,
          autoReject: false,
          acceptThreshold: 70,
          rejectThreshold: 40,
          enabled: true,
        });
      });
    });
  }

  function watchForFollowRequestsPage() {
    checkAndProcess();
    let lastUrl = location.href;
    new MutationObserver(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        setTimeout(checkAndProcess, 1500);
      }
    }).observe(document.body, { childList: true, subtree: true });
  }

  function checkAndProcess() {
    const url = location.href;
    const isFollowRequestsPage =
      url.includes("/accounts/activity") ||
      url.includes("followRequests") ||
      document.title.toLowerCase().includes("follow request");
    if (isFollowRequestsPage) {
      console.log("[AI Agent] Follow requests page detected");
      setTimeout(() => injectAnalyzeButtons(), 3000);
    }
  }

  // ─── Find follow request cards ────────────────────────────────────────────
  function findFollowRequestCards() {
    const allDivs = Array.from(document.querySelectorAll("div"));
    const sel = "button, [role='button']";

    const candidates = allDivs.filter((el) => {
      const btns = Array.from(el.querySelectorAll(sel));
      if (btns.length < 2 || btns.length > 12) return false;
      const hasConfirm = btns.some(b => b.textContent.trim().toLowerCase() === "confirm");
      const hasDelete = btns.some(b => b.textContent.trim().toLowerCase() === "delete");
      return hasConfirm && hasDelete && el.querySelectorAll("a[href^='/']").length > 0;
    });

    if (candidates.length > 0)
      return candidates.filter(el => !candidates.some(o => o !== el && el.contains(o)));

    const fallback = allDivs.filter((el) => {
      const btns = Array.from(el.querySelectorAll(sel));
      if (btns.length < 2 || btns.length > 12) return false;
      const hasConfirm = btns.some(b => b.textContent.trim().toLowerCase().includes("confirm"));
      const hasDelete = btns.some(b => b.textContent.trim().toLowerCase().includes("delete"));
      return hasConfirm && hasDelete && el.querySelectorAll("a[href^='/']").length > 0;
    });

    return fallback.length > 0
      ? fallback.filter(el => !fallback.some(o => o !== el && el.contains(o)))
      : [];
  }

  // ─── Extract mutual follower info directly from DOM ───────────────────────
  function extractMutualsFromCard(card) {
    // Search ALL divs inside the card for "Followed by" text
    // This is the most stable approach as per Instagram DOM structure
    const divs = card.querySelectorAll("div");

    for (const div of divs) {
      const text = div.innerText;
      if (!text || !text.includes("Followed by")) continue;
      if (text.length > 300) continue; // skip huge containers

      // Count mutuals: "Followed by alice, bob and 5 more" → 2 + 5 = 7
      const countMatch = text.match(/and (\d+) more/i);
      let mutualCount = 0;

      // Extract visible usernames: everything between "Followed by " and " and X more"
      const afterFollowedBy = text.replace(/^.*?Followed by\s+/i, "");
      const beforeAnd = afterFollowedBy.split(/\s+and\s+/)[0];
      const visibleNames = beforeAnd
        .split(",")
        .map(n => n.trim())
        .filter(n => n.length > 0 && n.length < 50);

      if (countMatch) {
        // e.g. "saaraa__1602, ishitaprajapatii and 5 more" → 2 visible + 5 = 7
        mutualCount = visibleNames.length + parseInt(countMatch[1]);
      } else {
        // No "and X more" — all names are visible
        mutualCount = visibleNames.length;
      }

      if (mutualCount > 0) {
        console.log(`[AI Agent] Mutuals found: ${mutualCount}`, visibleNames);
        return { mutualCount, mutualUsers: visibleNames };
      }
    }

    console.log("[AI Agent] No mutuals found in card");
    return { mutualCount: 0, mutualUsers: [] };
  }

  // ─── Inject analyze buttons ───────────────────────────────────────────────
  function injectAnalyzeButtons() {
    const cards = findFollowRequestCards();
    if (cards.length === 0) {
      console.log("[AI Agent] No cards found, retrying...");
      setTimeout(injectAnalyzeButtons, 3000);
      return;
    }
    console.log(`[AI Agent] Found ${cards.length} cards, injecting buttons`);

    cards.forEach((card) => {
      if (card.dataset.aiButtonInjected) return;
      card.dataset.aiButtonInjected = "true";

      const username = extractUsername(card);
      if (!username) return;

      const btn = document.createElement("button");
      btn.className = "ai-analyze-btn";
      btn.innerHTML = "🔍 Deep Analyze";
      btn.title = `Analyze @${username}'s profile with AI`;
      btn.style.cssText = `
        margin-left: 8px; padding: 6px 12px;
        background: #6366f1; color: white; border: none;
        border-radius: 8px; font-size: 12px; font-weight: 600;
        cursor: pointer; white-space: nowrap; transition: background 0.2s;
      `;
      btn.addEventListener("mouseenter", () => btn.style.background = "#4f46e5");
      btn.addEventListener("mouseleave", () => btn.style.background = "#6366f1");
      btn.addEventListener("click", async (e) => {
        e.stopPropagation(); e.preventDefault();
        await runDeepAnalysis(card, username, btn);
      });

      const container = findButtonsContainer(card);
      if (container) {
        container.style.cssText += "display:flex;align-items:center;flex-wrap:wrap;gap:6px;";
        container.appendChild(btn);
      } else {
        card.appendChild(btn);
      }
    });
  }

  function findButtonsContainer(card) {
    const allBtns = Array.from(card.querySelectorAll("button, [role='button']"));
    const confirmBtn = allBtns.find(b => b.textContent.trim().toLowerCase() === "confirm");
    return confirmBtn ? confirmBtn.parentElement : null;
  }

  function extractUsername(card) {
    const links = card.querySelectorAll("a[href^='/']");
    for (const link of links) {
      const href = link.getAttribute("href");
      const match = href?.match(/^\/([^/?#]+)\/?$/);
      if (match?.[1] && !["explore","accounts","direct","notifications"].includes(match[1]))
        return match[1];
    }
    return null;
  }

  // ─── Deep Analysis flow ───────────────────────────────────────────────────
  async function runDeepAnalysis(card, username, btn) {
    btn.innerHTML = "⏳ Fetching profile...";
    btn.disabled = true;
    btn.style.background = "#94a3b8";

    try {
      // Step 1: Fetch real profile via API (includes bio, stats, mutuals)
      const profileData = await fetchProfileData(username);

      // Step 2: If API didn't get mutuals, try DOM extraction as fallback
      if (!profileData.mutuals || profileData.mutuals === 0) {
        const { mutualCount, mutualUsers } = extractMutualsFromCard(card);
        if (mutualCount > 0) {
          profileData.mutuals = mutualCount;
          profileData.mutualUsers = mutualUsers;
          console.log(`[AI Agent] @${username} mutuals from DOM fallback:`, mutualCount, mutualUsers);
        }
      }

      btn.innerHTML = "🤖 Analyzing...";

      // Step 3: Send to hybrid AI backend
      const result = await analyzeProfile(profileData);

      btn.remove();
      injectResultBadge(card, result, username);

    } catch (err) {
      console.error("[AI Agent] Deep analysis error:", err);
      btn.innerHTML = "❌ Error — Retry";
      btn.disabled = false;
      btn.style.background = "#ef4444";
      btn.addEventListener("click", async () => await runDeepAnalysis(card, username, btn), { once: true });
    }
  }

  // ─── Fetch real profile page ──────────────────────────────────────────────
  async function fetchProfileData(username) {
    const profile = {
      username, fullName: "", bio: "",
      followers: null, following: null, posts: null,
      isVerified: false, isPrivate: false,
      hasProfilePic: true, externalUrl: "",
    };

    // Strategy 1: Use Instagram's internal API (returns real JSON data)
    try {
      const apiUrl = `https://www.instagram.com/api/v1/users/web_profile_info/?username=${username}`;
      const apiResp = await fetch(apiUrl, {
        headers: {
          "Accept": "application/json",
          "X-IG-App-ID": "936619743392459",
          "X-Requested-With": "XMLHttpRequest",
        },
        credentials: "include",
      });

      if (apiResp.ok) {
        const data = await apiResp.json();
        const user = data?.data?.user;
        if (user) {
          profile.bio = user.biography || "";
          profile.fullName = user.full_name || "";
          profile.followers = String(user.edge_followed_by?.count ?? user.follower_count ?? "");
          profile.following = String(user.edge_follow?.count ?? user.following_count ?? "");
          profile.posts = String(user.edge_owner_to_timeline_media?.count ?? user.media_count ?? "");
          profile.isVerified = user.is_verified || false;
          profile.isPrivate = user.is_private || false;
          profile.externalUrl = user.external_url || "";
          const picUrl = user.profile_pic_url || "";
          profile.hasProfilePic = picUrl.length > 0 && !picUrl.includes("static/images/anonymousUser");

          // Extract mutual followers from the user object
          // Instagram API returns edge_mutual_followed_by for mutual followers
          const mutualEdge = user.edge_mutual_followed_by;
          if (mutualEdge) {
            profile.mutuals = mutualEdge.count || 0;
            profile.mutualUsers = (mutualEdge.edges || []).map(e => e.node?.username).filter(Boolean);
          }

          console.log(`[AI Agent] API scraped @${username}:`, {
            bio: profile.bio, followers: profile.followers,
            posts: profile.posts, mutuals: profile.mutuals,
            mutualUsers: profile.mutualUsers
          });
          return profile;
        }
      }
    } catch (e) {
      console.warn("[AI Agent] API fetch failed, trying HTML fallback:", e.message);
    }

    // Strategy 2: Fallback — fetch profile HTML page
    try {
      const response = await fetch(`https://www.instagram.com/${username}/`, {
        headers: { "Accept": "text/html", "Accept-Language": "en-US,en;q=0.9" },
        credentials: "include",
      });
      if (!response.ok) throw new Error(`Profile fetch failed: ${response.status}`);
      const html = await response.text();

      // Meta description: "X Followers, Y Following, Z Posts"
      const descMatch = html.match(/<meta[^>]+name="description"[^>]+content="([^"]+)"/i)
        || html.match(/<meta[^>]+content="([^"]+)"[^>]+name="description"/i);
      if (descMatch) {
        const d = descMatch[1];
        const fm = d.match(/([\d,]+)\s+Followers/i);
        const fom = d.match(/([\d,]+)\s+Following/i);
        const pm = d.match(/([\d,]+)\s+Posts/i);
        if (fm) profile.followers = fm[1].replace(/,/g, "");
        if (fom) profile.following = fom[1].replace(/,/g, "");
        if (pm) profile.posts = pm[1].replace(/,/g, "");
      }

      // Title for full name
      const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
      if (titleMatch) {
        const nm = titleMatch[1].match(/^(.+?)\s*\(/);
        if (nm) profile.fullName = nm[1].trim();
      }

      // Bio from embedded JSON - try multiple patterns
      const bioPatterns = [
        /"biography":"((?:[^"\\]|\\.)*)"/,
        /"biography" : "((?:[^"\\]|\\.)*)"/,
        /,"bio":"((?:[^"\\]|\\.)*)"/,
      ];
      for (const pat of bioPatterns) {
        const m = html.match(pat);
        if (m?.[1]) { profile.bio = m[1].replace(/\n/g, " ").trim(); break; }
      }

      // Follower counts
      const efb = html.match(/"edge_followed_by":{"count":(\d+)/);
      if (efb && !profile.followers) profile.followers = efb[1];
      const ef = html.match(/"edge_follow":{"count":(\d+)/);
      if (ef && !profile.following) profile.following = ef[1];
      const ep = html.match(/"edge_owner_to_timeline_media":{"count":(\d+)/);
      if (ep && !profile.posts) profile.posts = ep[1];

      // Newer format
      if (!profile.followers) { const m = html.match(/"follower_count":(\d+)/); if (m) profile.followers = m[1]; }
      if (!profile.following) { const m = html.match(/"following_count":(\d+)/); if (m) profile.following = m[1]; }
      if (!profile.posts) { const m = html.match(/"media_count":(\d+)/); if (m) profile.posts = m[1]; }

      if (html.includes('"is_verified":true')) profile.isVerified = true;
      if (html.includes('"is_private":true')) profile.isPrivate = true;
      if (html.includes('static/images/anonymousUser')) profile.hasProfilePic = false;

      const extMatch = html.match(/"external_url":"([^"]+)"/);
      if (extMatch?.[1] && extMatch[1] !== "null") profile.externalUrl = extMatch[1];

    } catch (e) {
      console.warn("[AI Agent] HTML fallback also failed:", e.message);
    }

    console.log(`[AI Agent] Scraped @${username}:`, profile);
    return profile;
  }

  async function analyzeProfile(profile) {
    const backendUrl = settings?.backendUrl || BACKEND_URL;
    const response = await fetch(`${backendUrl}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profile),
    });
    if (!response.ok) throw new Error(`Backend error: ${response.status}`);
    return await response.json();
  }

  // ─── Result badge UI ──────────────────────────────────────────────────────
  function injectResultBadge(card, result, username) {
    const existing = card.querySelector(".ai-agent-badge");
    if (existing) existing.remove();

    const colorMap = {
      ACCEPT: { bg: "#d4f7e7", border: "#22c55e", text: "#15803d", emoji: "✅" },
      REJECT: { bg: "#fee2e2", border: "#ef4444", text: "#b91c1c", emoji: "🚫" },
      REVIEW: { bg: "#fef9c3", border: "#eab308", text: "#854d0e", emoji: "⚠️" },
    };
    const colors = colorMap[result.decision] || colorMap.REVIEW;

    // Confidence bar color
    const conf = result.confidence || 0;
    const confColor = conf >= 80 ? "#22c55e" : conf >= 40 ? "#eab308" : "#ef4444";

    const reasonsHtml = (result.reasons || []).slice(0, 3)
      .map(r => `<li style="margin:3px 0;color:#444">${r}</li>`).join("");

    const f = result.features || {};

    const statsHtml = `
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:8px;font-size:11px;color:#555;border-top:1px solid ${colors.border};padding-top:7px">
        <span>📝 ${f.posts ?? "?"} posts</span>
        <span>👥 ${f.followers ?? "?"} followers</span>
        <span>➡️ ${f.following ?? "?"} following</span>
        <span>🤝 ${f.mutuals ?? 0} mutuals</span>
        ${f.is_verified ? "<span>✔️ Verified</span>" : ""}
        ${!f.has_dp ? "<span>🚫 No DP</span>" : ""}
      </div>
      ${f.bio ? `<div style="margin-top:5px;font-size:11px;color:#666;font-style:italic">"${f.bio.slice(0,80)}${f.bio.length > 80 ? "..." : ""}"</div>` : ""}
    `;

    const overrideHtml = result.override
      ? `<div style="margin-top:5px;font-size:11px;font-weight:600;color:${colors.text}">⚡ ${result.override}</div>`
      : "";

    const badge = document.createElement("div");
    badge.className = "ai-agent-badge";
    badge.style.cssText = `
      margin-top: 10px; border-radius: 12px;
      border: 1.5px solid ${colors.border}; background: ${colors.bg};
      padding: 12px 14px; font-size: 13px; font-family: sans-serif;
      color: #111; max-width: 360px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    `;
    badge.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
        <span style="font-size:18px">${colors.emoji}</span>
        <strong style="color:${colors.text};font-size:15px">${result.decision}</strong>
        <span style="margin-left:auto;background:${colors.border};color:white;padding:2px 10px;border-radius:20px;font-size:12px;font-weight:700">
          ${result.score}/100
        </span>
      </div>
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">
        <span style="font-size:11px;color:#666">Confidence:</span>
        <div style="flex:1;height:6px;background:#e5e7eb;border-radius:3px;overflow:hidden">
          <div style="width:${conf}%;height:100%;background:${confColor};transition:width 0.5s"></div>
        </div>
        <span style="font-size:11px;font-weight:600;color:${confColor}">${conf}%</span>
      </div>
      ${result.summary ? `<p style="margin:0 0 7px;font-size:12px;color:#333;line-height:1.4">${result.summary}</p>` : ""}
      ${reasonsHtml ? `<ul style="margin:0 0 4px;padding-left:16px;font-size:12px">${reasonsHtml}</ul>` : ""}
      ${overrideHtml}
      ${statsHtml}
      <div style="display:flex;gap:6px;margin-top:8px;font-size:11px;color:#888">
        <span>Rule: ${result.rule_score ?? "?"}</span>
        <span>·</span>
        <span>LLM: ${result.llm_score ?? "?"}</span>
        <span>·</span>
        <span>Fused: ${result.score}</span>
      </div>
    `;

    card.style.position = "relative";
    card.appendChild(badge);
  }

  window.__aiAgentScan = injectAnalyzeButtons;
  console.log("[AI Agent] Content script loaded. Run window.__aiAgentScan() to manually trigger.");
})();
