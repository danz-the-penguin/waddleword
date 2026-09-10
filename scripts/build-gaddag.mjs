// scripts/build-gaddag.mjs
import fs from "node:fs";

const REV_CHAR = "#";
const REV_CODE = 26;

class GaddagTrieNode {
  constructor() {
    this.isTerminal = false;
    this.children = null;
    this.canonicalId = -1;
  }
}

function buildGaddagTrie(words) {
  const root = new GaddagTrieNode();
  console.log(
    `Ingesting ${words.length.toLocaleString()} words into GADDAG trie...`,
  );

  for (let w = 0; w < words.length; w++) {
    const word = words[w].trim().toUpperCase();
    if (word.length < 2 || !/^[A-Z]+$/.test(word)) continue;

    const n = word.length;

    // Form 1: wn, wn-1, ..., w1
    let revWord = "";
    for (let i = n - 1; i >= 0; i--) revWord += word[i];
    insertPath(root, revWord);

    // Form 2: wi, wi-1, ..., w1, REV, wi+1, ..., wn
    for (let i = 1; i < n; i++) {
      let pathStr = "";
      for (let j = i - 1; j >= 0; j--) pathStr += word[j];
      pathStr += REV_CHAR;
      for (let j = i; j < n; j++) pathStr += word[j];
      insertPath(root, pathStr);
    }
  }

  return root;
}

function insertPath(root, str) {
  let curr = root;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (!curr.children) curr.children = new Map();
    let next = curr.children.get(ch);
    if (!next) {
      next = new GaddagTrieNode();
      curr.children.set(ch, next);
    }
    curr = next;
  }
  curr.isTerminal = true;
}

// Bottom-up Subtree Minimization (DAWG Compression)
function minimizeGaddagTrie(root) {
  console.log("Minimizing GADDAG trie into DAWG via bottom-up hash consing...");
  const registry = new Map();
  let nextCanonicalId = 1;
  let totalVisited = 0;
  let mergedCount = 0;

  function minimizeNode(node) {
    totalVisited++;
    if (!node.children || node.children.size === 0) {
      const leafSig = node.isTerminal ? "T" : "F";
      let canon = registry.get(leafSig);
      if (!canon) {
        node.canonicalId = nextCanonicalId++;
        registry.set(leafSig, node);
        canon = node;
      } else {
        mergedCount++;
      }
      return canon;
    }

    const sortedEntries = Array.from(node.children.entries()).sort((a, b) =>
      a[0].localeCompare(b[0]),
    );
    let sig = node.isTerminal ? "T:" : "F:";

    for (let i = 0; i < sortedEntries.length; i++) {
      const [ch, child] = sortedEntries[i];
      const canonChild = minimizeNode(child);
      node.children.set(ch, canonChild);
      sig += `${ch}${canonChild.canonicalId},`;
    }

    let canon = registry.get(sig);
    if (!canon) {
      node.canonicalId = nextCanonicalId++;
      registry.set(sig, node);
      canon = node;
    } else {
      mergedCount++;
    }
    return canon;
  }

  const canonRoot = minimizeNode(root);
  console.log(
    `  Visited: ${totalVisited.toLocaleString()} nodes. Unique canonical states: ${registry.size.toLocaleString()} (Merged: ${mergedCount.toLocaleString()})`,
  );
  return canonRoot;
}

function flattenDawgToBinary(canonRoot) {
  console.log("Flattening minimized DAWG into contiguous Uint32Array...");
  const flatNodes = [0];
  const queue = [{ node: canonRoot, targetIndex: 0 }];
  let head = 0;

  // Track which canonical node already had its child block emitted
  const childBlockPointers = new Map();

  while (head < queue.length) {
    const { node, targetIndex } = queue[head++];

    if (!node.children || node.children.size === 0) continue;

    if (childBlockPointers.has(node.canonicalId)) {
      const firstChildIndex = childBlockPointers.get(node.canonicalId);
      flatNodes[targetIndex] =
        (flatNodes[targetIndex] & 0x7f) | ((firstChildIndex & 0x01ffffff) << 7);
      continue;
    }

    const childEntries = Array.from(node.children.entries()).sort((a, b) =>
      a[0].localeCompare(b[0]),
    );
    const firstChildIndex = flatNodes.length;
    childBlockPointers.set(node.canonicalId, firstChildIndex);

    flatNodes[targetIndex] =
      (flatNodes[targetIndex] & 0x7f) | ((firstChildIndex & 0x01ffffff) << 7);

    const startIdx = flatNodes.length;
    for (let i = 0; i < childEntries.length; i++) {
      flatNodes.push(0);
    }

    for (let i = 0; i < childEntries.length; i++) {
      const [ch, childNode] = childEntries[i];
      const nodeIndex = startIdx + i;

      const letterCode = ch === REV_CHAR ? REV_CODE : ch.charCodeAt(0) - 65;
      const isTerminalBit = childNode.isTerminal ? 1 : 0;
      const hasSiblingBit = i < childEntries.length - 1 ? 1 : 0;

      flatNodes[nodeIndex] =
        (letterCode & 0x1f) | (isTerminalBit << 5) | (hasSiblingBit << 6);

      if (childNode.children && childNode.children.size > 0) {
        queue.push({ node: childNode, targetIndex: nodeIndex });
      }
    }
  }

  return new Uint32Array(flatNodes);
}

const inputFile = process.argv[2] || "./data/lexicons/twl06.txt";
const outputFile = process.argv[3] || "./public/gaddag_twl06.bin";

if (!fs.existsSync(inputFile)) {
  console.error(`Input dictionary file not found: ${inputFile}`);
  process.exit(1);
}

const rawText = fs.readFileSync(inputFile, "utf8");
const words = rawText.split(/\r?\n/).filter(Boolean);

console.time("GADDAG Generation Time");
const trie = buildGaddagTrie(words);
const dawg = minimizeGaddagTrie(trie);
const binaryBuffer = flattenDawgToBinary(dawg);
console.timeEnd("GADDAG Generation Time");

fs.writeFileSync(outputFile, Buffer.from(binaryBuffer.buffer));
console.log(`\nBinary GADDAG successfully generated:`);
console.log(`  File: ${outputFile}`);
console.log(`  Node count: ${binaryBuffer.length.toLocaleString()}`);
console.log(
  `  Binary size: ${(binaryBuffer.byteLength / (1024 * 1024)).toFixed(2)} MB\n`,
);
