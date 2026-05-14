// background.js — Service Worker for Instagram AI Agent

const DEFAULT_SETTINGS = {
  backendUrl: "http://localhost:3000",
  autoAccept: false,
  autoReject: false,
  acceptThreshold: 70,
  rejectThreshold: 40,
  enabled: true,
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get("settings", (result) => {
    if (!result.settings) {
      chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
      console.log("[BG] Default settings initialized");
    }
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "ANALYZE_PROFILE") {
    handleAnalyze(message.profile)
      .then((result) => sendResponse({ success: true, data: result }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === "FETCH_PROFILE") {
    handleFetchProfile(message.username)
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === "GET_SETTINGS") {
    chrome.storage.local.get("settings", (result) => {
      sendResponse({ settings: result.settings || DEFAULT_SETTINGS });
    });
    return true;
  }

  if (message.type === "SAVE_SETTINGS") {
    chrome.storage.local.set({ settings: message.settings }, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.type === "GET_HISTORY") {
    chrome.storage.local.get("analysisHistory", (result) => {
      sendResponse({ history: result.analysisHistory || [] });
    });
    return true;
  }
});

// ─── Fetch & scrape a real Instagram profile page ─────────────────────────
async function handleFetchProfile(username) {
  const profileUrl = `https://www.instagram.com/${username}/`;

  const response = await fetch(profileUrl, {
    headers: {
      "Accept": "text/html",
      "Accept-Language": "en-US,en;q=0.9",
    },
    credentials: "include", // Send Instagram cookies so we see real data
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch profile: ${response.status}`);
  }

  const html = await response.text();

  // Scrape data from the HTML
  const profile = {
    username,
    fullName: "",
    bio: "",
    followers: null,
    following: null,
    posts: null,
    isVerified: false,
    isPrivate: false,
    hasProfilePic: false,
    externalUrl: "",
  };

  // Extract from meta tags (most reliable)
  const descMatch = html.match(/<meta[^>]+name="description"[^>]+content="([^"]+)"/i)
    || html.match(/<meta[^>]+content="([^"]+)"[^>]+name="description"/i);
  if (descMatch) {
    const desc = descMatch[1];
    // Format: "X Followers, Y Following, Z Posts - See Instagram photos..."
    const followersMatch = desc.match(/([\d,]+)\s+Followers/i);
    const followingMatch = desc.match(/([\d,]+)\s+Following/i);
    const postsMatch = desc.match(/([\d,]+)\s+Posts/i);
    if (followersMatch) profile.followers = followersMatch[1].replace(/,/g, "");
    if (followingMatch) profile.following = followingMatch[1].replace(/,/g, "");
    if (postsMatch) profile.posts = postsMatch[1].replace(/,/g, "");
  }

  // Extract full name from title tag: "Username (@handle) • Instagram"
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  if (titleMatch) {
    const titleText = titleMatch[1];
    const nameMatch = titleText.match(/^(.+?)\s*\(/);
    if (nameMatch) profile.fullName = nameMatch[1].trim();
  }

  // Extract bio from shared_data JSON embedded in page
  const sharedDataMatch = html.match(/window\._sharedData\s*=\s*({.+?});<\/script>/s);
  if (sharedDataMatch) {
    try {
      const data = JSON.parse(sharedDataMatch[1]);
      const user = data?.entry_data?.ProfilePage?.[0]?.graphql?.user;
      if (user) {
        profile.bio = user.biography || "";
        profile.isVerified = user.is_verified || false;
        profile.isPrivate = user.is_private || false;
        profile.hasProfilePic = !user.profile_pic_url?.includes("default");
        profile.externalUrl = user.external_url || "";
        if (!profile.followers) profile.followers = user.edge_followed_by?.count?.toString();
        if (!profile.following) profile.following = user.edge_follow?.count?.toString();
        if (!profile.posts) profile.posts = user.edge_owner_to_timeline_media?.count?.toString();
      }
    } catch (e) {
      console.log("[BG] Could not parse _sharedData, trying other methods");
    }
  }

  // Try newer Instagram data format
  if (!profile.bio) {
    const bioMatch = html.match(/"biography"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (bioMatch) profile.bio = bioMatch[1].replace(/\\n/g, " ").replace(/\\u[\dA-F]{4}/gi, "");
  }

  if (!profile.followers) {
    const edgeFollowedBy = html.match(/"edge_followed_by"\s*:\s*\{"count"\s*:\s*(\d+)/);
    if (edgeFollowedBy) profile.followers = edgeFollowedBy[1];
  }

  if (!profile.posts) {
    const edgePosts = html.match(/"edge_owner_to_timeline_media"\s*:\s*\{"count"\s*:\s*(\d+)/);
    if (edgePosts) profile.posts = edgePosts[1];
  }

  if (html.includes('"is_verified":true')) profile.isVerified = true;
  if (html.includes('"is_private":true')) profile.isPrivate = true;
  profile.hasProfilePic = !html.includes('"profile_pic_url":"https://www.instagram.com/static/images/anonymousUser');

  console.log(`[BG] Scraped profile for @${username}:`, profile);
  return profile;
}

// ─── Analyze profile via backend ──────────────────────────────────────────
async function handleAnalyze(profile) {
  const { settings } = await chrome.storage.local.get("settings");
  const config = settings || DEFAULT_SETTINGS;

  const response = await fetch(`${config.backendUrl}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(profile),
  });

  if (!response.ok) throw new Error(`Backend error: ${response.status}`);

  const result = await response.json();

  // Attach the profile data to result so UI can show stats
  result.profileData = {
    posts: profile.posts,
    followers: profile.followers,
    following: profile.following,
    bio: profile.bio,
    isVerified: profile.isVerified,
    isPrivate: profile.isPrivate,
  };

  // Save to history
  const { analysisHistory = [] } = await chrome.storage.local.get("analysisHistory");
  analysisHistory.unshift({ ...result, timestamp: Date.now() });
  if (analysisHistory.length > 100) analysisHistory.splice(100);
  await chrome.storage.local.set({ analysisHistory });

  return result;
}
