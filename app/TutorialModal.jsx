"use client";

import React from "react";
import { useDraggable } from "./useDraggable";

/**
 * TutorialModal - Explains GADDAG engine concepts, leave equity, defensive play, and badges.
 */
export default function TutorialModal({ isOpen, onClose }) {
  const { position, handlePointerDown } = useDraggable();

  if (!isOpen) return null;

  return (
    <div
      className="win98-window"
      style={{
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: `translate(calc(-50% + ${position.x}px), calc(-50% + ${position.y}px))`,
        zIndex: 10000,
        padding: "10px",
        width: "400px",
        maxWidth: "95vw",
        boxShadow: "2px 2px 10px rgba(0,0,0,0.5)",
      }}
    >
      <div
        className="win98-titlebar"
        onPointerDown={handlePointerDown}
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: "8px",
          cursor: "grab",
        }}
      >
        <span>Engine Tutorial & Math</span>
        <button className="win98-button win98-btn-sys" onClick={onClose}>
          X
        </button>
      </div>
      <div
        className="win98-inset"
        style={{
          padding: "10px",
          fontSize: "12px",
          lineHeight: "1.5",
          backgroundColor: "#fff",
          maxHeight: "60vh",
          overflowY: "auto",
        }}
      >
        <h4
          style={{
            margin: "0 0 8px 0",
            color: "var(--w98-title-start)",
          }}
        >
          1. The GADDAG Engine
        </h4>
        <p style={{ margin: "0 0 12px 0", color: "#222" }}>
          Instead of searching a linear dictionary, this engine uses a{" "}
          <strong>GADDAG</strong> (a specialized directed acyclic word
          graph). It stores words folded around every possible anchor. This
          allows the bot to latch onto any tile on the board and instantly build
          words outward in both directions simultaneously, checking millions of
          permutations in milliseconds.
        </p>

        <h4
          style={{
            margin: "0 0 8px 0",
            color: "var(--w98-title-start)",
          }}
        >
          2. Value = Score + Leave Equity
        </h4>
        <p style={{ margin: "0 0 12px 0", color: "#222" }}>
          The bot doesn&apos;t just play for the highest immediate score; it
          plays for the future. <br />
          <strong>Score:</strong> Immediate points on the board.
          <br />
          <strong>Leave Equity:</strong> The statistical value of the tiles kept
          on your rack. Good letters (A, E, R, S, T, Blanks) have positive
          equity because they increase future Bingo chances. Clunky letters (Q,
          V, W) subtract equity.
        </p>

        <h4
          style={{
            margin: "0 0 8px 0",
            color: "var(--w98-title-start)",
          }}
        >
          3. Defensive Adjustments
        </h4>
        <p style={{ margin: "0 0 12px 0", color: "#222" }}>
          If a play exposes a high-value premium square (like a Triple Word
          Score) for the opponent, the engine applies a &quot;Defense
          Penalty&quot; to the play&apos;s total value, effectively demoting
          risky moves.
        </p>

        <h4
          style={{
            margin: "0 0 8px 0",
            color: "var(--w98-title-start)",
          }}
        >
          4. Tactical Badges
        </h4>
        <ul
          style={{
            margin: "0 0 12px 0",
            paddingLeft: "20px",
            color: "#222",
            fontSize: "11px",
          }}
        >
          <li style={{ marginBottom: "4px" }}>
            <span
              className="badge-dict-only"
              style={{
                backgroundColor: "#e3f2fd",
                color: "#1565c0",
                borderColor: "#90caf9",
                padding: "1px 3px",
                fontSize: "9px",
              }}
            >
              BINGO
            </span>{" "}
            Played all 7 tiles from your rack, earning a 50-point bonus.
          </li>
          <li style={{ marginBottom: "4px" }}>
            <span
              className="badge-legal"
              style={{
                backgroundColor: "#8e24aa",
                padding: "1px 3px",
                fontSize: "9px",
              }}
            >
              POWER PLAY
            </span>{" "}
            A massive move scoring 50+ points without using all 7 tiles.
          </li>
          <li style={{ marginBottom: "4px" }}>
            <span
              className="badge-risk-safe"
              style={{ padding: "1px 3px", fontSize: "9px" }}
            >
              SAFE LEAVE
            </span>{" "}
            &{" "}
            <span
              className="badge-legal"
              style={{
                backgroundColor: "#1565c0",
                padding: "1px 3px",
                fontSize: "9px",
              }}
            >
              BLOCKS DWS
            </span>{" "}
            Defensively sound plays that lock down the board and deny your
            opponent premium multipliers.
          </li>
          <li style={{ marginBottom: "4px" }}>
            <span
              className="badge-risk-high"
              style={{ padding: "1px 3px", fontSize: "9px" }}
            >
              RISK: 3W
            </span>{" "}
            &{" "}
            <span
              className="badge-illegal"
              style={{
                backgroundColor: "#d84315",
                padding: "1px 3px",
                fontSize: "9px",
              }}
            >
              OPENS TWS
            </span>{" "}
            Warning! This play opens a highly dangerous Triple Word Score lane
            for your opponent.
          </li>
          <li style={{ marginBottom: "4px" }}>
            <span
              className="badge-legal"
              style={{
                backgroundColor: "#ff8f00",
                padding: "1px 3px",
                fontSize: "9px",
              }}
            >
              HOT SPOT
            </span>{" "}
            A highly tactical placement that forms multiple intersecting words
            at once.
          </li>
          <li style={{ marginBottom: "4px" }}>
            <span
              className="badge-illegal"
              style={{
                backgroundColor: "#b71c1c",
                color: "#ffffff",
                borderColor: "#ef5350",
                padding: "1px 3px",
                fontSize: "9px",
              }}
            >
              ⚠️ POISON LEAVE
            </span>{" "}
            Danger! This play retains toxic, uncooperative letter combinations
            (such as V+W, duplicate V, Q without U, or severe negative equity
            &le; -12 pts), drastically crippling your next draw.
          </li>
          <li>
            <span
              className="badge-illegal"
              style={{
                backgroundColor: "#e65100",
                color: "#ffffff",
                borderColor: "#ffb74d",
                padding: "1px 3px",
                fontSize: "9px",
              }}
            >
              ⚠️ VOWEL FLOOD
            </span>{" "}
            Warning! Leaves 4+ vowels or triple duplicate vowels (e.g. I-I-I),
            leaving you vowel-heavy and drastically lowering your bingo odds.
          </li>
          <li style={{ marginTop: "4px", marginBottom: "4px" }}>
            <span
              className="badge-illegal"
              style={{
                backgroundColor: "#b71c1c",
                color: "#ffffff",
                borderColor: "#ef5350",
                fontWeight: "bold",
                padding: "1px 3px",
                fontSize: "9px",
              }}
            >
              ⚠️ OPENS 9X TRIPLE-TRIPLE
            </span>{" "}
            Critical Red Alert! This move opens an unblocked 9x Triple-Triple
            corridor bridging two Triple Word Scores, inviting catastrophic
            opponent counter-bingos (140+ pts).
          </li>
          <li style={{ marginBottom: "4px" }}>
            <span
              className="badge-illegal"
              style={{
                backgroundColor: "#e65100",
                color: "#ffffff",
                borderColor: "#ff9800",
                fontWeight: "bold",
                padding: "1px 3px",
                fontSize: "9px",
              }}
            >
              ⚠️ OPENS 4X DBL-DBL
            </span>{" "}
            Orange Alert! Opens an exposed 4x Double-Double corridor giving your
            opponent massive multi-multiplier scoring reach (70-100+ pts).
          </li>
          <li style={{ marginBottom: "4px" }}>
            <span
              className="badge-legal"
              style={{
                backgroundColor: "#1b5e20",
                color: "#ffffff",
                borderColor: "#2e7d32",
                padding: "1px 3px",
                fontSize: "9px",
              }}
            >
              🛡️ BLOCKS 9X
            </span>{" "}
            &{" "}
            <span
              className="badge-legal"
              style={{
                backgroundColor: "#2e7d32",
                color: "#ffffff",
                borderColor: "#388e3c",
                padding: "1px 3px",
                fontSize: "9px",
              }}
            >
              🛡️ BLOCKS 4X
            </span>{" "}
            Defensive masterplays that neutralize high-risk multi-multiplier
            corridors before your opponent can exploit them.
          </li>
          <li style={{ marginBottom: "4px" }}>
            <span
              className="badge-legal"
              style={{
                backgroundColor: "#00838f",
                color: "#ffffff",
                borderColor: "#00acc1",
                fontWeight: "bold",
                padding: "1px 3px",
                fontSize: "9px",
              }}
            >
              💎 RETAIN BLANK
            </span>{" "}
            Cyan Recommendation! Preserves the wildcard blank on your rack for
            high-equity future bingos when a non-blank move is close in score.
          </li>
          <li style={{ marginBottom: "4px" }}>
            <span
              className="badge-illegal"
              style={{
                backgroundColor: "#d84315",
                color: "#ffffff",
                borderColor: "#ff5722",
                padding: "1px 3px",
                fontSize: "9px",
              }}
            >
              BLANK SURCHARGE (-14)
            </span>{" "}
            Penalty applied when burning a wildcard blank on a low-scoring
            non-bingo move (&lt; 50 pts) when non-blank alternatives were within
            15 pts.
          </li>
        </ul>

        <div style={{ textAlign: "center", marginTop: "10px" }}>
          <button className="win98-button" onClick={onClose}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
