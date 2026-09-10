"use client";

import React, { useState, useEffect } from "react";

export default function RefereeChecker({
  checkWord,
  wordCheckResult,
  activePreset,
  lookupWord,
  activeLexicon,
onInvalidWord}) {
  const [challengeInput, setChallengeInput] = useState("");
  const [challengeResult, setChallengeResult] = useState(null);

  useEffect(() => {
    if (!wordCheckResult) return;
    
    const { word, isValid } = wordCheckResult;
    const raw = challengeInput.trim().toLowerCase();
    const w = raw.replace(/[^a-z]/g, "");
    
    if (word !== w) return;

    const baseScore = w
      .split("")
      .reduce((sum, c) => sum + (activePreset?.scores?.[c.toLowerCase()] || 0), 0);

    const checkAsync = async () => {
      const def = lookupWord ? await lookupWord(w) : null;
      const inJson = Boolean(def);

      setChallengeResult({
        word: w,
        isLoaded: true,
        isValid,
        inJson,
        def,
        baseScore,
      });
      if (!isValid && onInvalidWord) onInvalidWord();
    };
    checkAsync();
  }, [wordCheckResult, challengeInput, lookupWord, activePreset, activeLexicon]);

  useEffect(() => {
    const raw = challengeInput.trim().toLowerCase();
    const w = raw.replace(/[^a-z]/g, "");
    if (!w) {
      setChallengeResult(null);
      return;
    }
    
    setChallengeResult({ word: w, isLoaded: false });
    
    const debounce = setTimeout(() => {
       if (checkWord) checkWord(w);
    }, 300);
    
    return () => clearTimeout(debounce);
  }, [challengeInput, checkWord]);

  return (
    <div className="win98-window" style={{ marginTop: "12px" }}>
      <div className="win98-titlebar">
        <span>Referee &bull; Verification</span>
      </div>
      <div className="win98-content" style={{ padding: "8px" }}>

        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <input
            type="text"
            className="win98-input"
            style={{ maxWidth: "260px" }}
            placeholder="Type word to challenge..."
            value={challengeInput}
            onChange={(e) => setChallengeInput(e.target.value.toUpperCase())}
          />
          {challengeInput.trim() && (
            <button
              className="win98-button"
              onClick={() => setChallengeInput("")}
            >
              Clear
            </button>
          )}
        </div>

        {challengeResult && (
          <div
            className="win98-inset"
            style={{
              marginTop: "8px",
              padding: "6px 8px",
              backgroundColor: !challengeResult.isLoaded
                ? "#fffde7"
                : challengeResult.isValid
                  ? "#e8f5e9"
                  : "#ffebee",
              borderColor: !challengeResult.isLoaded
                ? "#fbc02d"
                : challengeResult.isValid
                  ? "#2e7d32"
                  : "#c62828",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "4px",
                marginBottom: "4px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  gap: "4px",
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                {!challengeResult.isLoaded ? (
                  <span className="badge-dict-only">
                    ⏳ CHECKING {activeLexicon.toUpperCase()}...
                  </span>
                ) : (
                  <>
                    <span
                      className={
                        challengeResult.isValid
                          ? "badge-legal"
                          : "badge-illegal"
                      }
                    >
                      {challengeResult.isValid
                        ? `✔ VALID (${activeLexicon.toUpperCase()})`
                        : `✖ INVALID (${activeLexicon.toUpperCase()})`}
                    </span>

                    {challengeResult.inJson && (
                      <span
                        className="badge-dict-only"
                        style={{ fontSize: "8px", padding: "1px 3px" }}
                      >
                        DEF
                      </span>
                    )}
                  </>
                )}
              </div>

              {challengeResult.isLoaded && challengeResult.isValid && (
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: "bold",
                    color: "#1b5e20",
                  }}
                >
                  Base Value: {challengeResult.baseScore} PTS
                </span>
              )}
            </div>

            <div style={{ fontSize: "11px", lineHeight: "1.4", color: "#222" }}>
              {!challengeResult.isLoaded ? (
                <span style={{ color: "#777" }}>Verifying word...</span>
              ) : challengeResult.def ? (
                challengeResult.def
              ) : challengeResult.isValid ? (
                <span style={{ color: "#555", fontStyle: "italic" }}>
                  Verified legal word.
                </span>
              ) : (
                <span style={{ color: "#b71c1c" }}>
                  &quot;{challengeResult.word.toUpperCase()}&quot; is not legal
                  under {activeLexicon.toUpperCase()} rules. Challenge succeeds!
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
