import { useState, useEffect, useRef, useCallback } from 'react';

export function useDictionaryWorker() {
  const [isReady, setIsReady] = useState(false);
  const workerRef = useRef(null);
  const callbacksRef = useRef(new Map());

  useEffect(() => {
    if (typeof window !== "undefined") {
      const worker = new Worker("/dictionaryWorker.js?v=" + Date.now());
      workerRef.current = worker;

      worker.onmessage = (e) => {
        if (e.data.type === "INIT_SUCCESS") {
          setIsReady(true);
        } else if (e.data.type === "LOOKUP_RESULT") {
          const { word, definition } = e.data;
          const cb = callbacksRef.current.get(word);
          if (cb) {
            cb(definition);
            callbacksRef.current.delete(word);
          }
        }
      };

      worker.postMessage({ type: "INIT" });
    }
    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  const lookupWord = useCallback((word) => {
    return new Promise((resolve) => {
      if (!workerRef.current || !isReady) {
        resolve(null);
        return;
      }
      callbacksRef.current.set(word, resolve);
      workerRef.current.postMessage({ type: "LOOKUP", word });
    });
  }, [isReady]);

  return { isReady, lookupWord };
}
