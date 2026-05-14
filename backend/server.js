import "dotenv/config";
import express from "express";
import cors from "cors";
import groq from "./groqClient.js";
import supabase from "./supabaseClient.js";
import { buildPrompt } from "./promptBuilder.js";
import { extractFeatures, ruleScore, dynamicThresholds } from "./featureEngine.js";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: "*", methods: ["GET", "POST"], allowedHeaders: ["Content-Type"] }));
app.use(express.json());

app.get("/", (req, res) => {
  res.json({ status: "ok", message: "Instagram AI Agent Backend is running" });
});

// ─── Main analyze endpoint ────────────────────────────────────────────────────
app.post("/analyze", async (req, res) => {
  try {
    const profile = req.body;
    if (!profile?.username) return res.status(400).json({ error: "username is required" });

    console.log(`[ANALYZE] Processing: @${profile.username}`);

    // LAYER 1: Feature extraction
    const features = extractFeatures(profile);
    console.log(`[FEATURES] @${profile.username}:`, {
      followers: features.followers, following: features.following,
      posts: features.posts, mutuals: features.mutuals,
      ratio: features.ratio.toFixed(2), has_dp: features.has_dp,
      entropy: features.username_entropy.toFixed(2)
    });

    // LAYER 2: Rule-based scoring
    const ruleResult = ruleScore(features);
    console.log(`[RULES] @${profile.username} → Rule score: ${ruleResult.score}`);

    // LAYER 3: Dynamic threshold overrides
    const override = dynamicThresholds(features, ruleResult);
    if (override) {
      console.log(`[OVERRIDE] @${profile.username} → ${override.override}: ${override.reason}`);
    }

    // LAYER 4: LLM reasoning
    const prompt = buildPrompt(profile, features, ruleResult);
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: "You are a JSON-only response bot. Never add text outside the JSON." },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 600,
    });

    const rawResponse = completion.choices[0]?.message?.content || "";
    let aiResult;
    try {
      const cleaned = rawResponse.replace(/```json|```/g, "").trim();
      aiResult = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error("[PARSE ERROR]", rawResponse);
      // Fallback to rule-only result
      aiResult = {
        llm_score: ruleResult.score,
        decision: ruleResult.score >= 70 ? "ACCEPT" : ruleResult.score >= 40 ? "REVIEW" : "REJECT",
        confidence: 50,
        reasons: ruleResult.penalties.concat(ruleResult.bonuses).slice(0, 3),
        flags: [],
        summary: "Analysis based on rule engine (AI parsing failed)."
      };
    }

    // LAYER 5: Score fusion (60% rules, 40% LLM)
    const llmScore = Math.max(0, Math.min(100, parseInt(aiResult.llm_score) || ruleResult.score));
    const fusedScore = Math.round(0.6 * ruleResult.score + 0.4 * llmScore);

    // LAYER 6: Final decision with override support
    let finalDecision;
    if (override) {
      finalDecision = override.override;
    } else {
      finalDecision = fusedScore >= 70 ? "ACCEPT" : fusedScore >= 40 ? "REVIEW" : "REJECT";
    }

    const confidence = Math.max(0, Math.min(100, parseInt(aiResult.confidence) || 60));

    const result = {
      username: profile.username,
      score: fusedScore,
      rule_score: ruleResult.score,
      llm_score: llmScore,
      decision: finalDecision,
      confidence,
      reasons: aiResult.reasons || ruleResult.penalties.slice(0, 3),
      flags: aiResult.flags || [],
      summary: aiResult.summary || "",
      override: override?.reason || null,
      features: {
        posts: features.posts,
        followers: features.followers,
        following: features.following,
        mutuals: features.mutuals,
        ratio: parseFloat(features.ratio.toFixed(2)),
        has_dp: features.has_dp,
        bio_length: features.bio_length,
        is_verified: features.is_verified,
        bio: profile.bio || "",
      }
    };

    console.log(`[RESULT] @${profile.username} → Rule:${ruleResult.score} LLM:${llmScore} Fused:${fusedScore} → ${finalDecision} (confidence: ${confidence}%)`);

    // Save to Supabase (fire and forget)
    supabase.from("decision_history").insert({
      username: profile.username,
      ai_score: fusedScore,
      decision: finalDecision,
      reasoning: result,
    }).then(({ error }) => {
      if (error) console.warn("[SUPABASE] Log error:", error.message);
    });

    return res.json(result);

  } catch (err) {
    console.error("[SERVER ERROR]", err.message);
    return res.status(500).json({ error: "Internal server error", detail: err.message });
  }
});

// ─── History endpoint ─────────────────────────────────────────────────────────
app.get("/history", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("decision_history").select("*")
      .order("created_at", { ascending: false }).limit(50);
    if (error) throw error;
    return res.json({ history: data });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Instagram AI Agent Backend running on port ${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/`);
  console.log(`   Analyze endpoint: POST http://localhost:${PORT}/analyze`);
});
