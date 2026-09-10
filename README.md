# 🐧 WaddleWord

<div align="center">

[![Live Demo](https://img.shields.io/badge/Live%20Demo-waddleword.vercel.app-008080?style=for-the-badge&logo=vercel)](https://waddleword.vercel.app)
[![Next.js](https://img.shields.io/badge/Next.js-16.2.10-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.2.4-blue?style=for-the-badge&logo=react)](https://react.dev/)
[![WebGPU](https://img.shields.io/badge/WebGPU-Compute%20Shaders-red?style=for-the-badge&logo=webgpu)](https://www.w3.org/TR/webgpu/)
[![PWA](https://img.shields.io/badge/PWA-Offline%20Ready-green?style=for-the-badge&logo=pwa)](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps)

**A tournament-grade crossword board game engine, WebGPU Monte Carlo simulator, and strategic board analyzer styled in an authentic retro Windows 98 desktop interface.**

[Live Application](https://waddleword.vercel.app) • [Architecture](#-architecture--engine-design) • [Features](#-features) • [Lexicons](#-supported-lexicons) • [Getting Started](#-getting-started) • [Credits](#-credits--acknowledgments)

</div>

---

## 📖 Overview

**WaddleWord** combines the nostalgic, pixel-perfect aesthetic of 90s desktop operating systems with high-performance modern web technologies. Behind its classic dialogs and wooden tile racks lies a multi-threaded game engine powered by WebGPU compute shaders, deterministic GADDAG graph structures, and exact minimax alpha-beta endgame pruning.

Whether analyzing historical Grandmaster `.gcg` tournament games, calculating complex endgame outplays, or practicing defensive board control against aggressive open lanes, WaddleWord evaluates both immediate points and long-term equity.

---

## ⚡ Architecture & Engine Design

```
┌────────────────────────────────────────────────────────────┐
│                    WaddleWord Frontend                     │
│    (Next.js 16 + React 19 + Windows 98 Classic Styles)     │
└────────────────────────────┬───────────────────────────────┘
                             │
                  postMessage (Async / Non-blocking)
                             │
                             ▼
┌────────────────────────────────────────────────────────────┐
│               Dedicated Solver Web Worker                  │
│                      (solverWorker.js)                     │
├────────────────────────────────────────────────────────────┤
│  1. GADDAG Move Generation                                 │
│     • Fast candidate generation using Gordon GADDAG        │
│     • Cross-checks & anchor bitmasks in < 15ms             │
│                                                            │
│  2. Tactical Heuristics & Defensive Lane Engine            │
│     • 8-coordinate Triple Word Score (TWS) lane tracking   │
│     • Defective leave dynamic scaling (totalUnseen <= 14)  │
│     • Pre-endgame consonant penalty & turnover gating      │
│                                                            │
│  3. Exact Minimax Alpha-Beta Endgame Solver                │
│     • 1-4 ply deterministic search (bag <= 7)              │
│     • Killer outplay move ordering                         │
│     • Immediate terminal payoff beta-cutoff                │
│                                                            │
│  4. Monte Carlo Simulation Dispatch                        │
│     ┌────────────────────────┐  ┌───────────────────────┐  │
│     │  WebGPU Compute Shader │  │   CPU Fast Fallback   │  │
│     │   (mc_simulator.wgsl)  │  │ (runCPUSimulations)  │  │
│     │ 16,384 GPU rollout thr │  │ 128 rollouts/cand     │  │
│     └────────────────────────┘  └───────────────────────┘  │
└────────────────────────────────────────────────────────────┘
```

### 1. Directed Acyclic Word Graphs (GADDAG)
- Implements Steven A. Gordon's **GADDAG** data structure (1994) compiled into binary `.bin` files loaded directly into TypedArrays (`Uint32Array`).
- Enables bidirectional prefix/suffix expansion across horizontal and vertical board vectors in single-digit milliseconds.

### 2. WebGPU Monte Carlo Rollout Shader (`mc_simulator.wgsl`)
- Simulates opponent counter-responses in parallel using WebGPU compute pipelines.
- Spawns **16,384 GPU threads** (1,024 simulations across the top 16 candidate moves).
- Features a **PCG (Permuted Congruential Generator)** PRNG for fast, uniform sampling without replacement from unseen bag tiles.
- Models probabilistic opponent bingos, anchor densities, and Triple Word Score reachability.
- Automatically adjusts candidate ratings using relative defense variance ($\Delta_{\text{defense}} = \text{baselineOppScore} - \text{avgOppScore}$).
- Gracefully falls back to a 128-iteration CPU Monte Carlo simulation on devices without WebGPU support.

### 3. Exact Alpha-Beta Endgame Minimax
- Activates automatically when the bag is empty ($\le 7$ tiles remain in play).
- Employs **Killer Outplay Move Ordering**: orders potential game-ending outplays to index 0 using estimated terminal spread payoff:
  $$\text{estVal} = \text{score} + (\text{tilesUsed} \ge \text{rackTiles} \,?\, (\text{oppUnplayedSum} \times 2 + 1000) : 0)$$
- Triggers instant $\beta$-cutoffs when an insurmountable outplay is identified.
- Integrates transposition table caching with Zobrist hashing for $O(1)$ state lookups.

### 4. Board-Wide Open Lane Defense (TWS Guardian)
- Tracks 8 perimeter Triple Word Score coordinates: `(0,0), (0,7), (0,14), (7,0), (7,14), (14,0), (14,7), (14,14)`.
- Identifies open, hookable lanes along rows and columns within reach of standard rack placements.
- Rewards defensive sealing plays with $+6.0$ tactical defense bonuses while penalizing moves that leave dangerous lanes exposed when the opponent holds threat tiles (`?`, `J`, `Q`, `X`, `Z`).

---

## 🎛 Features

- **Retro Windows 98 Experience**: Authentic title bars, bevels, system buttons, draggable modals, and sound effects (tile clacks, button clicks, chord alerts).
- **Full Keyboard Navigation**:
  - `Arrow Keys`: Navigate cursor across the 15x15 board.
  - `Spacebar`: Toggle typing direction (Horizontal $\leftrightarrow$ Vertical).
  - `Shift + Arrow Keys`: Explicitly set typing direction without moving.
  - `?` or `/`: Open the zero-point Blank tile selector.
  - `Tab`: Jump directly to the top suggested play.
  - `Ctrl + Z / Y`: Full undo/redo history stack.
- **Interactive Move Preview**: Hover over any suggested move in the suggestion drawer to preview its placement and coordinates on the board.
- **Hover Definition Tooltip**: Move definitions fetched asynchronously from local compact dictionary indexes on hover.
- **Unseen Tile Tracker**: Real-time deduction pool displaying unseen distribution, remaining vowel/consonant balance, and power tiles.
- **GCG Replay Parser**: Import `.gcg` match transcripts from competitive platforms like Woogles.io and Cross-Tables to replay games turn-by-turn.
- **Offline PWA Support**: Pre-cached binary GADDAGs, shaders, and dictionary assets through a Service Worker for offline play.

---

## 📚 Supported Lexicons

| Lexicon | Description | Primary Region | Binary Size |
| :--- | :--- | :--- | :--- |
| **NWL 2023** | NASPA Word List (Current Tournament) | North America | ~18.2 MB |
| **CSW 2024** | Collins Scrabble Words (Current Tournament) | International / WESPA | ~26.1 MB |
| **CSW 2021** | Collins Scrabble Words (Legacy) | International | ~26.0 MB |
| **SOWPODS** | Traditional International English | Global | ~25.1 MB |
| **TWL 2006** | Tournament Word List (Historical) | North America | ~16.4 MB |

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- `npm` or `pnpm`

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/danz-the-penguin/waddleword.git
cd waddleword

# 2. Install dependencies
npm install

# 3. Start the local development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Production Build

```bash
# Compile optimized production bundle
npm run build

# Start production server
npm run start
```

---

## 📁 Repository Structure

```
waddleword/
├── app/
│   ├── layout.js                      # Root HTML layout with viewport & SEO metadata
│   ├── page.jsx                       # Main WaddleWord application component
│   ├── scrabble.css                   # Authentic Windows 98 stylesheet
│   ├── BoardCell.jsx                  # Individual 15x15 board cell with multipliers
│   ├── ResultCard.jsx                 # Suggested play card with WebGPU simulation stats
│   ├── UnseenTileTracker.jsx          # Live tile tracking & deduction UI
│   ├── FloatingDefinitionTooltip.jsx  # Definition popover on word hover
│   ├── RefereeChecker.js              # Challenge adjudicator dialog
│   ├── soundEffects.js                # Web Audio sound synthesis (clicks, clacks, chords)
│   ├── gcgParser.js                   # GCG transcript parser
│   ├── presets.js                     # Board geometries, letter distributions, tile values
│   └── [hooks]                        # Worker, debounce, and board history hooks
├── public/
│   ├── gaddag_*.bin                   # Pre-compiled GADDAG dictionary binary graphs
│   ├── dictionary_compact.json        # Compact word definitions
│   ├── solverWorker.js                # Multi-threaded solver engine
│   ├── mc_simulator.wgsl              # WebGPU Monte Carlo simulation shader
│   ├── synergy.json                   # Tournament single & pair synergy values
│   ├── synergy_trained.json           # Machine learning equity weights
│   ├── manifest.json                  # Progressive Web App manifest
│   └── sw.js                          # Cache-First Service Worker
├── next.config.mjs                    # Next.js configuration & headers
└── package.json                       # Dependencies & build scripts
```

---

## 🤝 Credits & Acknowledgments

This project stands on the shoulders of giants across computer science and the competitive word game community:

- **Kamil Mielnik ([Scrabble Solver](https://scrabble-solver.org))**: Pioneer of open-source web-based board solvers, whose work served as an architectural reference and inspiration.
- **Quackle**: The gold-standard open-source crossword AI. Endgame synergy weights were extracted directly from Quackle's pre-calculated strategy datasets.
- **Steven A. Gordon**: For formulating the **GADDAG** data structure (1994), the deterministic acyclic finite state automaton that powers move generation.
- **Albert Zobrist**: For Zobrist Hashing, used within the Transposition Table to cache board states in $O(1)$ time during Alpha-Beta pruning.
- **Woogles.io & Cross-Tables.com**: For providing open platforms, UI workflows, and public archives of Grandmaster tournament games.
- **NASPA & WESPA**: For the curation and maintenance of official competitive lexicons (NWL and CSW).
- **PCG (Permuted Congruential Generator)**: For the performant pseudo-random number generator used directly within the WGSL Compute Shader.
- **Sierra On-Line (Hoyle Classic Games)**: Design inspiration for the customized, wooden Windows 98 aesthetic.

---

## 📄 License

This project is open source and available under the [MIT License](LICENSE).
