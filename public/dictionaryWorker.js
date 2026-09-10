let dictionary = null;
let pendingLookups = [];

self.onmessage = async (e) => {
  if (e.data.type === "INIT") {
    if (!dictionary) {
       try {
          const res = await fetch("/dictionary_compact.json");
          dictionary = await res.json();
          self.postMessage({ type: "INIT_SUCCESS" });
          for (let i = 0; i < pendingLookups.length; i++) {
            const w = pendingLookups[i];
            self.postMessage({ type: "LOOKUP_RESULT", word: w, definition: dictionary[w] || null });
          }
          pendingLookups = [];
       } catch (err) {
          self.postMessage({ type: "INIT_ERROR", error: err.message });
          for (let i = 0; i < pendingLookups.length; i++) {
            self.postMessage({ type: "LOOKUP_RESULT", word: pendingLookups[i], definition: null });
          }
          pendingLookups = [];
       }
    } else {
       self.postMessage({ type: "INIT_SUCCESS" });
    }
  } else if (e.data.type === "LOOKUP") {
    const word = e.data.word;
    if (!dictionary) {
      pendingLookups.push(word);
      return;
    }
    const definition = dictionary[word] || null;
    self.postMessage({ type: "LOOKUP_RESULT", word, definition });
  }
};
