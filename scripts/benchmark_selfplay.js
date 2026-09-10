const fs = require('fs');
const path = require('path');

// CLI Arguments
const args = process.argv.slice(2);
const gamesArgIdx = args.indexOf('--games');
const TOTAL_GAMES = gamesArgIdx !== -1 && args[gamesArgIdx + 1] ? parseInt(args[gamesArgIdx + 1], 10) : 100;

const publicDir = path.join(__dirname, '../public');

// Setup Node.js sandbox for solverWorker.js
global.self = {};
global.fetch = async (url) => {
  const cleanUrl = url.replace(/^\//, '');
  const filePath = path.join(publicDir, cleanUrl);
  const content = fs.readFileSync(filePath);
  return {
    ok: true,
    status: 200,
    text: async () => content.toString('utf8'),
    json: async () => JSON.parse(content.toString('utf8')),
    arrayBuffer: async () => content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength)
  };
};

global.Worker = class {};
global.navigator = { gpu: null };

// Load solverWorker.js
const workerCode = fs.readFileSync(path.join(publicDir, 'solverWorker.js'), 'utf8');
eval(workerCode);

function solveTurn(payload) {
  return new Promise((resolve) => {
    self.postMessage = (msg) => {
      resolve(msg.plays || []);
    };
    self.onmessage({ data: payload });
  });
}

const TILE_SCORES = {
  a:1, b:3, c:3, d:2, e:1, f:4, g:2, h:4, i:1, j:8, k:5, l:1, m:3,
  n:1, o:1, p:3, q:10, r:1, s:1, t:1, u:1, v:4, w:4, x:8, y:4, z:10
};

const STANDARD_DIST = {
  A: 9, B: 2, C: 2, D: 4, E: 12, F: 2, G: 3, H: 2, I: 9, J: 1, K: 1, L: 4, M: 2,
  N: 6, O: 8, P: 2, Q: 1, R: 6, S: 4, T: 6, U: 4, V: 2, W: 2, X: 1, Y: 2, Z: 1, "?": 2
};

const BOARD_PRESET = {
  scores: TILE_SCORES,
  premiums: {
    "0,0": "3W", "0,7": "3W", "0,14": "3W",
    "7,0": "3W", "7,14": "3W",
    "14,0": "3W", "14,7": "3W", "14,14": "3W",
    "1,1": "2W", "2,2": "2W", "3,3": "2W", "4,4": "2W",
    "13,1": "2W", "12,2": "2W", "11,3": "2W", "10,4": "2W",
    "1,13": "2W", "2,12": "2W", "3,11": "2W", "4,10": "2W",
    "13,13": "2W", "12,12": "2W", "11,11": "2W", "10,10": "2W",
    "0,3": "2L", "0,11": "2L", "2,6": "2L", "2,8": "2L",
    "3,0": "2L", "3,7": "2L", "3,14": "2L",
    "6,2": "2L", "6,6": "2L", "6,8": "2L", "6,12": "2L",
    "7,3": "2L", "7,11": "2L",
    "8,2": "2L", "8,6": "2L", "8,8": "2L", "8,12": "2L",
    "11,0": "2L", "11,7": "2L", "11,14": "2L",
    "12,6": "2L", "12,8": "2L", "14,3": "2L", "14,11": "2L",
    "1,5": "3L", "1,9": "3L", "5,1": "3L", "5,5": "3L", "5,9": "3L", "5,13": "3L",
    "9,1": "3L", "9,5": "3L", "9,9": "3L", "9,13": "3L", "13,5": "3L", "13,9": "3L",
    "7,7": "CENTER"
  },
  bingoBonus: 50,
  distribution: STANDARD_DIST
};

function createFreshBag() {
  const bag = [];
  for (const [letter, count] of Object.entries(STANDARD_DIST)) {
    for (let i = 0; i < count; i++) bag.push(letter);
  }
  // Fisher-Yates Shuffle
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = bag[i];
    bag[i] = bag[j];
    bag[j] = temp;
  }
  return bag;
}

