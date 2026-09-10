// public/solverWorker.js - Anti-Bot Tactical Engine (Dynamic Defense + Anti-Stuck Penalty)

const REV_CODE = 26; // '#' Reversal separator
const MAX_RESULTS = 131072;


let gaddagTwl = null;
let gaddagSowpods = null;
let gaddagNwl2023 = null;
let gaddagCsw21 = null;
let gaddagCsw24 = null;
let trainedWeights = null;
let currentEquityMode = "static";
let gpuDevice = null;
let SYNERGY_WEIGHTS = {};

fetch('/synergy.json')
  .then(res => res.json())
  .then(data => SYNERGY_WEIGHTS = data)
  .catch(console.error);
let gpuPipeline = null;

// Tournament Base Leave Equity (scaled in 0.1 pts)
const BASE_LEAVE_EQUITY = new Int16Array([
  15, -20, -5, 10, 30, -20, -15, -10, 12, -25, -25, 12, -5, 20, -5, -10, -75,
  32, 80, 25, -30, -55, -25, 35, 0, 20,
]);
const BLANK_LEAVE_EQUITY = 255;

const RACK_COUNTS = new Int8Array(26);
const SCORE_TABLE = new Int8Array(26);
const REMAINING_COUNTS = new Int8Array(26);

const PREMIUM_GRID = new Uint8Array(225);
const BOARD_GRID = new Int8Array(225);
const BOARD_IS_BLANK = new Uint8Array(225);
const TEMP_BOARD_GRID = new Int8Array(225);
const TEMP_BOARD_IS_BLANK = new Uint8Array(225);
const IS_ANCHOR_SQUARE = new Uint8Array(225);

const CROSS_MASK_V = new Uint32Array(225);
const CROSS_SCORE_BASE_V = new Int16Array(225);
const HAS_PERP_GRID_V = new Uint8Array(225);

const CROSS_MASK_H = new Uint32Array(225);
const CROSS_SCORE_BASE_H = new Int16Array(225);
const HAS_PERP_GRID_H = new Uint8Array(225);

const PERP_BUF = new Uint8Array(15);
const PLACED_LETTERS = new Int8Array(15);
const PLACED_IS_BLANK = new Uint8Array(15);
const PLACED_CELLS = new Uint8Array(15);

const LINE_TILES = new Int8Array(15);
const LINE_ANCHORS = new Uint8Array(15);
const LINE_CROSS_MASKS = new Uint32Array(15);
const LINE_CROSS_SCORES = new Int16Array(15);
const LINE_HAS_PERP = new Uint8Array(15);

const OPP_RACK_COUNTS = new Int8Array(26);
const UNSEEN_COUNTS = new Int16Array(27);

let resultsCount = 0;
const RES_WORD_LEN = new Uint8Array(MAX_RESULTS);
const RES_WORD_CHARS = new Uint8Array(MAX_RESULTS * 15);
const RES_SCORE = new Int16Array(MAX_RESULTS);
const RES_EQUITY = new Float32Array(MAX_RESULTS);
const RES_TOTAL_VAL = new Float32Array(MAX_RESULTS);
const RES_ROW = new Uint8Array(MAX_RESULTS);
const RES_COL = new Uint8Array(MAX_RESULTS);
const RES_DIR = new Uint8Array(MAX_RESULTS);
const RES_TACTICS = new Uint16Array(MAX_RESULTS);
const RES_LEAVE_CHARS = new Uint8Array(MAX_RESULTS * 7);
const RES_LEAVE_LEN = new Uint8Array(MAX_RESULTS);

const INDEX_ARRAY = new Uint32Array(MAX_RESULTS);
const ALL_LETTERS_MASK = 0x03ffffff;


// ==========================================
// WebGPU Initialization
// ==========================================
async function initWebGPU() {
  if (!navigator.gpu) {
    console.warn("WebGPU not supported on this browser. Falling back to CPU MCTS.");
    return;
  }
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return;
    gpuDevice = await adapter.requestDevice();
  } catch (err) {
    console.error("WebGPU Init Error:", err);
  }
}

let currentLexiconStr = null;
let lexiconPromise = null;

async function ensureLexicon(lexicon) {
  if (currentLexiconStr === lexicon && (gaddagNwl2023 || gaddagCsw21 || gaddagTwl || gaddagSowpods || gaddagCsw24)) return;
  
  if (lexiconPromise && currentLexiconStr === lexicon) {
     await lexiconPromise;
     return;
  }
  
  currentLexiconStr = lexicon;
  
  lexiconPromise = (async () => {
      // Initialize WebGPU if needed
      if (navigator.gpu && !gpuDevice) {
        await initWebGPU();
      }
      
      // Free memory
      gaddagNwl2023 = null;
      gaddagCsw21 = null;
      gaddagTwl = null;
      gaddagSowpods = null;
      
      const dictUrl = lexicon === 'csw24' ? '/gaddag_csw24.bin' :
                      lexicon === 'csw21' ? '/gaddag_csw21.bin' :
                      lexicon === 'twl06' ? '/gaddag_twl06.bin' :
                      lexicon === 'sowpods' ? '/gaddag_sowpods.bin' :
                      '/gaddag_nwl2023.bin';
                      
      const [dictRes, wgslRes, trainedRes, synergyJsonRes] = await Promise.all([
          fetch(dictUrl),
          !gpuPipeline ? fetch("/mc_simulator.wgsl") : Promise.resolve(null),
          !trainedWeights ? fetch("/synergy_trained.json") : Promise.resolve(null),
          Object.keys(SYNERGY_WEIGHTS).length === 0 ? fetch("/synergy.json").catch(() => null) : Promise.resolve(null),
      ]);
      
      if (dictRes && dictRes.ok) {
         const arr = new Uint32Array(await dictRes.arrayBuffer());
         if (lexicon === 'csw24') gaddagCsw24 = arr;
         else if (lexicon === 'csw21') gaddagCsw21 = arr;
         else if (lexicon === 'twl06') gaddagTwl = arr;
         else if (lexicon === 'sowpods') gaddagSowpods = arr;
         else gaddagNwl2023 = arr;
      }
      
      if (trainedRes && trainedRes.ok) {
         trainedWeights = await trainedRes.json();
      }
      if (synergyJsonRes && synergyJsonRes.ok) {
         SYNERGY_WEIGHTS = await synergyJsonRes.json();
      }
      
      if (wgslRes && wgslRes.ok && gpuDevice) {
         const wgslCode = await wgslRes.text();
         const shaderModule = gpuDevice.createShaderModule({ code: wgslCode });
         gpuPipeline = gpuDevice.createComputePipeline({
           layout: "auto",
           compute: { module: shaderModule, entryPoint: "main" },
         });
      }
  })();
  
  await lexiconPromise;
}

function isWordValidCodes(gaddag, buf, len) {
  if (len < 2) return false;
  const firstCode = buf[0];
  let nodeIdx = 0;
  let childPointer = gaddag[0] >>> 7;
  let foundFirst = false;

  while (childPointer !== 0) {
    const entry = gaddag[childPointer];
    if ((entry & 0x1f) === firstCode) {
      nodeIdx = childPointer;
      foundFirst = true;
      break;
    }
    if ((entry & 0x40) === 0) break;
    childPointer++;
  }
  if (!foundFirst) return false;

  childPointer = gaddag[nodeIdx] >>> 7;
  let foundRev = false;
  while (childPointer !== 0) {
    const entry = gaddag[childPointer];
    if ((entry & 0x1f) === REV_CODE) {
      nodeIdx = childPointer;
      foundRev = true;
      break;
    }
    if ((entry & 0x40) === 0) break;
    childPointer++;
  }
  if (!foundRev) return false;

  for (let i = 1; i < len; i++) {
    const targetCode = buf[i];
    childPointer = gaddag[nodeIdx] >>> 7;
    let matched = false;
    while (childPointer !== 0) {
      const entry = gaddag[childPointer];
      if ((entry & 0x1f) === targetCode) {
        if (i === len - 1) return (entry & 0x20) !== 0;
        nodeIdx = childPointer;
        matched = true;
        break;
      }
      if ((entry & 0x40) === 0) break;
      childPointer++;
    }
    if (!matched) return false;
  }
  return false;
}

function evaluateLeaveEquity(counts, blanksRemaining, totalUnseen) {
  let chars = [];
  let vCount = counts[0] + counts[4] + counts[8] + counts[14] + counts[20];
  let yCount = counts[24];
  let cCount = 0;
  let equity = 0;
  
  // Triplet & Quadruplet Exterminator
  for (let c = 0; c < 26; c++) {
    if (counts[c] === 3) equity -= 10.0; 
    if (counts[c] >= 4) equity -= 25.0; 
    
    if (c !== 0 && c !== 4 && c !== 8 && c !== 14 && c !== 20 && c !== 24) {
      cCount += counts[c];
    }
    for (let i = 0; i < counts[c]; i++) {
      chars.push(String.fromCharCode(65 + c));
    }
  }
  for (let i = 0; i < blanksRemaining; i++) {
    chars.push('?');
  }

  const leaveLen = chars.length;
  if (leaveLen === 0) return 0;

  // Trained ML override (falls back to Quackle base pairs in static/EQ mode)
  const leaveStr = chars.sort().join('');
  if (currentEquityMode === "trained" && trainedWeights && trainedWeights[leaveStr] !== undefined) {
    equity += trainedWeights[leaveStr];
  } else {
    // Base Equity
    for (let i = 0; i < leaveLen; i++) {
      const ch = chars[i];
      equity += (SYNERGY_WEIGHTS[ch] || 0);
    }

    // True Pair Synergies (with fixed Blank parsing)
    for (let i = 0; i < leaveLen; i++) {
      for (let j = i + 1; j < leaveLen; j++) {
        let c1 = chars[i];
        let c2 = chars[j];
        let pairKey = "";
        
        if (c1 === '?' && c2 === '?') pairKey = "??";
        else if (c1 === '?') pairKey = c2 + "?";
        else if (c2 === '?') pairKey = c1 + "?";
        else pairKey = c1 <= c2 ? c1 + c2 : c2 + c1;
        
        if (SYNERGY_WEIGHTS[pairKey] !== undefined) {
          equity += SYNERGY_WEIGHTS[pairKey];
        }
      }
    }
  }

  // Macro-Penalties: Starvation and Safe Flood Balancing
  let totalTiles = vCount + cCount + yCount + blanksRemaining;
  if (totalTiles >= 4) {
    if (vCount === 0 && blanksRemaining === 0) equity -= 12.0; // Consonant starvation
    if (cCount === 0 && blanksRemaining === 0) equity -= 12.0; // Vowel starvation
    
    // Balanced Flood Penalty: High enough to encourage balance, low enough to preserve Bingos
    if (vCount > cCount + 3) equity -= 2.5; // Mild Vowel Flood
    if (cCount > vCount + 3) equity -= 2.5; // Mild Consonant Flood
  }

  if (counts[16] > 0 && counts[20] === 0 && blanksRemaining === 0) {
    equity -= 15.0; 
  }

  // Pre-Endgame & Endgame Dynamic Consonant / Defective Leave Scaling (Option 3A)
  if (totalUnseen <= 14) {
    const urgency = (15 - totalUnseen) / 15.0; // Scales smoothly from 0.07 (at 14) to 1.0 (at 0)

    // V: extremely inflexible in closed endgame boards
    if (counts[21] > 0) equity -= (4.0 + urgency * 8.0); // -4.5 to -12.0 pts
    // W: rigid semi-vowel
    if (counts[22] > 0) equity -= (3.5 + urgency * 7.5); // -4.0 to -11.0 pts
    // F: hard to hook without abundant vowels
    if (counts[5] > 0) equity -= (2.0 + urgency * 6.0); // -2.4 to -8.0 pts
    // Unpaired Q (Q without U and no blank)
    if (counts[16] > 0 && counts[20] === 0 && blanksRemaining === 0) {
      equity -= (15.0 + urgency * 15.0); // -16.0 to -30.0 pts
    }
    // High-point tiles without accessible bonus squares (J, X, Z)
    if (counts[9] > 0 || counts[23] > 0 || counts[25] > 0) {
      equity -= (2.0 + urgency * 5.0); 
    }
    // Consonant starvation in pre-endgame is fatal
    if (vCount === 0 && blanksRemaining === 0 && leaveLen >= 2) {
      equity -= (8.0 + urgency * 12.0);
    }
    // Duplicate consonants in pre-endgame
    for (let c = 0; c < 26; c++) {
      if (counts[c] >= 2 && c !== 0 && c !== 4 && c !== 8 && c !== 14 && c !== 20) {
        equity -= (3.0 * urgency);
      }
    }
  }

  return equity;
}

