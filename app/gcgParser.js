export function parseGcgFile(fileContent) {
  const lines = fileContent.split(/\r?\n/);
  const history = [];
  
  let player1 = null;
  let player2 = null;
  
  let currentBoard = Array(15).fill(null).map(() => Array(15).fill(""));
  let currentOwners = Array(15).fill(null).map(() => Array(15).fill(""));
  let p1Score = 0;
  let p2Score = 0;
  
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
         
         const rack = parts[1];
         const pos = parts[2];
         let rawWord = parts[3];
         const score = parseInt(parts[4]) || 0;
         
         const isPlayer1 = playerName === player1;
         if (isPlayer1) p1Score += score;
         else p2Score += score;
         
         if (/[0-9]/.test(pos) && /[A-Za-z]/.test(pos)) {
            let dir = "H";
            let row = 0;
            let col = 0;
            
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
            
            let word = rawWord.replace(/[()]/g, '');
            for (let i = 0; i < word.length; i++) {
               const r = dir === "V" ? row + i : row;
               const c = dir === "H" ? col + i : col;
               if (r >= 0 && r < 15 && c >= 0 && c < 15) {
                   if (currentBoard[r][c] === "") {
                      let char = word[i];
                      // Uppercase for regular, lowercase for blanks is standard in GCG.
                      currentBoard[r][c] = char;
                      currentOwners[r][c] = isPlayer1 ? "me" : "opp";
                   }
               }
            }
         }
         
         history.push({
           player: isPlayer1 ? "me" : "opp",
           rack,
           myScore: p1Score,
           oppScore: p2Score,
           board: currentBoard.map(row => [...row]),
           tileOwners: currentOwners.map(row => [...row])
         });
      }
    }
  }
  return history;
}
