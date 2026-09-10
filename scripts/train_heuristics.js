const fs = require('fs');
const path = require('path');

const MATCHES_DIR = path.join(__dirname, 'matches');
const OUTPUT_FILE = path.join(__dirname, '../public/synergy_trained.json');
const BASE_SYNERGY_FILE = path.join(__dirname, '../public/synergy.json');

function train() {
  if (!fs.existsSync(MATCHES_DIR)) {
    console.log("No matches directory found.");
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify({}));
    return;
  }

  const files = fs.readdirSync(MATCHES_DIR).filter(f => f.endsWith('.json'));
  
  if (files.length === 0) {
    console.log("No match files found to train on.");
    return;
  }

  // Load established Quackle baseline as empirical prior
  let baseSynergy = {};
  if (fs.existsSync(BASE_SYNERGY_FILE)) {
    try {
      baseSynergy = JSON.parse(fs.readFileSync(BASE_SYNERGY_FILE, 'utf8'));
    } catch (e) {
      console.warn("Could not read baseline synergy file:", e.message);
    }
  }

  // -------------------------------------------------------------------------
  // STEP 2: Filter by Match Quality and Expert/Winning Turns
  // -------------------------------------------------------------------------
  const qualifiedStreams = [];

  files.forEach(file => {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(MATCHES_DIR, file), 'utf8'));
      const turns = Array.isArray(raw) ? raw : (raw.turns || []);
      if (!turns || turns.length < 2) return;

      const p1Score = raw.p1Score || 0;
      const p2Score = raw.p2Score || 0;
      const maxScore = Math.max(p1Score, p2Score);

      // Skip low-level, truncated, or abandoned matches (< 340 pts)
      if (maxScore > 0 && maxScore < 340) return;

      const firstPlayer = turns[0].player;
      const p1Turns = [];
      const p2Turns = [];
      let secondPlayer = null;

      for (const turn of turns) {
        if (turn.player === firstPlayer) {
          p1Turns.push(turn);
        } else {
          if (!secondPlayer) secondPlayer = turn.player;
          p2Turns.push(turn);
        }
      }

      // Expert Filtering: Match winner or high-scoring player (>= 380 pts)
      const p1Qualifies = raw.winner ? (raw.winner === firstPlayer || p1Score >= 380) : true;
      const p2Qualifies = raw.winner ? (raw.winner === secondPlayer || p2Score >= 380) : true;

      if (p1Qualifies && p1Turns.length > 1) qualifiedStreams.push(p1Turns);
      if (p2Qualifies && p2Turns.length > 1) qualifiedStreams.push(p2Turns);
    } catch (err) {
      console.error("Error parsing file", file, err);
    }
  });

  // Pass 1: Compute empirical baseline average turn score
  let grandTotalScore = 0;
  let grandTotalTurns = 0;
  qualifiedStreams.forEach(stream => {
    for (let i = 0; i < stream.length - 1; i++) {
      grandTotalScore += (stream[i + 1].score || 0);
      grandTotalTurns++;
    }
  });

  const averageTurnScore = grandTotalTurns > 0 ? (grandTotalScore / grandTotalTurns) : 33.0;
  console.log(`[Step 2 - Expert Filter] Active dataset: ${qualifiedStreams.length} games, ${grandTotalTurns} turns. Baseline turn average: ${averageTurnScore.toFixed(2)} pts.`);

  // -------------------------------------------------------------------------
  // STEP 4: Compute Empirical Vowel/Consonant Ratio Imbalance Curve
  // -------------------------------------------------------------------------
  const vcStats = {};
  const VOWEL_SET = new Set(["A", "E", "I", "O", "U", "Y"]);

  qualifiedStreams.forEach(stream => {
    for (let i = 0; i < stream.length - 1; i++) {
      const cur = stream[i];
      if (!cur.leave) continue;
      const cleanChars = cur.leave.toUpperCase().split('').filter(c => c !== '?');
      const v = cleanChars.filter(c => VOWEL_SET.has(c)).length;
      const c = cleanChars.length - v;
      const ratioKey = `${v}V_${c}C`;

      if (!vcStats[ratioKey]) vcStats[ratioKey] = { total: 0, count: 0 };
      vcStats[ratioKey].total += (stream[i + 1].score || 0);
      vcStats[ratioKey].count++;
    }
  });

  const vcCurve = {};
  for (const [key, stat] of Object.entries(vcStats)) {
    if (stat.count >= 15) {
      vcCurve[key] = (stat.total / stat.count) - averageTurnScore;
    }
  }
  console.log(`[Step 4 - VC Ratios] Calibrated ${Object.keys(vcCurve).length} empirical vowel/consonant balance curves.`);

  const getPriorEquity = (leave) => {
    let eq = 0;
    const chars = leave.split('');
    for (const c of chars) {
      eq += (baseSynergy[c] || 0);
    }
    for (let i = 0; i < chars.length; i++) {
      for (let j = i + 1; j < chars.length; j++) {
        const p1 = chars[i] + chars[j];
        const p2 = chars[j] + chars[i];
        if (baseSynergy[p1] !== undefined) eq += baseSynergy[p1];
        else if (baseSynergy[p2] !== undefined) eq += baseSynergy[p2];
      }
    }

    // Step 4: Inject empirical Vowel/Consonant imbalance into Bayesian prior
    const cleanChars = chars.filter(c => c !== '?');
    const vCount = cleanChars.filter(c => VOWEL_SET.has(c)).length;
    const cCount = cleanChars.length - vCount;
    const ratioKey = `${vCount}V_${cCount}C`;
    if (vcCurve[ratioKey] !== undefined) {
      // Blend 50% of the macro VC delta into prior to anchor multi-tile leave evaluations
      eq += (vcCurve[ratioKey] * 0.5);
    }

    return eq;
  };

  // -------------------------------------------------------------------------
  // STEP 3: 2-Ply Lookahead with Discounted Future Return (TD-Lambda)
  // -------------------------------------------------------------------------
  const leavePerformance = {};
  const GAMMA = 0.65; // Discount factor for turn t+2 lookahead

  qualifiedStreams.forEach(stream => {
    for (let i = 0; i < stream.length - 1; i++) {
      const currentTurn = stream[i];
      const nextTurn = stream[i + 1];
      const immediateScore = nextTurn.score || nextTurn.points || 0;

      // 2-Ply Lookahead: reward or penalize based on subsequent turn performance
      let effectiveReward = immediateScore;
      if (i + 2 < stream.length) {
        const subsequentTurn = stream[i + 2];
        const subsequentScore = subsequentTurn.score || subsequentTurn.points || 0;
        effectiveReward += GAMMA * (subsequentScore - averageTurnScore);
      }

      const leave = (currentTurn.leave || "").toUpperCase().split('').sort().join('');
      if (!leave) continue;

      if (!leavePerformance[leave]) {
        leavePerformance[leave] = { total: 0, count: 0 };
      }
      leavePerformance[leave].total += effectiveReward;
      leavePerformance[leave].count++;
    }
  });

  console.log(`[Step 3 - 2-Ply TD] Computed discounted multi-turn returns for ${Object.keys(leavePerformance).length} distinct leaves.`);

  // -------------------------------------------------------------------------
  // Bayesian Shrinkage Model (K=20)
  // -------------------------------------------------------------------------
  const trainedWeights = {};
  const PRIOR_WEIGHT = 20;

  // 1. Shrunk Exact Leaves (for multi-tile combinations with sample size >= 3)
  for (const [leave, data] of Object.entries(leavePerformance)) {
    if (data.count >= 3 && leave.length > 1) {
      const empiricalDelta = (data.total / data.count) - averageTurnScore;
      const prior = getPriorEquity(leave);

      // Bayesian shrinkage towards grounded prior
      const shrunk = (data.count * empiricalDelta + PRIOR_WEIGHT * prior) / (data.count + PRIOR_WEIGHT);
      const clamped = Math.max(-25.0, Math.min(25.0, shrunk));
      trainedWeights[leave] = Math.round(clamped * 10) / 10;
    }
  }

  // 2. Single Letter Empirical vs Prior Shrinkage
  const singleLetterCounts = {};
  for (const [leave, data] of Object.entries(leavePerformance)) {
    if (leave.length === 1) {
      singleLetterCounts[leave] = data;
    }
  }

  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ?".split('');
  for (const char of alphabet) {
    const prior = baseSynergy[char] !== undefined ? baseSynergy[char] : 0;
    // Ground single-letter equities in Quackle baseline to preserve true long-term blank and consonant valuations
    trainedWeights[char] = Math.round(prior * 10) / 10;
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(trainedWeights, null, 2));
  console.log(`Successfully calibrated ${Object.keys(trainedWeights).length} heuristic weights to ${OUTPUT_FILE}`);

  // -------------------------------------------------------------------------
  // STEP 5: Empirical Retaliation Matrix Calibration across Tournament Matches
  // -------------------------------------------------------------------------
  console.log("\n[Step 5 - Retaliation Matrix] Training empirical retaliation matrix across tournament matches...");
  
  const RETALIATION_FILE = path.join(__dirname, '../public/retaliation_matrix.json');
  
  const categories = {
    perimeter: { name: "Perimeter (Rows/Cols 0,1,13,14)", count: 0, totalScore: 0, bingos: 0, blowouts70: 0 },
    outer_perimeter: { name: "Outer Edge / TWS (0, 14)", count: 0, totalScore: 0, bingos: 0, blowouts70: 0 },
    sub_perimeter: { name: "Sub-Perimeter Buffer (1, 13)", count: 0, totalScore: 0, bingos: 0, blowouts70: 0 },
    center: { name: "Center Core (Rows/Cols 3-11)", count: 0, totalScore: 0, bingos: 0, blowouts70: 0 },
    mid_board: { name: "Mid-Board (Rows/Cols 2, 12)", count: 0, totalScore: 0, bingos: 0, blowouts70: 0 },
    exchange_or_pass: { name: "Exchanges & Passes", count: 0, totalScore: 0, bingos: 0, blowouts70: 0 }
  };

  let totalMatchPairs = 0;

  files.forEach(file => {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(MATCHES_DIR, file), 'utf8'));
      const turns = Array.isArray(raw) ? raw : (raw.turns || []);
      if (!turns || turns.length < 2) return;

      for (let i = 0; i < turns.length - 1; i++) {
        const cur = turns[i];
        const next = turns[i + 1];
        if (cur.player === next.player) continue;
        
        const oppScore = next.score || 0;
        totalMatchPairs++;

        const isExch = !cur.pos || cur.pos.includes('-') || !cur.word;
        if (isExch) {
          categories.exchange_or_pass.count++;
          categories.exchange_or_pass.totalScore += oppScore;
          if (oppScore >= 50) categories.exchange_or_pass.bingos++;
          if (oppScore >= 70) categories.exchange_or_pass.blowouts70++;
          continue;
        }

        const r = cur.row !== undefined ? cur.row : -1;
        const c = cur.col !== undefined ? cur.col : -1;
        const isOuter = (r === 0 || r === 14 || c === 0 || c === 14);
        const isSub = (r === 1 || r === 13 || c === 1 || c === 13);
        const isPerim = cur.isPerimeter || isOuter || isSub;
        const isCenter = cur.isCenter || (!isPerim && r >= 3 && r <= 11 && c >= 3 && c <= 11);

        if (isPerim) {
          categories.perimeter.count++;
          categories.perimeter.totalScore += oppScore;
          if (oppScore >= 50) categories.perimeter.bingos++;
          if (oppScore >= 70) categories.perimeter.blowouts70++;

          if (isOuter) {
            categories.outer_perimeter.count++;
            categories.outer_perimeter.totalScore += oppScore;
            if (oppScore >= 50) categories.outer_perimeter.bingos++;
            if (oppScore >= 70) categories.outer_perimeter.blowouts70++;
          } else if (isSub) {
            categories.sub_perimeter.count++;
            categories.sub_perimeter.totalScore += oppScore;
            if (oppScore >= 50) categories.sub_perimeter.bingos++;
            if (oppScore >= 70) categories.sub_perimeter.blowouts70++;
          }
        } else if (isCenter) {
          categories.center.count++;
          categories.center.totalScore += oppScore;
          if (oppScore >= 50) categories.center.bingos++;
          if (oppScore >= 70) categories.center.blowouts70++;
        } else {
          categories.mid_board.count++;
          categories.mid_board.totalScore += oppScore;
          if (oppScore >= 50) categories.mid_board.bingos++;
          if (oppScore >= 70) categories.mid_board.blowouts70++;
        }
      }
    } catch (err) {}
  });

  const centerAvg = categories.center.count > 0 ? (categories.center.totalScore / categories.center.count) : 30.0;

  const retaliationMatrix = {
    metadata: {
      generatedAt: new Date().toISOString(),
      matchFilesProcessed: files.length,
      turnPairsAnalyzed: totalMatchPairs,
      centerBaselineScore: Math.round(centerAvg * 100) / 100
    },
    regions: {}
  };

  console.log("\n==========================================================================================");
  console.log("                     EMPIRICAL RETALIATION MATRIX (TOURNAMENT DATA)                        ");
  console.log("==========================================================================================");
  console.log(
    "Region".padEnd(30) +
    "Turns".padStart(8) +
    "Avg Opp".padStart(10) +
    "Delta vs Center".padStart(18) +
    "Bingo % (>=50)".padStart(16) +
    "Blowout % (>=70)".padStart(18)
  );
  console.log("-".repeat(100));

  for (const [key, data] of Object.entries(categories)) {
    if (data.count === 0) continue;
    const avg = data.totalScore / data.count;
    const delta = avg - centerAvg;
    const bingoPct = (data.bingos / data.count) * 100;
    const blowoutPct = (data.blowouts70 / data.count) * 100;

    retaliationMatrix.regions[key] = {
      description: data.name,
      sampleSize: data.count,
      avgOppScore: Math.round(avg * 10) / 10,
      penaltyDeltaVsCenter: Math.round(delta * 10) / 10,
      bingoProbability: Math.round(bingoPct * 10) / 10,
      blowout70Probability: Math.round(blowoutPct * 10) / 10
    };

    console.log(
      data.name.padEnd(30) +
      String(data.count).padStart(8) +
      (avg.toFixed(2) + " pts").padStart(10) +
      ((delta >= 0 ? "+" : "") + delta.toFixed(2) + " pts").padStart(18) +
      (bingoPct.toFixed(1) + "%").padStart(16) +
      (blowoutPct.toFixed(1) + "%").padStart(18)
    );
  }
  console.log("==========================================================================================\n");

  fs.writeFileSync(RETALIATION_FILE, JSON.stringify(retaliationMatrix, null, 2));
  console.log(`Saved empirical Retaliation Matrix to ${RETALIATION_FILE}`);
}

train();
