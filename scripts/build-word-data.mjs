import fs from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const sourcePath = path.resolve(
  projectRoot,
  "../sources/english-vocabulary/1 初中-乱序.txt",
);
const outputPath = path.join(projectRoot, "public", "words.json");

const raw = await fs.readFile(sourcePath, "utf8");
const entries = new Map();
const posPattern = /(?:^|\s)(n|v|adj|adv|prep|conj|pron|num|det|modal|aux|int)\.\s*/g;

function parseEntry(line) {
  if (!line.includes("\t")) return null;
  const [rawWord, ...rest] = line.split("\t");
  const word = rawWord.trim().toLowerCase();
  if (!/^[a-z]+(?:-[a-z]+)?$/.test(word)) return null;

  const gloss = rest
    .join(" ")
    .replace(/\s*\[[^\]]*\]\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const partsOfSpeech = [];
  for (const match of gloss.matchAll(posPattern)) {
    if (!partsOfSpeech.includes(match[1])) partsOfSpeech.push(match[1]);
  }
  if (!partsOfSpeech.length) return null;

  const meaning = gloss
    .replace(posPattern, "；")
    .split(/[；;]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => !/人名|过去式|过去分词|现在分词/.test(item))
    .slice(0, 4)
    .join("；");
  if (!meaning) return null;

  return {
    word,
    pos: partsOfSpeech.map((item) => `${item}.`).join("/"),
    primaryPos: partsOfSpeech[0],
    meaning,
  };
}

for (const line of raw.split(/\r?\n/)) {
  const parsed = parseEntry(line);
  if (!parsed) continue;
  const existing = entries.get(parsed.word);
  if (existing) {
    // The source contains a later concise learner-facing block. Keep the
    // first block's more reliable POS and use the later simplified meaning.
    existing.meaning = parsed.meaning;
  } else {
    entries.set(parsed.word, parsed);
  }
}

const words = [...entries.values()].map((entry, index) => ({
  id: index + 1,
  ...entry,
}));

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(words, null, 2)}\n`, "utf8");
console.log(`Generated ${words.length} words at ${outputPath}`);
