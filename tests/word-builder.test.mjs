import assert from "node:assert/strict";
import test from "node:test";
import { parseWordList } from "../scripts/build-word-data.mjs";

test("TXT word list is converted into quiz data", () => {
  const words = parseWordList(`
boat\tn. 小船；轮船 v. 划船
clean\tadj. 清洁的 v. 使干净 adv. 完全地 n. 打扫
nineteen\tnum. 十九
without\tprep. 没有 adv. 在外面
  `);

  assert.equal(words.length, 4);
  assert.deepEqual(words[0], {
    id: 1,
    word: "boat",
    pos: "n./v.",
    primaryPos: "n",
    meaning: "小船；轮船；划船",
  });
  assert.equal(words[1].pos, "adj./v./adv./n.");
});
