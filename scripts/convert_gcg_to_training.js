const fs = require('fs');
const path = require('path');

const RAW_GCG_DIR = path.join(__dirname, 'raw_gcg');
const MATCHES_DIR = path.join(__dirname, 'matches');

if (!fs.existsSync(RAW_GCG_DIR)) {
  fs.mkdirSync(RAW_GCG_DIR, { recursive: true });
}
if (!fs.existsSync(MATCHES_DIR)) {
  fs.mkdirSync(MATCHES_DIR, { recursive: true });
}

function processGcgFiles() {
  const files = fs.readdirSync(RAW_GCG_DIR).filter(f => f.endsWith('.gcg'));
  
  if (files.length === 0) {
    console.log("No .gcg files found in scripts/raw_gcg/. Please add some and run again.");
    return;
  }
  
  let convertedCount = 0;

  files.forEach(file => {
    try {
      const fileContent = fs.readFileSync(path.join(RAW_GCG_DIR, file), 'utf8');
      const lines = fileContent.split(/\r?\n/);
      
      let player1 = null;
      let player2 = null;
      
      let currentBoard = Array(15).fill(null).map(() => Array(15).fill(""));
      const turns = [];
      
      for (const line of lines) {
        if (line.startsWith("#player1")) {
          player1 = line.split(" ")[1] || "Player 1";
        } else if (line.startsWith("#player2")) {
          player2 = line.split(" ")[1] || "Player 2";
        } else if (line.startsWith(">")) {
          const parts = line.split(/\s+/).filter(Boolean);
          if (parts.length >= 5) {
             const playerName = parts[0].substring(1, parts[0].length - 1);
             if (!player1) player1 = playerName;
             if (!player2 && playerName !== player1) player2 = playerName;
             
             let rack = parts[1];
             const pos = parts[2];
             let rawWord = parts[3];
             
             let score = 0;
             for (let idx = 3; idx < parts.length; idx++) {
                if (/^[+-]\d+$/.test(parts[idx])) {
                   score = parseInt(parts[idx], 10);
                   break;
                }
             }
             
             let leave = "";
             let isPerimeter = false;
             let isCenter = false;
             let word = "";
             let row = -1;
             let col = -1;
             let dir = "";

             if (/[0-9]/.test(pos) && /[A-Za-z]/.test(pos)) {
                if (/[0-9]/.test(pos[0])) {
                   dir = "H";
                   const numMatch = pos.match(/[0-9]+/);
                   const letterMatch = pos.match(/[A-Za-z]+/);
                   row = parseInt(numMatch[0]) - 1;
                   col = letterMatch[0].toUpperCase().charCodeAt(0) - 65;
                } else {
                   dir = "V";
                   const letterMatch = pos.match(/[A-Za-z]+/);
                   const numMatch = pos.match(/[0-9]+/);
                   col = letterMatch[0].toUpperCase().charCodeAt(0) - 65;
                   row = parseInt(numMatch[0]) - 1;
                }
                
                word = rawWord.replace(/[()]/g, '');
                let rackArray = rack.split('');
                let touchesPerimeter = false;
                let allInCenter = true;
                
                for (let i = 0; i < word.length; i++) {
                   const r = dir === "V" ? row + i : row;
                   const c = dir === "H" ? col + i : col;
                   if (r >= 0 && r < 15 && c >= 0 && c < 15) {
                       if (r === 0 || r === 14 || c === 0 || c === 14 || r === 1 || r === 13 || c === 1 || c === 13) {
                          touchesPerimeter = true;
                       }
                       if (r < 3 || r > 11 || c < 3 || c > 11) {
                          allInCenter = false;
                       }
                       if (currentBoard[r][c] === "") {
                          let char = word[i];
                          currentBoard[r][c] = char;
                          
                          // Determine if it was a blank or normal letter from the rack
                          const isBlank = char === char.toLowerCase() && char !== char.toUpperCase();
                          const rackTarget = isBlank ? "?" : char.toUpperCase();
                          
                          const rackIdx = rackArray.indexOf(rackTarget);
                          if (rackIdx !== -1) {
                             rackArray.splice(rackIdx, 1);
                          } else {
                             const upperIdx = rackArray.indexOf(char.toUpperCase());
                             if (upperIdx !== -1) rackArray.splice(upperIdx, 1);
                          }
                       }
                   }
                }
                leave = rackArray.join("");
                isPerimeter = touchesPerimeter;
                isCenter = allInCenter;
             } else {
                leave = "";
             }
             
             turns.push({
               player: playerName,
               rack,
               leave,
               score,
               pos,
               word,
               row,
               col,
               dir,
               isPerimeter,
               isCenter
             });
          }
        }
      }
      
      let p1Total = 0;
      let p2Total = 0;
      for (const t of turns) {
        if (t.player === player1) p1Total += t.score;
        else if (t.player === player2) p2Total += t.score;
      }
      const winner = p1Total >= p2Total ? player1 : player2;

      // Tag each turn with winner status and final match scores
      for (const t of turns) {
        t.isWinner = (t.player === winner);
        t.finalScore = (t.player === player1) ? p1Total : p2Total;
        t.opponentFinalScore = (t.player === player1) ? p2Total : p1Total;
      }

      const matchOutput = {
        player1,
        player2,
        p1Score: p1Total,
        p2Score: p2Total,
        winner,
        turns
      };

      const outFile = path.join(MATCHES_DIR, file.replace('.gcg', '.json'));
      fs.writeFileSync(outFile, JSON.stringify(matchOutput, null, 2));
      convertedCount++;
      
    } catch (err) {
      console.error(`Error processing ${file}:`, err);
    }
  });

  console.log(`Successfully converted ${convertedCount} .gcg files into training data in scripts/matches/.`);
}

processGcgFiles();
