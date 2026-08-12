# 更换词库

把新的词表保存为本目录下的 `words.txt`，每行格式为：

```text
achieve\tv. 达到，实现，取得
patient\tadj. 有耐心的 n. 病人
however\tadv. 然而，可是
unless\tconj. 除非，如果不
```

单词与解释之间使用 Tab 或空格；一个词可以有多个词性。至少准备 4 个不重复的单词，然后在项目目录运行：

```powershell
npm.cmd run words:build
```

也可以直接指定任意 TXT 文件：

```powershell
npm.cmd run words:build -- "C:\你的目录\新词表.txt"
```

生成结果会覆盖 `public/words.json`。刷新网站后，新词库即可生效。
