"use client";

import React from "react";
import { useDraggable } from "./useDraggable";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

/**
 * BlankTileModal - Modal for designating the blank / wildcard tile letter.
 */
export default function BlankTileModal({ isOpen, onClose, onSelectLetter }) {
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
        width: "300px",
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
        <span>Select Blank Tile</span>
        <button className="win98-button win98-btn-sys" onClick={onClose}>
          X
        </button>
      </div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "4px",
          justifyContent: "center",
        }}
      >
        {LETTERS.map((letter) => (
          <button
            key={letter}
            className="win98-button"
            style={{
              width: "28px",
              height: "28px",
              fontWeight: "bold",
              fontSize: "14px",
            }}
            onClick={() => onSelectLetter(letter)}
          >
            {letter}
          </button>
        ))}
      </div>
      <div
        style={{
          marginTop: "10px",
          fontSize: "11px",
          textAlign: "center",
          color: "#444",
        }}
      >
        Or press any letter key (Esc to cancel)
      </div>
    </div>
  );
}
