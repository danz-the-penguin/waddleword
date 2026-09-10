"use client";

import React from "react";

/**
 * RackTray - Wooden tile rack with rack text input and letter tiles display.
 */
export default function RackTray({ rack, onRackChange, onShuffle, scores }) {
  return (
    <div className="rack-container">
      <label
        style={{
          fontSize: "11px",
          fontWeight: "bold",
          display: "block",
          marginBottom: "4px",
        }}
      >
        Your Rack Tiles:
      </label>
      <div style={{ display: "flex", gap: "6px" }}>
        <input
          type="text"
          maxLength={7}
          className="win98-input"
          style={{ fontSize: "14px", padding: "4px 6px" }}
          value={rack}
          onChange={(e) => onRackChange(e.target.value)}
          placeholder="E.g. REOPMAJ? or ? for blank"
        />
        <button className="win98-button" onClick={onShuffle}>
          Shuffle
        </button>
      </div>

      {/* Tray Display */}
      <div className="rack-tray">
        {rack.trim().length === 0 ? (
          <span
            style={{
              fontSize: "11px",
              color: "#d4a373",
              fontStyle: "italic",
              padding: "4px",
            }}
          >
            Empty rack (Type letters above)...
          </span>
        ) : (
          rack.split("").map((ch, idx) => {
            const isBlank = ["?", ".", "0", "*", "_"].includes(ch);
            const score = isBlank ? 0 : (scores?.[ch.toLowerCase()] ?? 0);
            return (
              <div
                key={idx}
                className="scrabble-tile-rack"
                title={
                  isBlank
                    ? "Blank / Wildcard Tile (0 pts)"
                    : `${ch.toUpperCase()} (${score} pts)`
                }
              >
                <span>{isBlank ? "" : ch.toUpperCase()}</span>
                {!isBlank && <sub className="tile-score-sub">{score}</sub>}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
