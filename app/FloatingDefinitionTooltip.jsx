import React, { useState, useEffect, useRef } from "react";

export default function FloatingDefinitionTooltip({
  hoveredPlay,
  lookupWord,
  activeLexicon,
  onLeave,
}) {
  const tooltipRef = useRef(null);
  const [definition, setDefinition] = useState(null);

  useEffect(() => {
    if (!hoveredPlay) return;
    const play = Array.isArray(hoveredPlay) ? hoveredPlay[0] : hoveredPlay;
    if (!play || play.dir === "EXCH") return;

    let isMounted = true;
    const fetchDef = async () => {
      const w = play.word.toLowerCase();
      if (lookupWord) {
        const def = await lookupWord(w);
        if (isMounted) setDefinition(def);
      }
    };
    fetchDef();

    if (tooltipRef.current) {
      tooltipRef.current.style.display = "block";
      tooltipRef.current.style.transform = "translate(-50%, -50%)";
      tooltipRef.current.style.left = "50%";
      tooltipRef.current.style.top = "50%";
    }

    const handleMouseMove = (e) => {
      if (!tooltipRef.current) return;
      if (window.innerWidth <= 768) {
        tooltipRef.current.style.transform = "translate(-50%, -50%)";
        tooltipRef.current.style.left = "50%";
        tooltipRef.current.style.top = "50%";
        return;
      }
      const x = Math.max(10, Math.min(e.clientX + 14, window.innerWidth - 300));
      const y = Math.max(10, Math.min(e.clientY + 14, window.innerHeight - 180));
      tooltipRef.current.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      tooltipRef.current.style.left = "0";
      tooltipRef.current.style.top = "0";
    };

    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    return () => {
      isMounted = false;
      window.removeEventListener("mousemove", handleMouseMove);
      setDefinition(null);
    };
  }, [hoveredPlay, lookupWord]);

  if (!hoveredPlay) return null;
  const play = Array.isArray(hoveredPlay) ? hoveredPlay[0] : hoveredPlay;
  if (!play || play.dir === "EXCH") return null;

  const getBingoProb = (leave) => {
    if (!leave || leave === "None") return "0%";
    const synergy = ["A", "E", "I", "O", "U", "R", "S", "T", "L", "N"];
    let good = 0,
      blanks = 0;
    for (let c of leave) {
      if (c === "?") blanks++;
      else if (synergy.includes(c.toUpperCase())) good++;
    }
    const bad = leave.length - good - blanks;
    const baseOdds = [0, 1, 4, 10, 22, 38, 26, 0]; // Probability curve by leave length
    let prob = (baseOdds[leave.length] || 0) - bad * 4 + blanks * 15;
    if (prob < 0) prob = 0;
    if (prob > 99) prob = 99;
    return Math.round(prob) + "%";
  };

  const leaveLen = play.leave === "None" ? 0 : play.leave.length;
  const turnover = `Draws ${7 - leaveLen} | Keeps ${leaveLen}`;

  return (
    <div
      ref={tooltipRef}
      className="win98-window win98-tooltip"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "280px",
        zIndex: 99999,
        pointerEvents: "auto",
        boxShadow: "2px 2px 0px #000000",
        margin: 0,
      }}
    >
      <div
        className="win98-titlebar"
        style={{
          padding: "2px 4px",
          fontSize: "11px",
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <span>{play.word.toUpperCase()}</span>
        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          <span>{play.score} PTS</span>
          <button
            className="def-btn-mobile"
            style={{ margin: 0 }}
            onClick={(e) => {
              e.stopPropagation();
              if (onLeave) onLeave();
            }}
          >
            X
          </button>
        </div>
      </div>
      <div
        className="win98-inset"
        style={{
          padding: "6px 8px",
          fontSize: "12px",
          lineHeight: "1.4",
          maxHeight: "220px",
          overflowY: "auto",
          whiteSpace: "normal",
          wordBreak: "break-word",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: "4px",
            marginBottom: "8px",
            flexWrap: "wrap",
          }}
        >
          {play.isValid ? (
            <span className="badge-legal">
              ✔ VALID ({activeLexicon ? activeLexicon.toUpperCase() : ""})
            </span>
          ) : (
            <span className="badge-illegal">✖ INVALID</span>
          )}
          {play.blocksDWS && (
            <span
              className="badge-legal"
              style={{ backgroundColor: "#1565c0" }}
            >
              🛡️ BLOCKS DWS
            </span>
          )}
          {play.opensTWS && (
            <span
              className="badge-illegal"
              style={{ backgroundColor: "#d84315" }}
            >
              🚨 OPENS TWS
            </span>
          )}
          {play.isHotSpot && (
            <span
              className="badge-legal"
              style={{ backgroundColor: "#ff8f00" }}
            >
              🎯 HOT SPOT
            </span>
          )}
        </div>

        <div
          style={{
            marginBottom: "8px",
            fontSize: "11px",
            background: "#eee",
            padding: "4px",
            border: "1px inset #fff",
          }}
        >
          <div>
            <strong>Math:</strong> {play.baseScore} (Base) + {play.leaveEquity}{" "}
            (Eq) - {play.defPenalty || 0} (Risk) = {play.totalVal}
          </div>
          <div style={{ marginTop: "2px" }}>
            <strong>Turnover:</strong> {turnover}
          </div>
          <div style={{ marginTop: "2px" }}>
            <strong>Est. Next Turn Bingo:</strong> {getBingoProb(play.leave)}
          </div>
        </div>

        {definition || (
          <span style={{ color: "#777", fontStyle: "italic" }}>
            Valid tournament play (inflected form or no extended definition
            entry).
          </span>
        )}
      </div>
    </div>
  );
}
