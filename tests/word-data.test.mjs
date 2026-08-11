import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const wordsUrl = new URL("../public/words.json", import.meta.url);

test("word data is complete and structurally valid", async () => {
  const words = JSON.parse(await readFile(wordsUrl, "utf8"));

  assert.equal(words.length, 1970);
  assert.equal(new Set(words.map((item) => item.id)).size, words.length);
  assert.equal(
    new Set(words.map((item) => item.word.toLowerCase())).size,
    words.length,
  );

  for (const item of words) {
    assert.equal(typeof item.id, "number");
    assert.match(item.word, /^[a-z]+(?:-[a-z]+)?$/);
    assert.match(item.pos, /\.$/);
    assert.ok(item.primaryPos.length > 0);
    assert.ok(item.meaning.trim().length > 0);
  }
});