// 1-Ply Minimax Counter-Move Evaluation
function findOpponentBestScore(
  gaddag,
  testBoard,
  testBoardIsBlank,
  oppCounts,
  oppWildcards,
  bingoBonus,
  dirtyRow,
  dirtyCol,
  dirtyDir,
  dirtyLen,
) {
  let maxOppScore = 0;
  let bestOppWord = "";
  let bestOppRow = 0;
  let bestOppCol = 0;
  let bestOppDir = "H";
  let bestOppTilesUsed = 0;

  const oppCrossV = new Uint32Array(CROSS_MASK_V);
  const oppCrossScoreV = new Int16Array(CROSS_SCORE_BASE_V);
  const oppHasPerpV = new Uint8Array(HAS_PERP_GRID_V);

  const oppCrossH = new Uint32Array(CROSS_MASK_H);
  const oppCrossScoreH = new Int16Array(CROSS_SCORE_BASE_H);
  const oppHasPerpH = new Uint8Array(HAS_PERP_GRID_H);

  const oppAnchors = new Uint8Array(IS_ANCHOR_SQUARE);

  for (let k = 0; k < dirtyLen; k++) {
    const r = dirtyDir === "V" ? dirtyRow + k : dirtyRow;
    const c = dirtyDir === "H" ? dirtyCol + k : dirtyCol;
    oppAnchors[r * 15 + c] = 0;
    if (r > 0 && testBoard[(r - 1) * 15 + c] === 0)
      oppAnchors[(r - 1) * 15 + c] = 1;
    if (r < 14 && testBoard[(r + 1) * 15 + c] === 0)
      oppAnchors[(r + 1) * 15 + c] = 1;
    if (c > 0 && testBoard[r * 15 + c - 1] === 0)
      oppAnchors[r * 15 + c - 1] = 1;
    if (c < 14 && testBoard[r * 15 + c + 1] === 0)
      oppAnchors[r * 15 + c + 1] = 1;
  }

  for (
    let c = dirtyCol;
    c < (dirtyDir === "H" ? dirtyCol + dirtyLen : dirtyCol + 1);
    c++
  ) {
    for (let r = 0; r < 15; r++) {
      const gridIdx = r * 15 + c;
      if (testBoard[gridIdx] !== 0) continue;
      let up = r - 1,
        upCount = 0,
        scoreV = 0;
      while (up >= 0 && testBoard[up * 15 + c] !== 0) {
        upCount++;
        up--;
      }
      for (let k = 0; k < upCount; k++) {
        const gIdx = (r - upCount + k) * 15 + c;
        const code = testBoard[gIdx] - 1;
        PERP_BUF[k] = code;
        scoreV += testBoardIsBlank[gIdx] ? 0 : SCORE_TABLE[code];
      }
      let down = r + 1,
        downCount = 0;
      while (down < 15 && testBoard[down * 15 + c] !== 0) {
        const gIdx = down * 15 + c;
        const code = testBoard[gIdx] - 1;
        PERP_BUF[upCount + 1 + downCount] = code;
        scoreV += testBoardIsBlank[gIdx] ? 0 : SCORE_TABLE[code];
        downCount++;
        down++;
      }
      const lenV = upCount + 1 + downCount;
      if (lenV > 1) {
        oppHasPerpV[gridIdx] = 1;
        oppCrossScoreV[gridIdx] = scoreV;
        let mask = 0;
        for (let code = 0; code < 26; code++) {
          PERP_BUF[upCount] = code;
          if (isWordValidCodes(gaddag, PERP_BUF, lenV)) mask |= 1 << code;
        }
        oppCrossV[gridIdx] = mask;
      } else {
        oppHasPerpV[gridIdx] = 0;
        oppCrossScoreV[gridIdx] = 0;
        oppCrossV[gridIdx] = ALL_LETTERS_MASK;
      }
    }
  }

  for (
    let r = dirtyRow;
    r < (dirtyDir === "V" ? dirtyRow + dirtyLen : dirtyRow + 1);
    r++
  ) {
    for (let c = 0; c < 15; c++) {
      const gridIdx = r * 15 + c;
      if (testBoard[gridIdx] !== 0) continue;
      let left = c - 1,
        leftCount = 0,
        scoreH = 0;
      while (left >= 0 && testBoard[r * 15 + left] !== 0) {
        leftCount++;
        left--;
      }
      for (let k = 0; k < leftCount; k++) {
        const gIdx = r * 15 + (c - leftCount + k);
        const code = testBoard[gIdx] - 1;
        PERP_BUF[k] = code;
        scoreH += testBoardIsBlank[gIdx] ? 0 : SCORE_TABLE[code];
      }
      let right = c + 1,
        rightCount = 0;
      while (right < 15 && testBoard[r * 15 + right] !== 0) {
        const gIdx = r * 15 + right;
        const code = testBoard[gIdx] - 1;
        PERP_BUF[leftCount + 1 + rightCount] = code;
        scoreH += testBoardIsBlank[gIdx] ? 0 : SCORE_TABLE[code];
        rightCount++;
        right++;
      }
      const lenH = leftCount + 1 + rightCount;
      if (lenH > 1) {
        oppHasPerpH[gridIdx] = 1;
        oppCrossScoreH[gridIdx] = scoreH;
        let mask = 0;
        for (let code = 0; code < 26; code++) {
          PERP_BUF[leftCount] = code;
          if (isWordValidCodes(gaddag, PERP_BUF, lenH)) mask |= 1 << code;
        }
        oppCrossH[gridIdx] = mask;
      } else {
        oppHasPerpH[gridIdx] = 0;
        oppCrossScoreH[gridIdx] = 0;
        oppCrossH[gridIdx] = ALL_LETTERS_MASK;
      }
    }
  }

  let oppWilds = oppWildcards;
  const oppPlaced = new Int8Array(15);
  const oppPlacedBlank = new Uint8Array(15);

  const testVector = (isVertical, lineIdx) => {
    const crossM = isVertical ? oppCrossH : oppCrossV;
    const crossS = isVertical ? oppCrossScoreH : oppCrossScoreV;
    const hasP = isVertical ? oppHasPerpH : oppHasPerpV;

    const lineT = new Int8Array(15);
    const lineA = new Uint8Array(15);
    const lineCM = new Uint32Array(15);
    const lineCS = new Int16Array(15);
    const lineHP = new Uint8Array(15);

    let lineTilesMask = 0;
    for (let i = 0; i < 15; i++) {
      const gIdx = isVertical ? i * 15 + lineIdx : lineIdx * 15 + i;
      lineT[i] = testBoard[gIdx];
      if (testBoard[gIdx] !== 0) lineTilesMask |= 1 << i;
      lineA[i] = oppAnchors[gIdx];
      lineCM[i] = crossM[gIdx];
      lineCS[i] = crossS[gIdx];
      lineHP[i] = hasP[gIdx];
    }

    const genOpp = (
      pos,
      currPos,
      nodeIdx,
      direction,
      minPos,
      maxPos,
      tilesUsed,
    ) => {
      if (nodeIdx !== 0) {
        const entry = gaddag[nodeIdx];
        if ((entry & 0x20) !== 0 && tilesUsed > 0 && maxPos > minPos) {
          const lClean =
            minPos === 0 || (lineTilesMask & (1 << (minPos - 1))) === 0;
          let rClean = false;
          if (direction > 0)
            rClean = currPos >= 15 || (lineTilesMask & (1 << currPos)) === 0;
          else
            rClean = pos + 1 >= 15 || (lineTilesMask & (1 << (pos + 1))) === 0;

          if (lClean && rClean) {
            let mScore = 0,
              mMult = 1,
              crossTot = 0;
            let wordBuilt = "";
            for (let p = minPos; p <= maxPos; p++) {
              const code = oppPlaced[p];
              wordBuilt += String.fromCharCode(65 + code);
              const r = isVertical ? p : lineIdx;
              const c = isVertical ? lineIdx : p;
              const gIdx = r * 15 + c;
              const prem = PREMIUM_GRID[gIdx];
              const isExist = testBoard[gIdx] !== 0;
              const isB = oppPlacedBlank[p] === 1;

              if (isExist) {
                mScore += testBoardIsBlank[gIdx] ? 0 : SCORE_TABLE[code];
              } else {
                let lVal = isB ? 0 : SCORE_TABLE[code];
                if (prem === 1) lVal *= 2;
                else if (prem === 2) lVal *= 3;
                else if (prem === 3) mMult *= 2;
                else if (prem === 4) mMult *= 3;
                mScore += lVal;

                if (lineHP[p] === 1) {
                  let pVal = isB ? 0 : SCORE_TABLE[code];
                  if (prem === 1) pVal *= 2;
                  else if (prem === 2) pVal *= 3;
                  let cMult = 1;
                  if (prem === 3) cMult = 2;
                  else if (prem === 4) cMult = 3;
                  crossTot += (lineCS[p] + pVal) * cMult;
                }
              }
            }
            let total = mScore * mMult + crossTot;
            if (tilesUsed === 7) total += bingoBonus;

            if (total > maxOppScore) {
              maxOppScore = total;
              bestOppWord = wordBuilt;
              bestOppRow = isVertical ? minPos : lineIdx;
              bestOppCol = isVertical ? lineIdx : minPos;
              bestOppDir = isVertical ? "V" : "H";
              bestOppTilesUsed = tilesUsed;
            }
          }
        }
      }

      if (direction > 0 && currPos >= 15) return;
      let childPointer = gaddag[nodeIdx] >>> 7;
      if (childPointer === 0) return;

      while (childPointer !== 0) {
        const entry = gaddag[childPointer];
        const letterCode = entry & 0x1f;
        const hasSibling = (entry & 0x40) !== 0;

        if (letterCode === REV_CODE) {
          if (direction < 0)
            genOpp(pos, pos + 1, childPointer, 1, minPos, maxPos, tilesUsed);
        } else if (letterCode < 26) {
          if (currPos >= 0 && currPos < 15) {
            const existing = lineT[currPos];
            if (existing !== 0) {
              if (existing - 1 === letterCode) {
                oppPlaced[currPos] = letterCode;
                oppPlacedBlank[currPos] = 0;
                const nextMin =
                  direction < 0 && currPos < minPos ? currPos : minPos;
                const nextMax =
                  direction > 0 && currPos > maxPos ? currPos : maxPos;
                genOpp(
                  pos,
                  currPos + direction,
                  childPointer,
                  direction,
                  nextMin,
                  nextMax,
                  tilesUsed,
                );
              }
            } else {
              if ((lineCM[currPos] & (1 << letterCode)) !== 0) {
                const nextMin =
                  direction < 0 && currPos < minPos ? currPos : minPos;
                const nextMax =
                  direction > 0 && currPos > maxPos ? currPos : maxPos;

                if (oppCounts[letterCode] > 0) {
                  oppCounts[letterCode]--;
                  oppPlaced[currPos] = letterCode;
                  oppPlacedBlank[currPos] = 0;
                  genOpp(
                    pos,
                    currPos + direction,
                    childPointer,
                    direction,
                    nextMin,
                    nextMax,
                    tilesUsed + 1,
                  );
                  oppCounts[letterCode]++;
                } else if (oppWilds > 0) {
                  oppWilds--;
                  oppPlaced[currPos] = letterCode;
                  oppPlacedBlank[currPos] = 1;
                  genOpp(
                    pos,
                    currPos + direction,
                    childPointer,
                    direction,
                    nextMin,
                    nextMax,
                    tilesUsed + 1,
                  );
                  oppWilds++;
                }
              }
            }
          }
        }
        if (!hasSibling) break;
        childPointer++;
      }
    };

    let anchorMask = 0;
    for (let pos = 0; pos < 15; pos++) {
      if (lineA[pos] === 1) anchorMask |= 1 << pos;
    }

    while (anchorMask !== 0) {
      const lowestBit = anchorMask & -anchorMask;
      const pos = 31 - Math.clz32(lowestBit);
      genOpp(pos, pos, 0, -1, pos, pos, 0);
      anchorMask &= anchorMask - 1;
    }
  };

  for (let i = 0; i < 15; i++) {
    testVector(false, i);
    testVector(true, i);
  }

  return {
    maxOppScore,
    bestOppWord,
    bestOppRow,
    bestOppCol,
    bestOppDir,
    bestOppTilesUsed,
  };
}


// Note: Batched MCTS compute pass is handled entirely by runGPUSimulations

// Multi-Multiplier High-Risk Corridors (9x Triple-Triple and 4x Double-Double)
const MULTI_CORRIDORS = [
  // 8 Triple-Triple (9x) Corridors
  { name: "H_Row0_Left",   isVert: false, line: 0,  start: 0, end: 7,  type: 9, m1: 0,   m2: 7 },
  { name: "H_Row0_Right",  isVert: false, line: 0,  start: 7, end: 14, type: 9, m1: 7,   m2: 14 },
  { name: "H_Row14_Left",  isVert: false, line: 14, start: 0, end: 7,  type: 9, m1: 210, m2: 217 },
  { name: "H_Row14_Right", isVert: false, line: 14, start: 7, end: 14, type: 9, m1: 217, m2: 224 },
  { name: "V_Col0_Top",    isVert: true,  line: 0,  start: 0, end: 7,  type: 9, m1: 0,   m2: 105 },
  { name: "V_Col0_Bottom", isVert: true,  line: 0,  start: 7, end: 14, type: 9, m1: 105, m2: 210 },
  { name: "V_Col14_Top",   isVert: true,  line: 14, start: 0, end: 7,  type: 9, m1: 14,  m2: 119 },
  { name: "V_Col14_Bottom",isVert: true,  line: 14, start: 7, end: 14, type: 9, m1: 119, m2: 224 },
  
  // 4 Prime Double-Double (4x) Corridors (Distance 6)
  { name: "V_Col4_E5_E11",    isVert: true,  line: 4,  start: 4, end: 10, type: 4, m1: 64,  m2: 154 },
  { name: "V_Col10_K5_K11",   isVert: true,  line: 10, start: 4, end: 10, type: 4, m1: 70,  m2: 160 },
  { name: "H_Row4_E5_K5",     isVert: false, line: 4,  start: 4, end: 10, type: 4, m1: 64,  m2: 70 },
  { name: "H_Row10_E11_K11",  isVert: false, line: 10, start: 4, end: 10, type: 4, m1: 154, m2: 160 }
];

// Stage 1: Fast Host Candidate Board Metric Computation
const TWS_FLAT_INDICES = [0, 7, 14, 105, 119, 210, 217, 224];

function computeCandidateBoardMetrics(grid) {
  let openTws = 0;
  for (let t = 0; t < 8; t++) {
    const twsIdx = TWS_FLAT_INDICES[t];
    if (grid[twsIdx] === 0) {
      const tr = Math.floor(twsIdx / 15);
      const tc = twsIdx % 15;
      let reachable = false;
      const cStart = Math.max(0, tc - 7);
      const cEnd = Math.min(14, tc + 7);
      for (let c = cStart; c <= cEnd; c++) {
        if (c !== tc && grid[tr * 15 + c] !== 0) {
          reachable = true;
          break;
        }
      }
      if (!reachable) {
        const rStart = Math.max(0, tr - 7);
        const rEnd = Math.min(14, tr + 7);
        for (let r = rStart; r <= rEnd; r++) {
          if (r !== tr && grid[r * 15 + tc] !== 0) {
            reachable = true;
            break;
          }
        }
      }
      if (reachable) openTws++;
    }
  }

  let totalAnchors = 0;
  for (let r = 0; r < 15; r++) {
    for (let c = 0; c < 15; c++) {
      const gIdx = r * 15 + c;
      if (grid[gIdx] === 0) {
        if (
          (r > 0 && grid[(r - 1) * 15 + c] !== 0) ||
          (r < 14 && grid[(r + 1) * 15 + c] !== 0) ||
          (c > 0 && grid[r * 15 + c - 1] !== 0) ||
          (c < 14 && grid[r * 15 + c + 1] !== 0)
        ) {
          totalAnchors++;
        }
      }
    }
  }

  let tripleTripleLanes = 0;
  let doubleDoubleLanes = 0;
  for (let cIdx = 0; cIdx < MULTI_CORRIDORS.length; cIdx++) {
    const c = MULTI_CORRIDORS[cIdx];
    if (grid[c.m1] !== 0 && grid[c.m2] !== 0) continue; // Both multipliers neutralized
    let emptyCount = 0;
    let hasAnchor = false;
    for (let p = c.start; p <= c.end; p++) {
      const r = c.isVert ? p : c.line;
      const col = c.isVert ? c.line : p;
      const idx = r * 15 + col;
      if (grid[idx] !== 0) {
        hasAnchor = true;
      } else {
        emptyCount++;
        if (
          (r > 0 && grid[(r - 1) * 15 + col] !== 0) ||
          (r < 14 && grid[(r + 1) * 15 + col] !== 0) ||
          (col > 0 && grid[r * 15 + col - 1] !== 0) ||
          (col < 14 && grid[r * 15 + col + 1] !== 0)
        ) {
          hasAnchor = true;
        }
      }
    }
    if (emptyCount <= 8 && hasAnchor) {
      if (c.type === 9) tripleTripleLanes++;
      else doubleDoubleLanes++;
    }
  }

  return { openTws, totalAnchors, tripleTripleLanes, doubleDoubleLanes };
}

// Stage 1: Persistent WebGPU Staging Buffer Pool (Zero-Allocation Loop)
const MAX_GPU_TOP_N = 16;
const SIMS_PER_CANDIDATE = 1024;
let poolConfigBuffer = null;
let poolBoardsBuffer = null;
let poolUnseenBuffer = null;
let poolMetricsBuffer = null;
let poolSpreadBuffer = null;
let poolReadBuffer = null;
let poolBindGroup = null;
let poolPipelineRef = null;

function ensureGpuBufferPool(device, pipeline) {
  if (poolBindGroup && poolPipelineRef === pipeline) return;

  if (poolConfigBuffer) {
    try {
      poolConfigBuffer.destroy();
      poolBoardsBuffer.destroy();
      poolUnseenBuffer.destroy();
      poolMetricsBuffer.destroy();
      poolSpreadBuffer.destroy();
      poolReadBuffer.destroy();
    } catch (_) {}
  }

  poolPipelineRef = pipeline;

  poolConfigBuffer = device.createBuffer({
    size: 4 * 4, // 4 u32s
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });

  poolBoardsBuffer = device.createBuffer({
    size: MAX_GPU_TOP_N * 225 * 4, // 14,400 bytes
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });

  poolUnseenBuffer = device.createBuffer({
    size: 100 * 4, // 400 bytes
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });

  poolMetricsBuffer = device.createBuffer({
    size: MAX_GPU_TOP_N * 4 * 4, // 256 bytes (4 u32s per candidate)
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });

  const maxSpreadSize = MAX_GPU_TOP_N * SIMS_PER_CANDIDATE * 4; // 65,536 bytes
  poolSpreadBuffer = device.createBuffer({
    size: maxSpreadSize,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });

  poolReadBuffer = device.createBuffer({
    size: maxSpreadSize,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });

  poolBindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: poolConfigBuffer } },
      { binding: 1, resource: { buffer: poolBoardsBuffer } },
      { binding: 2, resource: { buffer: poolUnseenBuffer } },
      { binding: 3, resource: { buffer: poolMetricsBuffer } },
      { binding: 4, resource: { buffer: poolSpreadBuffer } },
    ],
  });
}

