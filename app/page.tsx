"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type WordEntry = {
  id: number;
  word: string;
  pos: string;
  primaryPos: string;
  meaning: string;
};

type WordProgress = {
  correctCount: number;
  wrongCount: number;
  consecutiveCorrect: number;
  activeWrong: boolean;
  lastAnsweredAt: string;
};

type ProgressMap = Record<string, WordProgress>;
type Screen = "home" | "quiz" | "summary";
type QuizMode = "new" | "wrong";

type Option = {
  id: number;
  meaning: string;
};

const STORAGE_KEY = "word-choice-trainer-progress-v1";

const semanticBuckets = [
  { name: "emotion", test: /高兴|快乐|悲伤|难过|害怕|担心|紧张|生气|惊讶|满意|自豪|失望|感激|情绪|心情/ },
  { name: "thinking", test: /认为|知道|理解|意识|想法|主意|建议|说明|描述|决定|选择|记得|忘记|相信/ },
  { name: "change", test: /增加|减少|提高|改善|发展|改变|影响|成功|实现|完成|产生|创造|成长/ },
  { name: "people", test: /人们|朋友|家庭|父亲|母亲|学生|老师|医生|工人|成员|儿童|孩子/ },
  { name: "study", test: /学习|学校|知识|课程|教育|技能|考试|练习|问题|答案|研究|阅读/ },
  { name: "nature", test: /自然|环境|动物|植物|天气|气候|海洋|森林|山|河流|土地|地球/ },
  { name: "place", test: /地方|地点|房间|建筑|城市|乡村|国家|商店|医院|公园|道路|街道/ },
  { name: "time", test: /时间|时期|年代|早晨|下午|晚上|分钟|小时|星期|月份|年份/ },
  { name: "object", test: /工具|机器|设备|材料|物品|产品|衣服|食物|书|汽车|手机|电脑/ },
  { name: "abstract", test: /能力|机会|原因|结果|方法|目的|经验|意义|关系|情况|活动|文化|社会|价值|质量/ },
];

function shuffle<T>(items: T[]) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function bucketFor(meaning: string) {
  return semanticBuckets.find((bucket) => bucket.test.test(meaning))?.name ?? "general";
}

function firstSense(meaning: string) {
  return meaning.split(/[；;]/)[0].replace(/[，,。]/g, "").trim();
}

function buildOptions(current: WordEntry, allWords: WordEntry[]): Option[] {
  const bucket = bucketFor(current.meaning);
  const correctFirstSense = firstSense(current.meaning);
  const validCandidate = (candidate: WordEntry) => {
    if (candidate.id === current.id) return false;
    if (candidate.meaning === current.meaning) return false;
    const candidateFirstSense = firstSense(candidate.meaning);
    if (!candidateFirstSense || candidateFirstSense === correctFirstSense) return false;
    if (candidateFirstSense.length > 1 && current.meaning.includes(candidateFirstSense)) return false;
    if (correctFirstSense.length > 1 && candidate.meaning.includes(correctFirstSense)) return false;
    return true;
  };

  const sameBucket = allWords.filter(
    (candidate) =>
      candidate.primaryPos === current.primaryPos &&
      bucketFor(candidate.meaning) === bucket &&
      validCandidate(candidate),
  );
  const samePos = allWords.filter(
    (candidate) => candidate.primaryPos === current.primaryPos && validCandidate(candidate),
  );
  const fallback = allWords.filter(validCandidate);
  const pool = shuffle([...sameBucket, ...samePos, ...fallback]);
  const usedMeanings = new Set([current.meaning]);
  const distractors: WordEntry[] = [];

  for (const candidate of pool) {
    if (usedMeanings.has(candidate.meaning)) continue;
    usedMeanings.add(candidate.meaning);
    distractors.push(candidate);
    if (distractors.length === 3) break;
  }

  return shuffle([
    { id: current.id, meaning: current.meaning },
    ...distractors.map((item) => ({ id: item.id, meaning: item.meaning })),
  ]);
}

