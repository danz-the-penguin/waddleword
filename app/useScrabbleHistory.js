import { useState, useCallback, useRef, useEffect } from 'react';

const clone2D = (arr) => (arr ? arr.map((r) => [...r]) : arr);

export function useScrabbleHistory(
  board, setBoard, 
  rack, setRack, 
  tileOwners, setTileOwners,
  myScore, setMyScore,
  oppScore, setOppScore,
  setHoveredPlay
) {
  const [past, setPast] = useState([]);
  const [future, setFuture] = useState([]);

  const boardRef = useRef(board);
  const rackRef = useRef(rack);
  const tileOwnersRef = useRef(tileOwners);
  const myScoreRef = useRef(myScore);
  const oppScoreRef = useRef(oppScore);

  useEffect(() => {
    boardRef.current = board;
    rackRef.current = rack;
    tileOwnersRef.current = tileOwners;
    myScoreRef.current = myScore;
    oppScoreRef.current = oppScore;
  }, [board, rack, tileOwners, myScore, oppScore]);

  const pushHistory = useCallback(() => {
    setPast((p) => [
      ...p.slice(-49),
      { 
        board: clone2D(boardRef.current), 
        rack: rackRef.current,
        tileOwners: clone2D(tileOwnersRef.current),
        myScore: myScoreRef.current,
        oppScore: oppScoreRef.current,
      }
    ]);
    setFuture([]);
  }, []);

  const handleUndo = useCallback(() => {
    setPast((p) => {
      if (p.length === 0) return p;
      const previous = p[p.length - 1];
      setFuture((f) => [{ 
        board: clone2D(boardRef.current), 
        rack: rackRef.current,
        tileOwners: clone2D(tileOwnersRef.current),
        myScore: myScoreRef.current,
        oppScore: oppScoreRef.current,
      }, ...f]);
      setBoard(clone2D(previous.board));
      setRack(previous.rack);
      setTileOwners(clone2D(previous.tileOwners));
      setMyScore(previous.myScore);
      setOppScore(previous.oppScore);
      if (setHoveredPlay) setHoveredPlay(null);
      return p.slice(0, -1);
    });
  }, [setBoard, setRack, setTileOwners, setMyScore, setOppScore, setHoveredPlay]);

  const handleRedo = useCallback(() => {
    setFuture((f) => {
      if (f.length === 0) return f;
      const next = f[0];
      setPast((p) => [...p, { 
        board: clone2D(boardRef.current), 
        rack: rackRef.current,
        tileOwners: clone2D(tileOwnersRef.current),
        myScore: myScoreRef.current,
        oppScore: oppScoreRef.current,
      }]);
      setBoard(clone2D(next.board));
      setRack(next.rack);
      setTileOwners(clone2D(next.tileOwners));
      setMyScore(next.myScore);
      setOppScore(next.oppScore);
      if (setHoveredPlay) setHoveredPlay(null);
      return f.slice(1);
    });
  }, [setBoard, setRack, setTileOwners, setMyScore, setOppScore, setHoveredPlay]);

  return {
    past,
    setPast,
    future,
    setFuture,
    pushHistory,
    handleUndo,
    handleRedo,
  };
}
