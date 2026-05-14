// featureEngine.js — Feature extraction + lightweight rule scoring

export function extractFeatures(profile) {
  const followers = parseInt(profile.followers) || 0;
  const following = parseInt(profile.following) || 0;
  const posts = parseInt(profile.posts) || 0;
  const mutuals = parseInt(profile.mutuals) || 0;
  const mutualUsers = profile.mutualUsers || [];
  const bio = profile.bio || "";
  const username = profile.username || "";

  return {
    followers,
    following,
    posts,
    mutuals,
    mutualUsers,
    ratio: following / Math.max(followers, 1),
    has_dp: !!profile.hasProfilePic,
    bio_length: bio.trim().length,
    bio_has_suspicious: /crypto|invest|forex|earn\s*\$|profit|onlyfans|promo|trading|bitcoin|nft|drop\s*ship/i.test(bio),
    is_verified: !!profile.isVerified,
    is_private: !!profile.isPrivate,
    username_entropy: usernameEntropy(username),
    username_looks_bot: /^[a-z]+[\d]{5,}$/.test(username) || /_{2,}/.test(username) || /\d{6,}/.test(username),
    fullName: profile.fullName || "",
    external_url: profile.externalUrl || "",
    bio,
  };
}

export function ruleScore(f) {
  let score = 50;
  const penalties = [];
  const bonuses = [];

  // Profile picture
  if (!f.has_dp) { score -= 20; penalties.push("No profile picture"); }

  // Posts
  if (f.posts === 0) { score -= 15; penalties.push("Zero posts"); }
  else if (f.posts < 5) { score -= 5; penalties.push("Very few posts"); }
  else if (f.posts > 20) { score += 8; bonuses.push("Active poster"); }

  // Followers — >50 is good per requirements
  if (f.followers === 0) { score -= 20; penalties.push("Zero followers"); }
  else if (f.followers < 20) { score -= 15; penalties.push("Very low followers"); }
  else if (f.followers < 50) { score -= 8; penalties.push("Low followers"); }
  else if (f.followers >= 50) { score += 10; bonuses.push(`${f.followers} followers (healthy)`); }
  else if (f.followers >= 500) { score += 15; bonuses.push("Large following"); }

  // Mutuals — >3 is good per requirements
  if (f.mutuals === 0) { score -= 15; penalties.push("No mutual followers"); }
  else if (f.mutuals >= 1 && f.mutuals <= 2) { score += 10; bonuses.push(`${f.mutuals} mutual(s)`); }
  else if (f.mutuals === 3) { score += 20; bonuses.push("3 mutuals (good threshold)"); }
  else if (f.mutuals > 3 && f.mutuals <= 7) { score += 30; bonuses.push(`${f.mutuals} mutuals (trusted)`); }
  else if (f.mutuals > 7) { score += 40; bonuses.push(`${f.mutuals} mutuals (very trusted)`); }

  // Following/follower ratio
  if (f.ratio > 10) { score -= 20; penalties.push(`High ratio ${f.ratio.toFixed(1)}x (possible bot)`); }
  else if (f.ratio > 5) { score -= 10; penalties.push("Elevated follow ratio"); }
  else if (f.ratio < 2 && f.followers > 100) { score += 8; bonuses.push("Healthy follow ratio"); }

  // Bio
  if (f.bio_length === 0) { score -= 8; penalties.push("No bio"); }
  else if (f.bio_length > 20) { score += 5; bonuses.push("Has bio"); }
  if (f.bio_has_suspicious) { score -= 20; penalties.push("Suspicious bio keywords"); }

  // Verified
  if (f.is_verified) { score += 30; bonuses.push("Verified account"); }

  // Username entropy
  if (f.username_entropy > 0.85) { score -= 12; penalties.push("Auto-generated looking username"); }
  else if (f.username_looks_bot) { score -= 8; penalties.push("Bot-like username pattern"); }

  score = Math.max(0, Math.min(100, score));
  return { score, penalties, bonuses };
}

export function dynamicThresholds(f) {
  // Hard auto-reject cases
  if (!f.has_dp && f.followers < 30 && f.mutuals === 0)
    return { override: "REJECT", reason: "No profile picture + very low followers + zero mutuals" };
  if (f.bio_has_suspicious && f.ratio > 5)
    return { override: "REJECT", reason: "Spam bio keywords with aggressive follow pattern" };
  if (f.username_looks_bot && f.posts === 0 && f.mutuals === 0)
    return { override: "REJECT", reason: "Bot username + no posts + no mutuals" };

  // Hard auto-accept cases
  if (f.is_verified)
    return { override: "ACCEPT", reason: "Verified account" };
  if (f.mutuals > 7 && f.followers >= 50)
    return { override: "ACCEPT", reason: `High mutual count (${f.mutuals}) with healthy followers` };

  // Edge cases — defer to LLM
  if (f.posts === 0 && f.mutuals > 3)
    return { override: "REVIEW", reason: "No posts but has meaningful mutuals — needs judgment" };

  return null;
}

function usernameEntropy(str) {
  if (!str || str.length < 2) return 0;
  const freq = {};
  for (const ch of str) freq[ch] = (freq[ch] || 0) + 1;
  return Object.values(freq).reduce((h, c) => {
    const p = c / str.length;
    return h - p * Math.log2(p);
  }, 0) / Math.log2(Math.max(str.length, 2));
}