function emptyProgress(): WordProgress {
  return {
    correctCount: 0,
    wrongCount: 0,
    consecutiveCorrect: 0,
    activeWrong: false,
    lastAnsweredAt: "",
  };
}

export default function Home() {
  const [words, setWords] = useState<WordEntry[]>([]);
  const [progress, setProgress] = useState<ProgressMap>({});
  const [screen, setScreen] = useState<Screen>("home");
  const [mode, setMode] = useState<QuizMode>("new");
  const [roundSize, setRoundSize] = useState(20);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [queue, setQueue] = useState<WordEntry[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [options, setOptions] = useState<Option[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [answerState, setAnswerState] = useState<"correct" | "wrong" | null>(null);
  const [countdown, setCountdown] = useState(3);
  const [sessionCorrect, setSessionCorrect] = useState(0);
  const [sessionWrong, setSessionWrong] = useState(0);
  const [loadError, setLoadError] = useState(false);
  const queueRef = useRef<WordEntry[]>([]);
  const indexRef = useRef(0);
  const transitionRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetch("/words.json")
      .then((response) => {
        if (!response.ok) throw new Error("词库加载失败");
        return response.json();
      })
      .then((data: WordEntry[]) => setWords(data))
      .catch(() => setLoadError(true));

    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) setProgress(JSON.parse(saved));
      const savedAutoSpeak = window.localStorage.getItem(`${STORAGE_KEY}-auto-speak`);
      if (savedAutoSpeak !== null) setAutoSpeak(savedAutoSpeak === "true");
    } catch {
      // Private browsing can disable local storage; the session still works.
    }
  }, []);

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  useEffect(() => {
    indexRef.current = currentIndex;
  }, [currentIndex]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
    } catch {
      // Keep the in-memory experience available when storage is unavailable.
    }
  }, [progress]);

  useEffect(() => {
    try {
      window.localStorage.setItem(`${STORAGE_KEY}-auto-speak`, String(autoSpeak));
    } catch {
      // Preference persistence is optional.
    }
  }, [autoSpeak]);

  const speak = useCallback((word: string) => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(word);
    const voices = window.speechSynthesis.getVoices();
    const americanVoice = voices.find(
      (voice) => voice.lang.toLowerCase() === "en-us" || /us english|american/i.test(voice.name),
    );
    if (americanVoice) utterance.voice = americanVoice;
    utterance.lang = "en-US";
    utterance.rate = 0.85;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
  }, []);

  const currentWord = queue[currentIndex];

  useEffect(() => {
    if (screen !== "quiz" || !currentWord) return;
    setOptions(buildOptions(currentWord, words));
    setSelectedId(null);
    setAnswerState(null);
    setCountdown(3);
    const pronunciationTimer = setTimeout(() => {
      if (autoSpeak) speak(currentWord.word);
    }, 120);
    return () => clearTimeout(pronunciationTimer);
  }, [autoSpeak, currentWord, screen, speak, words]);

  const metrics = useMemo(() => {
    const entries = Object.values(progress);
    const seen = entries.filter((item) => item.correctCount + item.wrongCount > 0).length;
    const wrong = entries.filter((item) => item.activeWrong).length;
    const correctAnswers = entries.reduce((sum, item) => sum + item.correctCount, 0);
    const wrongAnswers = entries.reduce((sum, item) => sum + item.wrongCount, 0);
    const totalAnswers = correctAnswers + wrongAnswers;
    const accuracy = totalAnswers ? Math.round((correctAnswers / totalAnswers) * 100) : 0;
    return { seen, wrong, accuracy, totalAnswers };
  }, [progress]);

  const saveAnswer = useCallback((word: WordEntry, correct: boolean) => {
    setProgress((previous) => {
      const current = previous[word.word] ?? emptyProgress();
      const consecutiveCorrect = correct ? current.consecutiveCorrect + 1 : 0;
      return {
        ...previous,
        [word.word]: {
          correctCount: current.correctCount + (correct ? 1 : 0),
          wrongCount: current.wrongCount + (correct ? 0 : 1),
          consecutiveCorrect,
          activeWrong: correct ? current.activeWrong && consecutiveCorrect < 2 : true,
          lastAnsweredAt: new Date().toISOString(),
        },
      };
    });
  }, []);

  const finishOrAdvance = useCallback((activeQueue: WordEntry[]) => {
    const nextIndex = indexRef.current + 1;
    if (nextIndex >= activeQueue.length) {
      setScreen("summary");
      window.speechSynthesis?.cancel();
      return;
    }
    setCurrentIndex(nextIndex);
    indexRef.current = nextIndex;
  }, []);

  const handleAnswer = useCallback(
    (option: Option) => {
      if (!currentWord || answerState) return;
      const isCorrect = option.id === currentWord.id;
      setSelectedId(option.id);
      setAnswerState(isCorrect ? "correct" : "wrong");
      saveAnswer(currentWord, isCorrect);

      if (isCorrect) {
        setSessionCorrect((value) => value + 1);
        transitionRef.current = setTimeout(() => finishOrAdvance(queueRef.current), 160);
        return;
      }

      setSessionWrong((value) => value + 1);
      speak(currentWord.word);
      const nextQueue = [...queueRef.current];
      const reinsertAt = Math.min(indexRef.current + 6, nextQueue.length);
      nextQueue.splice(reinsertAt, 0, currentWord);
      setQueue(nextQueue);
      queueRef.current = nextQueue;

      let seconds = 3;
      setCountdown(seconds);
      countdownRef.current = setInterval(() => {
        seconds -= 1;
        setCountdown(Math.max(seconds, 0));
      }, 1000);
      transitionRef.current = setTimeout(() => {
        if (countdownRef.current) clearInterval(countdownRef.current);
        finishOrAdvance(nextQueue);
      }, 3000);
    },
    [answerState, currentWord, finishOrAdvance, saveAnswer, speak],
  );

  useEffect(() => {
    if (screen !== "quiz" || answerState) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const optionIndex = Number(event.key) - 1;
      if (optionIndex >= 0 && optionIndex < options.length) {
        handleAnswer(options[optionIndex]);
      }
      if (event.key.toLowerCase() === "r" && currentWord) speak(currentWord.word);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [answerState, currentWord, handleAnswer, options, screen, speak]);

  useEffect(
    () => () => {
      if (transitionRef.current) clearTimeout(transitionRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
      window.speechSynthesis?.cancel();
    },
    [],
  );

  function startQuiz(nextMode: QuizMode) {
    if (!words.length) return;
    let candidates: WordEntry[];
    if (nextMode === "wrong") {
      candidates = words.filter((word) => progress[word.word]?.activeWrong);
      if (!candidates.length) return;
      candidates.sort(
        (a, b) => (progress[b.word]?.wrongCount ?? 0) - (progress[a.word]?.wrongCount ?? 0),
      );
    } else {
      const unseen = shuffle(words.filter((word) => !progress[word.word]));
      const seen = shuffle(words.filter((word) => progress[word.word]));
      candidates = [...unseen, ...seen];
    }

    const nextQueue = candidates.slice(0, nextMode === "wrong" ? Math.max(roundSize, candidates.length) : roundSize);
    setMode(nextMode);
    setQueue(nextQueue);
    queueRef.current = nextQueue;
    setCurrentIndex(0);
    indexRef.current = 0;
    setSessionCorrect(0);
    setSessionWrong(0);
    setScreen("quiz");
  }

  function returnHome() {
    if (transitionRef.current) clearTimeout(transitionRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    window.speechSynthesis?.cancel();
    setScreen("home");
    setAnswerState(null);
  }

  function resetProgress() {
    if (!window.confirm("确定清空全部学习记录和错题吗？此操作无法撤销。")) return;
    setProgress({});
    window.localStorage.removeItem(STORAGE_KEY);
  }

  if (loadError) {
    return (
      <main className="center-state">
        <div className="state-mark">!</div>
        <h1>词库没有加载成功</h1>
        <p>请刷新页面后重试。</p>
      </main>
    );
  }

  if (!words.length) {
    return (
      <main className="center-state" aria-live="polite">
        <div className="loading-orb" />
        <h1>正在准备词库</h1>
        <p>马上就可以开始。</p>
      </main>
    );
  }

  if (screen === "quiz" && currentWord) {
    const correctOptionId = currentWord.id;
    const answeredCount = currentIndex;
    const progressPercent = Math.min(100, (answeredCount / Math.max(queue.length, 1)) * 100);
    return (
      <main className="quiz-shell">
        <header className="quiz-header">
          <button className="text-button" onClick={returnHome} aria-label="退出本轮学习">
            ← 退出
          </button>
          <div className="quiz-mode">{mode === "wrong" ? "错题强化" : "新词训练"}</div>
          <div className="quiz-count">{currentIndex + 1} / {queue.length}</div>
        </header>

        <div className="progress-track" aria-hidden="true">
          <div className="progress-value" style={{ width: `${progressPercent}%` }} />
        </div>

        <section className="quiz-card" aria-live="polite">
          <div className="word-kicker">选择最准确的中文含义</div>
          <div className="word-row">
            <h1>{currentWord.word}</h1>
            <button
              className="sound-button"
              onClick={() => speak(currentWord.word)}
              aria-label={`再次播放 ${currentWord.word} 的发音`}
              title="再次播放（快捷键 R）"
            >
              <span className="sound-rings" aria-hidden="true">)))</span>
              <span>发音</span>
            </button>
          </div>
          <div className="part-of-speech">{currentWord.pos}</div>

          <div className="option-grid">
            {options.map((option, index) => {
              const isCorrectOption = option.id === correctOptionId;
              const isSelected = option.id === selectedId;
              let className = "option-button";
              if (answerState === "correct" && isSelected) className += " option-correct";
              if (answerState === "wrong" && isSelected) className += " option-wrong";
              if (answerState === "wrong" && isCorrectOption) className += " option-correct";
              return (
                <button
                  key={`${option.id}-${index}`}
                  className={className}
                  onClick={() => handleAnswer(option)}
                  disabled={Boolean(answerState)}
                >
                  <span className="option-index">{index + 1}</span>
                  <span>{option.meaning}</span>
                </button>
              );
            })}
          </div>

          <div className={`answer-feedback ${answerState ? "feedback-visible" : ""}`}>
            {answerState === "wrong" ? (
              <>
                <strong>{currentWord.meaning}</strong>
                <span>{countdown} 秒后继续，这个词稍后还会再出现</span>
              </>
            ) : answerState === "correct" ? (
              <strong>正确</strong>
            ) : (
              <span>按数字键 1–4 也可以选择</span>
            )}
          </div>
        </section>
      </main>
    );
  }

  if (screen === "summary") {
    const attempts = sessionCorrect + sessionWrong;
    const accuracy = attempts ? Math.round((sessionCorrect / attempts) * 100) : 0;
    return (
      <main className="summary-shell">
        <section className="summary-card">
          <div className="summary-mark">✓</div>
          <p className="eyebrow">本轮完成</p>
          <h1>{accuracy}% 正确率</h1>
          <p className="summary-copy">
            答对 {sessionCorrect} 次，答错 {sessionWrong} 次。错词已经自动加入错题本。
          </p>
          <div className="summary-stats">
            <div><strong>{sessionCorrect}</strong><span>答对</span></div>
            <div><strong>{sessionWrong}</strong><span>答错</span></div>
            <div><strong>{metrics.wrong}</strong><span>待巩固</span></div>
          </div>
          <div className="summary-actions">
            <button className="primary-button" onClick={() => startQuiz(mode)}>
              再来一轮
            </button>
            <button className="secondary-button" onClick={returnHome}>
              返回首页
            </button>
          </div>
        </section>
      </main>
    );
  }

  const topWrongWords = words
    .filter((word) => progress[word.word]?.activeWrong)
    .sort((a, b) => (progress[b.word]?.wrongCount ?? 0) - (progress[a.word]?.wrongCount ?? 0))
    .slice(0, 6);

  return (
    <main className="home-shell">
      <nav className="top-nav">
        <div className="brand">
          <span className="brand-mark">词</span>
          <span>词选</span>
        </div>
        <div className="nav-note">初中英语 · 四选一识义训练</div>
      </nav>

      <section className="hero-section">
        <div className="hero-copy">
          <p className="eyebrow">听见 · 认出 · 记住</p>
          <h1>听发音，选词义。<br />把单词练成第一反应。</h1>
          <p className="hero-description">
            每个新词自动播放美式发音。答对立即进入下一题，答错停留三秒，并在稍后自动重现。
          </p>

          <div className="hero-actions">
            <button className="primary-button hero-primary" onClick={() => startQuiz("new")}>
              开始刷词 <span aria-hidden="true">→</span>
            </button>
            <button
              className="secondary-button"
              onClick={() => startQuiz("wrong")}
              disabled={!metrics.wrong}
            >
              刷错题 {metrics.wrong ? `· ${metrics.wrong}` : ""}
            </button>
          </div>

          <div className="quick-settings">
            <div className="setting-group">
              <span>每轮题数</span>
              <div className="segmented-control" aria-label="选择每轮题数">
                {[10, 20, 30].map((size) => (
                  <button
                    key={size}
                    className={roundSize === size ? "segment-active" : ""}
                    onClick={() => setRoundSize(size)}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={autoSpeak}
                onChange={(event) => setAutoSpeak(event.target.checked)}
              />
              <span className="toggle-ui" aria-hidden="true" />
              自动播放美式发音
            </label>
          </div>
        </div>

        <div className="hero-panel">
          <div className="panel-label"><span className="live-dot" /> 今日学习</div>
          <div className="sample-word">achieve</div>
          <div className="sample-pronunciation">美式发音自动播放</div>
          <div className="sample-options">
            <div><span>A</span>避免，避开</div>
            <div className="sample-correct"><span>B</span>达到，实现，取得</div>
            <div><span>C</span>允许，准许</div>
            <div><span>D</span>提到，提及</div>
          </div>
          <div className="panel-footer">
            <span>答对后无缝切换</span>
            <span className="mini-arrow">→</span>
          </div>
        </div>
      </section>

      <section className="metric-strip" aria-label="学习概况">
        <div><strong>{words.length}</strong><span>去重词汇</span></div>
        <div><strong>{metrics.seen}</strong><span>已经练习</span></div>
        <div><strong>{metrics.accuracy}%</strong><span>累计正确率</span></div>
        <div><strong>{metrics.wrong}</strong><span>错题待巩固</span></div>
      </section>

      <section className="lower-grid">
        <div className="method-section">
          <p className="eyebrow">记忆节奏</p>
          <h2>错一次，不只是看一次答案。</h2>
          <div className="method-steps">
            <div><span>01</span><strong>自动发音</strong><p>进入新词时先建立声音印象。</p></div>
            <div><span>02</span><strong>三秒记忆</strong><p>答错后同时标出错误项和正确含义。</p></div>
            <div><span>03</span><strong>间隔重现</strong><p>错词间隔五题再次出现，连续答对两次后移出。</p></div>
          </div>
        </div>

        <aside className="wrongbook-panel">
          <div className="wrongbook-heading">
            <div>
              <p className="eyebrow">错题本</p>
              <h2>{metrics.wrong ? `${metrics.wrong} 个词待巩固` : "目前没有错词"}</h2>
            </div>
            {metrics.wrong > 0 && (
              <button className="small-button" onClick={() => startQuiz("wrong")}>立即复习</button>
            )}
          </div>
          {topWrongWords.length ? (
            <div className="wrong-word-list">
              {topWrongWords.map((word) => (
                <div key={word.id}>
                  <span><strong>{word.word}</strong><small>{word.pos}</small></span>
                  <span className="wrong-count">错 {progress[word.word].wrongCount} 次</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-copy">答错的单词会自动出现在这里，并进入重复训练。</p>
          )}
          {metrics.totalAnswers > 0 && (
            <button className="reset-button" onClick={resetProgress}>清空学习记录</button>
          )}
        </aside>
      </section>
    </main>
  );
}
