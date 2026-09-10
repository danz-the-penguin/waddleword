"use client";

import React from "react";

/**
 * ControlPanel - Top-level toolbar controls and scoreboard status strip for WaddleWord.
 */
export default function ControlPanel({
  activePresetKey,
  onPresetChange,
  BOARD_PRESETS,
  sortMode,
  onSortModeChange,
  activeLexicon,
  onLexiconChange,
  equityMode,
  onEquityModeChange,
  isBoardLocked,
  onToggleBoardLocked,
  showHeatmap,
  onToggleHeatmap,
  typingDir,
  onToggleTypingDir,
  canUndo,
  onUndo,
  canRedo,
  onRedo,
  onClearBoard,
  onExportGame,
  onImportGame,
  theme,
  onToggleTheme,
  myScore,
  onMyScoreChange,
  oppScore,
  onOppScoreChange,
  inputMode,
  onToggleInputMode,
}) {
  return (
    <div
      style={{
        marginBottom: "10px",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: "10px",
          flexWrap: "wrap",
          width: "100%",
          alignItems: "stretch",
        }}
      >
        <fieldset
          className="win98-fieldset"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "8px",
            margin: 0,
            flex: "1 1 auto",
            minWidth: "480px",
          }}
        >
          <legend>Lexicon & Engine Rules</legend>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "6px",
            }}
          >
            <label style={{ fontSize: "11px", fontWeight: "bold" }}>
              Preset:
            </label>
            <select
              className="win98-input"
              style={{
                width: "150px",
                cursor: "pointer",
                padding: "2px 4px",
              }}
              value={activePresetKey}
              onChange={(e) => onPresetChange(e.target.value)}
            >
              {Object.entries(BOARD_PRESETS).map(([key, cfg]) => (
                <option key={key} value={key}>
                  {cfg.name.replace(" (15x15)", "")}
                </option>
              ))}
            </select>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "6px",
            }}
          >
            <label
              style={{
                fontSize: "11px",
                fontWeight: "bold",
                color: "#b71c1c",
              }}
            >
              Sort By:
            </label>
            <select
              className="win98-input"
              style={{
                width: "150px",
                cursor: "pointer",
                padding: "2px 4px",
              }}
              value={sortMode}
              onChange={(e) => onSortModeChange(e.target.value)}
            >
              <option value="value">Strategic Value (Eq)</option>
              <option value="score">Highest Score</option>
            </select>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "6px",
            }}
          >
            <label style={{ fontSize: "11px", fontWeight: "bold" }}>
              Lexicon:
            </label>
            <select
              className="win98-input"
              style={{
                width: "150px",
                cursor: "pointer",
                padding: "2px 4px",
              }}
              value={activeLexicon}
              onChange={(e) => onLexiconChange(e.target.value)}
            >
              <option value="nwl2023">NWL2023 (NA)</option>
              <option value="csw24">CSW24 (Intl)</option>
              <option value="csw21">CSW21 (Legacy)</option>
              <option value="twl06">TWL06 (Classic)</option>
              <option value="sowpods">SOWPODS</option>
            </select>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "6px",
            }}
          >
            <label
              style={{
                fontSize: "11px",
                fontWeight: "bold",
                color: "#b71c1c",
              }}
            >
              Engine:
            </label>
            <select
              className="win98-input"
              style={{
                width: "150px",
                cursor: "pointer",
                padding: "2px 4px",
              }}
              value={equityMode}
              onChange={(e) => onEquityModeChange(e.target.value)}
            >
              <option value="static">Static Baseline</option>
              <option value="trained">Trained (ML)</option>
            </select>
          </div>
        </fieldset>

        <fieldset
          className="win98-fieldset"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            margin: 0,
            flex: "1 1 auto",
          }}
        >
          <legend>Game State</legend>
          <button
            className="win98-button"
            style={{
              fontWeight: "bold",
              backgroundColor: isBoardLocked ? "#c0c0c0" : "#ffcccc",
            }}
            onClick={onToggleBoardLocked}
          >
            {isBoardLocked
              ? "🔒 Locked (Search)"
              : "🔓 Unlocked (Opponent)"}
          </button>
          <button
            className="win98-button"
            style={{
              fontWeight: "bold",
              color: showHeatmap ? "#cc0000" : "inherit",
            }}
            onClick={onToggleHeatmap}
          >
            Heatmap: {showHeatmap ? "ON" : "OFF"}
          </button>
          <button
            className="win98-button"
            style={{ fontWeight: "bold" }}
            onClick={onToggleTypingDir}
            title="Tip: Hold Shift while typing to place a blank tile (0 points)"
          >
            Typing:{" "}
            {typingDir === "Right"
              ? "Across ➔"
              : typingDir === "Left"
                ? "Across ⬅"
                : typingDir === "Down"
                  ? "Down ⬇"
                  : "Up ⬆"}{" "}
            (Shift=Blank)
          </button>
          <button
            className="win98-button"
            style={{
              fontWeight: "bold",
              opacity: !canUndo ? 0.5 : 1,
              cursor: !canUndo ? "not-allowed" : "pointer",
            }}
            onClick={onUndo}
            disabled={!canUndo}
            title="Undo last play or change (Ctrl+Z)"
          >
            ↶ Undo
          </button>
          <button
            className="win98-button"
            style={{
              fontWeight: "bold",
              opacity: !canRedo ? 0.5 : 1,
              cursor: !canRedo ? "not-allowed" : "pointer",
            }}
            onClick={onRedo}
            disabled={!canRedo}
            title="Redo undone play or change (Ctrl+Y)"
          >
            Redo ↷
          </button>
          <button className="win98-button" onClick={onClearBoard}>
            Clear Board
          </button>
        </fieldset>

        <fieldset
          className="win98-fieldset"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            margin: 0,
            flex: "1 1 auto",
          }}
        >
          <legend>File & Theme</legend>
          <button
            className="win98-button"
            onClick={onExportGame}
            title="Export game state"
          >
            💾 Export
          </button>
          <label
            className="win98-button"
            style={{
              display: "inline-block",
              cursor: "pointer",
              textAlign: "center",
            }}
            title="Import game state"
          >
            📂 Import
            <input
              type="file"
              accept=".json"
              onChange={onImportGame}
              style={{ display: "none" }}
            />
          </label>
          <button
            className="win98-button"
            onClick={onToggleTheme}
            title="Toggle Visual Theme"
          >
            🎨 Theme: {theme === "classic" ? "Win98" : "Wood"}
          </button>
        </fieldset>
      </div>

      {/* Dedicated Scoreboard Status Strip */}
      <div style={{ marginTop: "10px", width: "100%" }}>
        <div
          className="win98-inset"
          style={{
            display: "flex",
            padding: "4px 12px",
            width: "100%",
            backgroundColor: "var(--w98-bg)",
          }}
        >
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontWeight: "bold",
              backgroundColor:
                inputMode === "me"
                  ? "var(--w98-title-start)"
                  : "transparent",
              color: inputMode === "me" ? "#fff" : "inherit",
              padding: "2px 6px",
            }}
          >
            My Score:
            <input
              type="text"
              inputMode="numeric"
              className="win98-input"
              style={{ width: "60px", textAlign: "right" }}
              value={myScore}
              onChange={(e) =>
                onMyScoreChange(e.target.value.replace(/[^0-9]/g, ""))
              }
            />
          </label>
          <button
            className="win98-button"
            onClick={onToggleInputMode}
            style={{
              fontWeight: "bold",
              color: inputMode === "opp" ? "#cc0000" : "inherit",
            }}
          >
            {inputMode === "me"
              ? "My Play 👤 (Alt+O)"
              : "Opponent Play 👿 (Alt+O)"}
          </button>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontWeight: "bold",
              backgroundColor:
                inputMode === "opp" ? "#cc0000" : "transparent",
              color: inputMode === "opp" ? "#fff" : "#cc0000",
              padding: "2px 6px",
            }}
          >
            Opponent Score:
            <input
              type="text"
              inputMode="numeric"
              className="win98-input"
              style={{ width: "60px", textAlign: "right" }}
              value={oppScore}
              onChange={(e) =>
                onOppScoreChange(e.target.value.replace(/[^0-9]/g, ""))
              }
            />
          </label>
        </div>
      </div>
    </div>
  );
}