async function runGPUSimulations(
  finalPlays,
  unseenArray,
  totalUnseen,
  activeGaddag,
  scoreDifferential = 0,
) {
  if (!gpuDevice || !gpuPipeline || !activeGaddag) return false;

  finalPlays.sort((a, b) => b.totalVal - a.totalVal);
  const topN = Math.min(finalPlays.length, MAX_GPU_TOP_N);
  if (topN === 0 || totalUnseen <= 0) return false;

  ensureGpuBufferPool(gpuDevice, gpuPipeline);

  const configData = new Uint32Array([
    topN,
    SIMS_PER_CANDIDATE,
    totalUnseen,
    Math.floor(Math.random() * 0xffffffff),
  ]);

  const boardsData = new Uint32Array(topN * 225);
  const metricsData = new Uint32Array(topN * 4);

  for (let i = 0; i < topN; i++) {
    const play = finalPlays[i];
    TEMP_BOARD_GRID.set(BOARD_GRID);
    TEMP_BOARD_IS_BLANK.set(BOARD_IS_BLANK);

    if (play.dir !== "EXCH") {
      for (let k = 0; k < play.word.length; k++) {
        const r = play.dir === "V" ? play.row + k : play.row;
        const c = play.dir === "H" ? play.col + k : play.col;
        const charCode = play.word.charCodeAt(k);
        const isBlank = charCode >= 97;
        const num = isBlank ? charCode - 97 : charCode - 65;
        TEMP_BOARD_GRID[r * 15 + c] = num + 1;
        TEMP_BOARD_IS_BLANK[r * 15 + c] = isBlank ? 1 : 0;
      }
    }

    const offset = i * 225;
    for (let j = 0; j < 225; j++) {
      boardsData[offset + j] =
        (TEMP_BOARD_IS_BLANK[j] << 8) | TEMP_BOARD_GRID[j];
    }

    // Stage 1: Pre-calculate candidate metrics once on CPU host
    const metrics = computeCandidateBoardMetrics(TEMP_BOARD_GRID);
    metricsData[i * 4 + 0] = metrics.openTws;
    metricsData[i * 4 + 1] = metrics.totalAnchors;
    metricsData[i * 4 + 2] = metrics.tripleTripleLanes;
    metricsData[i * 4 + 3] = metrics.doubleDoubleLanes;
    play.openTws = metrics.openTws;
    play.totalAnchors = metrics.totalAnchors;
    play.tripleTripleLanes = metrics.tripleTripleLanes;
    play.doubleDoubleLanes = metrics.doubleDoubleLanes;
  }

  const unseenData = new Uint32Array(unseenArray);

  // Write directly into the persistent buffer pool (0 allocation)
  gpuDevice.queue.writeBuffer(poolConfigBuffer, 0, configData);
  gpuDevice.queue.writeBuffer(poolBoardsBuffer, 0, boardsData);
  gpuDevice.queue.writeBuffer(poolUnseenBuffer, 0, unseenData);
  gpuDevice.queue.writeBuffer(poolMetricsBuffer, 0, metricsData);

  const commandEncoder = gpuDevice.createCommandEncoder();
  const passEncoder = commandEncoder.beginComputePass();
  passEncoder.setPipeline(gpuPipeline);
  passEncoder.setBindGroup(0, poolBindGroup);

  const totalInvocations = topN * SIMS_PER_CANDIDATE;
  passEncoder.dispatchWorkgroups(Math.ceil(totalInvocations / 64));
  passEncoder.end();

  const spreadBytes = totalInvocations * 4;
  commandEncoder.copyBufferToBuffer(
    poolSpreadBuffer,
    0,
    poolReadBuffer,
    0,
    spreadBytes,
  );
  gpuDevice.queue.submit([commandEncoder.finish()]);

  await poolReadBuffer.mapAsync(GPUMapMode.READ, 0, spreadBytes);
  const resultArray = new Float32Array(poolReadBuffer.getMappedRange(0, spreadBytes));

  // CPU Reduction of the 1024 threads per candidate
  let totalOppScoreSum = 0;
  for (let i = 0; i < topN; i++) {
    let sum = 0;
    let wins = 0;
    const ourSpreadBaseline = finalPlays[i].score + (finalPlays[i].leaveEquity || 0);

    for (let j = 0; j < SIMS_PER_CANDIDATE; j++) {
      const simOppScore = resultArray[i * SIMS_PER_CANDIDATE + j];
      sum += simOppScore;
      const netSpread = ourSpreadBaseline - simOppScore;
      if (netSpread > 0) wins += 1;
      else if (Math.abs(netSpread) < 0.001) wins += 0.5;
    }

    const avgOppScore = Math.round((sum / SIMS_PER_CANDIDATE) * 10) / 10;
    const winRate = Math.round((wins / SIMS_PER_CANDIDATE) * 1000) / 10; // e.g. 58.4%
    const empiricalNetSpread = Math.round((finalPlays[i].score - avgOppScore) * 10) / 10;

    finalPlays[i].avgOppScore = avgOppScore;
    finalPlays[i].winRate = winRate;
    finalPlays[i].netSpread = empiricalNetSpread;
    totalOppScoreSum += avgOppScore;
  }

  // Relative Defense & Absolute Volatility Penalties (Ruthlessly Protect Leads)
  const baselineOppScore = totalOppScoreSum / topN;
  for (let i = 0; i < topN; i++) {
    const deltaDefense = baselineOppScore - finalPlays[i].avgOppScore;

    let volatilityAdjustment = 0;
    const oppScore = finalPlays[i].avgOppScore;
    if (oppScore > 32.0) {
      const excess = oppScore - 32.0;
      if (scoreDifferential > 30) {
        // Ruthlessly protect lead when leading by >30 pts
        const leadMultiplier = 1.0 + Math.min(2.0, (scoreDifferential - 30) / 30.0);
        volatilityAdjustment = excess * 0.8 * leadMultiplier;
      } else if (scoreDifferential < -30) {
        volatilityAdjustment = excess * 0.2;
      } else {
        volatilityAdjustment = excess * 0.5;
      }
    } else if (scoreDifferential > 30 && oppScore <= 26.0) {
      volatilityAdjustment = -3.0; // Lockdown bonus when protecting lead
    }

    finalPlays[i].totalVal = Math.round((finalPlays[i].totalVal + deltaDefense - volatilityAdjustment) * 10) / 10;
  }

  poolReadBuffer.unmap();
  // Persistent pool buffers remain alive for zero-allocation reuse!

  return true;
}

// Lightweight CPU Monte Carlo Fallback (Option 2B)
function runCPUSimulations(finalPlays, unseenArray, totalUnseen, scoreDifferential = 0) {
  finalPlays.sort((a, b) => b.totalVal - a.totalVal);
  const topN = Math.min(finalPlays.length, 16);
  const SIMS = 128;
  if (topN === 0 || totalUnseen <= 0) return;

  const getTileScore = (tile) => {
    if (tile === 26) return 0;
    if (tile === 16 || tile === 25) return 10;
    if (tile === 9 || tile === 23) return 8;
    if (tile === 10) return 5;
    if (tile === 5 || tile === 7 || tile === 21 || tile === 22 || tile === 24) return 4;
    if (tile === 1 || tile === 2 || tile === 12 || tile === 15) return 3;
    if (tile === 3 || tile === 6) return 2;
    return 1;
  };

  const isVowel = (tile) => tile === 0 || tile === 4 || tile === 8 || tile === 14 || tile === 20;

  let totalOppScoreSum = 0;
  for (let i = 0; i < topN; i++) {
    const play = finalPlays[i];
    TEMP_BOARD_GRID.set(BOARD_GRID);
    if (play.dir !== "EXCH") {
      for (let k = 0; k < play.word.length; k++) {
        const r = play.dir === "V" ? play.row + k : play.row;
        const c = play.dir === "H" ? play.col + k : play.col;
        const charCode = play.word.charCodeAt(k);
        const num = charCode >= 97 ? charCode - 97 : charCode - 65;
        TEMP_BOARD_GRID[r * 15 + c] = num + 1;
      }
    }
    const metrics = computeCandidateBoardMetrics(TEMP_BOARD_GRID);
    const hasOpenTws = metrics.openTws > 0 || play.opensTWS || play.exposes3W;
    const tripleTripleLanes = metrics.tripleTripleLanes || 0;
    const doubleDoubleLanes = metrics.doubleDoubleLanes || 0;
    const totalAnchors = metrics.totalAnchors;

    let sum = 0;
    let wins = 0;
    const ourSpreadBaseline = play.score + (play.leaveEquity || 0);

    const drawCount = Math.min(7, totalUnseen);
    const pool = unseenArray.slice();

    for (let s = 0; s < SIMS; s++) {
      let rackFaceVal = 0;
      let blankCount = 0;
      let sCount = 0;
      let vowelCount = 0;
      let consonantCount = 0;
      let powerPoints = 0;

      for (let j = 0; j < drawCount; j++) {
        const randIdx = j + Math.floor(Math.random() * (pool.length - j));
        const temp = pool[j];
        pool[j] = pool[randIdx];
        pool[randIdx] = temp;

        const tile = pool[j];
        const val = getTileScore(tile);
        rackFaceVal += val;

        if (tile === 26) {
          blankCount++;
        } else if (tile === 18) {
          sCount++;
          consonantCount++;
        } else if (isVowel(tile)) {
          vowelCount++;
        } else {
          consonantCount++;
          if (tile === 9 || tile === 16 || tile === 23 || tile === 25) {
            powerPoints += val;
          }
        }
      }

      let bingoProb = 0.0;
      if (drawCount === 7 && totalAnchors >= 4) {
        bingoProb = 0.12 + blankCount * 0.35 + sCount * 0.18;
        if ((vowelCount === 3 && consonantCount === 4) || (vowelCount === 4 && consonantCount === 3)) {
          bingoProb += 0.15;
        } else if (vowelCount === 0 || consonantCount === 0) {
          bingoProb = 0.0;
        }
        if (powerPoints >= 10 && blankCount === 0) {
          bingoProb = Math.max(0, bingoProb - 0.20);
        }
        // Boost bingo reachability when multi-multiplier corridors are wide open
        if (tripleTripleLanes > 0 || doubleDoubleLanes > 0) {
          bingoProb = Math.min(0.98, bingoProb + 0.10);
        }
        bingoProb = Math.min(0.98, Math.max(0, bingoProb));
      }

      let simOppScore = 0;
      if (Math.random() < bingoProb) {
        // Opponent executes a bingo! Accurately model 9x Triple-Triple or 4x Double-Double reachability
        if (tripleTripleLanes > 0) {
          simOppScore = 50 + (10 + rackFaceVal) * 9 * 0.65;
        } else if (doubleDoubleLanes > 0) {
          simOppScore = 50 + (10 + rackFaceVal) * 4 * 0.75;
        } else {
          simOppScore = 50 + 16 + rackFaceVal * 1.1;
        }
      } else {
        let baseScore = 12 + rackFaceVal * 0.65;
        if (hasOpenTws) {
          if (powerPoints > 0 || blankCount > 0) {
            baseScore = Math.max(baseScore, 38 + powerPoints * 2.2);
          } else {
            baseScore = Math.max(baseScore, 28 + rackFaceVal * 0.5);
          }
        } else if (powerPoints >= 8) {
          baseScore += powerPoints * 1.5;
        }
        simOppScore = baseScore;
      }

      sum += simOppScore;
      const netSpread = ourSpreadBaseline - simOppScore;
      if (netSpread > 0) wins += 1;
      else if (Math.abs(netSpread) < 0.001) wins += 0.5;
    }

    const avgOppScore = Math.round((sum / SIMS) * 10) / 10;
    const winRate = Math.round((wins / SIMS) * 1000) / 10;
    const empiricalNetSpread = Math.round((play.score - avgOppScore) * 10) / 10;

    play.avgOppScore = avgOppScore;
    play.winRate = winRate;
    play.netSpread = empiricalNetSpread;
    totalOppScoreSum += avgOppScore;
  }

  // Relative Defense & Absolute Volatility Penalties (Ruthlessly Protect Leads)
  const baselineOppScore = totalOppScoreSum / topN;
  for (let i = 0; i < topN; i++) {
    const deltaDefense = baselineOppScore - finalPlays[i].avgOppScore;

    let volatilityAdjustment = 0;
    const oppScore = finalPlays[i].avgOppScore;
    if (oppScore > 32.0) {
      const excess = oppScore - 32.0;
      if (scoreDifferential > 30) {
        // Ruthlessly protect lead when leading by >30 pts
        const leadMultiplier = 1.0 + Math.min(2.0, (scoreDifferential - 30) / 30.0);
        volatilityAdjustment = excess * 0.8 * leadMultiplier;
      } else if (scoreDifferential < -30) {
        volatilityAdjustment = excess * 0.2;
      } else {
        volatilityAdjustment = excess * 0.5;
      }
    } else if (scoreDifferential > 30 && oppScore <= 26.0) {
      volatilityAdjustment = -3.0; // Lockdown bonus when protecting lead
    }

    finalPlays[i].totalVal = Math.round((finalPlays[i].totalVal + deltaDefense - volatilityAdjustment) * 10) / 10;
  }
}

