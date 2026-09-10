import { COLUMNS, TILE_SCORES } from "./presets";

/**
 * Formats row, col, and dir into standard Scrabble notation.
 * e.g. row 7, col 3, dir "H" -> "8D"
 * e.g. row 7, col 7, dir "V" -> "H8"
 */
export function formatPos(row, col, dir) {
  if (dir === "H") {
    return `${row + 1}${COLUMNS[col] || ""}`;
  }
  return `${COLUMNS[col] || ""}${row + 1}`;
}

/**
 * Determines tile score:
 * - Lowercase ('a'-'z'): Blank tile = 0 pts
 * - Uppercase ('A'-'Z'): Looked up in preset.scores (or default TILE_SCORES)
 */
export function getLetterScore(char, preset) {
  if (!char) return 0;
  // Lowercase letters represent blank tiles
  if (char >= "a" && char <= "z") return 0;
  const lower = char.toLowerCase();
  if (preset?.scores && preset.scores[lower] !== undefined) {
    return preset.scores[lower];
  }
  const upper = char.toUpperCase();
  if (TILE_SCORES[upper] !== undefined) {
    return TILE_SCORES[upper];
  }
  return 0;
}

/**
 * Pure standalone Scrabble scoring function.
 *
 * @param {string[][]} board - Current 15x15 board state
 * @param {string[][]} committedBoard - Previously committed 15x15 board state (or null)
 * @param {object} preset - Active board preset (premiums, scores, bingoBonus)
 * @returns {object|null} Move evaluation payload or null if no tiles placed
 */
