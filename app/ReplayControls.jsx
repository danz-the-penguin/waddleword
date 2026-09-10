"use client";

import React from "react";

/**
 * ReplayControls - Turn-by-turn replay navigation and GCG file loader.
 */
export default function ReplayControls({
  currentTurnIdx,
  matchHistory,
  onSelectTurn,
  onGcgUpload,
}) {
  const historyLen = matchHistory ? matchHistory.length : 0;
  const hasHistory = historyLen > 0;
  const isAtStart = currentTurnIdx <= 0;
  const isAtEnd = currentTurnIdx >= historyLen - 1;

  return (
    <div
      className="win98-window"
      style={{
        marginTop: "10px",
        padding: "4px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        backgroundColor: "var(--w98-bg)",
      }}
    >
      <div style={{ display: "flex", gap: "4px" }}>
        <button
          className="win98-button"
          disabled={!hasHistory || isAtStart}
          onClick={() => onSelectTurn(0)}
          title="Jump to First Turn"
        >
          [|◄]
        </button>
        <button
          className="win98-button"
          disabled={!hasHistory || isAtStart}
          onClick={() => onSelectTurn(currentTurnIdx - 1)}
          title="Previous Turn"
        >
          [◄]
        </button>
        <div
          className="win98-inset"
          style={{
            padding: "2px 8px",
            minWidth: "120px",
            textAlign: "center",
            backgroundColor: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {hasHistory
            ? `Turn ${currentTurnIdx + 1} / ${historyLen}`
            : "No Match Loaded"}
        </div>
        <button
          className="win98-button"
          disabled={!hasHistory || isAtEnd}
          onClick={() => onSelectTurn(currentTurnIdx + 1)}
          title="Next Turn"
        >
          [►]
        </button>
        <button
          className="win98-button"
          disabled={!hasHistory || isAtEnd}
          onClick={() => onSelectTurn(historyLen - 1)}
          title="Jump to Last Turn"
        >
          [►|]
        </button>
      </div>
      <div
        style={{
          position: "relative",
          overflow: "hidden",
          display: "inline-block",
        }}
      >
        <button className="win98-button">📂 Load .GCG</button>
        <input
          type="file"
          accept=".gcg"
          onChange={onGcgUpload}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            opacity: 0,
            width: "100%",
            height: "100%",
            cursor: "pointer",
          }}
        />
      </div>
    </div>
  );
}
