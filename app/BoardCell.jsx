import React from "react";
import { TILE_SCORES } from "./presets";

const BoardCell = React.memo(
  ({
    r,
    c,
    dangerType,
    tileVal,
    isUncommitted,
    previewChar,
    oppPreviewChar,
    premium,
    isSelected,
    isInActiveLine,
    typingDir,
    onClick,
    owner,
    scores,
  }) => {
    let cellClass = tileVal ? "" : premium ? `cell-${premium}` : "";
    if (!tileVal && dangerType) {
      if (dangerType === "9x-corridor") cellClass += " cell-danger-9x-corridor";
      else if (dangerType === "4x-corridor") cellClass += " cell-danger-4x-corridor";
      else if (dangerType === "3W-center") cellClass += " cell-danger-3w-center";
      else if (dangerType === "3W-adj") cellClass += " cell-danger-3w-adj";
      else if (dangerType === "2W-center") cellClass += " cell-danger-2w-center";
      else if (dangerType === "2W-adj") cellClass += " cell-danger-2w-adj";
    }

    let renderTile = null;
    if (tileVal) {
      const isBlank = tileVal >= "a" && tileVal <= "z";
      const score = isBlank
        ? 0
        : (scores?.[tileVal.toLowerCase()] ?? (TILE_SCORES[tileVal.toUpperCase()] || 0));
      renderTile = (
        <div
          className={`cell-tile ${owner === "opp" ? "cell-tile-opponent" : ""} ${isUncommitted ? "cell-tile-staged" : ""}`}
          style={{
            color: isBlank ? "var(--w98-highlight)" : "",
            boxShadow: isUncommitted ? "inset 0 0 0 2px #008080" : undefined,
          }}
        >
          {tileVal.toUpperCase()}
          <span className="tile-score-sub">{score}</span>
        </div>
      );
    } else if (previewChar) {
      const isBlank = previewChar >= "a" && previewChar <= "z";
      const score = isBlank
        ? 0
        : (scores?.[previewChar.toLowerCase()] ?? (TILE_SCORES[previewChar.toUpperCase()] || 0));
      renderTile = (
        <div className="cell-preview">
          {previewChar.toUpperCase()}
          <span className="tile-score-sub" style={{ color: "#ffffff" }}>
            {score}
          </span>
        </div>
      );
    } else if (oppPreviewChar) {
      const isBlank = oppPreviewChar >= "a" && oppPreviewChar <= "z";
      const score = isBlank
        ? 0
        : (scores?.[oppPreviewChar.toLowerCase()] ?? (TILE_SCORES[oppPreviewChar.toUpperCase()] || 0));
      renderTile = (
        <div className="cell-opp-preview" title="HastyBot Counter-Play">
          {oppPreviewChar.toUpperCase()}
          <span className="tile-score-sub">{score}</span>
        </div>
      );
    }

    return (
      <div
        className={`board-cell ${cellClass} ${isSelected ? "selected" : ""} ${
          isInActiveLine ? "active-line" : ""
        }`}
        onClick={() => onClick(r, c)}
        style={{
          borderTop:
            isSelected || isInActiveLine
              ? ["Down", "Up"].includes(typingDir)
                ? "2px solid var(--w98-highlight)"
                : undefined
              : undefined,
          borderBottom:
            isSelected || isInActiveLine
              ? ["Down", "Up"].includes(typingDir)
                ? "2px solid var(--w98-highlight)"
                : undefined
              : undefined,
          borderLeft:
            isSelected || isInActiveLine
              ? ["Right", "Left"].includes(typingDir)
                ? "2px solid var(--w98-highlight)"
                : undefined
              : undefined,
          borderRight:
            isSelected || isInActiveLine
              ? ["Right", "Left"].includes(typingDir)
                ? "2px solid var(--w98-highlight)"
                : undefined
              : undefined,
        }}
      >
        {renderTile || (premium === "CENTER" ? "★" : premium || "")}

        {isSelected && (
          <div
            style={{
              position: "absolute",
              bottom: "1px",
              right: "2px",
              fontSize: "8px",
              color: "#ff0000",
              fontWeight: "bold",
              lineHeight: 1,
              pointerEvents: "none",
              textShadow: "1px 1px 0px #ffffff",
            }}
          >
            {typingDir === "Right" ? "►" : typingDir === "Left" ? "◄" : typingDir === "Down" ? "▼" : "▲"}
          </div>
        )}
      </div>
    );
  },
);
BoardCell.displayName = "BoardCell";

export default BoardCell;