export function calculateBoardMoveScore(board, committedBoard, preset) {
  if (!board || !Array.isArray(board)) return null;

  const newTiles = [];
  const committed =
    committedBoard ||
    Array(15)
      .fill(null)
      .map(() => Array(15).fill(""));

  for (let r = 0; r < 15; r++) {
    for (let c = 0; c < 15; c++) {
      const currentVal = board[r]?.[c] || "";
      const committedVal = committed[r]?.[c] || "";

      // If a previously committed tile was removed or changed, signal invalid
      if (committedVal && committedVal !== currentVal) {
        return {
          isValid: false,
          reason: "Cannot modify or delete already committed board tiles.",
          tilesPlaced: 0,
        };
      }

      if (currentVal && !committedVal) {
        newTiles.push({ r, c, char: currentVal });
      }
    }
  }

  // No new tiles placed
  if (newTiles.length === 0) {
    return null;
  }

  if (newTiles.length > 7) {
    return {
      isValid: false,
      reason: `Cannot place more than 7 tiles in a single turn (${newTiles.length} placed).`,
      tilesPlaced: newTiles.length,
    };
  }

  // Helper to check if a cell was newly placed this turn
  const isNew = (r, c) => Boolean(board[r]?.[c] && !committed[r]?.[c]);

  // Helper to get letter and word multiplier for a cell
  const getCellMultipliers = (r, c) => {
    if (!isNew(r, c)) {
      return { letterMult: 1, wordMult: 1 };
    }
    const premium = preset?.premiums?.[`${r},${c}`];
    if (premium === "2L") return { letterMult: 2, wordMult: 1 };
    if (premium === "3L") return { letterMult: 3, wordMult: 1 };
    if (premium === "2W" || premium === "CENTER")
      return { letterMult: 1, wordMult: 2 };
    if (premium === "3W") return { letterMult: 1, wordMult: 3 };
    return { letterMult: 1, wordMult: 1 };
  };

  // Determine linearity
  const sameRow = newTiles.every((t) => t.r === newTiles[0].r);
  const sameCol = newTiles.every((t) => t.c === newTiles[0].c);

  if (!sameRow && !sameCol) {
    return {
      isValid: false,
      reason: "Tiles must be placed in a single continuous row or column.",
      tilesPlaced: newTiles.length,
    };
  }

  // Check if board was empty prior to this move
  let isFirstMove = true;
  for (let r = 0; r < 15; r++) {
    for (let c = 0; c < 15; c++) {
      if (committed[r]?.[c]) {
        isFirstMove = false;
        break;
      }
    }
    if (!isFirstMove) break;
  }

  let dir = "H";
  let startRow = 0;
  let endRow = 0;
  let startCol = 0;
  let endCol = 0;

  if (newTiles.length === 1) {
    const { r, c } = newTiles[0];

    // Find horizontal word span
    let hStart = c;
    while (hStart > 0 && board[r]?.[hStart - 1]) hStart--;
    let hEnd = c;
    while (hEnd < 14 && board[r]?.[hEnd + 1]) hEnd++;
    const hLen = hEnd - hStart + 1;

    // Find vertical word span
    let vStart = r;
    while (vStart > 0 && board[vStart - 1]?.[c]) vStart--;
    let vEnd = r;
    while (vEnd < 14 && board[vEnd + 1]?.[c]) vEnd++;
    const vLen = vEnd - vStart + 1;

    if (hLen === 1 && vLen === 1) {
      return {
        isValid: false,
        reason: "A single tile must connect to form a word of at least 2 letters.",
        tilesPlaced: 1,
      };
    }

    if (hLen >= vLen) {
      dir = "H";
      startRow = r;
      endRow = r;
      startCol = hStart;
      endCol = hEnd;
    } else {
      dir = "V";
      startRow = vStart;
      endRow = vEnd;
      startCol = c;
      endCol = c;
    }
  } else if (sameRow) {
    dir = "H";
    startRow = newTiles[0].r;
    endRow = startRow;
    const minC = Math.min(...newTiles.map((t) => t.c));
    const maxC = Math.max(...newTiles.map((t) => t.c));

    // Check for empty gaps between placed tiles
    for (let c = minC; c <= maxC; c++) {
      if (!board[startRow]?.[c]) {
        return {
          isValid: false,
          reason: "Tiles placed horizontally must not have gaps between them.",
          tilesPlaced: newTiles.length,
        };
      }
    }

    // Expand contiguous letters left and right
    let sc = minC;
    while (sc > 0 && board[startRow]?.[sc - 1]) sc--;
    let ec = maxC;
    while (ec < 14 && board[startRow]?.[ec + 1]) ec++;

    startCol = sc;
    endCol = ec;
  } else {
    dir = "V";
    startCol = newTiles[0].c;
    endCol = startCol;
    const minR = Math.min(...newTiles.map((t) => t.r));
    const maxR = Math.max(...newTiles.map((t) => t.r));

    // Check for empty gaps between placed tiles
    for (let r = minR; r <= maxR; r++) {
      if (!board[r]?.[startCol]) {
        return {
          isValid: false,
          reason: "Tiles placed vertically must not have gaps between them.",
          tilesPlaced: newTiles.length,
        };
      }
    }

    // Expand contiguous letters up and down
    let sr = minR;
    while (sr > 0 && board[sr - 1]?.[startCol]) sr--;
    let er = maxR;
    while (er < 14 && board[er + 1]?.[startCol]) er++;

    startRow = sr;
    endRow = er;
  }

  // First move validation: must cover center star (7, 7) and be >= 2 letters
  if (isFirstMove) {
    let coversCenter = false;
    for (const t of newTiles) {
      if (t.r === 7 && t.c === 7) {
        coversCenter = true;
        break;
      }
    }
    if (!coversCenter) {
      return {
        isValid: false,
        reason: "The first move of the game must cover the center star (H8).",
        tilesPlaced: newTiles.length,
      };
    }
    const wordLen =
      dir === "H" ? endCol - startCol + 1 : endRow - startRow + 1;
    if (wordLen < 2) {
      return {
        isValid: false,
        reason: "The first move must be at least 2 letters long.",
        tilesPlaced: newTiles.length,
      };
    }
  } else {
    // Non-first move: must connect to existing tiles
    let connects = false;

    // Check connection along main word span
    if (dir === "H") {
      for (let c = startCol; c <= endCol; c++) {
        if (committed[startRow]?.[c]) {
          connects = true;
          break;
        }
      }
    } else {
      for (let r = startRow; r <= endRow; r++) {
        if (committed[r]?.[startCol]) {
          connects = true;
          break;
        }
      }
    }

    // Check connection via perpendicular adjacent tiles
    if (!connects) {
      for (const t of newTiles) {
        if (dir === "H") {
          if (
            (t.r > 0 && committed[t.r - 1]?.[t.c]) ||
            (t.r < 14 && committed[t.r + 1]?.[t.c])
          ) {
            connects = true;
            break;
          }
        } else {
          if (
            (t.c > 0 && committed[t.r]?.[t.c - 1]) ||
            (t.c < 14 && committed[t.r]?.[t.c + 1])
          ) {
            connects = true;
            break;
          }
        }
      }
    }

    if (!connects) {
      return {
        isValid: false,
        reason: "New tiles must connect to existing words on the board.",
        tilesPlaced: newTiles.length,
      };
    }
  }

  // --- Calculate Main Word Score ---
  let mainWordStr = "";
  let mainLettersSum = 0;
  let mainWordMult = 1;

  if (dir === "H") {
    for (let c = startCol; c <= endCol; c++) {
      const ch = board[startRow][c];
      mainWordStr += ch;
      const baseVal = getLetterScore(ch, preset);
      if (isNew(startRow, c)) {
        const { letterMult, wordMult } = getCellMultipliers(startRow, c);
        mainLettersSum += baseVal * letterMult;
        mainWordMult *= wordMult;
      } else {
        mainLettersSum += baseVal;
      }
    }
  } else {
    for (let r = startRow; r <= endRow; r++) {
      const ch = board[r][startCol];
      mainWordStr += ch;
      const baseVal = getLetterScore(ch, preset);
      if (isNew(r, startCol)) {
        const { letterMult, wordMult } = getCellMultipliers(r, startCol);
        mainLettersSum += baseVal * letterMult;
        mainWordMult *= wordMult;
      } else {
        mainLettersSum += baseVal;
      }
    }
  }

  const mainScore = mainLettersSum * mainWordMult;

  // --- Calculate Cross Words Score ---
  const crossWords = [];
  let totalCrossScore = 0;

  for (const t of newTiles) {
    if (dir === "H") {
      let rTop = t.r;
      while (rTop > 0 && board[rTop - 1]?.[t.c]) rTop--;
      let rBottom = t.r;
      while (rBottom < 14 && board[rBottom + 1]?.[t.c]) rBottom++;

      if (rBottom > rTop) {
        let crossStr = "";
        let crossLettersSum = 0;
        let crossWordMult = 1;

        for (let r = rTop; r <= rBottom; r++) {
          const ch = board[r][t.c];
          crossStr += ch;
          const baseVal = getLetterScore(ch, preset);
          if (r === t.r) {
            const { letterMult, wordMult } = getCellMultipliers(r, t.c);
            crossLettersSum += baseVal * letterMult;
            crossWordMult *= wordMult;
          } else {
            crossLettersSum += baseVal;
          }
        }

        const crossWordScore = crossLettersSum * crossWordMult;
        totalCrossScore += crossWordScore;
        crossWords.push({
          word: crossStr,
          cleanWord: crossStr.toUpperCase(),
          row: rTop,
          col: t.c,
          dir: "V",
          score: crossWordScore,
          posString: formatPos(rTop, t.c, "V"),
        });
      }
    } else {
      let cLeft = t.c;
      while (cLeft > 0 && board[t.r]?.[cLeft - 1]) cLeft--;
      let cRight = t.c;
      while (cRight < 14 && board[t.r]?.[cRight + 1]) cRight++;

      if (cRight > cLeft) {
        let crossStr = "";
        let crossLettersSum = 0;
        let crossWordMult = 1;

        for (let c = cLeft; c <= cRight; c++) {
          const ch = board[t.r][c];
          crossStr += ch;
          const baseVal = getLetterScore(ch, preset);
          if (c === t.c) {
            const { letterMult, wordMult } = getCellMultipliers(t.r, c);
            crossLettersSum += baseVal * letterMult;
            crossWordMult *= wordMult;
          } else {
            crossLettersSum += baseVal;
          }
        }

        const crossWordScore = crossLettersSum * crossWordMult;
        totalCrossScore += crossWordScore;
        crossWords.push({
          word: crossStr,
          cleanWord: crossStr.toUpperCase(),
          row: t.r,
          col: cLeft,
          dir: "H",
          score: crossWordScore,
          posString: formatPos(t.r, cLeft, "H"),
        });
      }
    }
  }

  const isBingo = newTiles.length >= 7;
  const bingoBonus = isBingo ? (preset?.bingoBonus ?? 50) : 0;
  const totalScore = mainScore + totalCrossScore + bingoBonus;

  return {
    isValid: true,
    word: mainWordStr,
    cleanWord: mainWordStr.toUpperCase(),
    row: startRow,
    col: startCol,
    dir,
    posString: formatPos(startRow, startCol, dir),
    score: totalScore,
    mainScore,
    crossScore: totalCrossScore,
    crossWords,
    tilesPlaced: newTiles.length,
    isBingo,
    bingoBonus,
  };
}
