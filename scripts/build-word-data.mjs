import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const sourcePath = resolve(process.argv[2] ?? "data/words.txt");
const targetPath = resolve(process.argv[3] ?? "public/words.json");
const posPattern = /(?:^|\s)(adj|adv|art|aux|conj|interj|n|num|prep|pron|v)\./gi;

export function parseWordList(source) {
  const entries = [];
  const seen = new Set();

  for (const [lineIndex, rawLine] of source.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z]+(?:-[A-Za-z]+)?)\s+(.+)$/);
    if (!match) throw new Error(`第 ${lineIndex + 1} 行格式不正确：${line}`);

    const word = match[1].toLowerCase();
    if (seen.has(word)) throw new Error(`第 ${lineIndex + 1} 行出现重复单词：${word}`);
    seen.add(word);

    const body = match[2].replace(/\[[^\]]*]/g, "").trim();
    const matches = [...body.matchAll(posPattern)];
    if (!matches.length) throw new Error(`第 ${lineIndex + 1} 行缺少词性：${word}`);

    const parts = [];
    const meanings = [];
    for (let index = 0; index < matches.length; index += 1) {
      const pos = matches[index][1].toLowerCase();
      if (!parts.includes(pos)) parts.push(pos);
      const start = (matches[index].index ?? 0) + matches[index][0].length;
      const end = matches[index + 1]?.index ?? body.length;
      const meaning = body.slice(start, end)
        .replace(/^[\s；;,，]+|[\s；;,，]+$/g, "")
        .replace(/\s+/g, " ");
      if (meaning && !meanings.includes(meaning)) meanings.push(meaning);
    }
    if (!meanings.length) throw new Error(`第 ${lineIndex + 1} 行缺少中文释义：${word}`);

    entries.push({
      id: entries.length + 1,
      word,
      pos: parts.map((part) => `${part}.`).join("/"),
      primaryPos: parts[0],
      meaning: meanings.join("；"),
    });
  }

  if (entries.length < 4) throw new Error("词库至少需要 4 个单词，才能生成四选一题目。");
  return entries;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const source = await readFile(sourcePath, "utf8");
  const entries = parseWordList(source);
  await writeFile(targetPath, `${JSON.stringify(entries, null, 2)}\n`, "utf8");
  console.log(`已生成 ${entries.length} 个词条：${targetPath}`);
}