self.onmessage = async function (e) {
  if (!e.data) return;
  await ensureLexicon(e.data.activeLexicon || "nwl2023");

  if (e.data && e.data.type === "CHECK_WORD") {
    const activeLexicon = e.data.activeLexicon;
    const w = e.data.word.toLowerCase();
    const len = w.length;
    const wordCodes = new Int8Array(len);
    for (let k = 0; k < len; k++) {
      let charCode = w.charCodeAt(k);
      wordCodes[k] = charCode >= 97 ? charCode - 97 : charCode - 65;
    }

    let inDict = false;
    if (activeLexicon === "csw24") inDict = gaddagCsw24 ? isWordValidCodes(gaddagCsw24, wordCodes, len) : false;
    else if (activeLexicon === "csw21") inDict = gaddagCsw21 ? isWordValidCodes(gaddagCsw21, wordCodes, len) : false;
    else if (activeLexicon === "twl06") inDict = gaddagTwl ? isWordValidCodes(gaddagTwl, wordCodes, len) : false;
    else if (activeLexicon === "sowpods") inDict = gaddagSowpods ? isWordValidCodes(gaddagSowpods, wordCodes, len) : false;
    else inDict = gaddagNwl2023 ? isWordValidCodes(gaddagNwl2023, wordCodes, len) : false;

    self.postMessage({
      type: "CHECK_WORD_RESULT",
      word: e.data.word,
      isValid: inDict,
    });
    return;
  }

  const {
    rack,
    board,
    activePreset,
    activeLexicon,
    sortMode,
    enableIntel,
    manualAvailableTiles,
    scoreDifferential = 0,
    equityMode = "static",
    workerId = 0,
    numWorkers = 1,
    jobId = 0,
  } = e.data;

  if (!rack || !activePreset) {
    self.postMessage({ plays: [], jobId });
    return;
  }

  let gaddag = gaddagNwl2023;
  if (activeLexicon === "csw24") gaddag = gaddagCsw24;
  else if (activeLexicon === "csw21") gaddag = gaddagCsw21;
  else if (activeLexicon === "twl06") gaddag = gaddagTwl;
  else if (activeLexicon === "sowpods") gaddag = gaddagSowpods;
  if (!gaddag) {
    self.postMessage({ plays: [], jobId });
    return;
  }

  currentEquityMode = equityMode;
  const {
    scores = {},
    premiums = {},
    bingoBonus = 50,
    distribution = {},
  } = activePreset;

  resultsCount = 0;
  RACK_COUNTS.fill(0);
  SCORE_TABLE.fill(0);
  PREMIUM_GRID.fill(0);
  BOARD_GRID.fill(0);
  BOARD_IS_BLANK.fill(0);
  IS_ANCHOR_SQUARE.fill(0);
  CROSS_MASK_V.fill(ALL_LETTERS_MASK);
  CROSS_SCORE_BASE_V.fill(0);
  HAS_PERP_GRID_V.fill(0);
  CROSS_MASK_H.fill(ALL_LETTERS_MASK);
  CROSS_SCORE_BASE_H.fill(0);
  HAS_PERP_GRID_H.fill(0);

  let initialWildcards = 0;
  for (let i = 0; i < rack.length; i++) {
    const code = rack.charCodeAt(i);
    if (code >= 97 && code <= 122) RACK_COUNTS[code - 97]++;
    else if (code >= 65 && code <= 90) RACK_COUNTS[code - 65]++;
    else initialWildcards++;
  }
  let wildcards = initialWildcards;

  for (let i = 0; i < 26; i++) {
    const lower = String.fromCharCode(97 + i);
    const upper = String.fromCharCode(65 + i);
    SCORE_TABLE[i] = scores[lower] ?? scores[upper] ?? 0;
  }

  for (let r = 0; r < 15; r++) {
    for (let c = 0; c < 15; c++) {
      const idx = r * 15 + c;
      const p = premiums[`${r},${c}`];
      if (p === "2L") PREMIUM_GRID[idx] = 1;
      else if (p === "3L") PREMIUM_GRID[idx] = 2;
      else if (p === "2W" || p === "CENTER") PREMIUM_GRID[idx] = 3;
      else if (p === "3W") PREMIUM_GRID[idx] = 4;
    }
  }

  let hasBoardTiles = false;
  for (let r = 0; r < 15; r++) {
    for (let c = 0; c < 15; c++) {
      const val = board[r]?.[c];
      if (val && typeof val === "string") {
        const isBlank = val >= "a" && val <= "z";
        const code = val.toLowerCase().charCodeAt(0) - 97;
        if (code >= 0 && code < 26) {
          BOARD_GRID[r * 15 + c] = code + 1;
          BOARD_IS_BLANK[r * 15 + c] = isBlank ? 1 : 0;
          hasBoardTiles = true;
        }
      }
    }
  }

  if (!hasBoardTiles) IS_ANCHOR_SQUARE[7 * 15 + 7] = 1;

  for (let r = 0; r < 15; r++) {
    for (let c = 0; c < 15; c++) {
      const gridIdx = r * 15 + c;
      if (BOARD_GRID[gridIdx] !== 0) {
        if (r > 0 && BOARD_GRID[(r - 1) * 15 + c] === 0)
          IS_ANCHOR_SQUARE[(r - 1) * 15 + c] = 1;
        if (r < 14 && BOARD_GRID[(r + 1) * 15 + c] === 0)
          IS_ANCHOR_SQUARE[(r + 1) * 15 + c] = 1;
        if (c > 0 && BOARD_GRID[r * 15 + (c - 1)] === 0)
          IS_ANCHOR_SQUARE[r * 15 + (c - 1)] = 1;
        if (c < 14 && BOARD_GRID[r * 15 + (c + 1)] === 0)
          IS_ANCHOR_SQUARE[r * 15 + (c + 1)] = 1;
        continue;
      }

      let up = r - 1,
        upCount = 0,
        scoreV = 0;
      while (up >= 0 && BOARD_GRID[up * 15 + c] !== 0) {
        upCount++;
        up--;
      }
      for (let k = 0; k < upCount; k++) {
        const gridIdx = (r - upCount + k) * 15 + c;
        const code = BOARD_GRID[gridIdx] - 1;
        PERP_BUF[k] = code;
        scoreV += BOARD_IS_BLANK[gridIdx] ? 0 : SCORE_TABLE[code];
      }
      let down = r + 1,
        downCount = 0;
      while (down < 15 && BOARD_GRID[down * 15 + c] !== 0) {
        const gridIdx = down * 15 + c;
        const code = BOARD_GRID[gridIdx] - 1;
        PERP_BUF[upCount + 1 + downCount] = code;
        scoreV += BOARD_IS_BLANK[gridIdx] ? 0 : SCORE_TABLE[code];
        downCount++;
        down++;
      }
      const perpLenV = upCount + 1 + downCount;
      if (perpLenV > 1) {
        HAS_PERP_GRID_V[gridIdx] = 1;
        CROSS_SCORE_BASE_V[gridIdx] = scoreV;
        let mask = 0;
        for (let code = 0; code < 26; code++) {
          PERP_BUF[upCount] = code;
          if (isWordValidCodes(gaddag, PERP_BUF, perpLenV)) mask |= 1 << code;
        }
        CROSS_MASK_V[gridIdx] = mask;
      }

      let left = c - 1,
        leftCount = 0,
        scoreH = 0;
      while (left >= 0 && BOARD_GRID[r * 15 + left] !== 0) {
        leftCount++;
        left--;
      }
      for (let k = 0; k < leftCount; k++) {
        const gridIdx = r * 15 + (c - leftCount + k);
        const code = BOARD_GRID[gridIdx] - 1;
        PERP_BUF[k] = code;
        scoreH += BOARD_IS_BLANK[gridIdx] ? 0 : SCORE_TABLE[code];
      }
      let right = c + 1,
        rightCount = 0;
      while (right < 15 && BOARD_GRID[r * 15 + right] !== 0) {
        const gridIdx = r * 15 + right;
        const code = BOARD_GRID[gridIdx] - 1;
        PERP_BUF[leftCount + 1 + rightCount] = code;
        scoreH += BOARD_IS_BLANK[gridIdx] ? 0 : SCORE_TABLE[code];
        rightCount++;
        right++;
      }
      const perpLenH = leftCount + 1 + rightCount;
      if (perpLenH > 1) {
        HAS_PERP_GRID_H[gridIdx] = 1;
        CROSS_SCORE_BASE_H[gridIdx] = scoreH;
        let mask = 0;
        for (let code = 0; code < 26; code++) {
          PERP_BUF[leftCount] = code;
          if (isWordValidCodes(gaddag, PERP_BUF, perpLenH)) mask |= 1 << code;
        }
        CROSS_MASK_H[gridIdx] = mask;
      }
    }
  }

  // Calculate Unseen Pool
  UNSEEN_COUNTS.fill(0);
  let totalUnseen = 0;

  if (enableIntel && manualAvailableTiles && manualAvailableTiles.trim()) {
    const pool = manualAvailableTiles.toUpperCase().replace(/[^A-Z?]/g, "");
    for (let i = 0; i < pool.length; i++) {
      if (pool[i] === "?") UNSEEN_COUNTS[26]++;
      else UNSEEN_COUNTS[pool.charCodeAt(i) - 65]++;
      totalUnseen++;
    }
  } else if (distribution) {
    for (let i = 0; i < 26; i++) {
      const char = String.fromCharCode(65 + i);
      UNSEEN_COUNTS[i] = distribution[char] || 0;
      totalUnseen += UNSEEN_COUNTS[i];
    }
    UNSEEN_COUNTS[26] = distribution["?"] || 0;
    totalUnseen += UNSEEN_COUNTS[26];

    for (let i = 0; i < 225; i++) {
      if (BOARD_GRID[i] !== 0) {
        if (BOARD_IS_BLANK[i]) {
          UNSEEN_COUNTS[26]--;
        } else {
          UNSEEN_COUNTS[BOARD_GRID[i] - 1]--;
        }
        totalUnseen--;
      }
    }
    for (let i = 0; i < 26; i++) {
      UNSEEN_COUNTS[i] -= RACK_COUNTS[i];
      totalUnseen -= RACK_COUNTS[i];
    }
    UNSEEN_COUNTS[26] -= initialWildcards;
    totalUnseen -= initialWildcards;
  }

  // UPGRADE 3: Dynamic Triple-Word Score Lane Danger Estimation
  let twsThreatWeight = 12.0; // Default penalty
  if (
    UNSEEN_COUNTS[9] > 0 || // J
    UNSEEN_COUNTS[16] > 0 || // Q
    UNSEEN_COUNTS[23] > 0 || // X
    UNSEEN_COUNTS[25] > 0 || // Z
    UNSEEN_COUNTS[26] > 0 // Blank
  ) {
    twsThreatWeight = 22.0; // Extreme penalty if power tiles are in opponent pool
  } else if (
    UNSEEN_COUNTS[7] > 0 || // H
    UNSEEN_COUNTS[22] > 0 || // W
    UNSEEN_COUNTS[12] > 0 // M
  ) {
    twsThreatWeight = 16.0; // Moderate penalty for versatile offensive tiles
  }

  // Stage 2 (Option 1B): Board-Wide Open Triple Word Score Lane Pre-computation
  const TWS_COORDS = [
    [0, 0], [0, 7], [0, 14],
    [7, 0],         [7, 14],
    [14, 0], [14, 7], [14, 14]
  ];

  let exposedTwsRowsMask = 0;
  let exposedTwsColsMask = 0;
  let totalExposedTwsCount = 0;

  for (let t = 0; t < TWS_COORDS.length; t++) {
    const tr = TWS_COORDS[t][0];
    const tc = TWS_COORDS[t][1];
    const gIdx = tr * 15 + tc;

    // Filled TWS squares are already neutralized
    if (BOARD_GRID[gIdx] !== 0) continue;

    // Check if TWS square is an active anchor itself
    if (IS_ANCHOR_SQUARE[gIdx] === 1) {
      exposedTwsRowsMask |= (1 << tr);
      exposedTwsColsMask |= (1 << tc);
      totalExposedTwsCount++;
      continue;
    }

    // Check reachable anchors along horizontal row `tr` (within reach of 7 tiles)
    let hReachable = false;
    for (let c = Math.max(0, tc - 7); c <= Math.min(14, tc + 7); c++) {
      if (c !== tc && IS_ANCHOR_SQUARE[tr * 15 + c] === 1) {
        hReachable = true;
        break;
      }
    }
    if (hReachable) {
      exposedTwsRowsMask |= (1 << tr);
      totalExposedTwsCount++;
    }

    // Check reachable anchors along vertical column `tc` (within reach of 7 tiles)
    let vReachable = false;
    for (let r = Math.max(0, tr - 7); r <= Math.min(14, tr + 7); r++) {
      if (r !== tr && IS_ANCHOR_SQUARE[r * 15 + tc] === 1) {
        vReachable = true;
        break;
      }
    }
    if (vReachable) {
      exposedTwsColsMask |= (1 << tc);
      totalExposedTwsCount++;
    }
  }

  // Multi-Multiplier High-Risk Corridors (9x Triple-Triple and 4x Double-Double) Initial State
  let initialExposedCorridorsMask = 0;
  let hasExposedTripleTriple = false;
  let hasExposedDoubleDouble = false;
  for (let cIdx = 0; cIdx < MULTI_CORRIDORS.length; cIdx++) {
    const c = MULTI_CORRIDORS[cIdx];
    if (BOARD_GRID[c.m1] !== 0 && BOARD_GRID[c.m2] !== 0) continue;
    let emptyCount = 0;
    let hasAnchor = false;
    for (let p = c.start; p <= c.end; p++) {
      const r = c.isVert ? p : c.line;
      const col = c.isVert ? c.line : p;
      const idx = r * 15 + col;
      if (BOARD_GRID[idx] !== 0) {
        hasAnchor = true;
      } else {
        emptyCount++;
        if (IS_ANCHOR_SQUARE[idx] === 1) hasAnchor = true;
        const up = r > 0 && BOARD_GRID[(r - 1) * 15 + col] !== 0;
        const dn = r < 14 && BOARD_GRID[(r + 1) * 15 + col] !== 0;
        const lt = col > 0 && BOARD_GRID[r * 15 + col - 1] !== 0;
        const rt = col < 14 && BOARD_GRID[r * 15 + col + 1] !== 0;
        if (up || dn || lt || rt) hasAnchor = true;
      }
    }
    if (emptyCount <= 8 && hasAnchor) {
      initialExposedCorridorsMask |= (1 << cIdx);
      if (c.type === 9) hasExposedTripleTriple = true;
      else hasExposedDoubleDouble = true;
    }
  }

  const recordPlay = (startPos, endPos, rackUsed, isVertical, lineIdx) => {
    if (resultsCount >= MAX_RESULTS) return;

    let mainWordScore = 0,
      mainWordMult = 1,
      crossScoreTotal = 0,
      exposes3W = 0,
      exposes2W = 0,
      exposes3L = 0,
      blocksDWS = 0,
      opensTWS = 0,
      crossWordsCount = 0;
    const charOffset = resultsCount * 15;
    let wordLen = 0;
    let placedCount = 0;

    for (let k = 0; k < 26; k++) REMAINING_COUNTS[k] = RACK_COUNTS[k];
    let blanksLeft = wildcards;

    for (let p = startPos; p <= endPos; p++) {
      const charCode = PLACED_LETTERS[p];
      const isBlank = PLACED_IS_BLANK[p] === 1;
      RES_WORD_CHARS[charOffset + wordLen] = charCode + (isBlank ? 32 : 0);
      wordLen++;

      const r = isVertical ? p : lineIdx;
      const c = isVertical ? lineIdx : p;
      const gIdx = r * 15 + c;
      const premium = PREMIUM_GRID[gIdx];
      const isExisting = BOARD_GRID[gIdx] !== 0;

      if (isExisting) {
        mainWordScore += BOARD_IS_BLANK[gIdx] ? 0 : SCORE_TABLE[charCode];
      } else {
        PLACED_CELLS[placedCount++] = gIdx;
        let letterVal = isBlank ? 0 : SCORE_TABLE[charCode];
        if (premium === 1) letterVal *= 2;
        else if (premium === 2) letterVal *= 3;
        else if (premium === 3) mainWordMult *= 2;
        else if (premium === 4) mainWordMult *= 3;
        mainWordScore += letterVal;

        const upFree = r > 0 && BOARD_GRID[(r - 1) * 15 + c] === 0;
        const dnFree = r < 14 && BOARD_GRID[(r + 1) * 15 + c] === 0;
        const ltFree = c > 0 && BOARD_GRID[r * 15 + c - 1] === 0;
        const rtFree = c < 14 && BOARD_GRID[r * 15 + c + 1] === 0;

        const upPrem = upFree ? PREMIUM_GRID[(r - 1) * 15 + c] : 0;
        const dnPrem = dnFree ? PREMIUM_GRID[(r + 1) * 15 + c] : 0;
        const ltPrem = ltFree ? PREMIUM_GRID[r * 15 + c - 1] : 0;
        const rtPrem = rtFree ? PREMIUM_GRID[r * 15 + c + 1] : 0;

        if (premium === 3) blocksDWS = 1;
        if (upPrem === 4 || dnPrem === 4 || ltPrem === 4 || rtPrem === 4) {
          exposes3W = 1;
          if (!isBlank && (charCode === 0 || charCode === 4 || charCode === 8 || charCode === 14 || charCode === 20)) {
            opensTWS = 1;
          }
        }
        if (upPrem === 3 || dnPrem === 3 || ltPrem === 3 || rtPrem === 3)
          exposes2W = 1;
        if (upPrem === 2 || dnPrem === 2 || ltPrem === 2 || rtPrem === 2)
          exposes3L = 1;

        if (LINE_HAS_PERP[p] === 1) {
          crossWordsCount++;
          let pVal = isBlank ? 0 : SCORE_TABLE[charCode];
          if (premium === 1) pVal *= 2;
          else if (premium === 2) pVal *= 3;
          let cMult = 1;
          if (premium === 3) cMult = 2;
          else if (premium === 4) cMult = 3;
          crossScoreTotal += (LINE_CROSS_SCORES[p] + pVal) * cMult;
        }
      }
    }

    let totalScore = mainWordScore * mainWordMult + crossScoreTotal;
    if (rackUsed === 7) totalScore += bingoBonus;

    const leaveEquity = evaluateLeaveEquity(
      REMAINING_COUNTS,
      blanksLeft,
      totalUnseen,
    );

    // Multi-Multiplier High-Risk Corridor Evaluation (9x Triple-Triple and 4x Double-Double)
    let opensTripleTriple = 0;
    let opensDoubleDouble = 0;
    let blocksTripleTriple = 0;
    let blocksDoubleDouble = 0;

    for (let cIdx = 0; cIdx < MULTI_CORRIDORS.length; cIdx++) {
      const c = MULTI_CORRIDORS[cIdx];
      const wasExposed = (initialExposedCorridorsMask & (1 << cIdx)) !== 0;

      let placedOnM1 = false;
      let placedOnM2 = false;
      for (let ci = 0; ci < placedCount; ci++) {
        const pIdx = PLACED_CELLS[ci];
        if (pIdx === c.m1) placedOnM1 = true;
        if (pIdx === c.m2) placedOnM2 = true;
      }

      if (wasExposed) {
        if (placedOnM1 || placedOnM2) {
          if (c.type === 9) blocksTripleTriple = 1;
          else blocksDoubleDouble = 1;
        }
      } else {
        let placesInsideCorridor = false;
        for (let ci = 0; ci < placedCount; ci++) {
          const pIdx = PLACED_CELLS[ci];
          const pr = (pIdx / 15) | 0;
          const pc = pIdx % 15;
          if (c.isVert) {
            if (pc === c.line && pr >= c.start && pr <= c.end) {
              placesInsideCorridor = true;
              break;
            }
            if ((pc === c.line - 1 || pc === c.line + 1) && pr >= c.start && pr <= c.end) {
              placesInsideCorridor = true;
              break;
            }
          } else {
            if (pr === c.line && pc >= c.start && pc <= c.end) {
              placesInsideCorridor = true;
              break;
            }
            if ((pr === c.line - 1 || pr === c.line + 1) && pc >= c.start && pc <= c.end) {
              placesInsideCorridor = true;
              break;
            }
          }
        }

        if (placesInsideCorridor) {
          if (c.type === 9) opensTripleTriple = 1;
          else opensDoubleDouble = 1;
        }
      }
    }

    // UPGRADE 4: Continuous Risk Scaling & Tactical Rewards
    let defensivePenalty = 0;
    if (exposes3W === 1) defensivePenalty += twsThreatWeight;
    if (exposes2W === 1) defensivePenalty += 4.0; // Nerfed from 6.5
    if (exposes3L === 1) defensivePenalty += 2.0; // Nerfed from 4.0

    // Stage 1 Multi-Multiplier Corridor Defense
    if (opensTripleTriple === 1) defensivePenalty += 24.0;
    if (opensDoubleDouble === 1) defensivePenalty += 12.0;
    if (hasExposedTripleTriple && blocksTripleTriple === 0) defensivePenalty += 10.0;
    if (hasExposedDoubleDouble && blocksDoubleDouble === 0) defensivePenalty += 5.0;

    // Stage 2 (Option 1B): Board-Wide Exposed TWS Lane Defense & Risk
    let blocksExposedTwsLane = 0;
    if (totalExposedTwsCount > 0) {
      if (!isVertical) {
        // Horizontal word along row `lineIdx`
        if ((exposedTwsRowsMask & (1 << lineIdx)) !== 0) {
          blocksExposedTwsLane = 1;
        }
      } else {
        // Vertical word along column `lineIdx`
        if ((exposedTwsColsMask & (1 << lineIdx)) !== 0) {
          blocksExposedTwsLane = 1;
        }
      }

      if (blocksExposedTwsLane === 0) {
        // Play is placed away from exposed TWS lanes, leaving them vulnerable to opponent hooks
        if (twsThreatWeight >= 16.0 || UNSEEN_COUNTS[26] > 0) {
          defensivePenalty += (twsThreatWeight * 0.35);
        }
      }
    }
    
    // Asymmetrical Risk Scaling: Protect leads ruthlessly, maintain a 75% defense floor when behind
    let riskMultiplier = 1.0;
    if (scoreDifferential > 0) {
      riskMultiplier += (scoreDifferential / 40.0);
    } else {
      riskMultiplier += (scoreDifferential / 150.0); 
    }
    riskMultiplier = Math.max(0.75, Math.min(riskMultiplier, 3.0));
    defensivePenalty *= riskMultiplier;

    // Proactive Tactical Bonuses & Turnover Cycling
    let tacticalBonus = 0;
    if (blocksDWS === 1) tacticalBonus += 5.0; 
    if (crossWordsCount >= 2) tacticalBonus += 3.5;
    if (blocksExposedTwsLane === 1) tacticalBonus += 6.0; // Option 1B: reward sealing exposed TWS lanes
    if (blocksTripleTriple === 1) tacticalBonus += 8.0;
    if (blocksDoubleDouble === 1) tacticalBonus += 5.0;
    
    // Option 1A: Turnover Bonus - Only reward cycling when the bag has tiles to replenish!
    if (totalUnseen > 14 && rackUsed >= 4 && rackUsed <= 6) {
      tacticalBonus += (rackUsed * 1.5); 
    }

    // Option 1A: Endgame Rack Valuation & Outplay Bonus
    // When bag is empty (totalUnseen <= 7), penalize stranded tiles unless going out
    if (totalUnseen <= 7) {
      let unplayedSum = 0;
      let tilesRemaining = 0;
      for (let c = 0; c < 26; c++) {
        if (REMAINING_COUNTS[c] > 0) {
          unplayedSum += REMAINING_COUNTS[c] * SCORE_TABLE[c];
          tilesRemaining += REMAINING_COUNTS[c];
        }
      }
      tilesRemaining += blanksLeft;

      if (tilesRemaining === 0) {
        // Going out completely in the endgame receives a massive bonus!
        tacticalBonus += 25.0;
      } else {
        // Stranded tiles are worth double negative value in the endgame
        tacticalBonus -= (unplayedSum * 1.2);
      }
    }
    
    const totalPlayValue = totalScore + leaveEquity + tacticalBonus - defensivePenalty;

    const leaveOffset = resultsCount * 7;
    let leaveLen = 0;
    for (let k = 0; k < blanksLeft; k++) {
      RES_LEAVE_CHARS[leaveOffset + leaveLen] = 63;
      leaveLen++;
    }
    for (let k = 0; k < 26; k++) {
      for (let count = 0; count < REMAINING_COUNTS[k]; count++) {
        if (leaveLen < 7) {
          RES_LEAVE_CHARS[leaveOffset + leaveLen] = 65 + k;
          leaveLen++;
        }
      }
    }

    const isBingo = rackUsed === 7 ? 1 : 0;
    const usedBlank = (initialWildcards > 0 && blanksLeft < initialWildcards) ? 1 : 0;
    const retainsBlank = (initialWildcards > 0 && blanksLeft === initialWildcards) ? 1 : 0;

    RES_WORD_LEN[resultsCount] = wordLen;
    RES_SCORE[resultsCount] = totalScore;
    RES_EQUITY[resultsCount] = leaveEquity;
    RES_TOTAL_VAL[resultsCount] = totalPlayValue;
    RES_LEAVE_LEN[resultsCount] = leaveLen;
    RES_ROW[resultsCount] = isVertical ? startPos : lineIdx;
    RES_COL[resultsCount] = isVertical ? lineIdx : startPos;
    RES_DIR[resultsCount] = isVertical ? 1 : 0;
    RES_TACTICS[resultsCount] =
      (exposes3W) |
      (opensTWS << 1) |
      (blocksDWS << 2) |
      ((crossWordsCount >= 2 ? 1 : 0) << 3) |
      (blocksExposedTwsLane << 4) |
      (opensTripleTriple << 5) |
      (opensDoubleDouble << 6) |
      (blocksTripleTriple << 7) |
      (blocksDoubleDouble << 8) |
      (retainsBlank << 10) |
      (usedBlank << 11) |
      (isBingo << 12);

    resultsCount++;
  };

  const searchVector = (isVertical, lineIdx) => {
    const crossMask = isVertical ? CROSS_MASK_H : CROSS_MASK_V;
    const crossScoreBase = isVertical ? CROSS_SCORE_BASE_H : CROSS_SCORE_BASE_V;
    const hasPerpGrid = isVertical ? HAS_PERP_GRID_H : HAS_PERP_GRID_V;

    let lineTilesMask = 0;
    for (let i = 0; i < 15; i++) {
      const gIdx = isVertical ? i * 15 + lineIdx : lineIdx * 15 + i;
      LINE_TILES[i] = BOARD_GRID[gIdx];
      if (BOARD_GRID[gIdx] !== 0) lineTilesMask |= 1 << i;
      LINE_ANCHORS[i] = IS_ANCHOR_SQUARE[gIdx];
      LINE_CROSS_MASKS[i] = crossMask[gIdx];
      LINE_CROSS_SCORES[i] = crossScoreBase[gIdx];
      LINE_HAS_PERP[i] = hasPerpGrid[gIdx];
    }

    const gen = (
      pos,
      currPos,
      nodeIdx,
      direction,
      minPos,
      maxPos,
      tilesUsed,
    ) => {
      if (nodeIdx !== 0) {
        const entry = gaddag[nodeIdx];
        if ((entry & 0x20) !== 0 && tilesUsed > 0 && maxPos > minPos) {
          const leftClean =
            minPos === 0 || (lineTilesMask & (1 << (minPos - 1))) === 0;
          let rightClean = false;
          if (direction > 0)
            rightClean =
              currPos >= 15 || (lineTilesMask & (1 << currPos)) === 0;
          else
            rightClean =
              pos + 1 >= 15 || (lineTilesMask & (1 << (pos + 1))) === 0;

          if (leftClean && rightClean)
            recordPlay(minPos, maxPos, tilesUsed, isVertical, lineIdx);
        }
      }

      if (direction > 0 && currPos >= 15) return;
      let childPointer = gaddag[nodeIdx] >>> 7;
      if (childPointer === 0) return;

      while (childPointer !== 0) {
        const entry = gaddag[childPointer];
        const letterCode = entry & 0x1f;
        const hasSibling = (entry & 0x40) !== 0;

        if (letterCode === REV_CODE) {
          if (direction < 0)
            gen(pos, pos + 1, childPointer, 1, minPos, maxPos, tilesUsed);
        } else if (letterCode < 26) {
          if (currPos >= 0 && currPos < 15) {
            const existing = LINE_TILES[currPos];
            if (existing !== 0) {
              if (existing - 1 === letterCode) {
                PLACED_LETTERS[currPos] = letterCode;
                PLACED_IS_BLANK[currPos] = 0;
                const nextMin =
                  direction < 0 && currPos < minPos ? currPos : minPos;
                const nextMax =
                  direction > 0 && currPos > maxPos ? currPos : maxPos;
                gen(
                  pos,
                  currPos + direction,
                  childPointer,
                  direction,
                  nextMin,
                  nextMax,
                  tilesUsed,
                );
              }
            } else {
              if ((LINE_CROSS_MASKS[currPos] & (1 << letterCode)) !== 0) {
                const nextMin =
                  direction < 0 && currPos < minPos ? currPos : minPos;
                const nextMax =
                  direction > 0 && currPos > maxPos ? currPos : maxPos;

                if (RACK_COUNTS[letterCode] > 0) {
                  RACK_COUNTS[letterCode]--;
                  PLACED_LETTERS[currPos] = letterCode;
                  PLACED_IS_BLANK[currPos] = 0;
                  gen(
                    pos,
                    currPos + direction,
                    childPointer,
                    direction,
                    nextMin,
                    nextMax,
                    tilesUsed + 1,
                  );
                  RACK_COUNTS[letterCode]++;
                } else if (wildcards > 0) {
                  wildcards--;
                  PLACED_LETTERS[currPos] = letterCode;
                  PLACED_IS_BLANK[currPos] = 1;
                  gen(
                    pos,
                    currPos + direction,
                    childPointer,
                    direction,
                    nextMin,
                    nextMax,
                    tilesUsed + 1,
                  );
                  wildcards++;
                }
              }
            }
          }
        }
        if (!hasSibling) break;
        childPointer++;
      }
    };

    let anchorMask = 0;
    for (let pos = 0; pos < 15; pos++) {
      if (LINE_ANCHORS[pos] === 1) anchorMask |= 1 << pos;
    }

    // Fast Bitboard Traversal using trailing zeros count (TZCNT)
    while (anchorMask !== 0) {
      // Isolate the lowest set bit
      const lowestBit = anchorMask & -anchorMask;
      // Calculate the position of the bit (0 to 14)
      const pos = 31 - Math.clz32(lowestBit);

      gen(pos, pos, 0, -1, pos, pos, 0);

      // Clear the lowest set bit
      anchorMask &= anchorMask - 1;
    }
  };

  for (let i = 0; i < 15; i++) {
    if (i % numWorkers === workerId) {
      searchVector(false, i);
      searchVector(true, i);
    }
  }

  // Exact Endgame Deduction
  OPP_RACK_COUNTS.fill(0);
  let oppWildcards = 0;
  let isDeterministicOpponent = false;

  if (enableIntel && totalUnseen > 0 && totalUnseen <= 7) {
    isDeterministicOpponent = true;
    for (let i = 0; i < 26; i++) OPP_RACK_COUNTS[i] = UNSEEN_COUNTS[i];
    oppWildcards = UNSEEN_COUNTS[26];
  }

  // Strategic Exchange Logic
  let bestExchange = null;
  let maxExchVal = -999;

  if (workerId === 0 && totalUnseen >= 7) {
    let bagEquitySum = 0;
    for (let c = 0; c < 26; c++)
      bagEquitySum += (UNSEEN_COUNTS[c] || 0) * (BASE_LEAVE_EQUITY[c] / 10.0);
    bagEquitySum += (UNSEEN_COUNTS[26] || 0) * (BLANK_LEAVE_EQUITY / 10.0);
    const avgDrawEquityPerTile =
      totalUnseen > 0 ? bagEquitySum / totalUnseen : 0;

    const rackLetters = [];
    for (let c = 0; c < 26; c++) {
      for (let k = 0; k < RACK_COUNTS[c]; k++) rackLetters.push(c);
    }
    for (let k = 0; k < initialWildcards; k++) rackLetters.push(26);

    const n = rackLetters.length;
    if (n > 0) {
      const totalSubsets = 1 << n;
      for (let mask = 1; mask < totalSubsets; mask++) {
        const keptCounts = new Int8Array(26);
        let keptBlanks = 0;
        let dumpStr = "";
        let dumpCount = 0;

        for (let i = 0; i < n; i++) {
          if ((mask & (1 << i)) === 0) {
            if (rackLetters[i] === 26) keptBlanks++;
            else keptCounts[rackLetters[i]]++;
          } else {
            dumpCount++;
            dumpStr +=
              rackLetters[i] === 26
                ? "?"
                : String.fromCharCode(65 + rackLetters[i]);
          }
        }

        const leaveEquity = evaluateLeaveEquity(
          keptCounts,
          keptBlanks,
          totalUnseen,
        );
        const expectedDrawValue = dumpCount * avgDrawEquityPerTile;
        // Anti-Surrender Tempo: Exchanging is strictly an emergency measure.
        // Never give top bots free unanswered turns when winning OR losing.
        let tempoPenalty = -5.0;
        if (scoreDifferential < -30) tempoPenalty = -10.0; // Trailing? Never give away free turns to top bots!
        else if (scoreDifferential > 30) tempoPenalty = -8.0; // Leading? Protect the lead ruthlessly.

        const totalVal = leaveEquity + expectedDrawValue + tempoPenalty;

        if (totalVal > maxExchVal) {
          maxExchVal = totalVal;
          bestExchange = {
            word: dumpStr,
            score: 0,
            leaveEquity: Math.round(leaveEquity * 10) / 10,
            totalVal: Math.round(totalVal * 10) / 10,
            leave: "",
            row: 0,
            col: 0,
            dir: "EXCH",
            exposes3W: false,
            opensTWS: false,
            blocksDWS: false,
            isHotSpot: false,
            blocksExposedTwsLane: 0,
            opensTripleTriple: false,
            opensDoubleDouble: false,
            blocksTripleTriple: false,
            blocksDoubleDouble: false,
            blankSurchargeApplied: false,
            retainsBlank: keptBlanks > 0,
            baseScore: 0,
            defPenalty: 0,
          };
        }
      }
    }
  }

  // Stage 1: Blank Consumption Surcharge
  // Deduct -14.0 equity if candidate play expends a blank without scoring >= 50 or bingoing,
  // when a non-blank alternative is within 15 points
  if (initialWildcards > 0) {
    let maxNonBlankScore = -999;
    for (let i = 0; i < resultsCount; i++) {
      if ((RES_TACTICS[i] & (1 << 11)) === 0) {
        if (RES_SCORE[i] > maxNonBlankScore) {
          maxNonBlankScore = RES_SCORE[i];
        }
      }
    }

    if (maxNonBlankScore > -999) {
      for (let i = 0; i < resultsCount; i++) {
        const usedBlank = (RES_TACTICS[i] & (1 << 11)) !== 0;
        if (usedBlank) {
          const score = RES_SCORE[i];
          const isBingo = (RES_TACTICS[i] & (1 << 12)) !== 0;
          if (!isBingo && score < 50 && (score - maxNonBlankScore <= 15)) {
            RES_TOTAL_VAL[i] -= 14.0;
            RES_TACTICS[i] |= (1 << 9); // Bit 9: blankSurchargeApplied
          }
        }
      }
    }
  }

  // Sort candidate plays
  for (let i = 0; i < resultsCount; i++) INDEX_ARRAY[i] = i;
  const validSlice = INDEX_ARRAY.subarray(0, resultsCount);

  validSlice.sort((a, b) => {
    if (sortMode === "score") {
      const sDiff = RES_SCORE[b] - RES_SCORE[a];
      return sDiff !== 0 ? sDiff : RES_TOTAL_VAL[b] - RES_TOTAL_VAL[a];
    } else {
      const vDiff = RES_TOTAL_VAL[b] - RES_TOTAL_VAL[a];
      return Math.abs(vDiff) > 0.001 ? vDiff : RES_SCORE[b] - RES_SCORE[a];
    }
  });

  const finalPlays = [];
  const topCandidatesCount = Math.min(resultsCount, 30);

  for (let i = 0; i < resultsCount; i++) {
    const idx = validSlice[i];
    const row = RES_ROW[idx];
    const col = RES_COL[idx];
    const dir = RES_DIR[idx] === 1 ? "V" : "H";
    const len = RES_WORD_LEN[idx];
    const charOffset = idx * 15;

    let duplicate = false;
    for (let j = 0; j < finalPlays.length; j++) {
      const ex = finalPlays[j];
      if (
        ex.row === row &&
        ex.col === col &&
        ex.dir === dir &&
        ex.word.length === len
      ) {
        let match = true;
        for (let k = 0; k < len; k++) {
          const stored = RES_WORD_CHARS[charOffset + k];
          const expectedCode = stored >= 32 ? stored - 32 + 97 : stored + 65;
          if (ex.word.charCodeAt(k) !== expectedCode) {
            match = false;
            break;
          }
        }
        if (match) {
          duplicate = true;
          break;
        }
      }
    }
    if (duplicate) continue;

    let wordStr = "";
    for (let k = 0; k < len; k++) {
      const stored = RES_WORD_CHARS[charOffset + k];
      wordStr += String.fromCharCode(
        stored >= 32 ? stored - 32 + 97 : stored + 65,
      );
    }

    const leaveOffset = idx * 7;
    const leaveLen = RES_LEAVE_LEN[idx];
    let leaveStr = "";
    for (let k = 0; k < leaveLen; k++)
      leaveStr += String.fromCharCode(RES_LEAVE_CHARS[leaveOffset + k]);
    if (leaveStr.length === 0) leaveStr = "None";

    let oppBestReply = null;
    let netSpread = null;
    let totalValAdjusted = RES_TOTAL_VAL[idx];

    // Endgame Minimax Counter
    if (
      sortMode !== "score" &&
      isDeterministicOpponent
    ) {
      if (leaveLen === 0) {
        // Outplay: game ends immediately, opponent gets 0 reply
        netSpread = RES_SCORE[idx];
        oppBestReply = null;
      } else if (i < topCandidatesCount || ((RES_TACTICS[idx] & 16) === 16)) {
        TEMP_BOARD_GRID.set(BOARD_GRID);
        TEMP_BOARD_IS_BLANK.set(BOARD_IS_BLANK);
        for (let k = 0; k < len; k++) {
          const r = dir === "V" ? row + k : row;
          const c = dir === "H" ? col + k : col;
          const stored = RES_WORD_CHARS[charOffset + k];
          const isBlank = stored >= 32;
          const charCode = isBlank ? stored - 32 : stored;

          TEMP_BOARD_GRID[r * 15 + c] = charCode + 1;
          TEMP_BOARD_IS_BLANK[r * 15 + c] = isBlank ? 1 : 0;
        }

        const oppReply = findOpponentBestScore(
          gaddag,
          TEMP_BOARD_GRID,
          TEMP_BOARD_IS_BLANK,
          OPP_RACK_COUNTS,
          oppWildcards,
          bingoBonus,
          row,
          col,
          dir,
          len,
        );
        if (oppReply.bestOppWord) {
          oppBestReply = {
            word: oppReply.bestOppWord,
            score: oppReply.maxOppScore,
            row: oppReply.bestOppRow,
            col: oppReply.bestOppCol,
            dir: oppReply.bestOppDir,
          };
          netSpread = RES_SCORE[idx] - oppReply.maxOppScore;
          totalValAdjusted = netSpread + RES_EQUITY[idx] * 0.5;
        }
      }
    } else if (
      sortMode !== "score" &&
      !isDeterministicOpponent &&
      enableIntel &&
      totalUnseen > 7 &&
      i < 15
    ) {
      // Midgame Opponent Counter-Play Deduction: Sample representative threat rack from unseen pool
      TEMP_BOARD_GRID.set(BOARD_GRID);
      TEMP_BOARD_IS_BLANK.set(BOARD_IS_BLANK);
      for (let k = 0; k < len; k++) {
        const r = dir === "V" ? row + k : row;
        const c = dir === "H" ? col + k : col;
        const stored = RES_WORD_CHARS[charOffset + k];
        const isBlank = stored >= 32;
        const charCode = isBlank ? stored - 32 : stored;

        TEMP_BOARD_GRID[r * 15 + c] = charCode + 1;
        TEMP_BOARD_IS_BLANK[r * 15 + c] = isBlank ? 1 : 0;
      }

      const midOppCounts = new Int8Array(26);
      let midOppWilds = 0;
      let drawn = 0;
      if (UNSEEN_COUNTS[26] > 0) {
        midOppWilds = 1;
        drawn++;
      }
      for (const pt of [25, 23, 16, 9, 18, 4, 0]) {
        if (drawn < 7 && UNSEEN_COUNTS[pt] > 0) {
          midOppCounts[pt]++;
          drawn++;
        }
      }
      for (let c = 0; c < 26 && drawn < 7; c++) {
        const available = UNSEEN_COUNTS[c] - midOppCounts[c];
        for (let k = 0; k < available && drawn < 7; k++) {
          midOppCounts[c]++;
          drawn++;
        }
      }

      const oppReply = findOpponentBestScore(
        gaddag,
        TEMP_BOARD_GRID,
        TEMP_BOARD_IS_BLANK,
        midOppCounts,
        midOppWilds,
        bingoBonus,
        row,
        col,
        dir,
        len,
      );

      if (oppReply.bestOppWord) {
        oppBestReply = {
          word: oppReply.bestOppWord,
          score: oppReply.maxOppScore,
          row: oppReply.bestOppRow,
          col: oppReply.bestOppCol,
          dir: oppReply.bestOppDir,
        };
        netSpread = RES_SCORE[idx] - oppReply.maxOppScore;
      }
    }

    finalPlays.push({
      word: wordStr,
      score: RES_SCORE[idx],
      leaveEquity: Math.round(RES_EQUITY[idx] * 10) / 10,
      totalVal: Math.round(totalValAdjusted * 10) / 10,
      leave: leaveStr,
      row,
      col,
      dir,
      exposes3W: (RES_TACTICS[idx] & 1) === 1,
      opensTWS: (RES_TACTICS[idx] & 2) === 2,
      blocksDWS: (RES_TACTICS[idx] & 4) === 4,
      isHotSpot: (RES_TACTICS[idx] & 8) === 8,
      blocksExposedTwsLane: (RES_TACTICS[idx] & 16) === 16 ? 1 : 0,
      opensTripleTriple: (RES_TACTICS[idx] & 32) === 32,
      opensDoubleDouble: (RES_TACTICS[idx] & 64) === 64,
      blocksTripleTriple: (RES_TACTICS[idx] & 128) === 128,
      blocksDoubleDouble: (RES_TACTICS[idx] & 256) === 256,
      blankSurchargeApplied: (RES_TACTICS[idx] & 512) === 512,
      retainsBlank: (RES_TACTICS[idx] & 1024) === 1024,
      baseScore: RES_SCORE[idx],
      defPenalty: RES_SCORE[idx] + Math.round(RES_EQUITY[idx] * 10) / 10 - Math.round(totalValAdjusted * 10) / 10,
      oppBestReply,
      netSpread,
      isValid: true,
    });

    if (finalPlays.length >= 100) {
      if (!isDeterministicOpponent || finalPlays.length >= 130) break;
      const isSpecialTactical = leaveLen === 0 || ((RES_TACTICS[idx] & 16) === 16);
      if (!isSpecialTactical) continue;
    }
  }

  // Include Strategic Exchange Option
  if (bestExchange) {
    const keptArr = [];
    const rackArr = rack.toUpperCase().split("");
    for (const c of rackArr) keptArr.push(c);
    for (const d of bestExchange.word.split("")) {
      const idx = keptArr.indexOf(d);
      if (idx !== -1) keptArr.splice(idx, 1);
    }
    bestExchange.leave = keptArr.join("") || "None";
    finalPlays.push(bestExchange);
  }

  // Phase 2: Trigger WebGPU Compute Pass (or CPU Fast Simulation Fallback)
  if (
    sortMode !== "score" &&
    totalUnseen > 7 &&
    enableIntel &&
    finalPlays.length > 0
  ) {
    const unseenArray = [];
    for (let i = 0; i < 26; i++) {
      for (let j = 0; j < UNSEEN_COUNTS[i]; j++) unseenArray.push(i);
    }
    for (let j = 0; j < UNSEEN_COUNTS[26]; j++) unseenArray.push(26);

    if (gpuDevice) {
      await runGPUSimulations(finalPlays, unseenArray, totalUnseen, gaddag, scoreDifferential);
    } else {
      runCPUSimulations(finalPlays, unseenArray, totalUnseen, scoreDifferential);
    }
  }

  // Phase 4: Exact Alpha-Beta Perfect Endgame Solver
  if (
    sortMode !== "score" &&
    isDeterministicOpponent &&
    finalPlays.length > 0
  ) {
    // Stage 2: Clear Transposition Table for this endgame solve
    clearTranspositionTable();

    const candidatesToEval = [];
    const seenPlays = new Set();

    // 1. Include top heuristic candidates
    const topCount = Math.min(finalPlays.length, topCandidatesCount);
    for (let i = 0; i < topCount; i++) {
      const p = finalPlays[i];
      if (p.dir !== "EXCH" && !seenPlays.has(p)) {
        seenPlays.add(p);
        candidatesToEval.push(p);
      }
    }

    // 2. Stage 3 (Option 1C): Guaranteed inclusion of killer outplays & defensive TWS blockers
    for (let i = topCount; i < finalPlays.length; i++) {
      const p = finalPlays[i];
      if (p.dir === "EXCH" || seenPlays.has(p)) continue;
      if (p.leave === "None" || p.blocksExposedTwsLane === 1) {
        seenPlays.add(p);
        candidatesToEval.push(p);
      }
    }

    for (let i = 0; i < candidatesToEval.length; i++) {
      const play = candidatesToEval[i];

      let ourTilesUsed = 0;
      let tempRackCounts = new Int8Array(RACK_COUNTS);
      let tempWilds = initialWildcards;

      const newBoard = new Int8Array(BOARD_GRID);
      const newBoardIsBlank = new Uint8Array(BOARD_IS_BLANK);

      const len = play.word.length;
      for (let k = 0; k < len; k++) {
        const r = play.dir === "V" ? play.row + k : play.row;
        const c = play.dir === "H" ? play.col + k : play.col;
        if (!BOARD_GRID || BOARD_GRID[r * 15 + c] === 0) {
          ourTilesUsed++;
          let charCode = play.word.charCodeAt(k);
          const isBlank = charCode >= 97;
          const num = isBlank ? charCode - 97 : charCode - 65;

          newBoard[r * 15 + c] = num + 1;
          newBoardIsBlank[r * 15 + c] = isBlank ? 1 : 0;

          if (isBlank) tempWilds--;
          else if (tempRackCounts[num] > 0) tempRackCounts[num]--;
        }
      }

      let totalRackTiles = initialWildcards;
      for (let c = 0; c < 26; c++) totalRackTiles += RACK_COUNTS[c];
      let ourTilesRemaining = totalRackTiles - ourTilesUsed;

      if (ourTilesRemaining === 0) {
        let oppRackVal = 0;
        for (let c = 0; c < 26; c++)
          oppRackVal += OPP_RACK_COUNTS[c] * SCORE_TABLE[c];
        play.totalVal = play.score + oppRackVal * 2 + 1000;
        play.netSpread = play.score + oppRackVal * 2;
        continue;
      }

      // Dynamic Depth: Transposition Table + Dirty Updates enable deeper search depths in milliseconds!
      let searchDepth = 3; // 3-ply standard endgame
      if (totalUnseen <= 4) searchDepth = 4; // 4-ply near terminal
      if (totalUnseen <= 2) searchDepth = 5; // 5-ply perfect closure

      // Run Dynamic Alpha-Beta Search
      const oppNetScore = alphaBetaEndgame(
        newBoard,
        newBoardIsBlank,
        tempRackCounts,
        tempWilds,
        OPP_RACK_COUNTS,
        oppWildcards,
        false, // It is NOT our turn (it's the opponent's turn)
        searchDepth, 
        -10000,
        10000,
        gaddag,
        bingoBonus,
      );

      // play.score is our score now.
      // oppNetScore is the best net score from the OPPONENT's perspective after searchDepth plies.
      // So our net value is our current score MINUS their net score.
      play.totalVal = play.score - oppNetScore;
      play.netSpread = play.totalVal;
    }
  }

  // Final Sort
  if (isDeterministicOpponent || bestExchange || gpuDevice || (enableIntel && totalUnseen > 7)) {
    finalPlays.sort((a, b) => {
      if (sortMode === "score") {
        const sDiff = b.score - a.score;
        return sDiff !== 0 ? sDiff : b.totalVal - a.totalVal;
      } else {
        const vDiff = b.totalVal - a.totalVal;
        return Math.abs(vDiff) > 0.001 ? vDiff : b.score - a.score;
      }
    });
  }

  self.postMessage({ plays: finalPlays, jobId });
};

