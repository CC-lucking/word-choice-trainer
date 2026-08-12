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
type Screen = "home" | "quiz" | "summary" | "wrongbook";
type QuizMode = "new" | "wrong";
type WrongbookTab = "active" | "mastered";

type Option = {
  id: number;
  pos: string;
  meaning: string;
};

type SavedSession = {
  version: 1;
  mode: QuizMode;
  queueWords: string[];
  currentIndex: number;
  sessionCorrect: number;
  sessionWrong: number;
  sessionMistakes: Record<string, number>;
  savedAt: string;
};

const STORAGE_KEY = "word-choice-trainer-progress-v1";
const SESSION_STORAGE_KEY = `${STORAGE_KEY}-active-session`;

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
    { id: current.id, pos: current.pos, meaning: current.meaning },
    ...distractors.map((item) => ({ id: item.id, pos: item.pos, meaning: item.meaning })),
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
  const [sessionMistakes, setSessionMistakes] = useState<Record<string, number>>({});
  const [masteryNotice, setMasteryNotice] = useState("");
  const [wrongbookTab, setWrongbookTab] = useState<WrongbookTab>("active");
  const [savedSession, setSavedSession] = useState<SavedSession | null>(null);
  const [loadError, setLoadError] = useState(false);
  const queueRef = useRef<WordEntry[]>([]);
  const indexRef = useRef(0);
  const transitionRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const skipNextAutoSpeakRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    fetch("/words.json")
      .then((response) => {
        if (!response.ok) throw new Error("词库加载失败");
        return response.json();
      })
      .then((data: WordEntry[]) => {
        setWords(data);
        try {
          const rawSession = window.localStorage.getItem(SESSION_STORAGE_KEY);
          if (rawSession) {
            const parsed = JSON.parse(rawSession) as SavedSession;
            const availableWords = new Set(data.map((word) => word.word));
            const isValid = parsed.version === 1
              && Array.isArray(parsed.queueWords)
              && parsed.queueWords.length > 0
              && parsed.queueWords.every((word) => availableWords.has(word))
              && parsed.currentIndex >= 0
              && parsed.currentIndex < parsed.queueWords.length;
            if (isValid) setSavedSession(parsed);
            else window.localStorage.removeItem(SESSION_STORAGE_KEY);
          }
        } catch {
          window.localStorage.removeItem(SESSION_STORAGE_KEY);
        }
      })
      .catch(() => setLoadError(true));

    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) setProgress(JSON.parse(saved));
      const savedAutoSpeak = window.localStorage.getItem(`${STORAGE_KEY}-auto-speak`);
      if (savedAutoSpeak !== null) setAutoSpeak(savedAutoSpeak === "true");
      const savedRoundSize = Number(window.localStorage.getItem(`${STORAGE_KEY}-round-size`));
      if (savedRoundSize >= 5 && savedRoundSize <= 200) setRoundSize(savedRoundSize);
    } catch {
      // Private browsing can disable local storage; the session still works.
    }
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || window.location.protocol !== "https:") return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Installation and offline mode are optional; online practice still works.
    });
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

  useEffect(() => {
    try {
      window.localStorage.setItem(`${STORAGE_KEY}-round-size`, String(roundSize));
    } catch {
      // Preference persistence is optional.
    }
  }, [roundSize]);

  useEffect(() => {
    if (screen !== "quiz" || !queue.length || answerState) return;
    const snapshot: SavedSession = {
      version: 1,
      mode,
      queueWords: queue.map((word) => word.word),
      currentIndex,
      sessionCorrect,
      sessionWrong,
      sessionMistakes,
      savedAt: new Date().toISOString(),
    };
    setSavedSession(snapshot);
    try {
      window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(snapshot));
    } catch {
      // Resuming is an optional device-local convenience.
    }
  }, [answerState, currentIndex, mode, queue, screen, sessionCorrect, sessionMistakes, sessionWrong]);

  const speakWithSystemVoice = useCallback((word: string) => {
    if (!("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis;
    synth.cancel();
    synth.resume();
    const utterance = new SpeechSynthesisUtterance(word);
    const voices = synth.getVoices();
    const americanVoice = voices.find(
      (voice) => voice.lang.toLowerCase() === "en-us" || /us english|american/i.test(voice.name),
    );
    if (americanVoice) utterance.voice = americanVoice;
    utterance.lang = "en-US";
    utterance.rate = 0.85;
    utterance.pitch = 1;
    utterance.volume = 1;
    synth.speak(utterance);
  }, []);

  const speak = useCallback((word: string) => {
    if (!("Audio" in window)) {
      speakWithSystemVoice(word);
      return;
    }

    const audio = audioRef.current ?? new Audio();
    audioRef.current = audio;
    audio.onerror = null;
    audio.pause();
    audio.currentTime = 0;
    audio.preload = "auto";
    audio.volume = 1;
    audio.src = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(word)}&type=2`;

    let usedFallback = false;
    const fallback = () => {
      if (usedFallback) return;
      usedFallback = true;
      audio.onerror = null;
      speakWithSystemVoice(word);
    };

    audio.onerror = fallback;
    const playback = audio.play();
    playback?.catch(fallback);
  }, [speakWithSystemVoice]);

  const currentWord = queue[currentIndex];

  useEffect(() => {
    if (screen !== "quiz" || !currentWord) return;
    setOptions(buildOptions(currentWord, words));
    setSelectedId(null);
    setAnswerState(null);
    setCountdown(3);
    setMasteryNotice("");
    if (skipNextAutoSpeakRef.current) {
      skipNextAutoSpeakRef.current = false;
      return;
    }
    const pronunciationTimer = setTimeout(() => {
      if (autoSpeak) speak(currentWord.word);
    }, 120);
    return () => clearTimeout(pronunciationTimer);
  }, [autoSpeak, currentWord, screen, speak, words]);

  const metrics = useMemo(() => {
    const entries = Object.values(progress);
    const seen = entries.filter((item) => item.correctCount + item.wrongCount > 0).length;
    const wrong = entries.filter((item) => item.activeWrong).length;
    const mastered = entries.filter((item) => item.wrongCount > 0 && !item.activeWrong).length;
    const correctAnswers = entries.reduce((sum, item) => sum + item.correctCount, 0);
    const wrongAnswers = entries.reduce((sum, item) => sum + item.wrongCount, 0);
    const totalAnswers = correctAnswers + wrongAnswers;
    const accuracy = totalAnswers ? Math.round((correctAnswers / totalAnswers) * 100) : 0;
    return { seen, unseen: Math.max(words.length - seen, 0), wrong, mastered, accuracy, totalAnswers };
  }, [progress, words.length]);

  const saveAnswer = useCallback((word: WordEntry, correct: boolean) => {
    setProgress((previous) => {
      const current = previous[word.word] ?? emptyProgress();
      const consecutiveCorrect = correct && current.activeWrong ? current.consecutiveCorrect + 1 : 0;
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
      setSavedSession(null);
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
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
      const currentProgress = progress[currentWord.word] ?? emptyProgress();
      if (isCorrect && currentProgress.activeWrong) {
        const nextStreak = currentProgress.consecutiveCorrect + 1;
        setMasteryNotice(nextStreak >= 2 ? "已掌握，移入历史错题" : "还需连续答对 1 次");
      } else {
        setMasteryNotice("");
      }
      saveAnswer(currentWord, isCorrect);

      if (isCorrect) {
        setSessionCorrect((value) => value + 1);
        transitionRef.current = setTimeout(() => finishOrAdvance(queueRef.current), 160);
        return;
      }

      setSessionWrong((value) => value + 1);
      setSessionMistakes((previous) => ({
        ...previous,
        [currentWord.word]: (previous[currentWord.word] ?? 0) + 1,
      }));
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
    [answerState, currentWord, finishOrAdvance, progress, saveAnswer, speak],
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
      audioRef.current?.pause();
      window.speechSynthesis?.cancel();
    },
    [],
  );

  function startQuiz(nextMode: QuizMode, selectedWords?: WordEntry[]) {
    if (!words.length) return;
    let candidates: WordEntry[];
    if (selectedWords?.length) {
      candidates = [...selectedWords];
    } else if (nextMode === "wrong") {
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

    const nextQueue = nextMode === "wrong"
      ? [...shuffle(candidates), ...shuffle(candidates)]
      : candidates.slice(0, roundSize);
    if (autoSpeak && nextQueue[0]) {
      // Mobile browsers may block speech started from a timer or effect. The
      // first pronunciation is therefore triggered directly by this tap.
      skipNextAutoSpeakRef.current = true;
      speak(nextQueue[0].word);
    }
    setMode(nextMode);
    setQueue(nextQueue);
    queueRef.current = nextQueue;
    setCurrentIndex(0);
    indexRef.current = 0;
    setSessionCorrect(0);
    setSessionWrong(0);
    setSessionMistakes({});
    setMasteryNotice("");
    setScreen("quiz");
  }

  function resumeQuiz() {
    if (!savedSession) return;
    const wordMap = new Map(words.map((word) => [word.word, word]));
    const restoredQueue = savedSession.queueWords
      .map((word) => wordMap.get(word))
      .filter((word): word is WordEntry => Boolean(word));
    if (!restoredQueue.length || savedSession.currentIndex >= restoredQueue.length) {
      setSavedSession(null);
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
      return;
    }
    if (autoSpeak) {
      skipNextAutoSpeakRef.current = true;
      speak(restoredQueue[savedSession.currentIndex].word);
    }
    setMode(savedSession.mode);
    setQueue(restoredQueue);
    queueRef.current = restoredQueue;
    setCurrentIndex(savedSession.currentIndex);
    indexRef.current = savedSession.currentIndex;
    setSessionCorrect(savedSession.sessionCorrect);
    setSessionWrong(savedSession.sessionWrong);
    setSessionMistakes(savedSession.sessionMistakes);
    setMasteryNotice("");
    setScreen("quiz");
  }

  function reviewSessionMistakes() {
    const sessionWords = words.filter((word) => sessionMistakes[word.word]);
    if (sessionWords.length) startQuiz("wrong", sessionWords);
  }

  function setWrongWordStatus(word: WordEntry, activeWrong: boolean) {
    setProgress((previous) => {
      const current = previous[word.word] ?? emptyProgress();
      return {
        ...previous,
        [word.word]: {
          ...current,
          activeWrong,
          consecutiveCorrect: activeWrong ? 0 : Math.max(current.consecutiveCorrect, 2),
          lastAnsweredAt: new Date().toISOString(),
        },
      };
    });
  }

  function returnHome() {
    if (transitionRef.current) clearTimeout(transitionRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    audioRef.current?.pause();
    window.speechSynthesis?.cancel();
    setScreen("home");
    setAnswerState(null);
  }

  function resetProgress() {
    if (!window.confirm("确定清空全部学习记录和错题吗？此操作无法撤销。")) return;
    setProgress({});
    setSavedSession(null);
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
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
                  <span className="option-pos">{option.pos}</span>
                  <span className="option-meaning">{option.meaning}</span>
                </button>
              );
            })}
          </div>

          <div className={`answer-feedback ${answerState ? "feedback-visible" : ""}`}>
            {answerState === "wrong" ? (
              <>
                <strong>
                  <span className="feedback-pos">{currentWord.pos}</span>
                  {currentWord.meaning}
                </strong>
                <span>{countdown} 秒后继续，这个词稍后还会再出现</span>
              </>
            ) : answerState === "correct" ? (
              <>
                <strong>正确</strong>
                {masteryNotice && <span>{masteryNotice}</span>}
              </>
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
    const sessionWrongWords = words.filter((word) => sessionMistakes[word.word]);
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
          <div className="session-wrong-section">
            <div className="session-wrong-heading">
              <strong>{sessionWrongWords.length ? `本轮错词 · ${sessionWrongWords.length}` : "本轮全部正确"}</strong>
              {sessionWrongWords.length > 0 && <span>同一单词只列一次</span>}
            </div>
            {sessionWrongWords.length > 0 && (
              <div className="session-wrong-list">
                {sessionWrongWords.map((word) => (
                  <div key={word.id}>
                    <span className="summary-word">
                      <strong>{word.word}</strong>
                      <small>{word.pos}</small>
                    </span>
                    <span className="summary-meaning">{word.meaning}</span>
                    <span className="wrong-count">本轮错 {sessionMistakes[word.word]} 次</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="summary-actions">
            {sessionWrongWords.length > 0 && (
              <button className="primary-button" onClick={reviewSessionMistakes}>立即复习本轮错题</button>
            )}
            <button className={sessionWrongWords.length ? "secondary-button" : "primary-button"} onClick={() => startQuiz("new")}>
              再刷一轮新词
            </button>
            <button className="secondary-button" onClick={() => setScreen("wrongbook")}>查看全部错题</button>
            <button className="secondary-button" onClick={returnHome}>
              返回首页
            </button>
          </div>
        </section>
      </main>
    );
  }

  const activeWrongWords = words
    .filter((word) => progress[word.word]?.activeWrong)
    .sort((a, b) => (progress[b.word]?.wrongCount ?? 0) - (progress[a.word]?.wrongCount ?? 0));
  const masteredWrongWords = words
    .filter((word) => progress[word.word]?.wrongCount > 0 && !progress[word.word]?.activeWrong)
    .sort((a, b) => Date.parse(progress[b.word].lastAnsweredAt) - Date.parse(progress[a.word].lastAnsweredAt));

  if (screen === "wrongbook") {
    const displayedWords = wrongbookTab === "active" ? activeWrongWords : masteredWrongWords;
    return (
      <main className="wrongbook-shell">
        <header className="wrongbook-page-header">
          <button className="text-button" onClick={returnHome}>← 返回首页</button>
          <div>
            <p className="eyebrow">完整错题本</p>
            <h1>把错过的词，真正练会。</h1>
            <p>待巩固词连续答对两次后，会进入“已掌握”，不会从历史中消失。</p>
          </div>
          {activeWrongWords.length > 0 && (
            <button className="primary-button" onClick={() => startQuiz("wrong")}>复习全部待巩固</button>
          )}
        </header>

        <div className="wrongbook-tabs" role="tablist" aria-label="错题分类">
          <button
            role="tab"
            aria-selected={wrongbookTab === "active"}
            className={wrongbookTab === "active" ? "tab-active" : ""}
            onClick={() => setWrongbookTab("active")}
          >
            待巩固 <span>{activeWrongWords.length}</span>
          </button>
          <button
            role="tab"
            aria-selected={wrongbookTab === "mastered"}
            className={wrongbookTab === "mastered" ? "tab-active" : ""}
            onClick={() => setWrongbookTab("mastered")}
          >
            已掌握 <span>{masteredWrongWords.length}</span>
          </button>
        </div>

        {displayedWords.length ? (
          <div className="wrongbook-table">
            <div className="wrongbook-table-head">
              <span>单词</span><span>中文释义</span><span>学习情况</span><span>操作</span>
            </div>
            {displayedWords.map((word) => {
              const item = progress[word.word];
              const mastery = Math.min(item.consecutiveCorrect, 2);
              return (
                <article className="wrongbook-row" key={word.id}>
                  <div className="wrongbook-word">
                    <strong>{word.word}</strong>
                    <span>{word.pos}</span>
                  </div>
                  <div className="wrongbook-meaning">{word.meaning}</div>
                  <div className="wrongbook-progress">
                    <span>累计错 {item.wrongCount} 次</span>
                    {wrongbookTab === "active" ? (
                      <span>连续答对 {mastery}/2</span>
                    ) : (
                      <span className="mastered-label">已掌握</span>
                    )}
                  </div>
                  <div className="wrongbook-actions">
                    <button onClick={() => speak(word.word)} aria-label={`播放 ${word.word} 的发音`}>发音</button>
                    <button onClick={() => startQuiz("wrong", [word])}>单练</button>
                    <button onClick={() => setWrongWordStatus(word, wrongbookTab !== "active")}>
                      {wrongbookTab === "active" ? "标记掌握" : "重新巩固"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="wrongbook-empty">
            <strong>{wrongbookTab === "active" ? "暂时没有待巩固词" : "还没有已掌握的历史错词"}</strong>
            <p>{wrongbookTab === "active" ? "普通训练中答错的单词会自动加入这里。" : "待巩固词连续答对两次后会保留在这里。"}</p>
          </div>
        )}
      </main>
    );
  }

  const topWrongWords = activeWrongWords.slice(0, 6);

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
            {savedSession && (
              <button className="resume-button" onClick={resumeQuiz}>
                继续上次 · {savedSession.currentIndex + 1}/{savedSession.queueWords.length}
              </button>
            )}
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
            <button className="secondary-button" onClick={() => setScreen("wrongbook")}>
              查看错题本
            </button>
          </div>

          <div className="quick-settings">
            <div className="setting-group">
              <span>每轮题数</span>
              <div className="segmented-control" aria-label="选择每轮题数">
                {[5, 10, 20, 50].map((size) => (
                  <button
                    key={size}
                    className={roundSize === size ? "segment-active" : ""}
                    onClick={() => setRoundSize(size)}
                  >
                    {size}
                  </button>
                ))}
                <label className="custom-round-size">
                  <span className="sr-only">自定义每轮题数</span>
                  <input
                    type="number"
                    min="5"
                    max="200"
                    value={roundSize}
                    onChange={(event) => {
                      const size = Number(event.target.value);
                      if (Number.isFinite(size)) setRoundSize(Math.min(200, Math.max(5, size)));
                    }}
                    aria-label="自定义每轮题数，最少 5 题，最多 200 题"
                  />
                </label>
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

      <section className="metric-strip metric-strip-six" aria-label="学习概况">
        <div><strong>{words.length}</strong><span>全部词汇</span></div>
        <div><strong>{metrics.seen}</strong><span>已经练习</span></div>
        <div><strong>{metrics.unseen}</strong><span>待学习</span></div>
        <div><strong>{metrics.wrong}</strong><span>错题待巩固</span></div>
        <div><strong>{metrics.mastered}</strong><span>历史错题已掌握</span></div>
        <div><strong>{metrics.accuracy}%</strong><span>累计正确率</span></div>
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
              <button className="small-button" onClick={() => setScreen("wrongbook")}>查看全部</button>
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
            <div className="wrongbook-footer-actions">
              <button className="reset-button" onClick={() => setScreen("wrongbook")}>打开完整错题本</button>
              <button className="reset-button" onClick={resetProgress}>清空学习记录</button>
            </div>
          )}
        </aside>
      </section>
    </main>
  );
}
