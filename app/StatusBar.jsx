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
}) {
  return (
    <div className="win98-statusbar">
      <div style={{ flex: 1 }}>
        {isSolving
          ? gpuEnabled
            ? "⏳ GPU Compute MCTS..."
            : "⏳ Solving (8 Workers)..."
          : gpuEnabled
            ? "✔ WebGPU Engine Ready"
            : "✔ CPU Engine Ready"}
      </div>
      <div>
        Turn: {inputMode === "me" ? "Player (Alt+O)" : "Opponent (Alt+O)"}
      </div>
      <div>
        Diff:{" "}
        {scoreDifferential > 0
          ? `+${scoreDifferential}`
          : scoreDifferential}
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
