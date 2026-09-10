const fs = require('fs');
const path = require('path');

const RAW_GCG_DIR = path.join(__dirname, 'raw_gcg');

if (!fs.existsSync(RAW_GCG_DIR)) {
  fs.mkdirSync(RAW_GCG_DIR, { recursive: true });
}

// Curated top-performing bots on Woogles
const TOP_BOTS = [
  'HastyBot',
  'BetterBot',
  'STEEBot',
  'BasicBot'
];

// Curated active tournament grandmasters / expert players on Woogles
const TOP_PLAYERS = [
  'cesar',        // Cesar Del Solar (Woogles co-founder & Master)
  'Abiola',       // Abiola Oyewole (2180+ rating)
  'tequilajoe',   // Master tier (2100+ rating)
  'joelimus',     // Joel Sherman / World Champion tier (2200+ rating)
  'solider',      // CSW Master (2200+ rating)
  'sungoer',      // CSW Master (1950+ rating)
  'Joshua',       // Tournament Champion (1930+ rating)
  'BethMix',      // Expert tier (1720+ rating)
  'LikeMike'      // Expert tier (1790+ rating)
];

function printHelp() {
  console.log(`
=== Woogles Bulk GCG Downloader ===

Usage:
  node scripts/download_gcgs.js [options] [usernames...]

Options:
  --bots            Download from top AI engines (${TOP_BOTS.join(', ')})
  --players         Download from top human Grandmasters (${TOP_PLAYERS.slice(0, 5).join(', ')}...)
  --all             Download from both top bots AND top human Grandmasters
  --count <N>       Number of games to request per user/bot (default: 30, max: 1000)
  --min-rating <N>  Only keep games where at least one player's rating >= N (e.g. 1800)
  --help, -h        Show this help message

Examples:
  npm run download:gcg
  node scripts/download_gcgs.js --bots --count 50
  node scripts/download_gcgs.js --players --count 40
  node scripts/download_gcgs.js --all --count 25
  node scripts/download_gcgs.js HastyBot cesar joelimus --count 50
  node scripts/download_gcgs.js HastyBot --min-rating 2000 --count 100
`);
}

async function fetchRecentGames(username, count = 30) {
  const url = 'https://woogles.io/api/game_service.GameMetadataService/GetRecentGames';
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, num_games: Math.min(count, 1000) })
    });

    if (!res.ok) {
      console.warn(`  [!] API returned status ${res.status} for ${username}`);
      return [];
    }

    const data = await res.json();
    return data.game_info || [];
  } catch (err) {
    console.warn(`  [!] Failed network call for ${username}: ${err.message}`);
    return [];
  }
}

async function fetchGCG(gameId) {
  const url = 'https://woogles.io/api/game_service.GameMetadataService/GetGCG';
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game_id: gameId })
    });

    if (!res.ok) return null;
    const data = await res.json();
    return data.gcg || null;
  } catch (err) {
    return null;
  }
}

function sanitizeName(name) {
  return (name || 'Player').replace(/[^a-zA-Z0-9_-]/g, '');
}

async function main() {
  const rawArgs = process.argv.slice(2);

  if (rawArgs.includes('--help') || rawArgs.includes('-h')) {
    printHelp();
    return;
  }

  let count = 30;
  let minRating = 0;
  let targets = [];

  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (arg === '--count' || arg === '-c') {
      const val = parseInt(rawArgs[++i], 10);
      if (!isNaN(val) && val > 0) count = val;
    } else if (arg === '--min-rating') {
      const val = parseInt(rawArgs[++i], 10);
      if (!isNaN(val) && val > 0) minRating = val;
    } else if (arg === '--bots') {
      targets.push(...TOP_BOTS);
    } else if (arg === '--players') {
      targets.push(...TOP_PLAYERS);
    } else if (arg === '--all') {
      targets.push(...TOP_BOTS, ...TOP_PLAYERS);
    } else if (!arg.startsWith('-')) {
      targets.push(arg);
    }
  }

  // Deduplicate targets
  targets = Array.from(new Set(targets));

  // Default if no targets specified
  if (targets.length === 0) {
    targets = [...TOP_BOTS];
  }

  console.log(`=======================================================`);
  console.log(`Woogles Bulk GCG Downloader`);
  console.log(`Targets (${targets.length}): ${targets.join(', ')}`);
  console.log(`Max games per target: ${count}`);
  if (minRating > 0) {
    console.log(`Min rating filter: >= ${minRating}`);
  }
  console.log(`Destination: scripts/raw_gcg/`);
  console.log(`=======================================================\n`);

  let totalFetched = 0;
  let totalSaved = 0;
  let totalSkippedExisting = 0;
  let totalFilteredOut = 0;

  for (const username of targets) {
    console.log(`▶ Querying recent games for [${username}]...`);
    const games = await fetchRecentGames(username, count);
    totalFetched += games.length;

    let savedForUser = 0;

    for (const game of games) {
      const gameId = game.game_id;
      if (!gameId) continue;

      // Filter: Finished standard games only
      if (game.game_end_reason && game.game_end_reason !== 'STANDARD') {
        totalFilteredOut++;
        continue;
      }

      // Filter: Require non-trivial match score (> 100 per player)
      const scores = game.scores || [];
      if (scores.length >= 2 && (scores[0] < 100 || scores[1] < 100)) {
        totalFilteredOut++;
        continue;
      }

      const p1Obj = game.players?.[0] || {};
      const p2Obj = game.players?.[1] || {};
      const p1 = sanitizeName(p1Obj.nickname);
      const p2 = sanitizeName(p2Obj.nickname);
      const r1 = parseInt(p1Obj.rating, 10) || 0;
      const r2 = parseInt(p2Obj.rating, 10) || 0;

      // Rating filter if requested
      if (minRating > 0 && Math.max(r1, r2) < minRating) {
        totalFilteredOut++;
        continue;
      }

      const filename = `${p1}_vs_${p2}_${gameId}.gcg`;
      const filePath = path.join(RAW_GCG_DIR, filename);

      // Skip already downloaded files
      if (fs.existsSync(filePath)) {
        totalSkippedExisting++;
        continue;
      }

      const gcgContent = await fetchGCG(gameId);
      if (gcgContent && gcgContent.startsWith('#')) {
        fs.writeFileSync(filePath, gcgContent, 'utf8');
        totalSaved++;
        savedForUser++;
        const lexicon = game.game_request?.lexicon || 'CLASSIC';
        const scoreStr = scores.length === 2 ? `(${scores[0]}-${scores[1]})` : '';
        console.log(`  ✔ [${lexicon}] ${p1} (${r1 || '?'}) vs ${p2} (${r2 || '?'}) ${scoreStr} -> ${filename}`);
      }

      // Polite rate-limiting between GCG downloads
      await new Promise(r => setTimeout(r, 120));
    }

    console.log(`  └─ Saved ${savedForUser} new match(es) for ${username}.\n`);
  }

  console.log(`=======================================================`);
  console.log(`Summary:`);
  console.log(`  • Metadata fetched:    ${totalFetched} matches`);
  console.log(`  • Newly saved to disk: ${totalSaved} .gcg files`);
  console.log(`  • Already on disk:     ${totalSkippedExisting} files`);
  console.log(`  • Filtered/Aborted:    ${totalFilteredOut} matches`);
  console.log(`=======================================================`);
  console.log(`\nNext step: Run 'npm run train' to parse and update your ML heuristic weights!`);
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
