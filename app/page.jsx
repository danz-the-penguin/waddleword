"use client";

import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
} from "react";
import localforage from "localforage";
import Link from "next/link";
import "./scrabble.css";
import { COLUMNS, BOARD_PRESETS } from "./presets";
import BoardCell from "./BoardCell";
import ResultCard from "./ResultCard";
import UnseenTileTracker from "./UnseenTileTracker";
import FloatingDefinitionTooltip from "./FloatingDefinitionTooltip";
import { useDebounce } from "./useDebounce";
import { useScrabbleHistory } from "./useScrabbleHistory";
import { useSolverWorker } from "./useSolverWorker";
import { parseGcgFile } from "./gcgParser";
import { useDictionaryWorker } from "./useDictionaryWorker";
import RefereeChecker from "./RefereeChecker";
import { playTileClack, playWin98Chord, playButtonClick } from "./soundEffects";
import { useDraggable } from "./useDraggable";

export default function WaddleWord() {
  // State to track the active visual theme ("classic" or "wood")
  const [theme, setTheme] = useState("classic");
  const [activePresetKey, setActivePresetKey] = useState("plato_literati");

  const [activeLexicon, setActiveLexicon] = useState("nwl2023");
  const [sortMode, setSortMode] = useState("value");

  // Opponent Intel & Deduction State
  const [enableIntel, setEnableIntel] = useState(true);
  const [showIntelSettings, setShowIntelSettings] = useState(false);
  const [intelMode, setIntelMode] = useState("auto");
  const [manualAvailableTiles, setManualAvailableTiles] = useState("");
  const [equityMode, setEquityMode] = useState("static");

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("/sw.js").catch((err) => {
          console.warn("Service Worker registration failed:", err);
        });
      });
    }
  }, []);

  const [rack, setRack] = useState("REOPMAJ");
  const [hoveredPlay, setHoveredPlay] = useState(null);
  const [blankPrompt, setBlankPrompt] = useState(null);
  const helpDrag = useDraggable();
  const tutorialDrag = useDraggable();
  const blankDrag = useDraggable();
  const [showHelp, setShowHelp] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [matchHistory, setMatchHistory] = useState([]);
  const [currentTurnIdx, setCurrentTurnIdx] = useState(-1);
  const [isBoardLocked, setIsBoardLocked] = useState(true);
  const [typingDir, setTypingDir] = useState("Right");

  const [myScore, setMyScore] = useState("");
  const [oppScore, setOppScore] = useState("");
  const [inputMode, setInputMode] = useState("me"); // "me" | "opp"

  const [board, setBoard] = useState(() =>
    Array(15)
      .fill(null)
      .map(() => Array(15).fill("")),
  );

  const [tileOwners, setTileOwners] = useState(() =>
    Array(15)
      .fill(null)
      .map(() => Array(15).fill("")),
  );

  const [selectedCell, setSelectedCell] = useState([7, 7]);

  const activePreset =
    BOARD_PRESETS[activePresetKey] || BOARD_PRESETS.plato_literati;

  const [showHeatmap, setShowHeatmap] = useState(false);
  const dangerSquares = useMemo(() => {
    if (!showHeatmap) return new Map();
    const dangers = new Map();
    for (let r = 0; r < 15; r++) {
      for (let c = 0; c < 15; c++) {
        if (board[r][c]) continue;
        const premium = activePreset.premiums[`${r},${c}`];
        if (premium === "3W" || premium === "2W") {
          const setDanger = (nr, nc, level) => {
            const current = dangers.get(`${nr},${nc}`);
            const priority = {
              "3W-center": 4,
              "3W-adj": 3,
              "2W-center": 2,
              "2W-adj": 1,
            };
            if (!current || priority[level] > priority[current]) {
              dangers.set(`${nr},${nc}`, level);
            }
          };
          setDanger(r, c, `${premium}-center`);
          if (r > 0 && !board[r - 1][c]) setDanger(r - 1, c, `${premium}-adj`);
          if (r < 14 && !board[r + 1][c]) setDanger(r + 1, c, `${premium}-adj`);
          if (c > 0 && !board[r][c - 1]) setDanger(r, c - 1, `${premium}-adj`);
          if (c < 14 && !board[r][c + 1]) setDanger(r, c + 1, `${premium}-adj`);
        }
      }
    }
    return dangers;
  }, [board, showHeatmap, activePreset]);

  const deferredBoard = useDebounce(board, 250);
  const deferredRack = useDebounce(rack, 250);

  const {
    past,
    setPast,
    future,
    setFuture,
    pushHistory,
    handleUndo,
    handleRedo,
  } = useScrabbleHistory(
    board,
    setBoard,
    rack,
    setRack,
    tileOwners,
    setTileOwners,
    myScore,
    setMyScore,
    oppScore,
    setOppScore,
    setHoveredPlay,
  );

  const scoreDifferential = (Number(myScore) || 0) - (Number(oppScore) || 0);

  const { candidatePlays, isSolving, checkWord, wordCheckResult, gpuEnabled } =
    useSolverWorker(
      deferredRack,
      deferredBoard,
      activePreset,
      activeLexicon,
      sortMode,
      enableIntel,
      intelMode,
      manualAvailableTiles,
      scoreDifferential,
      equityMode,
    );

  const { isReady: dictReady, lookupWord } = useDictionaryWorker();

  useEffect(() => {
    if (dictReady) setLoading(false);
  }, [dictReady]);

  const handlePresetChange = (key) => {
    setActivePresetKey(key);
    const def = BOARD_PRESETS[key]?.defaultLexicon;
    if (def === "twl") {
      setActiveLexicon("nwl2023");
    } else if (def === "sowpods") {
      setActiveLexicon("csw24");
    }
  };

  // Persistence: Load
  useEffect(() => {
    localforage
      .getItem("waddleword_saved_game")
      .then((saved) => {
        if (!saved) return localforage.getItem("scpro_saved_game");
        return saved;
      })
      .then((saved) => {
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.board) setBoard(parsed.board);
          if (parsed.tileOwners) setTileOwners(parsed.tileOwners);
          if (parsed.rack) setRack(parsed.rack);
          if (parsed.past) setPast(parsed.past);
          if (parsed.future) setFuture(parsed.future);
          if (parsed.theme) setTheme(parsed.theme);
        }
      })
      .catch((e) => console.error("Failed to load state", e));
  }, [setBoard, setTileOwners, setRack, setPast, setFuture]);

  // Persistence: Save
  useEffect(() => {
    const timer = setTimeout(() => {
      localforage
        .setItem(
          "waddleword_saved_game",
          JSON.stringify({ board, tileOwners, rack, past, future, theme }),
        )
        .catch((e) => console.error(e));
    }, 1000);
    return () => clearTimeout(timer);
  }, [board, tileOwners, rack, past, future, theme]);

  const exportGame = () => {
    const data = JSON.stringify({
      board,
      tileOwners,
      rack,
      past,
      future,
      activePresetKey,
      intelMode,
      manualAvailableTiles,
    });
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `waddleword_game_${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importGame = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        if (parsed.board) setBoard(parsed.board);
        if (parsed.tileOwners) setTileOwners(parsed.tileOwners);
        if (parsed.rack) setRack(parsed.rack);
        if (parsed.past) setPast(parsed.past);
        if (parsed.future) setFuture(parsed.future);
        if (parsed.activePresetKey) setActivePresetKey(parsed.activePresetKey);
        if (parsed.intelMode) setIntelMode(parsed.intelMode);
        if (parsed.manualAvailableTiles)
          setManualAvailableTiles(parsed.manualAvailableTiles);
      } catch (err) {
        alert("Failed to parse game file.");
      }
    };
    reader.readAsText(file);
    e.target.value = null; // reset
  };

  const boardRef = useRef(board);
  const selectedCellRef = useRef(selectedCell);
  const inputModeRef = useRef(inputMode);
  const mobileInputRef = useRef(null);
  const tileOwnersRef = useRef(tileOwners);
  const candidatePlaysRef = useRef(candidatePlays);
  const blankPromptRef = useRef(null);
  const typingDirRef = useRef(typingDir);
  const isBoardLockedRef = useRef(isBoardLocked);

  useEffect(() => {
    boardRef.current = board;
    selectedCellRef.current = selectedCell;
    inputModeRef.current = inputMode;
    tileOwnersRef.current = tileOwners;
    candidatePlaysRef.current = candidatePlays;
    blankPromptRef.current = blankPrompt;
    typingDirRef.current = typingDir;
    isBoardLockedRef.current = isBoardLocked;
  }, [board, selectedCell, inputMode, tileOwners, candidatePlays, blankPrompt, typingDir, isBoardLocked]);

  useEffect(() => {
    const findNextTargetCell = (b, startR, startC, dir) => {
      let currR = startR;
      let currC = startC;
      const isAcross = ["Right", "Left"].includes(dir);
      const stepR = isAcross ? 0 : dir === "Down" ? 1 : -1;
      const stepC = isAcross ? (dir === "Right" ? 1 : -1) : 0;

      // Check up to 15 steps forward
      for (let i = 0; i < 15; i++) {
        currR += stepR;
        currC += stepC;
        if (currR < 0 || currR > 14 || currC < 0 || currC > 14) {
          return [startR, startC]; // Stay put if edge reached
        }
        if (!b[currR][currC]) {
          return [currR, currC]; // Return first empty cell found
        }
      }
      return [startR, startC];
    };

    const handleKeyDown = (e) => {
      if (e.key === "Tab") {
        e.preventDefault();
        const topPlays = candidatePlaysRef.current;
        if (topPlays && topPlays.length > 0) {
          setHoveredPlay((prev) => (prev ? null : topPlays[0]));
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        if (
          document.activeElement &&
          document.activeElement.tagName === "INPUT" &&
          document.activeElement.id !== "hidden-board-input"
        )
          return;
        e.preventDefault();
        handleUndo();
        return;
      }

      if (e.altKey && e.code === "KeyO") {
        e.preventDefault();
        setInputMode((m) => (m === "me" ? "opp" : "me"));
        return;
      }

      if (isBoardLockedRef.current) return;

      if (blankPromptRef.current) {
        e.preventDefault();
        if (/^[a-zA-Z]$/.test(e.key)) {
          setBlankPrompt(null);
          setTimeout(
            () =>
              window.dispatchEvent(
                new KeyboardEvent("keydown", {
                  key: e.key.toUpperCase(),
                  shiftKey: true,
                }),
              ),
            10,
          );
        } else if (e.key === "Escape") setBlankPrompt(null);
        return;
      }

      if (
        document.activeElement &&
        document.activeElement.tagName === "INPUT" &&
        document.activeElement.id !== "hidden-board-input"
      )
        return;

      const currentCell = selectedCellRef.current;
      if (!currentCell) return;
      const [r, c] = currentCell;

      if (e.key === " ") {
        e.preventDefault();
        setTypingDir((d) => (["Right", "Left"].includes(d) ? "Down" : "Right"));
        return;
      }

      if (e.key === "?" || e.key === "/") {
        e.preventDefault();
        setBlankPrompt(true);
        return;
      }

      const currentBoard = boardRef.current;
      const currentOwner = tileOwnersRef.current;
      const currentTypingDir = typingDirRef.current;

      if (/^[a-zA-Z]$/.test(e.key)) {
        const typedChar = e.shiftKey ? e.key.toLowerCase() : e.key.toUpperCase();
        const existingTile = currentBoard[r][c];
        const existingOwner = currentOwner[r][c];
        const opponentMode = inputModeRef.current === "me" ? "opp" : "me";

        playTileClack();

        if (existingTile && existingOwner === opponentMode) {
          if (existingTile.toUpperCase() === typedChar.toUpperCase()) {
            setSelectedCell(findNextTargetCell(currentBoard, r, c, currentTypingDir));
          }
        } else {
          pushHistory();
          setBoard((prev) => {
            const next = prev.map((row) => [...row]);
            next[r][c] = typedChar;
            return next;
          });
          setTileOwners((prev) => {
            const next = prev.map((row) => [...row]);
            next[r][c] = inputModeRef.current;
            return next;
          });
          setSelectedCell(findNextTargetCell(currentBoard, r, c, currentTypingDir));
        }
      } else if (e.key === "Backspace") {
        e.preventDefault();
        playTileClack();
        const opponentMode = inputModeRef.current === "me" ? "opp" : "me";
        const stepR = currentTypingDir === "Down" ? -1 : currentTypingDir === "Up" ? 1 : 0;
        const stepC = currentTypingDir === "Right" ? -1 : currentTypingDir === "Left" ? 1 : 0;

        const clearCell = (tr, tc) => {
          setBoard((prev) => {
            const n = prev.map((row) => [...row]);
            n[tr][tc] = "";
            return n;
          });
          setTileOwners((prev) => {
            const n = prev.map((row) => [...row]);
            n[tr][tc] = "";
            return n;
          });
        };

        if (currentBoard[r][c] && currentOwner[r][c] !== opponentMode) {
          pushHistory();
          clearCell(r, c);
        } else {
          let nR = r + stepR,
            nC = c + stepC;
          while (
            nR >= 0 &&
            nR < 15 &&
            nC >= 0 &&
            nC < 15 &&
            currentOwner[nR][nC] === opponentMode
          ) {
            nR += stepR;
            nC += stepC;
          }
          if (nR >= 0 && nR < 15 && nC >= 0 && nC < 15) {
            if (currentBoard[nR][nC] && currentOwner[nR][nC] !== opponentMode) {
              pushHistory();
              clearCell(nR, nC);
            }
            setSelectedCell([nR, nC]);
          }
        }
      } else if (e.key === "Delete") {
        const isOpponentTile =
          currentOwner[r][c] === (inputModeRef.current === "me" ? "opp" : "me");
        if (isOpponentTile) return;
        pushHistory();
        setBoard((prev) => {
          const next = prev.map((row) => [...row]);
          next[r][c] = "";
          return next;
        });
        setTileOwners((prev) => {
          const next = prev.map((row) => [...row]);
          next[r][c] = "";
          return next;
        });
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        if (e.shiftKey) setTypingDir("Right");
        else if (c < 14) setSelectedCell([r, c + 1]);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (e.shiftKey) setTypingDir("Left");
        else if (c > 0) setSelectedCell([r, c - 1]);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        if (e.shiftKey) setTypingDir("Down");
        else if (r < 14) setSelectedCell([r + 1, c]);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (e.shiftKey) setTypingDir("Up");
        else if (r > 0) setSelectedCell([r - 1, c]);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleUndo, pushHistory]);

  const applyHistoricalTurn = useCallback(
    (turn) => {
      pushHistory();
      setBoard(turn.board);
      setTileOwners(turn.tileOwners);
      setMyScore(turn.myScore.toString());
      setOppScore(turn.oppScore.toString());
      setInputMode(turn.player);
      setRack(turn.rack.replace(/[^A-Za-z?]/g, "").toUpperCase());
    },
    [pushHistory],
  );

  const handleGcgUpload = useCallback(
    (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const history = parseGcgFile(ev.target.result);
        if (history.length > 0) {
          setMatchHistory(history);
          const lastIdx = history.length - 1;
          setCurrentTurnIdx(lastIdx);
          applyHistoricalTurn(history[lastIdx]);
        }
      };
      reader.readAsText(file);
    },
    [applyHistoricalTurn],
  );

  const clearBoard = useCallback(() => {
    pushHistory();
    setBoard(
      Array(15)
        .fill(null)
        .map(() => Array(15).fill("")),
    );
    setTileOwners(
      Array(15)
        .fill(null)
        .map(() => Array(15).fill("")),
    );
    setHoveredPlay(null);
  }, [pushHistory]);

  const previewMap = useMemo(() => {
    if (!hoveredPlay) return {};
    const plays = Array.isArray(hoveredPlay) ? hoveredPlay : [hoveredPlay];
    const map = {};
    for (const p of plays) {
      if (!p || p.dir === "EXCH") continue;
      const { word, row, col, dir } = p;
      for (let i = 0; i < word.length; i++) {
        const r = dir === "V" ? row + i : row;
        const c = dir === "H" ? col + i : col;
        map[`${r},${c}`] = word[i];
      }
    }
    return map;
  }, [hoveredPlay]);

  const applyPlay = useCallback(
    (play, isOpponentFlag) => {
      const isOpp =
        isOpponentFlag === true ? true : inputModeRef.current === "opp";
      pushHistory();
      if (play.dir !== "EXCH") {
        setBoard((prev) => {
          const next = prev.map((row) => [...row]);
          for (let i = 0; i < play.word.length; i++) {
            const r = play.dir === "V" ? play.row + i : play.row;
            const c = play.dir === "H" ? play.col + i : play.col;
            next[r][c] = play.word[i];
          }
          return next;
        });
        setTileOwners((prev) => {
          const next = prev.map((row) => [...row]);
          for (let i = 0; i < play.word.length; i++) {
            const r = play.dir === "V" ? play.row + i : play.row;
            const c = play.dir === "H" ? play.col + i : play.col;
            if (!prev[r][c]) {
              next[r][c] = isOpp ? "opp" : "me";
            }
          }
          return next;
        });
      }

      if (!isOpp) {
        setRack((prevRack) => {
          let currentRack = prevRack.toUpperCase().split("");
          for (let i = 0; i < play.word.length; i++) {
            if (play.dir !== "EXCH") {
              const r = play.dir === "V" ? play.row + i : play.row;
              const c = play.dir === "H" ? play.col + i : play.col;
              if (board[r][c]) continue;
            }
            const isBlank = play.word[i] >= "a" && play.word[i] <= "z";
            const char = play.word[i].toUpperCase();
            if (isBlank) {
              const wildcardIdx = currentRack.findIndex((ch) =>
                ["?", ".", "0", "*", "_"].includes(ch),
              );
              if (wildcardIdx !== -1) currentRack.splice(wildcardIdx, 1);
            } else {
              const idx = currentRack.indexOf(char);
              if (idx !== -1) {
                currentRack.splice(idx, 1);
              } else {
                const wildcardIdx = currentRack.findIndex((ch) =>
                  ["?", ".", "0", "*", "_"].includes(ch),
                );
                if (wildcardIdx !== -1) currentRack.splice(wildcardIdx, 1);
              }
            }
          }
          return currentRack.join("");
        });
      }

      setHoveredPlay(null);
    },
    [board, pushHistory],
  );

  const handleCellClick = useCallback(
    (r, c) => {
      if (isBoardLocked) setIsBoardLocked(false);
      if (mobileInputRef.current) mobileInputRef.current.focus();
      setSelectedCell((prev) => {
        if (!prev) return [r, c];
        if (prev[0] === r && prev[1] === c) {
          setTypingDir((d) => (d === "H" ? "V" : "H"));
          return [r, c];
        }
        return [r, c];
      });
    },
    [isBoardLocked],
  );

  const handleHoverPlay = useCallback((play) => setHoveredPlay(play), []);
  const handleLeavePlay = useCallback(() => setHoveredPlay(null), []);

  const handleRackChange = (val) => {
    const sanitized = val.toUpperCase().replace(/[^A-Z?.*_0]/g, "").slice(0, 7);
    setRack(sanitized);
  };

  return (
    <div className={`win98-body ${theme === "wood" ? "theme-hoyle" : ""}`}>
      <div className="win98-container">
        <div className="win98-window">
          <div className="win98-titlebar">
            <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <div
                style={{
                  width: "16px",
                  height: "16px",
                  background: "var(--w98-surface)",
                  color: "#000",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: "bold",
                  border: "1px solid",
                  borderColor:
                    "var(--w98-border-light) var(--w98-border-dark) var(--w98-border-dark) var(--w98-border-light)",
                }}
              >
                W
              </div>
              WaddleWord_v3.exe - [Multi-Lexicon Control Panel]
            </span>
            <div style={{ display: "flex", gap: "2px" }}>
              <button className="win98-button win98-btn-sys" disabled>
                _
              </button>
              <button className="win98-button win98-btn-sys" disabled>
                □
              </button>
              <button
                className="win98-button win98-btn-sys"
                onClick={() =>
                  (window.location.href = "https://penguins-portfolio.vercel.app")
                }
              >
                ✕
              </button>
            </div>
          </div>

          {/* Classic Windows 98 Menu Bar for authentic desktop feel */}
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
                setShowTutorial(true);
              }}
            >
              <u>T</u>utorial
            </span>
            <span
              className="menu-item"
              style={{ cursor: "pointer" }}
              onClick={() => {
                playButtonClick();
                setShowHelp(true);
              }}
            >
              <u>H</u>elp
            </span>
          </div>

          <div className="win98-content">
            {/* Toolbar Controls */}
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
                      onChange={(e) => handlePresetChange(e.target.value)}
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
                      onChange={(e) => setSortMode(e.target.value)}
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
                      onChange={(e) => setActiveLexicon(e.target.value)}
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
                      onChange={(e) => setEquityMode(e.target.value)}
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
                    onClick={() => setIsBoardLocked((prev) => !prev)}
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
                    onClick={() => setShowHeatmap((prev) => !prev)}
                  >
                    Heatmap: {showHeatmap ? "ON" : "OFF"}
                  </button>
                  <button
                    className="win98-button"
                    style={{ fontWeight: "bold" }}
                    onClick={() =>
                      setTypingDir((prev) => (prev === "H" ? "V" : "H"))
                    }
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
                      opacity: past.length === 0 ? 0.5 : 1,
                      cursor: past.length === 0 ? "not-allowed" : "pointer",
                    }}
                    onClick={handleUndo}
                    disabled={past.length === 0}
                    title="Undo last play or change (Ctrl+Z)"
                  >
                    ↶ Undo
                  </button>
                  <button
                    className="win98-button"
                    style={{
                      fontWeight: "bold",
                      opacity: future.length === 0 ? 0.5 : 1,
                      cursor: future.length === 0 ? "not-allowed" : "pointer",
                    }}
                    onClick={handleRedo}
                    disabled={future.length === 0}
                    title="Redo undone play or change (Ctrl+Y)"
                  >
                    Redo ↷
                  </button>
                  <button className="win98-button" onClick={clearBoard}>
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
                    onClick={exportGame}
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
                      onChange={importGame}
                      style={{ display: "none" }}
                    />
                  </label>
                  <button
                    className="win98-button"
                    onClick={() =>
                      setTheme((t) => (t === "classic" ? "wood" : "classic"))
                    }
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
                        setMyScore(e.target.value.replace(/[^0-9]/g, ""))
                      }
                    />
                  </label>
                  <button
                    className="win98-button"
                    onClick={() =>
                      setInputMode((m) => (m === "me" ? "opp" : "me"))
                    }
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
                        setOppScore(e.target.value.replace(/[^0-9]/g, ""))
                      }
                    />
                  </label>
                </div>
              </div>
            </div>

            <div className="v3-layout">
              <div>
                <input
                  id="hidden-board-input"
                  ref={mobileInputRef}
                  type="text"
                  autoCapitalize="characters"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck="false"
                  style={{
                    position: "fixed",
                    top: "-100px",
                    left: "-100px",
                    opacity: 0,
                    fontSize: "16px",
                  }}
                  value=" "
                  onChange={(e) => {
                    const val = e.target.value;
                    e.target.value = " "; // Reset
                    if (val.length > 1) {
                      const char = val.charAt(1);
                      if (/^[a-zA-Z]$/.test(char)) {
                        window.dispatchEvent(
                          new KeyboardEvent("keydown", {
                            key: char.toUpperCase(),
                            shiftKey: false,
                          }),
                        );
                      } else if (char === "?") {
                        window.dispatchEvent(
                          new KeyboardEvent("keydown", { key: "?" }),
                        );
                      }
                    } else if (val.length === 0) {
                      window.dispatchEvent(
                        new KeyboardEvent("keydown", { key: "Backspace" }),
                      );
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.altKey || e.ctrlKey || e.metaKey) {
                      e.preventDefault();
                      return;
                    }
                    if (
                      /^[a-zA-Z]$/.test(e.key) ||
                      e.key === "Backspace" ||
                      e.key === "Delete" ||
                      e.key === " " ||
                      e.key === "?"
                    ) {
                      e.preventDefault();
                    }
                  }}
                />
                <div className="board-grid-container win98-inset">
                  <div className="board-grid">
                    <div className="board-header"></div>
                    {COLUMNS.map((col) => (
                      <div key={col} className="board-header">
                        {col}
                      </div>
                    ))}

                    {board.map((row, r) => (
                      <React.Fragment key={`row-${r}`}>
                        <div className="board-header">{r + 1}</div>
                        {row.map((tileVal, c) => {
                          const isSelected =
                            !isBoardLocked &&
                            selectedCell &&
                            selectedCell[0] === r &&
                            selectedCell[1] === c;
                          const isInActiveLine =
                            !isBoardLocked &&
                            selectedCell &&
                            (["Right", "Left"].includes(typingDir)
                              ? selectedCell[0] === r
                              : selectedCell[1] === c);
                          const previewChar = previewMap[`${r},${c}`];
                          const premium = activePreset.premiums[`${r},${c}`];

                          return (
                            <BoardCell
                              key={`${r}-${c}`}
                              r={r}
                              c={c}
                              dangerType={dangerSquares.get(`${r},${c}`)}
                              tileVal={tileVal}
                              previewChar={previewChar}
                              premium={premium}
                              isSelected={isSelected}
                              isInActiveLine={isInActiveLine}
                              typingDir={typingDir}
                              onClick={handleCellClick}
                              owner={tileOwners[r][c]}
                              scores={activePreset?.scores}
                            />
                          );
                        })}
                      </React.Fragment>
                    ))}
                  </div>
                </div>

                <div
                  className="win98-window"
                  style={{
                    marginTop: "10px",
                    padding: "4px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    backgroundColor: "var(--w98-bg)",
                  }}
                >
                  <div style={{ display: "flex", gap: "4px" }}>
                    <button
                      className="win98-button"
                      disabled={currentTurnIdx <= 0}
                      onClick={() => {
                        const newIdx = 0;
                        setCurrentTurnIdx(newIdx);
                        applyHistoricalTurn(matchHistory[newIdx]);
                      }}
                    >
                      [|◄]
                    </button>
                    <button
                      className="win98-button"
                      disabled={currentTurnIdx <= 0}
                      onClick={() => {
                        const newIdx = currentTurnIdx - 1;
                        setCurrentTurnIdx(newIdx);
                        applyHistoricalTurn(matchHistory[newIdx]);
                      }}
                    >
                      [◄]
                    </button>
                    <div
                      className="win98-inset"
                      style={{
                        padding: "2px 8px",
                        minWidth: "120px",
                        textAlign: "center",
                        backgroundColor: "#fff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {matchHistory.length > 0
                        ? `Turn ${currentTurnIdx + 1} / ${matchHistory.length}`
                        : "No Match Loaded"}
                    </div>
                    <button
                      className="win98-button"
                      disabled={currentTurnIdx >= matchHistory.length - 1}
                      onClick={() => {
                        const newIdx = currentTurnIdx + 1;
                        setCurrentTurnIdx(newIdx);
                        applyHistoricalTurn(matchHistory[newIdx]);
                      }}
                    >
                      [►]
                    </button>
                    <button
                      className="win98-button"
                      disabled={currentTurnIdx >= matchHistory.length - 1}
                      onClick={() => {
                        const newIdx = matchHistory.length - 1;
                        setCurrentTurnIdx(newIdx);
                        applyHistoricalTurn(matchHistory[newIdx]);
                      }}
                    >
                      [►|]
                    </button>
                  </div>
                  <div
                    style={{
                      position: "relative",
                      overflow: "hidden",
                      display: "inline-block",
                    }}
                  >
                    <button className="win98-button">📂 Load .GCG</button>
                    <input
                      type="file"
                      accept=".gcg"
                      onChange={handleGcgUpload}
                      style={{
                        position: "absolute",
                        left: 0,
                        top: 0,
                        opacity: 0,
                        width: "100%",
                        height: "100%",
                        cursor: "pointer",
                      }}
                    />
                  </div>
                </div>

                <UnseenTileTracker
                  board={board}
                  rack={rack}
                  activePreset={activePreset}
                  enableIntel={enableIntel}
                  intelMode={intelMode}
                  manualAvailableTiles={manualAvailableTiles}
                />
                <RefereeChecker
                  activeLexicon={activeLexicon}
                  activePreset={activePreset}
                  checkWord={checkWord}
                  lookupWord={lookupWord}
                  onInvalidWord={playWin98Chord}
                  wordCheckResult={wordCheckResult}
                />
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                }}
              >
                {/* Physical Wooden Rack Tray & Input */}
                <div className="rack-container">
                  <label
                    style={{
                      fontSize: "11px",
                      fontWeight: "bold",
                      display: "block",
                      marginBottom: "4px",
                    }}
                  >
                    Your Rack Tiles:
                  </label>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <input
                      type="text"
                      maxLength={7}
                      className="win98-input"
                      style={{ fontSize: "14px", padding: "4px 6px" }}
                      value={rack}
                      onChange={(e) => handleRackChange(e.target.value)}
                      placeholder="E.g. REOPMAJ? or ? for blank"
                    />
                    <button
                      className="win98-button"
                      onClick={() =>
                        setRack((r) =>
                          r
                            .split("")
                            .sort(() => Math.random() - 0.5)
                            .join(""),
                        )
                      }
                    >
                      Shuffle
                    </button>
                  </div>

                  {/* Tray Display */}
                  <div className="rack-tray">
                    {rack.trim().length === 0 ? (
                      <span
                        style={{
                          fontSize: "11px",
                          color: "#d4a373",
                          fontStyle: "italic",
                          padding: "4px",
                        }}
                      >
                        Empty rack (Type letters above)...
                      </span>
                    ) : (
                      rack.split("").map((ch, idx) => {
                        const isBlank = ["?", ".", "0", "*", "_"].includes(ch);
                        const score = isBlank
                          ? 0
                          : (activePreset?.scores?.[ch.toLowerCase()] ?? 0);
                        return (
                          <div
                            key={idx}
                            className="scrabble-tile-rack"
                            title={
                              isBlank
                                ? "Blank / Wildcard Tile (0 pts)"
                                : `${ch.toUpperCase()} (${score} pts)`
                            }
                          >
                            <span>{isBlank ? "" : ch.toUpperCase()}</span>
                            {!isBlank && (
                              <sub className="tile-score-sub">{score}</sub>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Opponent Intel & Prediction Module */}
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
                        onChange={(e) => setEnableIntel(e.target.checked)}
                      />
                      Opponent Intel & Minimax Counter
                    </label>
                    <button
                      className="win98-button"
                      style={{ padding: "0 6px", fontSize: "10px" }}
                      onClick={() => setShowIntelSettings((prev) => !prev)}
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
                            onChange={() => setIntelMode("auto")}
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
                            onChange={() => setIntelMode("manual")}
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
                              setManualAvailableTiles(
                                e.target.value
                                  .toUpperCase()
                                  .replace(/[^A-Z?]/g, ""),
                              )
                            }
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div
                  className="win98-window"
                  style={{
                    flex: 1,
                    margin: 0,
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  <div className="win98-titlebar">
                    <span>Ranked Strategic Plays</span>
                    <span>
                      {isSolving
                        ? "Calculating..."
                        : `${candidatePlays.length} Found`}
                    </span>
                  </div>

                  <div className="win98-inset results-list">
                    {loading || isSolving ? (
                      <div
                        style={{
                          padding: "10px",
                          textAlign: "center",
                          fontSize: "11px",
                        }}
                      >
                        {loading
                          ? "Loading Lexicons..."
                          : "Calculating Best Plays & Counter-Responses..."}
                      </div>
                    ) : candidatePlays.length === 0 ? (
                      <div
                        style={{
                          padding: "10px",
                          textAlign: "center",
                          fontSize: "11px",
                        }}
                      >
                        No legal moves found for this board state.
                      </div>
                    ) : (
                      candidatePlays.slice(0, 50).map((play, idx) => {
                        const isExch = play.dir === "EXCH";
                        const colLetter = isExch ? "" : COLUMNS[play.col];
                        const rowNum = isExch ? "" : play.row + 1;
                        const notation = isExch
                          ? "EXCHANGE"
                          : play.dir === "H"
                            ? `${rowNum}${colLetter}`
                            : `${colLetter}${rowNum}`;

                        return (
                          <ResultCard
                            key={`${play.word}-${play.row}-${play.col}-${play.dir}-${idx}`}
                            play={play}
                            rack={rack}
                            notation={notation}
                            colLetter={colLetter}
                            rowNum={rowNum}
                            activeLexicon={activeLexicon}
                            activePreset={activePreset}
                            onHover={handleHoverPlay}
                            onLeave={handleLeavePlay}
                            onClick={applyPlay}
                          />
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

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
        </div>

        {showTutorial && (
          <div
            className="win98-window"
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: `translate(calc(-50% + ${tutorialDrag.position.x}px), calc(-50% + ${tutorialDrag.position.y}px))`,
              zIndex: 10000,
              padding: "10px",
              width: "400px",
              maxWidth: "95vw",
              boxShadow: "2px 2px 10px rgba(0,0,0,0.5)",
            }}
          >
            <div
              className="win98-titlebar"
              onPointerDown={tutorialDrag.handlePointerDown}
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "8px",
                cursor: "grab",
              }}
            >
              <span>Engine Tutorial & Math</span>
              <button
                className="win98-button win98-btn-sys"
                onClick={() => setShowTutorial(false)}
              >
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
                allows the bot to latch onto any tile on the board and instantly
                build words outward in both directions simultaneously, checking
                millions of permutations in milliseconds.
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
                <strong>Leave Equity:</strong> The statistical value of the tiles
                kept on your rack. Good letters (A, E, R, S, T, Blanks) have
                positive equity because they increase future Bingo chances.
                Clunky letters (Q, V, W) subtract equity.
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
                  Warning! This play opens a highly dangerous Triple Word Score
                  lane for your opponent.
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
                  A highly tactical placement that forms multiple intersecting
                  words at once.
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
                  Danger! This play retains toxic, uncooperative letter combinations (such as V+W, duplicate V, Q without U, or severe negative equity &le; -12 pts), drastically crippling your next draw.
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
                  Warning! Leaves 4+ vowels or triple duplicate vowels (e.g. I-I-I), leaving you vowel-heavy and drastically lowering your bingo odds.
                </li>
              </ul>

              <div style={{ textAlign: "center", marginTop: "10px" }}>
                <button
                  className="win98-button"
                  onClick={() => setShowTutorial(false)}
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        )}

        {showHelp && (
          <div
            className="win98-window"
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: `translate(calc(-50% + ${helpDrag.position.x}px), calc(-50% + ${helpDrag.position.y}px))`,
              zIndex: 10000,
              padding: "10px",
              width: "360px",
              boxShadow: "2px 2px 10px rgba(0,0,0,0.5)",
            }}
          >
            <div
              className="win98-titlebar"
              onPointerDown={helpDrag.handlePointerDown}
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "8px",
                cursor: "grab",
              }}
            >
              <span>Help & Hotkeys</span>
              <button
                className="win98-button win98-btn-sys"
                onClick={() => setShowHelp(false)}
              >
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
                  <strong>Shift + Arrow Keys:</strong> Change typing direction
                  (►, ◄, ▼, ▲) without moving.
                </li>
                <li style={{ marginBottom: "4px" }}>
                  <strong>Spacebar:</strong> Toggle typing direction.
                </li>
                <li style={{ marginBottom: "4px" }}>
                  <strong>? or / :</strong> Open the Blank Tile selector. Click
                  a letter or press it on your keyboard to place a 0-point tile.
                </li>
                <li style={{ marginBottom: "4px" }}>
                  <strong>Tab:</strong> Select the top suggested play to reveal
                  its Math (Value = Score + Leave Equity) and Next-Turn Bingo
                  Probability.
                </li>
                <li style={{ marginBottom: "4px" }}>
                  <strong>Alt + O:</strong> Switch between &quot;My Play&quot;
                  and &quot;Opponent Play&quot;.
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
                This project stands on the shoulders of giants within the
                computer science and competitive word game communities:
                <ul
                  style={{
                    paddingLeft: "16px",
                    margin: "8px 0",
                    listStyleType: "square",
                  }}
                >
                  <li style={{ marginBottom: "6px" }}>
                    <strong>Kamil Mielnik (Scrabble Solver):</strong> Pioneer of open-source
                    web-based board solvers, whose work served as an architectural reference and inspiration.
                  </li>
                  <li style={{ marginBottom: "6px" }}>
                    <strong>Quackle:</strong> The gold-standard open-source
                    crossword AI. The endgame synergy weights were extracted
                    directly from Quackle&apos;s pre-calculated strategy datasets.
                  </li>
                  <li style={{ marginBottom: "6px" }}>
                    <strong>Woogles.io &amp; Cross-Tables.com:</strong> For
                    providing an incredible open platform, UI workflows, and
                    exhaustive public archives of Grandmaster .gcg tournament
                    files.
                  </li>
                  <li style={{ marginBottom: "6px" }}>
                    <strong>Steven A. Gordon:</strong> For formulating the
                    GADDAG Data Structure (1994), the deterministic acyclic
                    finite state automaton that powers this engine&apos;s move
                    generation.
                  </li>
                  <li style={{ marginBottom: "6px" }}>
                    <strong>Albert Zobrist:</strong> For Zobrist Hashing, used
                    within the Transposition Table to cache board states in O(1)
                    time during Alpha-Beta pruning.
                  </li>
                  <li style={{ marginBottom: "6px" }}>
                    <strong>NASPA &amp; WESPA:</strong> For the curation and
                    maintenance of the official competitive Scrabble lexicons
                    (NWL and CSW).
                  </li>
                  <li style={{ marginBottom: "6px" }}>
                    <strong>PCG (Permuted Congruential Generator):</strong> For
                    the performant pseudo-random number generator used directly
                    within the WGSL Compute Shader.
                  </li>
                  <li style={{ marginBottom: "6px" }}>
                    <strong>Sierra On-Line (Hoyle Classic Games):</strong> A
                    primary design inspiration for the customized, wooden
                    Windows 98 aesthetic.
                  </li>
                </ul>
              </div>

              <div style={{ textAlign: "center", marginTop: "10px" }}>
                <button
                  className="win98-button"
                  onClick={() => setShowHelp(false)}
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        )}

        {blankPrompt && (
          <div
            className="win98-window"
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: `translate(calc(-50% + ${blankDrag.position.x}px), calc(-50% + ${blankDrag.position.y}px))`,
              zIndex: 10000,
              padding: "10px",
              width: "300px",
              boxShadow: "2px 2px 10px rgba(0,0,0,0.5)",
            }}
          >
            <div
              className="win98-titlebar"
              onPointerDown={blankDrag.handlePointerDown}
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "8px",
                cursor: "grab",
              }}
            >
              <span>Select Blank Tile</span>
              <button
                className="win98-button win98-btn-sys"
                onClick={() => setBlankPrompt(null)}
              >
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
              {"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((letter) => (
                <button
                  key={letter}
                  className="win98-button"
                  style={{
                    width: "28px",
                    height: "28px",
                    fontWeight: "bold",
                    fontSize: "14px",
                  }}
                  onClick={() => {
                    setBlankPrompt(null);
                    setTimeout(
                      () =>
                        window.dispatchEvent(
                          new KeyboardEvent("keydown", {
                            key: letter,
                            shiftKey: true,
                          }),
                        ),
                      10,
                    );
                  }}
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
        )}
        <FloatingDefinitionTooltip
          hoveredPlay={hoveredPlay}
          lookupWord={lookupWord}
          activeLexicon={activeLexicon}
          onLeave={() => setHoveredPlay(null)}
        />
      </div>
    </div>
  );
}
