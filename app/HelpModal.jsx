"use client";

import React from "react";
import { useDraggable } from "./useDraggable";

/**
 * HelpModal - Displays keyboard shortcut references and development credits.
 */
export default function HelpModal({ isOpen, onClose }) {
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
        width: "360px",
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
        <span>Help & Hotkeys</span>
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
          Keyboard Shortcuts
        </h4>
        <ul
          style={{
            paddingLeft: "20px",
            margin: "0 0 12px 0",
            color: "#222",
          }}
        >
          <li style={{ marginBottom: "4px" }}>
            <strong>Arrow Keys:</strong> Move the cursor around the board.
          </li>
          <li style={{ marginBottom: "4px" }}>
            <strong>Shift + Arrow Keys:</strong> Change typing direction (►, ◄,
            ▼, ▲) without moving.
          </li>
          <li style={{ marginBottom: "4px" }}>
            <strong>Spacebar:</strong> Toggle typing direction.
          </li>
          <li style={{ marginBottom: "4px" }}>
            <strong>? or / :</strong> Open the Blank Tile selector. Click a
            letter or press it on your keyboard to place a 0-point tile.
          </li>
          <li style={{ marginBottom: "4px" }}>
            <strong>Tab:</strong> Select the top suggested play to reveal its
            Math (Value = Score + Leave Equity) and Next-Turn Bingo Probability.
          </li>
          <li style={{ marginBottom: "4px" }}>
            <strong>Alt + O:</strong> Switch between &quot;My Play&quot; and
            &quot;Opponent Play&quot;.
          </li>
          <li>
            <strong>Ctrl + Z / Y:</strong> Undo or Redo board history.
          </li>
        </ul>

        <h4
          style={{
            margin: "12px 0 8px 0",
            color: "var(--w98-title-start)",
          }}
        >
          Credits &amp; Acknowledgments
        </h4>
        <div style={{ fontSize: "11px", color: "#333" }}>
          This project stands on the shoulders of giants within the computer
          science and competitive word game communities:
          <ul
            style={{
              paddingLeft: "16px",
              margin: "8px 0",
              listStyleType: "square",
            }}
          >
            <li style={{ marginBottom: "6px" }}>
              <strong>Kamil Mielnik (Scrabble Solver):</strong> Pioneer of
              open-source web-based board solvers, whose work served as an
              architectural reference and inspiration.
            </li>
            <li style={{ marginBottom: "6px" }}>
              <strong>Quackle:</strong> The gold-standard open-source crossword
              AI. The endgame synergy weights were extracted directly from
              Quackle&apos;s pre-calculated strategy datasets.
            </li>
            <li style={{ marginBottom: "6px" }}>
              <strong>Woogles.io &amp; Cross-Tables.com:</strong> For providing
              an incredible open platform, UI workflows, and exhaustive public
              archives of Grandmaster .gcg tournament files.
            </li>
            <li style={{ marginBottom: "6px" }}>
              <strong>Steven A. Gordon:</strong> For formulating the GADDAG
              Data Structure (1994), the deterministic acyclic finite state
              automaton that powers this engine&apos;s move generation.
            </li>
            <li style={{ marginBottom: "6px" }}>
              <strong>Albert Zobrist:</strong> For Zobrist Hashing, used within
              the Transposition Table to cache board states in O(1) time during
              Alpha-Beta pruning.
            </li>
            <li style={{ marginBottom: "6px" }}>
              <strong>NASPA &amp; WESPA:</strong> For the curation and
              maintenance of the official competitive Scrabble lexicons (NWL and
              CSW).
            </li>
            <li style={{ marginBottom: "6px" }}>
              <strong>PCG (Permuted Congruential Generator):</strong> For the
              performant pseudo-random number generator used directly within the
              WGSL Compute Shader.
            </li>
            <li style={{ marginBottom: "6px" }}>
              <strong>Sierra On-Line (Hoyle Classic Games):</strong> A primary
              design inspiration for the customized, wooden Windows 98
              aesthetic.
            </li>
          </ul>
        </div>

        <div style={{ textAlign: "center", marginTop: "10px" }}>
          <button className="win98-button" onClick={onClose}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