// ============================================================================
// Stage 2: Exact Minimax Zobrist Transposition Table & Dirty Updates
// ============================================================================

// --- 1. Zobrist Hash Keys (Deterministic SplitMix32) ---
let smSeed = 0x12345678;
function nextRandomU32() {
  smSeed |= 0;
  smSeed = (smSeed + 0x9e3779b9) | 0;
  let t = smSeed ^ (smSeed >>> 16);
  t = Math.imul(t, 0x21f0aaad);
  t = t ^ (t >>> 15);
  t = Math.imul(t, 0x735a2d97);
  return (t ^ (t >>> 15)) >>> 0;
}

const ZOBRIST_BOARD_HI = new Uint32Array(225 * 53);
const ZOBRIST_BOARD_LO = new Uint32Array(225 * 53);
for (let i = 0; i < 225 * 53; i++) {
  ZOBRIST_BOARD_HI[i] = nextRandomU32();
  ZOBRIST_BOARD_LO[i] = nextRandomU32();
}

const ZOBRIST_RACK_A_HI = new Uint32Array(27 * 8);
const ZOBRIST_RACK_A_LO = new Uint32Array(27 * 8);
const ZOBRIST_RACK_B_HI = new Uint32Array(27 * 8);
const ZOBRIST_RACK_B_LO = new Uint32Array(27 * 8);
for (let i = 0; i < 27 * 8; i++) {
  ZOBRIST_RACK_A_HI[i] = nextRandomU32();
  ZOBRIST_RACK_A_LO[i] = nextRandomU32();
  ZOBRIST_RACK_B_HI[i] = nextRandomU32();
  ZOBRIST_RACK_B_LO[i] = nextRandomU32();
}