function drawTiles(bag, rack, targetCount = 7) {
  while (rack.length < targetCount && bag.length > 0) {
    rack.push(bag.pop());
  }
}

function removeTilesFromRack(rack, word, board, row, col, dir) {
  const newRack = [...rack];
  for (let i = 0; i < word.length; i++) {
    const r = dir === "V" ? row + i : row;
    const c = dir === "H" ? col + i : col;
    if (!board[r][c]) {
      const char = word[i];
      const isBlank = char >= 'a' && char <= 'z';
      const target = isBlank ? '?' : char.toUpperCase();
      const idx = newRack.indexOf(target);
      if (idx !== -1) {
        newRack.splice(idx, 1);
      } else {
        const altIdx = newRack.indexOf(char.toUpperCase());
        if (altIdx !== -1) newRack.splice(altIdx, 1);
        else {
          const qIdx = newRack.indexOf('?');
          if (qIdx !== -1) newRack.splice(qIdx, 1);
        }
      }
    }
  }
  return newRack;
}

function applyPlayToBoard(board, play) {
  const { word, row, col, dir } = play;
  for (let i = 0; i < word.length; i++) {
    const r = dir === "V" ? row + i : row;
    const c = dir === "H" ? col + i : col;
    if (!board[r][c]) {
      board[r][c] = word[i];
    }
  }
}

