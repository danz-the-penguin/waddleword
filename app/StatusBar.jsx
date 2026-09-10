"use client";

import React from "react";

/**
 * StatusBar - Windows 98 status bar displaying engine calculation status, active turn, and score differential.
 */
export default function StatusBar({
  isSolving,
  gpuEnabled,
  inputMode,
  scoreDifferential,
  stagedMoveEvaluation,
}) {
  let projectedDiff = null;
  if (
    stagedMoveEvaluation?.isValid &&
    typeof stagedMoveEvaluation.score === "number"
  ) {
    projectedDiff =
      inputMode === "me"
        ? scoreDifferential + stagedMoveEvaluation.score
        : scoreDifferential - stagedMoveEvaluation.score;
  }

  return (
    <div className="win98-statusbar">
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          gap: "8px",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {stagedMoveEvaluation ? (
          stagedMoveEvaluation.isValid ? (
            <span style={{ color: "#006600", fontWeight: "bold" }}>
              ✍ Staged: {stagedMoveEvaluation.word} ({stagedMoveEvaluation.posString}) +
              {stagedMoveEvaluation.score} pts
              <span
                style={{
                  fontWeight: "normal",
                  color: "#444",
                  marginLeft: "6px",
                }}
              >
                [Main: {stagedMoveEvaluation.mainScore}
                {stagedMoveEvaluation.crossWords?.length > 0 &&
                  ` + ${stagedMoveEvaluation.crossWords.length} Cross (${stagedMoveEvaluation.crossScore})`}
                {stagedMoveEvaluation.isBingo &&
                  ` + Bingo (${stagedMoveEvaluation.bingoBonus})`}
                ]
              </span>
            </span>
          ) : (
            <span style={{ color: "#cc0000", fontWeight: "bold" }}>
              ⚠ Staged: {stagedMoveEvaluation.reason}
            </span>
          )
        ) : (
          <span>
            {isSolving
              ? gpuEnabled
                ? "⏳ GPU Compute MCTS..."
                : "⏳ Solving (8 Workers)..."
              : gpuEnabled
                ? "✔ WebGPU Engine Ready"
                : "✔ CPU Engine Ready"}
          </span>
        )}
      </div>
      <div>
        Turn: {inputMode === "me" ? "Player (Alt+O)" : "Opponent (Alt+O)"}
      </div>
      <div>
        Diff:{" "}
        {scoreDifferential > 0 ? `+${scoreDifferential}` : scoreDifferential}
        {projectedDiff !== null && (
          <span
            style={{
              color:
                projectedDiff >= scoreDifferential ? "#006600" : "#cc0000",
              fontWeight: "bold",
            }}
          >
            {" "}
            ➔ {projectedDiff > 0 ? `+${projectedDiff}` : projectedDiff}
          </span>
        )}
      </div>
      <div
        style={{
          padding: "0 2px",
          color: "var(--w98-border-dark)",
          letterSpacing: "1px",
        }}
      >
        {"///"}
      </div>
    </div>
  );
}