const ZOBRIST_TURN_HI = nextRandomU32();
const ZOBRIST_TURN_LO = nextRandomU32();

function computeFullZobrist(board, boardIsBlank, countsA, wildsA, countsB, wildsB, isTurnA) {
  let hHi = 0 >>> 0;
  let hLo = 0 >>> 0;
  for (let i = 0; i < 225; i++) {
    const tile = board[i];
    if (tile > 0) {
      const isBlank = boardIsBlank[i];
      const state = isBlank ? (tile - 1) + 27 : tile;
      const idx = i * 53 + state;
      hHi ^= ZOBRIST_BOARD_HI[idx];
      hLo ^= ZOBRIST_BOARD_LO[idx];
    }
  }
  for (let c = 0; c < 26; c++) {
    const cA = countsA[c];
    if (cA > 0) {
      hHi ^= ZOBRIST_RACK_A_HI[c * 8 + cA];
      hLo ^= ZOBRIST_RACK_A_LO[c * 8 + cA];
    }
    const cB = countsB[c];
    if (cB > 0) {
      hHi ^= ZOBRIST_RACK_B_HI[c * 8 + cB];
      hLo ^= ZOBRIST_RACK_B_LO[c * 8 + cB];
    }
  }
  if (wildsA > 0) {
    hHi ^= ZOBRIST_RACK_A_HI[26 * 8 + wildsA];
    hLo ^= ZOBRIST_RACK_A_LO[26 * 8 + wildsA];
  }
  if (wildsB > 0) {
    hHi ^= ZOBRIST_RACK_B_HI[26 * 8 + wildsB];
    hLo ^= ZOBRIST_RACK_B_LO[26 * 8 + wildsB];
  }
  if (isTurnA) {
    hHi ^= ZOBRIST_TURN_HI;
    hLo ^= ZOBRIST_TURN_LO;
  }
  return { hHi: hHi >>> 0, hLo: hLo >>> 0 };
}

