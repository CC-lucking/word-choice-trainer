import { readFile, writeFile } from "node:fs/promises";

const wordsUrl = new URL("../public/words.json", import.meta.url);

const removeWords = new Set(["lookout", "pro", "sock", "stair"]);

const additions = [
  ["recognize", "v.", "认出；认识；承认"],
  ["curious", "adj.", "好奇的；求知欲强的"],
  ["disappointed", "adj.", "失望的；沮丧的"],
  ["energetic", "adj.", "精力充沛的；积极的"],
  ["grateful", "adj.", "感激的；感谢的"],
  ["independent", "adj.", "独立的；自主的"],
  ["relaxed", "adj.", "放松的；自在的"],
  ["satisfied", "adj.", "满意的；满足的"],
  ["exactly", "adv.", "确切地；正是；完全正确"],
  ["moreover", "adv.", "而且；此外"],
  ["otherwise", "adv.", "否则；不然；在其他方面"],
  ["suddenly", "adv.", "突然地"],
  ["tradition", "n.", "传统；惯例"],
  ["digital", "adj.", "数字的；数码的"],
  ["responsibility", "n.", "责任；职责"],
  ["community", "n.", "社区；团体；社会"],
  ["heritage", "n.", "遗产；传统"],
  ["resource", "n.", "资源；资料"],
  ["climate", "n.", "气候"],
  ["reduce", "v.", "减少；降低"],
  ["explore", "v.", "探索；考察"],
  ["respect", "n./v.", "尊重；敬意"],
  ["relationship", "n.", "关系；联系"],
  ["habit", "n.", "习惯"],
  ["context", "n.", "上下文；语境；背景"],
  ["detail", "n.", "细节；详情"],
  ["meaningful", "adj.", "有意义的"],
  ["environmental", "adj.", "环境的；环保的"],
  ["carefully", "adv.", "仔细地；小心地"],
  ["finally", "adv.", "最后；终于"],
  ["actually", "adv.", "实际上；事实上"],
  ["recently", "adv.", "最近；近来"],
  ["mainly", "adv.", "主要地；大体上"],
  ["widely", "adv.", "广泛地；普遍地"],
];

const overrides = {
  against: ["prep.", "反对；倚靠；与…对抗；与…相比"],
  at: ["prep.", "在；向；以"],
  can: ["aux./n./v.", "能；会；可以；罐头；把…装罐"],
  double: ["adj./v./n./adv.", "两倍的；双重的；使加倍；两倍"],
  fantastic: ["adj.", "极好的；奇异的"],
  find: ["v./n.", "找到；发现；发现物"],
  fine: ["adj./n./v.", "好的；健康的；精美的；罚款"],
  fit: ["v./adj./n.", "适合；合身；健康的；发作"],
  free: ["adj./v./adv.", "自由的；免费的；空闲的；释放"],
  hair: ["n.", "头发；毛发"],
  heavy: ["adj.", "重的；大量的；严重的；繁重的"],
  low: ["adj./adv.", "低的；矮的；不足的；低声地"],
  man: ["n./v.", "男人；人；给…配备人员；操纵"],
  may: ["aux.", "可能；也许；可以"],
  might: ["aux./n.", "可能；也许；力量；威力"],
  name: ["n./v.", "名字；名称；命名"],
  office: ["n.", "办公室；办事处；职务"],
  old: ["adj.", "老的；旧的；…岁的；过去的"],
  over: ["prep./adv./adj.", "在…上方；越过；超过；结束的"],
  say: ["v./n.", "说；讲；表明；发言权"],
  service: ["n./v.", "服务；公共设施；维修"],
  set: ["v./n./adj.", "放置；设置；一套；固定的"],
  situation: ["n.", "情况；形势；处境"],
  socks: ["n.", "袜子"],
  stairs: ["n.", "楼梯"],
  strong: ["adj.", "强壮的；强大的；坚定的；强烈的"],
  sweet: ["adj./n.", "甜的；悦耳的；可爱的；糖果"],
  that: ["pron./conj./adv.", "那；那个；那样；引导从句"],
  thing: ["n.", "事情；东西；事物"],
  to: ["prep./adv.", "到；向；给"],
  true: ["adj./adv.", "真的；真实的；忠实的；准确的"],
  welcome: ["adj./n./v./int.", "受欢迎的；欢迎"],
  will: ["aux./n./v.", "将；会；愿意；意志；决心"],
};

function primaryPos(pos) {
  return pos.split("/")[0].replace(".", "");
}

function cleanMeaning(meaning) {
  return meaning
    .replace(/〔[^〕]*〕/g, "")
    .replace(/\[[^\]]*]/g, "")
    .replace(/\s+(?:interjection|determiner|conjunction|modal verb)\./gi, "；")
    .replace(/；?\s*n\.\s*\([^)]*\)人名.*$/i, "")
    .replace(/（[^）]*(?:复数|过去式|过去分词|现在分词)[^）]*）/g, "")
    .replace(/\s*([，；。])/g, "$1")
    .replace(/[；;]+/g, "；")
    .replace(/^；|；$/g, "")
    .trim();
}

const current = JSON.parse(await readFile(wordsUrl, "utf8"));
const retained = current
  .filter((entry) => !removeWords.has(entry.word))
  .map((entry) => {
    const override = overrides[entry.word];
    if (override) {
      return { ...entry, pos: override[0], primaryPos: primaryPos(override[0]), meaning: override[1] };
    }
    return { ...entry, meaning: cleanMeaning(entry.meaning) };
  });

const existing = new Set(retained.map((entry) => entry.word));
for (const [word, pos, meaning] of additions) {
  if (existing.has(word)) throw new Error(`补充词已存在：${word}`);
  retained.push({ id: 0, word, pos, primaryPos: primaryPos(pos), meaning });
}

if (retained.length !== 2000) throw new Error(`词库应为 2000 词，当前为 ${retained.length} 词`);

const output = retained.map((entry, index) => ({ ...entry, id: index + 1 }));
await writeFile(wordsUrl, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log("已生成北京＋河北中考适用的 2000 词合并词库。");
