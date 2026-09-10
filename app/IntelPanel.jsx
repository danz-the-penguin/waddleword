"use client";

import React from "react";

/**
 * IntelPanel - Opponent intel and minimax prediction configuration.
 */
export default function IntelPanel({
  enableIntel,
  onToggleIntel,
  showIntelSettings,
  onToggleIntelSettings,
  intelMode,
  onIntelModeChange,
  manualAvailableTiles,
  onManualAvailableTilesChange,
}) {
  return (
    <div className="options-panel">
      <div
        className="options-panel-title"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: "4px",
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={enableIntel}
            onChange={(e) => onToggleIntel(e.target.checked)}
          />
          Opponent Intel & Minimax Counter
        </label>
        <button
          className="win98-button"
          style={{ padding: "0 6px", fontSize: "10px" }}
          onClick={onToggleIntelSettings}
        >
          {showIntelSettings ? "▲ Hide" : "▼ Settings"}
        </button>
      </div>

      {enableIntel && showIntelSettings && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            marginTop: "8px",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: "10px",
              fontSize: "11px",
            }}
          >
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
                cursor: "pointer",
              }}
            >
              <input
                type="radio"
                name="intelMode"
                value="auto"
                checked={intelMode === "auto"}
                onChange={() => onIntelModeChange("auto")}
              />
              Auto (Endgame Deduce)
            </label>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
                cursor: "pointer",
              }}
            >
              <input
                type="radio"
                name="intelMode"
                value="manual"
                checked={intelMode === "manual"}
                onChange={() => onIntelModeChange("manual")}
              />
              Manual (Paste Woogles Tiles)
            </label>
          </div>

          {intelMode === "manual" && (
            <div>
              <input
                type="text"
                className="win98-input"
                style={{ fontSize: "11px", padding: "4px" }}
                placeholder="Paste 'Available Tiles' from Woogles (e.g. AABCDEE...)"
                value={manualAvailableTiles}
                onChange={(e) =>
                  onManualAvailableTilesChange(
                    e.target.value.toUpperCase().replace(/[^A-Z?]/g, ""),
                  )
                }
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