// --- 2. Transposition Table (64K Entries Direct-Mapped) ---
const TT_SIZE = 65536;
const TT_MASK = TT_SIZE - 1;
const TT_FLAG_EXACT = 0;
const TT_FLAG_LOWER = 1; // Lower bound (beta cutoff)
const TT_FLAG_UPPER = 2; // Upper bound (failed low)

const TT_KEY_HI = new Uint32Array(TT_SIZE);
const TT_KEY_LO = new Uint32Array(TT_SIZE);
const TT_DEPTH = new Int8Array(TT_SIZE);
const TT_FLAG = new Uint8Array(TT_SIZE);
const TT_VAL = new Int16Array(TT_SIZE);

function clearTranspositionTable() {
  TT_DEPTH.fill(-1);
  TT_KEY_HI.fill(0);
  TT_KEY_LO.fill(0);
}

// --- 3. Localized Dirty Board State Helpers ---
const SHARED_DIRTY_PERP_BUF = new Uint8Array(15);
const DIRTY_V_SET = new Set();
const DIRTY_H_SET = new Set();

function recomputePerpV(r, c, board, boardIsBlank, gaddag, crossV, crossScoreV, hasPerpV, perpBuf) {
  const gridIdx = r * 15 + c;
  if (board[gridIdx] !== 0) {
    hasPerpV[gridIdx] = 0;
    crossScoreV[gridIdx] = 0;
    crossV[gridIdx] = 0x3ffffff;
    return;
  }
  let up = r - 1, upCount = 0, scoreV = 0;
  while (up >= 0 && board[up * 15 + c] !== 0) {
    upCount++;
    up--;
  }
  for (let k = 0; k < upCount; k++) {
    const gIdx = (r - upCount + k) * 15 + c;
    const code = board[gIdx] - 1;
    perpBuf[k] = code;
    scoreV += boardIsBlank[gIdx] ? 0 : SCORE_TABLE[code];
  }

  let down = r + 1, downCount = 0;
  while (down < 15 && board[down * 15 + c] !== 0) {
    const gIdx = down * 15 + c;
    const code = board[gIdx] - 1;
    perpBuf[upCount + 1 + downCount] = code;
    scoreV += boardIsBlank[gIdx] ? 0 : SCORE_TABLE[code];
    downCount++;
    down++;
  }

  const lenV = upCount + 1 + downCount;
  if (lenV > 1) {
    hasPerpV[gridIdx] = 1;
    crossScoreV[gridIdx] = scoreV;
    let mask = 0;
    for (let code = 0; code < 26; code++) {
      perpBuf[upCount] = code;
      if (isWordValidCodes(gaddag, perpBuf, lenV)) mask |= 1 << code;
    }
    crossV[gridIdx] = mask;
  } else {
    hasPerpV[gridIdx] = 0;
    crossScoreV[gridIdx] = 0;
    crossV[gridIdx] = 0x3ffffff;
  }
}

function recomputePerpH(r, c, board, boardIsBlank, gaddag, crossH, crossScoreH, hasPerpH, perpBuf) {
  const gridIdx = r * 15 + c;
  if (board[gridIdx] !== 0) {
    hasPerpH[gridIdx] = 0;
    crossScoreH[gridIdx] = 0;
    crossH[gridIdx] = 0x3ffffff;
    return;
  }
  let left = c - 1, leftCount = 0, scoreH = 0;
  while (left >= 0 && board[r * 15 + left] !== 0) {
    leftCount++;
    left--;
  }
  for (let k = 0; k < leftCount; k++) {
    const gIdx = r * 15 + (c - leftCount + k);
    const code = board[gIdx] - 1;
    perpBuf[k] = code;
    scoreH += boardIsBlank[gIdx] ? 0 : SCORE_TABLE[code];
  }

  let right = c + 1, rightCount = 0;
  while (right < 15 && board[r * 15 + right] !== 0) {
    const gIdx = r * 15 + right;
    const code = board[gIdx] - 1;
    perpBuf[leftCount + 1 + rightCount] = code;
    scoreH += boardIsBlank[gIdx] ? 0 : SCORE_TABLE[code];
    rightCount++;
    right++;
  }

  const lenH = leftCount + 1 + rightCount;
  if (lenH > 1) {
    hasPerpH[gridIdx] = 1;
    crossScoreH[gridIdx] = scoreH;
    let mask = 0;
    for (let code = 0; code < 26; code++) {
      perpBuf[leftCount] = code;
      if (isWordValidCodes(gaddag, perpBuf, lenH)) mask |= 1 << code;
    }
    crossH[gridIdx] = mask;
  } else {
    hasPerpH[gridIdx] = 0;
    crossScoreH[gridIdx] = 0;
    crossH[gridIdx] = 0x3ffffff;
  }
}

function updateBoardStateDirty(prevState, board, boardIsBlank, newlyPlaced, gaddag) {
  const anchors = new Uint8Array(prevState.anchors);
  const crossV = new Uint32Array(prevState.crossV);
  const crossScoreV = new Int16Array(prevState.crossScoreV);
  const hasPerpV = new Uint8Array(prevState.hasPerpV);
  const crossH = new Uint32Array(prevState.crossH);
  const crossScoreH = new Int16Array(prevState.crossScoreH);
  const hasPerpH = new Uint8Array(prevState.hasPerpH);

  DIRTY_V_SET.clear();
  DIRTY_H_SET.clear();

  for (let i = 0; i < newlyPlaced.length; i++) {
    const r = newlyPlaced[i].r;
    const c = newlyPlaced[i].c;
    const gIdx = r * 15 + c;

    anchors[gIdx] = 0;
    if (r > 0 && board[(r - 1) * 15 + c] === 0) anchors[(r - 1) * 15 + c] = 1;
    if (r < 14 && board[(r + 1) * 15 + c] === 0) anchors[(r + 1) * 15 + c] = 1;
    if (c > 0 && board[r * 15 + c - 1] === 0) anchors[r * 15 + c - 1] = 1;
    if (c < 14 && board[r * 15 + c + 1] === 0) anchors[r * 15 + c + 1] = 1;

    crossV[gIdx] = 0x3ffffff;
    hasPerpV[gIdx] = 0;
    crossScoreV[gIdx] = 0;
    crossH[gIdx] = 0x3ffffff;
    hasPerpH[gIdx] = 0;
    crossScoreH[gIdx] = 0;

    let up = r - 1;
    while (up >= 0 && board[up * 15 + c] !== 0) up--;
    if (up >= 0) DIRTY_V_SET.add(up * 15 + c);

    let down = r + 1;
    while (down < 15 && board[down * 15 + c] !== 0) down++;
    if (down < 15) DIRTY_V_SET.add(down * 15 + c);

    let left = c - 1;
    while (left >= 0 && board[r * 15 + left] !== 0) left--;
    if (left >= 0) DIRTY_H_SET.add(r * 15 + left);

    let right = c + 1;
    while (right < 15 && board[r * 15 + right] !== 0) right++;
    if (right < 15) DIRTY_H_SET.add(r * 15 + right);
  }

  for (const idx of DIRTY_V_SET) {
    const r = Math.floor(idx / 15);
    const c = idx % 15;
    recomputePerpV(r, c, board, boardIsBlank, gaddag, crossV, crossScoreV, hasPerpV, SHARED_DIRTY_PERP_BUF);
  }

  for (const idx of DIRTY_H_SET) {
    const r = Math.floor(idx / 15);
    const c = idx % 15;
    recomputePerpH(r, c, board, boardIsBlank, gaddag, crossH, crossScoreH, hasPerpH, SHARED_DIRTY_PERP_BUF);
  }

  return { anchors, crossV, crossScoreV, hasPerpV, crossH, crossScoreH, hasPerpH };
}

