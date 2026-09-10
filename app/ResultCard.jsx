import React from "react";
import { playBingoChime } from "./soundEffects";

let lastChimeTime = 0;
function playThrottledChime() {
  const now = Date.now();
  if (now - lastChimeTime > 300) {
    lastChimeTime = now;
    playBingoChime();
  }
}

const ResultCard = React.memo(
  ({
    play,
    notation,
    colLetter,
    rowNum,
    activeLexicon,
    activePreset,
    onHover,
    onLeave,
    onClick,
    rack,
  }) => {
    const isExch = play.dir === "EXCH";
    const cleanRack = rack ? rack.replace(/[^a-zA-Z?]/g, "") : "";
    const leaveLen = !play.leave || play.leave === "None" ? 0 : play.leave.length;
    const tilesUsed = isExch ? 0 : (cleanRack.length - leaveLen);

    const leaveStr = play.leave && play.leave !== "None" ? play.leave.toUpperCase() : "";
    const vCount = (leaveStr.match(/[AEIOU]/g) || []).length;
    const hasVW = leaveStr.includes("V") && leaveStr.includes("W");
    const hasVV = (leaveStr.match(/V/g) || []).length >= 2;
    const hasTripleVowel = (leaveStr.match(/I/g) || []).length >= 3 || (leaveStr.match(/U/g) || []).length >= 3 || (leaveStr.match(/O/g) || []).length >= 3;
    const hasQnoU = leaveStr.includes("Q") && !leaveStr.includes("U");
    const isPoisonLeave = !isExch && (hasVW || hasVV || hasQnoU || play.leaveEquity <= -12.0);
    const isVowelFlood = !isExch && ((leaveLen >= 4 && vCount >= 4) || hasTripleVowel);

    return (
      <div
        className="result-card"
        style={{
          cursor: "pointer",
          backgroundColor: isExch ? "#f4f0ff" : undefined,
        }}
        onMouseEnter={() => {
          if (tilesUsed === 7) playThrottledChime();
          onHover(play);
        }}
        onMouseLeave={onLeave}
        onClick={() => onClick(play)}
      >
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              flexWrap: "wrap",
              marginBottom: "4px",
            }}
          >
            <div style={{ display: "flex", gap: "2px" }}>
              {play.word
                .toUpperCase()
                .split("")
                .map((ch, idx) => (
                  <div
                    key={idx}
                    className="scrabble-tile-mini"
                    style={{ opacity: isExch ? 0.6 : 1 }}
                  >
                    <span>{ch}</span>
                    <sub className="tile-score-sub">
                      {activePreset?.scores?.[ch.toLowerCase()] ?? 0}
                    </sub>
                  </div>
                ))}

              {!isExch && (
                <button
                  className="def-btn-mobile"
                  onClick={(e) => {
                    e.stopPropagation();
                    onHover(play);
                  }}
                  title="View Definition"
                >
                  DEF
                </button>
              )}
            </div>

            {!isExch && play.score >= 50 && tilesUsed < 7 && (
              <span className="badge-legal" style={{ backgroundColor: "#8e24aa" }}>POWER PLAY</span>
            )}
            {!isExch && (
              <>
                <span
                  className="badge-legal"
                  style={{ fontSize: "8px", padding: "1px 3px" }}
                >
                  {activeLexicon ? activeLexicon.toUpperCase() : ""}
                </span>

                {tilesUsed === 7 && (
                  <span
                    className="badge-dict-only"
                    style={{
                      fontSize: "8px",
                      padding: "1px 3px",
                      backgroundColor: "#e3f2fd",
                      color: "#1565c0",
                      borderColor: "#90caf9",
                    }}
                  >
                    BINGO
                  </span>
                )}

                {play.exposes3W && (
                  <span
                    className="badge-illegal"
                    style={{
                      fontSize: "8px",
                      padding: "1px 3px",
                      backgroundColor: "#ffebee",
                      color: "#c62828",
                      borderColor: "#ef9a9a",
                    }}
                  >
                    RISK: 3W
                  </span>
                )}

                {isPoisonLeave && (
                  <span
                    className="badge-illegal"
                    style={{
                      fontSize: "8px",
                      padding: "1px 3px",
                      backgroundColor: "#b71c1c",
                      color: "#ffffff",
                      borderColor: "#ef5350",
                    }}
                    title="Warning: Keeps toxic consonant combinations (V/W, duplicate V, Q without U) or severe negative equity."
                  >
                    ⚠️ POISON LEAVE
                  </span>
                )}

                {isVowelFlood && (
                  <span
                    className="badge-illegal"
                    style={{
                      fontSize: "8px",
                      padding: "1px 3px",
                      backgroundColor: "#e65100",
                      color: "#ffffff",
                      borderColor: "#ffb74d",
                    }}
                    title="Warning: Severe vowel flood or triple duplicate vowels on rack."
                  >
                    ⚠️ VOWEL FLOOD
                  </span>
                )}

                {play.opensTripleTriple && (
                  <span
                    className="badge-illegal"
                    style={{
                      fontSize: "8px",
                      padding: "1px 3px",
                      backgroundColor: "#880e4f",
                      color: "#ffffff",
                      borderColor: "#ad1457",
                      fontWeight: "bold",
                    }}
                    title="Critical Warning: Opens a 9x Triple-Triple corridor directly exposed to opponent bingos!"
                  >
                    ⚠️ RISK: 9X TWS
                  </span>
                )}

                {play.opensDoubleDouble && (
                  <span
                    className="badge-illegal"
                    style={{
                      fontSize: "8px",
                      padding: "1px 3px",
                      backgroundColor: "#c2185b",
                      color: "#ffffff",
                      borderColor: "#e91e63",
                    }}
                    title="Warning: Opens a 4x Double-Double corridor exposed to high-scoring counter plays."
                  >
                    ⚠️ RISK: 4X DWS
                  </span>
                )}

                {play.blocksTripleTriple && (
                  <span
                    className="badge-legal"
                    style={{
                      fontSize: "8px",
                      padding: "1px 3px",
                      backgroundColor: "#1b5e20",
                      color: "#ffffff",
                      borderColor: "#2e7d32",
                    }}
                    title="Defensive Masterplay: Blocks opponent access to a 9x Triple-Triple corridor!"
                  >
                    🛡️ BLOCKS 9X
                  </span>
                )}

                {play.blocksDoubleDouble && (
                  <span
                    className="badge-legal"
                    style={{
                      fontSize: "8px",
                      padding: "1px 3px",
                      backgroundColor: "#2e7d32",
                      color: "#ffffff",
                      borderColor: "#388e3c",
                    }}
                    title="Defensive Play: Blocks opponent access to a 4x Double-Double corridor."
                  >
                    🛡️ BLOCKS 4X
                  </span>
                )}

                {play.retainsBlank && (
                  <span
                    className="badge-legal"
                    style={{
                      fontSize: "8px",
                      padding: "1px 3px",
                      backgroundColor: "#0277bd",
                      color: "#ffffff",
                      borderColor: "#0288d1",
                    }}
                    title="Retains Blank (?) for future high-equity bingos."
                  >
                    💎 RETAIN BLANK
                  </span>
                )}

                {play.blankSurchargeApplied && (
                  <span
                    className="badge-illegal"
                    style={{
                      fontSize: "8px",
                      padding: "1px 3px",
                      backgroundColor: "#d84315",
                      color: "#ffffff",
                      borderColor: "#ff5722",
                    }}
                    title="Blank Surcharge (-14): Expends a blank tile without scoring ≥ 50 pts or bingoing when non-blank moves are close in score."
                  >
                    BLANK SURCHARGE (-14)
                  </span>
                )}
              </>
            )}
          </div>

          <div style={{ fontSize: "11px", opacity: 0.9 }}>
            <strong>{notation}</strong>{" "}
            {!isExch &&
              `• Row ${rowNum}, Col ${colLetter} (${play.dir === "H" ? "Across" : "Down"})`}
          </div>
          <div style={{ fontSize: "10px", marginTop: "3px", color: "#444" }}>
            Leave:{" "}
            <strong style={{ letterSpacing: "1px" }}>{play.leave}</strong>
            {(() => {
              if (!play.leave || play.leave === "None") return null;
              const v = (play.leave.match(/[AEIOU]/gi) || []).length;
              const blanks = (play.leave.match(/[?]/g) || []).length;
              const c = play.leave.length - v - blanks;
              const bStr = blanks > 0 ? `/${blanks}?` : "";
              return ` (${v}V/${c}C${bStr})`;
            })()}
            (
            <span
              style={{
                color: play.leaveEquity >= 0 ? "#1b5e20" : "#b71c1c",
                fontWeight: "bold",
              }}
            >
              {play.leaveEquity >= 0
                ? `+${play.leaveEquity}`
                : play.leaveEquity}{" "}
              eq
            </span>
            )
          </div>

          {/* Counter-Move / Opponent Deduction Metrics */}
          {play.oppBestReply ? (
            <div
              className="opponent-reply-block"
              onMouseEnter={(e) => {
                e.stopPropagation();
                onHover([play, play.oppBestReply]);
              }}
              onMouseLeave={(e) => {
                e.stopPropagation();
                onHover(play);
              }}
              onClick={(e) => {
                e.stopPropagation();
                onClick(play, false);
                onClick(play.oppBestReply, true);
              }}
              title="Click to apply Opponent's counter-play to the board"
            >
              Opp. Reply: {play.oppBestReply.word} ({play.oppBestReply.score}{" "}
              PTS) &bull; Net:{" "}
              {play.netSpread > 0 ? `+${play.netSpread}` : play.netSpread}
            </div>
          ) : play.avgOppScore != null ? (
            <div
              className="opponent-reply-block"
              style={{ backgroundColor: "#f3e8ff", borderColor: "#d8b4fe", color: "#6b21a8" }}
              title={`Simulated average opponent response: ~${play.avgOppScore} pts across Monte Carlo rollouts`}
            >
              Sim. Opp: ~{play.avgOppScore} PTS &bull; Net:{" "}
              {play.netSpread > 0 ? `+${play.netSpread}` : play.netSpread}
            </div>
          ) : null}
        </div>

        <div style={{ textAlign: "right", minWidth: "90px" }}>
          <div
            style={{
              fontSize: "14px",
              fontWeight: "bold",
              color: isExch ? "#606060" : "#008000",
            }}
          >
            {play.score} PTS
          </div>
          <div
            style={{
              fontSize: "10px",
              color: "#333",
              fontWeight: "bold",
              marginBottom: "2px",
            }}
          >
            Val: {play.totalVal}
            {play.winRate != null && (
              <span
                style={{
                  marginLeft: "4px",
                  color: play.winRate >= 50 ? "#1b5e20" : "#b71c1c",
                  fontSize: "9px",
                }}
                title={`Monte Carlo Win Rate: ${play.winRate}%`}
              >
                ({play.winRate}%)
              </span>
            )}
          </div>
          {!isExch &&
            (play.exposes3W ? (
              <span className="badge-risk-high">EXPOSES 3W</span>
            ) : isPoisonLeave ? (
              <span className="badge-risk-high" style={{ backgroundColor: "#ffebee", color: "#c62828", borderColor: "#ef9a9a" }}>
                POISON LEAVE
              </span>
            ) : isVowelFlood ? (
              <span className="badge-risk-high" style={{ backgroundColor: "#fff3e0", color: "#e65100", borderColor: "#ffcc80" }}>
                VOWEL FLOOD
              </span>
            ) : (
              <span className="badge-risk-safe">SAFE LEAVE</span>
            ))}
        </div>
      </div>
    );
  },
);
ResultCard.displayName = "ResultCard";

export default ResultCard;