async function playOneGame(gameNum) {
  const bag = createFreshBag();
  const board = Array(15).fill(null).map(() => Array(15).fill(""));

  // Player 1: Current Engine (Stage 1 & 2 Active)
  // Player 2: Defensive Variant (Pre-Stage 1: Naive Heuristic without corridor raycasting defense & without blank surcharge)
  const currentEngineStarts = (gameNum % 2 === 1);
  const p1Name = "CurrentEngine";
  const p2Name = "PreStage1Variant";

  const racks = {
    [p1Name]: [],
    [p2Name]: []
  };

  const scores = {
    [p1Name]: 0,
    [p2Name]: 0
  };

  const multiConcessions = {
    [p1Name]: 0, // Multi-multiplier blowouts conceded by Current Engine
    [p2Name]: 0  // Multi-multiplier blowouts conceded by PreStage1 Variant
  };

  drawTiles(bag, racks[p1Name]);
  drawTiles(bag, racks[p2Name]);

  let turnPlayer = currentEngineStarts ? p1Name : p2Name;
  let consecutivePasses = 0;
  let turnNumber = 0;

  while (consecutivePasses < 4 && turnNumber < 80) {
    turnNumber++;
    const isCurrentEngine = (turnPlayer === p1Name);
    const rack = racks[turnPlayer];
    const opponent = isCurrentEngine ? p2Name : p1Name;

    if (rack.length === 0) break;

    const diff = scores[turnPlayer] - scores[opponent];

    const plays = await solveTurn({
      rack: rack.join(''),
      board,
      activePreset: BOARD_PRESET,
      activeLexicon: "nwl2023",
      sortMode: "val",
      enableIntel: false,
      scoreDifferential: diff,
      bagCount: bag.length
    });

    let chosenPlay = null;

    if (isCurrentEngine) {
      // Current Engine (Stage 1 & 2): picks top candidate using full totalVal
      // (with corridor raycasting defense, blank surcharge, and lead protection)
      chosenPlay = plays.length > 0 ? plays[0] : null;
    } else {
      // Pre-Stage 1 Variant (Exact Ablation):
      // Retains all standard heuristics, turnover bonuses, and endgame valuation,
      // but ablates Stage 1 multi-multiplier corridor defense and blank surcharge.
      if (plays.length > 0) {
        const variantPlays = plays.map(p => {
          let vVal = p.totalVal;
          if (p.opensTripleTriple) vVal += 24.0;
          if (p.opensDoubleDouble) vVal += 12.0;
          if (p.blocksTripleTriple) vVal -= 8.0;
          if (p.blocksDoubleDouble) vVal -= 5.0;
          if (p.blankSurchargeApplied) vVal += 14.0;
          return { play: p, vVal };
        });
        variantPlays.sort((a, b) => b.vVal - a.vVal);
        chosenPlay = variantPlays.length > 0 ? variantPlays[0].play : plays[0];
      }
    }

    if (chosenPlay && chosenPlay.dir !== "EXCH") {
      consecutivePasses = 0;

      // Check if this move is a multi-multiplier blowout (70+ pts)
      if (chosenPlay.score >= 70) {
        // The opponent conceded this blowout!
        multiConcessions[opponent]++;
      }

      // CRITICAL: Deduct tiles from rack BEFORE placing on board
      racks[turnPlayer] = removeTilesFromRack(racks[turnPlayer], chosenPlay.word, board, chosenPlay.row, chosenPlay.col, chosenPlay.dir);
      applyPlayToBoard(board, chosenPlay);
      scores[turnPlayer] += chosenPlay.score;
      drawTiles(bag, racks[turnPlayer]);

      // Outplay condition: bag is empty and rack is empty
      if (bag.length === 0 && racks[turnPlayer].length === 0) {
        let oppRackVal = 0;
        for (const tile of racks[opponent]) {
          if (tile !== '?') oppRackVal += (TILE_SCORES[tile.toLowerCase()] || 0);
        }
        scores[turnPlayer] += oppRackVal * 2;
        break;
      }
    } else if (chosenPlay && chosenPlay.dir === "EXCH" && bag.length >= 7) {
      // Execute legal tile exchange with the exact tiles recommended
      for (const ch of chosenPlay.word.split('')) {
        const idx = racks[turnPlayer].indexOf(ch);
        if (idx !== -1) {
          racks[turnPlayer].splice(idx, 1);
          bag.push(ch);
        }
      }
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const temp = bag[i];
        bag[i] = bag[j];
        bag[j] = temp;
      }
      drawTiles(bag, racks[turnPlayer]);
      consecutivePasses = 0;
    } else {
      consecutivePasses++;
    }

    turnPlayer = (turnPlayer === p1Name) ? p2Name : p1Name;
  }

  return {
    gameNum,
    p1Score: scores[p1Name],
    p2Score: scores[p2Name],
    winner: scores[p1Name] > scores[p2Name] ? p1Name : scores[p2Name] > scores[p1Name] ? p2Name : "Tie",
    p1Concessions: multiConcessions[p1Name],
    p2Concessions: multiConcessions[p2Name],
    turnsPlayed: turnNumber
  };
}