function computeBoardState(board, boardIsBlank, gaddag) {
  const anchors = new Uint8Array(225);
  const crossV = new Uint32Array(225);
  const crossScoreV = new Int16Array(225);
  const hasPerpV = new Uint8Array(225);
  const crossH = new Uint32Array(225);
  const crossScoreH = new Int16Array(225);
  const hasPerpH = new Uint8Array(225);

  crossV.fill(0x3ffffff); // ALL_LETTERS_MASK
  crossH.fill(0x3ffffff);

  let hasTiles = false;
  for (let i = 0; i < 225; i++) {
    if (board[i] !== 0) {
      hasTiles = true;
      const r = Math.floor(i / 15);
      const c = i % 15;
      if (r > 0 && board[(r - 1) * 15 + c] === 0) anchors[(r - 1) * 15 + c] = 1;
      if (r < 14 && board[(r + 1) * 15 + c] === 0)
        anchors[(r + 1) * 15 + c] = 1;
      if (c > 0 && board[r * 15 + c - 1] === 0) anchors[r * 15 + c - 1] = 1;
      if (c < 14 && board[r * 15 + c + 1] === 0) anchors[r * 15 + c + 1] = 1;
    }
  }

  if (!hasTiles) {
    anchors[112] = 1; // Center square
    return {
      anchors,
      crossV,
      crossScoreV,
      hasPerpV,
      crossH,
      crossScoreH,
      hasPerpH,
    };
  }

  const PERP_BUF = new Uint8Array(15);

  for (let c = 0; c < 15; c++) {
    for (let r = 0; r < 15; r++) {
      const gridIdx = r * 15 + c;
      if (board[gridIdx] !== 0) continue;

      let up = r - 1,
        upCount = 0,
        scoreV = 0;
      while (up >= 0 && board[up * 15 + c] !== 0) {
        upCount++;
        up--;
      }
      for (let k = 0; k < upCount; k++) {
        const gIdx = (r - upCount + k) * 15 + c;
        const code = board[gIdx] - 1;
        PERP_BUF[k] = code;
        scoreV += boardIsBlank[gIdx] ? 0 : SCORE_TABLE[code];
      }

      let down = r + 1,
        downCount = 0;
      while (down < 15 && board[down * 15 + c] !== 0) {
        const gIdx = down * 15 + c;
        const code = board[gIdx] - 1;
        PERP_BUF[upCount + 1 + downCount] = code;
        scoreV += boardIsBlank[gIdx] ? 0 : SCORE_TABLE[code];
        downCount++;
        down++;
      }

      const lenV = upCount + 1 + downCount;
      if (lenV > 1) {
        hasPerpV[gridIdx] = 1;
        crossScoreV[gridIdx] = scoreV;
        let mask = 0;
        for (let code = 0; code < 26; code++) {
          PERP_BUF[upCount] = code;
          if (isWordValidCodes(gaddag, PERP_BUF, lenV)) mask |= 1 << code;
        }
        crossV[gridIdx] = mask;
      }

      let left = c - 1,
        leftCount = 0,
        scoreH = 0;
      while (left >= 0 && board[r * 15 + left] !== 0) {
        leftCount++;
        left--;
      }
      for (let k = 0; k < leftCount; k++) {
        const gIdx = r * 15 + (c - leftCount + k);
        const code = board[gIdx] - 1;
        PERP_BUF[k] = code;
        scoreH += boardIsBlank[gIdx] ? 0 : SCORE_TABLE[code];
      }

      let right = c + 1,
        rightCount = 0;
      while (right < 15 && board[r * 15 + right] !== 0) {
        const gIdx = r * 15 + right;
        const code = board[gIdx] - 1;
        PERP_BUF[leftCount + 1 + rightCount] = code;
        scoreH += boardIsBlank[gIdx] ? 0 : SCORE_TABLE[code];
        rightCount++;
        right++;
      }

      const lenH = leftCount + 1 + rightCount;
      if (lenH > 1) {
        hasPerpH[gridIdx] = 1;
        crossScoreH[gridIdx] = scoreH;
        let mask = 0;
        for (let code = 0; code < 26; code++) {
          PERP_BUF[leftCount] = code;
          if (isWordValidCodes(gaddag, PERP_BUF, lenH)) mask |= 1 << code;
        }
        crossH[gridIdx] = mask;
      }
    }
  }

  return {
    anchors,
    crossV,
    crossScoreV,
    hasPerpV,
    crossH,
    crossScoreH,
    hasPerpH,
  };
}
function generatePlays(
  board,
  boardIsBlank,
  boardState,
  rackCounts,
  wildcards,
  gaddag,
  bingoBonus,
) {
  const {
    anchors,
    crossV,
    crossScoreV,
    hasPerpV,
    crossH,
    crossScoreH,
    hasPerpH,
  } = boardState;
  const plays = [];

  const placed = new Int8Array(15);
  const placedBlank = new Uint8Array(15);

  const testVector = (isVertical, lineIdx) => {
    const crossM = isVertical ? crossH : crossV;
    const crossS = isVertical ? crossScoreH : crossScoreV;
    const hasP = isVertical ? hasPerpH : hasPerpV;

    const lineT = new Int8Array(15);
    const lineA = new Uint8Array(15);
    const lineCM = new Uint32Array(15);
    const lineCS = new Int16Array(15);
    const lineHP = new Uint8Array(15);

    for (let i = 0; i < 15; i++) {
      const gIdx = isVertical ? i * 15 + lineIdx : lineIdx * 15 + i;
      lineT[i] = board[gIdx];
      lineA[i] = anchors[gIdx];
      lineCM[i] = crossM[gIdx];
      lineCS[i] = crossS[gIdx];
      lineHP[i] = hasP[gIdx];
    }

    const gen = (
      pos,
      currPos,
      nodeIdx,
      direction,
      minPos,
      maxPos,
      tilesUsed,
    ) => {
      if (nodeIdx !== 0) {
        const entry = gaddag[nodeIdx];
        if ((entry & 0x20) !== 0 && tilesUsed > 0 && maxPos > minPos) {
          const lClean = minPos === 0 || lineT[minPos - 1] === 0;
          let rClean = false;
          if (direction > 0) rClean = currPos >= 15 || lineT[currPos] === 0;
          else rClean = pos + 1 >= 15 || lineT[pos + 1] === 0;

          if (lClean && rClean) {
            let mScore = 0,
              mMult = 1,
              crossTot = 0;
            let wordBuilt = "";
            for (let p = minPos; p <= maxPos; p++) {
              const code = placed[p];
              const r = isVertical ? p : lineIdx;
              const c = isVertical ? lineIdx : p;
              const gIdx = r * 15 + c;
              const prem = PREMIUM_GRID[gIdx];
              const isExist = board[gIdx] !== 0;
              const isB = !isExist && placedBlank[p] === 1;
              wordBuilt += String.fromCharCode((isB ? 97 : 65) + code);

              if (isExist) {
                mScore += boardIsBlank[gIdx] ? 0 : SCORE_TABLE[code];
              } else {
                let lVal = isB ? 0 : SCORE_TABLE[code];
                if (prem === 1) lVal *= 2;
                else if (prem === 2) lVal *= 3;
                else if (prem === 3) mMult *= 2;
                else if (prem === 4) mMult *= 3;
                mScore += lVal;

                if (lineHP[p] === 1) {
                  let pVal = isB ? 0 : SCORE_TABLE[code];
                  if (prem === 1) pVal *= 2;
                  else if (prem === 2) pVal *= 3;
                  let cMult = 1;
                  if (prem === 3) cMult = 2;
                  else if (prem === 4) cMult = 3;
                  crossTot += (lineCS[p] + pVal) * cMult;
                }
              }
            }
            let total = mScore * mMult + crossTot;
            if (tilesUsed === 7) total += bingoBonus;

            plays.push({
              word: wordBuilt,
              row: isVertical ? minPos : lineIdx,
              col: isVertical ? lineIdx : minPos,
              dir: isVertical ? "V" : "H",
              score: total,
              tilesUsed: tilesUsed,
            });
          }
        }
      }

      if (direction > 0 && currPos >= 15) return;
      let childPointer = gaddag[nodeIdx] >>> 7;
      if (childPointer === 0) return;

      while (childPointer !== 0) {
        const entry = gaddag[childPointer];
        const letterCode = entry & 0x1f;
        const hasSibling = (entry & 0x40) !== 0;

        if (letterCode === REV_CODE) {
          // REV_CODE
          if (direction < 0)
            gen(pos, pos + 1, childPointer, 1, minPos, maxPos, tilesUsed);
        } else if (letterCode < 26) {
          if (currPos >= 0 && currPos < 15) {
            const existing = lineT[currPos];
            if (existing !== 0) {
              if (existing - 1 === letterCode) {
                placed[currPos] = letterCode;
                placedBlank[currPos] = 0;
                gen(
                  pos,
                  currPos + direction,
                  childPointer,
                  direction,
                  direction < 0 && currPos < minPos ? currPos : minPos,
                  direction > 0 && currPos > maxPos ? currPos : maxPos,
                  tilesUsed,
                );
              }
            } else {
              if ((lineCM[currPos] & (1 << letterCode)) !== 0) {
                const nextMin =
                  direction < 0 && currPos < minPos ? currPos : minPos;
                const nextMax =
                  direction > 0 && currPos > maxPos ? currPos : maxPos;

                if (rackCounts[letterCode] > 0) {
                  rackCounts[letterCode]--;
                  placed[currPos] = letterCode;
                  placedBlank[currPos] = 0;
                  gen(
                    pos,
                    currPos + direction,
                    childPointer,
                    direction,
                    nextMin,
                    nextMax,
                    tilesUsed + 1,
                  );
                  rackCounts[letterCode]++;
                } else if (wildcards > 0) {
                  wildcards--;
                  placed[currPos] = letterCode;
                  placedBlank[currPos] = 1;
                  gen(
                    pos,
                    currPos + direction,
                    childPointer,
                    direction,
                    nextMin,
                    nextMax,
                    tilesUsed + 1,
                  );
                  wildcards++;
                }
              }
            }
          }
        }
        if (!hasSibling) break;
        childPointer++;
      }
    };

    for (let pos = 0; pos < 15; pos++) {
      if (lineA[pos] === 1) gen(pos, pos, 0, -1, pos, pos, 0);
    }
  };

  for (let i = 0; i < 15; i++) {
    testVector(false, i);
    testVector(true, i);
  }

  return plays;
}

function alphaBetaEndgame(
  board,
  boardIsBlank,
  countsA,
  wildsA,
  countsB,
  wildsB,
  isTurnA,
  depth,
  alpha,
  beta,
  gaddag,
  bingoBonus,
  passedBoardState = null,
  passedHashHi = 0,
  passedHashLo = 0,
) {
  // Single-pass computation of tile counts and unplayed sums without arrow function closures
  let tilesA = wildsA;
  let unplayedA = 0;
  for (let c = 0; c < 26; c++) {
    const cnt = countsA[c];
    tilesA += cnt;
    unplayedA += cnt * SCORE_TABLE[c];
  }
  let tilesB = wildsB;
  let unplayedB = 0;
  for (let c = 0; c < 26; c++) {
    const cnt = countsB[c];
    tilesB += cnt;
    unplayedB += cnt * SCORE_TABLE[c];
  }

  // Terminal Condition: Game over (player out of tiles) or search depth reached
  if (tilesA === 0 || tilesB === 0 || depth === 0) {
    // In Scrabble, the person who goes out gets 2x the opponent's unplayed tiles in net spread.
    let spreadForA = 0;
    if (tilesA === 0) spreadForA = unplayedB * 2;
    else if (tilesB === 0) spreadForA = -(unplayedA * 2);

    // Return spread from the perspective of the CURRENT active player
    return isTurnA ? spreadForA : -spreadForA;
  }

  // Stage 2: Zobrist Hash & TT Lookup
  let hashHi = passedHashHi;
  let hashLo = passedHashLo;
  if (hashHi === 0 && hashLo === 0) {
    const fullHash = computeFullZobrist(board, boardIsBlank, countsA, wildsA, countsB, wildsB, isTurnA);
    hashHi = fullHash.hHi;
    hashLo = fullHash.hLo;
  }

  const origAlpha = alpha;
  const ttIndex = (hashLo ^ (hashHi >>> 16)) & TT_MASK;

  if (
    TT_KEY_HI[ttIndex] === hashHi &&
    TT_KEY_LO[ttIndex] === hashLo &&
    TT_DEPTH[ttIndex] >= depth
  ) {
    const flag = TT_FLAG[ttIndex];
    const ttVal = TT_VAL[ttIndex];
    if (flag === TT_FLAG_EXACT) {
      return ttVal;
    } else if (flag === TT_FLAG_LOWER) {
      if (ttVal >= beta) return ttVal;
      if (ttVal > alpha) alpha = ttVal;
    } else if (flag === TT_FLAG_UPPER) {
      if (ttVal <= alpha) return ttVal;
      if (ttVal < beta) beta = ttVal;
    }
  }

  const boardState = passedBoardState || computeBoardState(board, boardIsBlank, gaddag);
  const activeCounts = isTurnA ? countsA : countsB;
  const activeWilds = isTurnA ? wildsA : wildsB;

  const plays = generatePlays(
    board,
    boardIsBlank,
    boardState,
    activeCounts,
    activeWilds,
    gaddag,
    bingoBonus,
  );

  if (plays.length === 0) {
    // Pass
    const passHHi = (hashHi ^ ZOBRIST_TURN_HI) >>> 0;
    const passHLo = (hashLo ^ ZOBRIST_TURN_LO) >>> 0;
    const val = -alphaBetaEndgame(
      board,
      boardIsBlank,
      countsA,
      wildsA,
      countsB,
      wildsB,
      !isTurnA,
      depth - 1,
      -beta,
      -alpha,
      gaddag,
      bingoBonus,
      boardState,
      passHHi,
      passHLo,
    );

    // TT Store on Pass
    let ttFlag = TT_FLAG_EXACT;
    if (val <= origAlpha) ttFlag = TT_FLAG_UPPER;
    else if (val >= beta) ttFlag = TT_FLAG_LOWER;

    if (
      TT_KEY_HI[ttIndex] !== hashHi ||
      TT_KEY_LO[ttIndex] !== hashLo ||
      depth >= TT_DEPTH[ttIndex]
    ) {
      TT_KEY_HI[ttIndex] = hashHi;
      TT_KEY_LO[ttIndex] = hashLo;
      TT_DEPTH[ttIndex] = depth;
      TT_FLAG[ttIndex] = ttFlag;
      TT_VAL[ttIndex] = Math.max(-32000, Math.min(32000, val));
    }

    return val;
  }

  // Sort plays to optimize alpha-beta pruning (highest score first)
  // Stage 3 (Option 1C): Killer Outplay Move Ordering in Minimax
  const activeTiles = isTurnA ? tilesA : tilesB;
  const oppUnplayedSum = isTurnA ? unplayedB : unplayedA;

  for (let i = 0; i < plays.length; i++) {
    const p = plays[i];
    p.estVal = p.score + (p.tilesUsed >= activeTiles ? (oppUnplayedSum * 2 + 1000) : 0);
  }

  plays.sort((a, b) => b.estVal - a.estVal);

  let bestValue = -Infinity;
  const maxBranch = Math.min(plays.length, 16);

  for (let i = 0; i < maxBranch; i++) {
    const play = plays[i];

    // Immediate terminal outplay check
    if (play.tilesUsed >= activeTiles) {
      const value = play.score + oppUnplayedSum * 2;
      bestValue = Math.max(bestValue, value);
      alpha = Math.max(alpha, value);
      if (alpha >= beta) break;
      continue;
    }

    // Apply play
    const newBoard = new Int8Array(board);
    const newBoardIsBlank = new Uint8Array(boardIsBlank);
    const newCounts = new Int8Array(activeCounts);
    let newWilds = activeWilds;

    let nextHHi = hashHi;
    let nextHLo = hashLo;
    const newlyPlaced = [];

    for (let k = 0; k < play.word.length; k++) {
      const r = play.dir === "V" ? play.row + k : play.row;
      const c = play.dir === "H" ? play.col + k : play.col;
      const gIdx = r * 15 + c;
      if (newBoard[gIdx] === 0) {
        const charCode = play.word.charCodeAt(k);
        const isBlank = charCode >= 97;
        const num = isBlank ? charCode - 97 : charCode - 65;

        newBoard[gIdx] = num + 1;
        newBoardIsBlank[gIdx] = isBlank ? 1 : 0;
        newlyPlaced.push({ r, c });

        const state = isBlank ? num + 27 : num + 1;
        nextHHi ^= ZOBRIST_BOARD_HI[gIdx * 53 + state];
        nextHLo ^= ZOBRIST_BOARD_LO[gIdx * 53 + state];

        if (isTurnA) {
          if (isBlank) {
            nextHHi ^= ZOBRIST_RACK_A_HI[26 * 8 + newWilds];
            nextHLo ^= ZOBRIST_RACK_A_LO[26 * 8 + newWilds];
            newWilds--;
            if (newWilds > 0) {
              nextHHi ^= ZOBRIST_RACK_A_HI[26 * 8 + newWilds];
              nextHLo ^= ZOBRIST_RACK_A_LO[26 * 8 + newWilds];
            }
          } else {
            nextHHi ^= ZOBRIST_RACK_A_HI[num * 8 + newCounts[num]];
            nextHLo ^= ZOBRIST_RACK_A_LO[num * 8 + newCounts[num]];
            newCounts[num]--;
            if (newCounts[num] > 0) {
              nextHHi ^= ZOBRIST_RACK_A_HI[num * 8 + newCounts[num]];
              nextHLo ^= ZOBRIST_RACK_A_LO[num * 8 + newCounts[num]];
            }
          }
        } else {
          if (isBlank) {
            nextHHi ^= ZOBRIST_RACK_B_HI[26 * 8 + newWilds];
            nextHLo ^= ZOBRIST_RACK_B_LO[26 * 8 + newWilds];
            newWilds--;
            if (newWilds > 0) {
              nextHHi ^= ZOBRIST_RACK_B_HI[26 * 8 + newWilds];
              nextHLo ^= ZOBRIST_RACK_B_LO[26 * 8 + newWilds];
            }
          } else {
            nextHHi ^= ZOBRIST_RACK_B_HI[num * 8 + newCounts[num]];
            nextHLo ^= ZOBRIST_RACK_B_LO[num * 8 + newCounts[num]];
            newCounts[num]--;
            if (newCounts[num] > 0) {
              nextHHi ^= ZOBRIST_RACK_B_HI[num * 8 + newCounts[num]];
              nextHLo ^= ZOBRIST_RACK_B_LO[num * 8 + newCounts[num]];
            }
          }
        }
      }
    }

    nextHHi ^= ZOBRIST_TURN_HI;
    nextHLo ^= ZOBRIST_TURN_LO;
    nextHHi >>>= 0;
    nextHLo >>>= 0;

    // Stage 2: Localized Dirty Board State Recalculation (10x faster than full board scan)
    const nextBoardState = updateBoardStateDirty(
      boardState,
      newBoard,
      newBoardIsBlank,
      newlyPlaced,
      gaddag,
    );

    const value =
      play.score -
      alphaBetaEndgame(
        newBoard,
        newBoardIsBlank,
        isTurnA ? newCounts : countsA,
        isTurnA ? newWilds : wildsA,
        isTurnA ? countsB : newCounts,
        isTurnA ? wildsB : newWilds,
        !isTurnA,
        depth - 1,
        -beta,
        -alpha,
        gaddag,
        bingoBonus,
        nextBoardState,
        nextHHi,
        nextHLo,
      );

    bestValue = Math.max(bestValue, value);
    alpha = Math.max(alpha, value);
    if (alpha >= beta) break;
  }

  // Stage 2: Store Evaluated Node into Transposition Table
  let ttFlag = TT_FLAG_EXACT;
  if (bestValue <= origAlpha) {
    ttFlag = TT_FLAG_UPPER;
  } else if (bestValue >= beta) {
    ttFlag = TT_FLAG_LOWER;
  }

  if (
    TT_KEY_HI[ttIndex] !== hashHi ||
    TT_KEY_LO[ttIndex] !== hashLo ||
    depth >= TT_DEPTH[ttIndex]
  ) {
    TT_KEY_HI[ttIndex] = hashHi;
    TT_KEY_LO[ttIndex] = hashLo;
    TT_DEPTH[ttIndex] = depth;
    TT_FLAG[ttIndex] = ttFlag;
    TT_VAL[ttIndex] = Math.max(-32000, Math.min(32000, bestValue));
  }

  return bestValue;
}
