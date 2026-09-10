import React, { useState, useMemo } from "react";

export default function UnseenTileTracker({
  board,
  rack,
  activePreset,
  enableIntel,
  intelMode,
  manualAvailableTiles,
}) {
  const unseen = useMemo(() => {
    let counts = {};
    let total = 0;

    // Default: initialize all standard alphabet + blank
    Object.keys(activePreset.distribution).forEach((k) => (counts[k] = 0));

    if (enableIntel && intelMode === "manual" && manualAvailableTiles.trim()) {
      // Manual Paste Mode from Woogles
      const pool = manualAvailableTiles.toUpperCase().replace(/[^A-Z?]/g, "");
      for (let i = 0; i < pool.length; i++) {
        const ch = pool[i];
        counts[ch] = (counts[ch] || 0) + 1;
        total++;
      }
    } else {
      // Auto Calculation Mode (Distribution minus Board minus Rack)
      counts = { ...activePreset.distribution };
      for (const k in counts) total += counts[k];

      for (let r = 0; r < 15; r++) {
        for (let c = 0; c < 15; c++) {
          const val = board[r][c];
          if (val) {
            const isBlank = val >= "a" && val <= "z";
            const keyToDeduct = isBlank ? "?" : val.toUpperCase();
            if (counts[keyToDeduct] !== undefined && counts[keyToDeduct] > 0) {
              counts[keyToDeduct]--;
              total--;
            }
          }
        }
      }

      const rackChars = rack.toUpperCase().split("");
      for (const ch of rackChars) {
        const mapped = ["?", ".", "0", "*", "_"].includes(ch) ? "?" : ch;
        if (counts[mapped] !== undefined && counts[mapped] > 0) {
          counts[mapped]--;
          total--;
        }
      }
    }

    return { counts, total };
  }, [board, rack, activePreset, enableIntel, intelMode, manualAvailableTiles]);

  const [hideEmpty, setHideEmpty] = useState(false);

  return (
    <div className="unseen-pane">
      <div className="unseen-header">
        <span>Available Tiles (Bag + Opponent)</span>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <label style={{ fontSize: "9px", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={hideEmpty}
              onChange={(e) => setHideEmpty(e.target.checked)}
            />{" "}
            Hide Empty
          </label>
          <span style={{ color: "#000080" }}>Total: {unseen.total}</span>
        </div>
      </div>

      <div className="unseen-grid">
        {Object.entries(unseen.counts).map(([ch, count]) => {
          const isZero = count === 0;
          if (hideEmpty && isZero) return null;
          return (
            <div key={ch} className={`unseen-item ${isZero ? "empty" : ""}`}>
              <div
                className="scrabble-tile-mini"
                style={{
                  width: "20px",
                  height: "22px",
                  fontSize: "11px",
                  boxShadow: "1px 1px 1px rgba(0,0,0,0.4)",
                }}
              >
                <span>{ch === "?" ? "" : ch}</span>
                {ch !== "?" && (
                  <sub
                    className="tile-score-sub"
                    style={{ fontSize: "7px", bottom: "0px", right: "1px" }}
                  >
                    {activePreset?.scores?.[ch.toLowerCase()] ?? 0}
                  </sub>
                )}
              </div>
              <span className="unseen-count">x{count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
