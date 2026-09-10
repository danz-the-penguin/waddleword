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
import RefereeChecker from "./RefereeChecker";
import { useDebounce } from "./useDebounce";
import { useScrabbleHistory } from "./useScrabbleHistory";
import { useSolverWorker } from "./useSolverWorker";
import { parseGcgFile } from "./gcgParser";
import { useDictionaryWorker } from "./useDictionaryWorker";
import { playTileClack, playWin98Chord } from "./soundEffects";

// Modularized components extracted in Stage 5
import MenuBar from "./MenuBar";
import ControlPanel from "./ControlPanel";
import ReplayControls from "./ReplayControls";
import RackTray from "./RackTray";
import IntelPanel from "./IntelPanel";
import StatusBar from "./StatusBar";
import TutorialModal from "./TutorialModal";
import HelpModal from "./HelpModal";
import BlankTileModal from "./BlankTileModal";

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

  const handleSelectBlank = useCallback((letter) => {
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
  }, []);

  return (
    <div className={`win98-body ${theme === "wood" ? "theme-hoyle" : ""}`}>
      <div className="win98-container">
        <div className="win98-window">
          {/* Title Bar */}
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

          {/* Windows 98 Menu Bar */}
          <MenuBar
            onOpenTutorial={() => setShowTutorial(true)}
            onOpenHelp={() => setShowHelp(true)}
          />

          <div className="win98-content">
            {/* Toolbar Controls & Scoreboard */}
            <ControlPanel
              activePresetKey={activePresetKey}
              onPresetChange={handlePresetChange}
              BOARD_PRESETS={BOARD_PRESETS}
              sortMode={sortMode}
              onSortModeChange={setSortMode}
              activeLexicon={activeLexicon}
              onLexiconChange={setActiveLexicon}
              equityMode={equityMode}
              onEquityModeChange={setEquityMode}
              isBoardLocked={isBoardLocked}
              onToggleBoardLocked={() => setIsBoardLocked((prev) => !prev)}
              showHeatmap={showHeatmap}
              onToggleHeatmap={() => setShowHeatmap((prev) => !prev)}
              typingDir={typingDir}
              onToggleTypingDir={() =>
                setTypingDir((d) => (["Right", "Left", "H"].includes(d) ? "Down" : "Right"))
              }
              canUndo={past.length > 0}
              onUndo={handleUndo}
              canRedo={future.length > 0}
              onRedo={handleRedo}
              onClearBoard={clearBoard}
              onExportGame={exportGame}
              onImportGame={importGame}
              theme={theme}
              onToggleTheme={() =>
                setTheme((t) => (t === "classic" ? "wood" : "classic"))
              }
              myScore={myScore}
              onMyScoreChange={setMyScore}
              oppScore={oppScore}
              onOppScoreChange={setOppScore}
              inputMode={inputMode}
              onToggleInputMode={() =>
                setInputMode((m) => (m === "me" ? "opp" : "me"))
              }
            />

            <div className="v3-layout">
              {/* Left Column: Board and Game State Trackers */}
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

                {/* Replay Controls */}
                <ReplayControls
                  currentTurnIdx={currentTurnIdx}
                  matchHistory={matchHistory}
                  onSelectTurn={(newIdx) => {
                    setCurrentTurnIdx(newIdx);
                    applyHistoricalTurn(matchHistory[newIdx]);
                  }}
                  onGcgUpload={handleGcgUpload}
                />

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

              {/* Right Column: Rack, Opponent Intel & Candidate Plays */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                }}
              >
                {/* Physical Wooden Rack Tray & Input */}
                <RackTray
                  rack={rack}
                  onRackChange={handleRackChange}
                  onShuffle={() =>
                    setRack((r) =>
                      r
                        .split("")
                        .sort(() => Math.random() - 0.5)
                        .join(""),
                    )
                  }
                  scores={activePreset?.scores}
                />

                {/* Opponent Intel & Prediction Module */}
                <IntelPanel
                  enableIntel={enableIntel}
                  onToggleIntel={setEnableIntel}
                  showIntelSettings={showIntelSettings}
                  onToggleIntelSettings={() => setShowIntelSettings((prev) => !prev)}
                  intelMode={intelMode}
                  onIntelModeChange={setIntelMode}
                  manualAvailableTiles={manualAvailableTiles}
                  onManualAvailableTilesChange={setManualAvailableTiles}
                />

                {/* Ranked Strategic Plays List */}
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

          {/* Status Bar */}
          <StatusBar
            isSolving={isSolving}
            gpuEnabled={gpuEnabled}
            inputMode={inputMode}
            scoreDifferential={scoreDifferential}
          />
        </div>

        {/* Modals */}
        <TutorialModal
          isOpen={showTutorial}
          onClose={() => setShowTutorial(false)}
        />

        <HelpModal
          isOpen={showHelp}
          onClose={() => setShowHelp(false)}
        />

        <BlankTileModal
          isOpen={Boolean(blankPrompt)}
          onClose={() => setBlankPrompt(null)}
          onSelectLetter={handleSelectBlank}
        />

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
