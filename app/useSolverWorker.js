import { useState, useEffect, useRef, useCallback } from 'react';

export function useSolverWorker(
  deferredRack,
  deferredBoard,
  activePreset,
  activeLexicon,
  sortMode,
  enableIntel,
  intelMode,
  manualAvailableTiles,
  scoreDifferential,
  equityMode
) {
  const [candidatePlays, setCandidatePlays] = useState([]);
  const [wordCheckResult, setWordCheckResult] = useState(null);
  const [isSolving, setIsSolving] = useState(false);
  const [gpuEnabled, setGpuEnabled] = useState(false);
  
  const workersRef = useRef([]);
  const resolveQueueRef = useRef(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      if (navigator.gpu) setGpuEnabled(true);
      const numWorkers = navigator.hardwareConcurrency ? Math.min(navigator.hardwareConcurrency, 8) : 4;
      const newWorkers = [];
      
      for (let i = 0; i < numWorkers; i++) {
        const worker = new Worker("/solverWorker.js?v=" + Date.now());
        worker.onmessage = (e) => {
          if (e.data && e.data.type === "CHECK_WORD_RESULT") {
             setWordCheckResult(e.data);
             return;
          }
          if (resolveQueueRef.current) {
            resolveQueueRef.current(i, e.data.plays || [], e.data.jobId);
          }
        };
        worker.onerror = (err) => {
          console.error(`Solver worker ${i} error:`, err);
          if (resolveQueueRef.current) {
            resolveQueueRef.current(i, [], null);
          }
        };
        newWorkers.push(worker);
      }
      workersRef.current = newWorkers;
    }
    return () => {
      workersRef.current.forEach(w => w.terminate());
    };
  }, []);

  useEffect(() => {
    if (!deferredRack.trim()) {
      setCandidatePlays([]);
      setIsSolving(false);
      return;
    }

    setIsSolving(true);
    
    const numWorkers = workersRef.current.length;
    let completed = 0;
    let mergedPlays = [];
    let isDone = false;
    
    const currentJobId = Date.now();

    const finishSolving = () => {
      mergedPlays.sort((a, b) => {
        if (sortMode === "score") {
          const sDiff = b.score - a.score;
          return sDiff !== 0 ? sDiff : b.totalVal - a.totalVal;
        } else {
          const vDiff = b.totalVal - a.totalVal;
          return Math.abs(vDiff) > 0.001 ? vDiff : b.score - a.score;
        }
      });
      
      const uniquePlays = [];
      const seen = new Set();
      for (let p of mergedPlays) {
         const key = `${p.word}-${p.row}-${p.col}-${p.dir}`;
         if (!seen.has(key)) {
            seen.add(key);
            uniquePlays.push(p);
         }
      }
      
      setCandidatePlays(uniquePlays.slice(0, 50));
      setIsSolving(false);
    };

    // Safety fallback timeout to prevent UI freeze if OS terminates a worker thread
    const safetyTimer = setTimeout(() => {
      if (!isDone) {
        isDone = true;
        console.warn("Solver worker pool timeout reached, flushing available plays.");
        finishSolving();
      }
    }, 7000);

    resolveQueueRef.current = (workerId, plays, jobId) => {
       if (jobId && jobId !== currentJobId) return;
       if (isDone) return;
       mergedPlays = mergedPlays.concat(plays);
       completed++;
       
       if (completed >= numWorkers) {
          isDone = true;
          clearTimeout(safetyTimer);
          finishSolving();
       }
    };
    
    for (let i = 0; i < numWorkers; i++) {
       workersRef.current[i].postMessage({
         rack: deferredRack,
         board: deferredBoard,
         activePreset,
         activeLexicon,
         sortMode,
         enableIntel,
         manualAvailableTiles: intelMode === "manual" ? manualAvailableTiles : "",
         scoreDifferential,
         equityMode,
         workerId: i,
         numWorkers: numWorkers,
         jobId: currentJobId
       });
    }

    return () => {
      clearTimeout(safetyTimer);
    };
  }, [
    deferredBoard,
    deferredRack,
    activePreset,
    activeLexicon,
    sortMode,
    enableIntel,
    intelMode,
    manualAvailableTiles,
    scoreDifferential,
    equityMode
  ]);

  const checkWord = useCallback((word) => {
     if (workersRef.current.length > 0 && word) {
        workersRef.current[0].postMessage({ type: "CHECK_WORD", word, activeLexicon });
     }
  }, [activeLexicon]);

  return { candidatePlays, isSolving, checkWord, wordCheckResult, gpuEnabled };
}
