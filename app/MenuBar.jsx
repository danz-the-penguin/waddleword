"use client";

import React from "react";
import { playButtonClick } from "./soundEffects";

/**
 * MenuBar - Authentic Windows 98 menu bar for WaddleWord.
 */
export default function MenuBar({ onOpenTutorial, onOpenHelp }) {
  return (
    <div className="win98-menubar">
      <span className="menu-item">
        <u>F</u>ile
      </span>
      <span className="menu-item">
        <u>E</u>dit
      </span>
      <span className="menu-item">
        <u>V</u>iew
      </span>
      <span
        className="menu-item"
        style={{ cursor: "pointer" }}
        onClick={() => {
          playButtonClick();
          onOpenTutorial();
        }}
      >
        <u>T</u>utorial
      </span>
      <span
        className="menu-item"
        style={{ cursor: "pointer" }}
        onClick={() => {
          playButtonClick();
          onOpenHelp();
        }}
      >
        <u>H</u>elp
      </span>
    </div>
  );
}
