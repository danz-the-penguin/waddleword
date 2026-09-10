let dictionary = null;

self.onmessage = async (e) => {
  if (e.data.type === "INIT") {
    if (!dictionary) {
       try {
          const res = await fetch("/dictionary_compact.json");
          dictionary = await res.json();
          self.postMessage({ type: "INIT_SUCCESS" });
       } catch (err) {
          self.postMessage({ type: "INIT_ERROR", error: err.message });
       }
    } else {
       self.postMessage({ type: "INIT_SUCCESS" });
    }
  } else if (e.data.type === "LOOKUP") {
    if (!dictionary) return;
    const word = e.data.word;
    const definition = dictionary[word];
    self.postMessage({ type: "LOOKUP_RESULT", word, definition });
  }
};
