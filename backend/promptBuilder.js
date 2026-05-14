// promptBuilder.js — LLM-heavy prompt with Instagram bot patterns

export function buildPrompt(profile, features, ruleResult) {
  const f = features;
  const r = ruleResult;

  const mutualText = f.mutualUsers.length > 0
    ? `${f.mutuals} mutual(s): ${f.mutualUsers.slice(0, 5).join(", ")}`
    : f.mutuals > 0
      ? `${f.mutuals} mutuals (names unknown)`
      : "0 mutuals";

  return `You are an expert Instagram account authenticity analyst. Your job is to decide whether a follow request is from a REAL person, a BOT, or a SPAMMER.

== PROFILE DATA ==
Username: ${profile.username}
Full Name: ${f.fullName || "none"}
Bio: "${profile.bio || "none"}"
Followers: ${f.followers}
Following: ${f.following}
Posts: ${f.posts}
Following/Follower Ratio: ${f.ratio.toFixed(2)}x
Mutual Followers: ${mutualText}
Verified: ${f.is_verified ? "Yes" : "No"}
Profile Picture: ${f.has_dp ? "Yes" : "No"}
Bio Length: ${f.bio_length} characters
External URL: ${f.external_url || "none"}
Username Entropy: ${f.username_entropy.toFixed(2)} (0=simple, 1=random/bot-like)

== RULE ENGINE PRE-SCORE ==
Score: ${r.score}/100
Penalties: ${r.penalties.join("; ") || "none"}
Bonuses: ${r.bonuses.join("; ") || "none"}

== KNOWN INSTAGRAM BOT & SPAM PATTERNS (use these to judge) ==

STRONG BOT SIGNALS:
- Username is random letters + 4-6+ digits (e.g. user8273649, john_98271)
- Zero posts with zero mutuals — classic ghost/bot account
- Following 1000s of people but very few follow back (ratio >10)
- No profile picture + no bio + no posts = textbook bot
- Bio contains: crypto, forex, investment, earn money, DM me, OnlyFans promo links
- Account created recently (many numbers in username suggest auto-generation)
- Follows in bulk patterns — mass following then unfollowing
- Profile picture is stock photo or AI generated face (can't detect but note if other signals exist)

STRONG REAL PERSON SIGNALS:
- Has 3+ mutual followers (people you know also follow them — very strong trust signal)
- Followers >= 50 with reasonable following count
- Has a real bio (personal text, not promotional)
- Has posts (especially 10+)
- Low following/follower ratio (<2x)
- Has a real full name matching the username
- Private account with mutuals — almost always a real person
- Verified account

GREY AREA / NEEDS JUDGMENT:
- New account: 0 posts but has mutuals → probably real, just new
- Low followers but high mutuals → real person, just not popular
- High followers but 0 posts → could be inactive real person or bought followers
- Following slightly more than followers (ratio 1-3x) → normal behavior

== IMPORTANT WEIGHTING RULES ==
1. Mutual followers (especially >3) should STRONGLY push toward ACCEPT — these are real people who know the requester
2. Followers >= 50 with any mutuals = very likely real person
3. Zero mutuals + zero posts + no DP = almost certainly REJECT
4. Do NOT penalize private accounts — private is normal for real people
5. A simple short bio like "Faith." or "Student" is a GOOD sign — real people write simple bios
6. If the rule score and your analysis disagree, explain why

== DECISION THRESHOLDS ==
- ACCEPT: Confident this is a real person worth accepting (score 70-100)
- REVIEW: Unclear, human should decide (score 40-69)  
- REJECT: High confidence this is a bot/spam/fake account (score 0-39)

Return ONLY valid JSON, no extra text, no markdown fences:
{
  "llm_score": <integer 0-100>,
  "decision": "<ACCEPT | REVIEW | REJECT>",
  "confidence": <integer 0-100>,
  "reasons": ["<specific reason based on THIS profile's data>", "<reason2>", "<reason3>"],
  "flags": ["<flag if any suspicious pattern>"],
  "summary": "<2-3 sentences explaining your verdict naturally, referencing the specific data points that mattered most>"
}`;
}