async function runBenchmark() {
  console.log("==========================================================================================");
  console.log(`        HEADLESS SCRABBLE BENCHMARK: Current Engine vs. Pre-Stage 1 Variant`);
  console.log(`                             Total Games: ${TOTAL_GAMES}`);
  console.log("==========================================================================================");
  console.log("Initializing GADDAG dictionary and heuristics...");

  // Wait for worker initialization
  await new Promise(resolve => setTimeout(resolve, 1500));

  let p1Wins = 0;
  let p2Wins = 0;
  let ties = 0;
  let p1ScoreSum = 0;
  let p2ScoreSum = 0;
  let p1ConcessionsTotal = 0;
  let p2ConcessionsTotal = 0;

  const startTime = Date.now();

  for (let g = 1; g <= TOTAL_GAMES; g++) {
    const result = await playOneGame(g);
    p1ScoreSum += result.p1Score;
    p2ScoreSum += result.p2Score;
    p1ConcessionsTotal += result.p1Concessions;
    p2ConcessionsTotal += result.p2Concessions;

    if (result.winner === "CurrentEngine") p1Wins++;
    else if (result.winner === "PreStage1Variant") p2Wins++;
    else ties++;

    if (g % 10 === 0 || g === TOTAL_GAMES) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const currentWinRate = ((p1Wins / g) * 100).toFixed(1);
      console.log(
        `Game [${String(g).padStart(3)}/${TOTAL_GAMES}] | ` +
        `CurrentEngine Wins: ${p1Wins} (${currentWinRate}%) | ` +
        `Avg Score: ${(p1ScoreSum / g).toFixed(1)} vs ${(p2ScoreSum / g).toFixed(1)} | ` +
        `Concessions: ${p1ConcessionsTotal} vs ${p2ConcessionsTotal} | ` +
        `${elapsed}s`
      );
    }
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
  const winRate = ((p1Wins / TOTAL_GAMES) * 100).toFixed(1);
  const avgP1Score = (p1ScoreSum / TOTAL_GAMES).toFixed(1);
  const avgP2Score = (p2ScoreSum / TOTAL_GAMES).toFixed(1);
  const avgMargin = ((p1ScoreSum - p2ScoreSum) / TOTAL_GAMES).toFixed(1);

  console.log("\n==========================================================================================");
  console.log("                            FINAL BENCHMARK RESULTS SUMMARY                               ");
  console.log("==========================================================================================");
  console.log(`Total Games Played:               ${TOTAL_GAMES}`);
  console.log(`Duration:                         ${durationSec}s (~${(durationSec / TOTAL_GAMES).toFixed(2)}s per game)`);
  console.log(`Current Engine Wins:              ${p1Wins} (${winRate}%)`);
  console.log(`Pre-Stage 1 Variant Wins:         ${p2Wins} (${((p2Wins / TOTAL_GAMES) * 100).toFixed(1)}%)`);
  console.log(`Ties:                             ${ties}`);
  console.log(`------------------------------------------------------------------------------------------`);
  console.log(`Current Engine Avg Score:         ${avgP1Score} pts`);
  console.log(`Pre-Stage 1 Variant Avg Score:    ${avgP2Score} pts`);
  console.log(`Average Margin:                   +${avgMargin} pts`);
  console.log(`------------------------------------------------------------------------------------------`);
  console.log(`Multi-Multiplier Concessions:`);
  console.log(`  Current Engine Conceded:        ${p1ConcessionsTotal} (Avg ${(p1ConcessionsTotal / TOTAL_GAMES).toFixed(2)} / game)`);
  console.log(`  Pre-Stage 1 Variant Conceded:   ${p2ConcessionsTotal} (Avg ${(p2ConcessionsTotal / TOTAL_GAMES).toFixed(2)} / game)`);
  const reduction = p2ConcessionsTotal > 0 ? (((p2ConcessionsTotal - p1ConcessionsTotal) / p2ConcessionsTotal) * 100).toFixed(1) : 0;
  console.log(`  Defensive Concession Reduction: -${reduction}%`);
  console.log("==========================================================================================\n");

  const BENCHMARK_OUT = path.join(__dirname, '../public/benchmark_results.json');
  fs.writeFileSync(BENCHMARK_OUT, JSON.stringify({
    totalGames: TOTAL_GAMES,
    durationSeconds: parseFloat(durationSec),
    currentEngine: {
      wins: p1Wins,
      winRate: parseFloat(winRate),
      avgScore: parseFloat(avgP1Score),
      multiMultiplierConcessions: p1ConcessionsTotal
    },
    preStage1Variant: {
      wins: p2Wins,
      winRate: parseFloat(((p2Wins / TOTAL_GAMES) * 100).toFixed(1)),
      avgScore: parseFloat(avgP2Score),
      multiMultiplierConcessions: p2ConcessionsTotal
    },
    concessionReductionPercent: parseFloat(reduction),
    avgMargin: parseFloat(avgMargin)
  }, null, 2));

  console.log(`Saved benchmark results to ${BENCHMARK_OUT}`);
  process.exit(0);
}

runBenchmark().catch(err => {
  console.error("Benchmark failed:", err);
  process.exit(1);
});
