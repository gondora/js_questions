// JS基礎問題集アプリ ロジック本体
(function () {
  "use strict";

  const STORAGE_KEY_WRONG = "jsquiz_wrong_ids";
  const STORAGE_KEY_CORRECT = "jsquiz_correct_ids";
  const STORAGE_KEY_STATS = "jsquiz_stats_v2"; // { [group]: { total, correct, byCategory: {cat: {total, correct}} } }

  const GROUPS = {
    basic: { title: "基礎編", desc: "変数・演算子・条件分岐・ループなど、JavaScriptの土台" },
    es6: { title: "ES6+編", desc: "let/constからfetch APIまで、モダンJSの構文" }
  };
  const GROUP_ORDER = ["basic", "es6"];

  const LEVEL_LABELS = {
    choice: { title: "選択式", desc: "4択クイズで基礎を確認する" },
    fill: { title: "穴埋め式", desc: "コードの空欄を埋めて理解を深める" },
    write: { title: "記述式", desc: "白紙からコードを書いて力試し" }
  };

  const appEl = document.getElementById("app");
  const homeBtn = document.getElementById("homeBtn");
  const settingsBtn = document.getElementById("settingsBtn");

  /** @type {{screen:string, [key:string]: any}} */
  let state = { screen: "home" };

  // ---------------- localStorage helpers ----------------

  function loadWrongIds() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_WRONG);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function saveWrongIds(ids) {
    try {
      localStorage.setItem(STORAGE_KEY_WRONG, JSON.stringify(ids));
    } catch (e) { /* noop */ }
  }

  function addWrongId(id) {
    const ids = loadWrongIds();
    if (!ids.includes(id)) {
      ids.push(id);
      saveWrongIds(ids);
    }
  }

  function removeWrongId(id) {
    const ids = loadWrongIds().filter((x) => x !== id);
    saveWrongIds(ids);
  }

  function loadCorrectIds() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_CORRECT);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function saveCorrectIds(ids) {
    try {
      localStorage.setItem(STORAGE_KEY_CORRECT, JSON.stringify(ids));
    } catch (e) { /* noop */ }
  }

  function addCorrectId(id) {
    const ids = loadCorrectIds();
    if (!ids.includes(id)) {
      ids.push(id);
      saveCorrectIds(ids);
    }
  }

  function removeCorrectId(id) {
    const ids = loadCorrectIds().filter((x) => x !== id);
    saveCorrectIds(ids);
  }

  function loadAllStats() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_STATS);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function saveAllStats(allStats) {
    try {
      localStorage.setItem(STORAGE_KEY_STATS, JSON.stringify(allStats));
    } catch (e) { /* noop */ }
  }

  function loadGroupStats(group) {
    const all = loadAllStats();
    return all[group] || { total: 0, correct: 0, unknown: 0, byCategory: {} };
  }

  // result: "correct" | "wrong" | "unknown"
  function recordAnswer(question, result) {
    const all = loadAllStats();
    const group = question.group;
    if (!all[group]) all[group] = { total: 0, correct: 0, unknown: 0, byCategory: {} };
    const stats = all[group];

    stats.total += 1;
    if (result === "correct") stats.correct += 1;
    if (result === "unknown") stats.unknown = (stats.unknown || 0) + 1;

    if (!stats.byCategory[question.category]) {
      stats.byCategory[question.category] = { total: 0, correct: 0, unknown: 0 };
    }
    const catStats = stats.byCategory[question.category];
    catStats.total += 1;
    if (result === "correct") catStats.correct += 1;
    if (result === "unknown") catStats.unknown = (catStats.unknown || 0) + 1;

    saveAllStats(all);

    // 「不正解」「わからない」はどちらも復習対象にする
    if (result === "correct") {
      removeWrongId(question.id);
      addCorrectId(question.id);
    } else {
      addWrongId(question.id);
      removeCorrectId(question.id);
    }
  }

  // ---------------- 進捗リセット ----------------

  function resetAllProgress() {
    try {
      localStorage.removeItem(STORAGE_KEY_STATS);
      localStorage.removeItem(STORAGE_KEY_WRONG);
      localStorage.removeItem(STORAGE_KEY_CORRECT);
    } catch (e) { /* noop */ }
  }

  function resetGroupProgress(group) {
    const all = loadAllStats();
    delete all[group];
    saveAllStats(all);

    const groupIds = new Set(QUESTIONS.filter((q) => q.group === group).map((q) => q.id));
    saveWrongIds(loadWrongIds().filter((id) => !groupIds.has(id)));
    saveCorrectIds(loadCorrectIds().filter((id) => !groupIds.has(id)));
  }

  function resetWrongHistory() {
    saveWrongIds([]);
  }

  function resetCorrectHistory() {
    saveCorrectIds([]);
  }

  // ---------------- ユーティリティ ----------------

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function normalizeForCompare(str) {
    return String(str).trim().replace(/\s+/g, " ");
  }

  function checkAnswer(question, userInput) {
    if (question.level === "choice") {
      return userInput === question.answerIndex;
    }
    if (question.level === "fill") {
      return normalizeForCompare(userInput).toLowerCase() === normalizeForCompare(question.answer).toLowerCase();
    }
    if (question.level === "write") {
      if (question.judge === "exact") {
        return normalizeForCompare(userInput) === normalizeForCompare(question.sampleAnswer || "");
      }
      // partial: 必須キーワードが全て含まれているかで判定
      const text = userInput.toLowerCase();
      return (question.keywords || []).every((kw) => text.includes(String(kw).toLowerCase()));
    }
    return false;
  }

  // ---------------- 画面遷移 ----------------

  function goHome() {
    state = { screen: "home" };
    render();
  }

  function goGroupHome(group) {
    state = { screen: "groupHome", group: group };
    render();
  }

  function goCategoryHome(group, category) {
    state = { screen: "categoryHome", group: group, category: category };
    render();
  }

  function goSettings() {
    state = { screen: "settings", returnState: state };
    render();
  }

  function backFromSettings() {
    state = state.returnState || { screen: "home" };
    render();
  }

  function startQuiz(group, category, level, options) {
    options = options || {};
    let pool;
    if (options.reviewOnly) {
      const wrongIds = loadWrongIds();
      pool = QUESTIONS.filter((q) => q.group === group && wrongIds.includes(q.id) && (!category || q.category === category) && (!level || q.level === level));
    } else {
      pool = QUESTIONS.filter((q) => q.group === group && (!category || q.category === category) && q.level === level);
    }
    pool = shuffle(pool);

    state = {
      screen: "quiz",
      group: group,
      category: category,
      level: level,
      reviewOnly: !!options.reviewOnly,
      questions: pool,
      index: 0,
      correctCount: 0,
      unknownCount: 0,
      answered: false,
      userAnswer: null,
      result: null,
      showExplanation: false
    };
    render();
  }

  function submitAnswer(userInput) {
    const q = state.questions[state.index];
    const isCorrect = checkAnswer(q, userInput);
    const result = isCorrect ? "correct" : "wrong";
    recordAnswer(q, result);
    state.answered = true;
    state.userAnswer = userInput;
    state.result = result;
    state.showExplanation = false;
    if (result === "correct") state.correctCount += 1;
    render();
  }

  function submitUnknown() {
    const q = state.questions[state.index];
    recordAnswer(q, "unknown");
    state.answered = true;
    state.userAnswer = null;
    state.result = "unknown";
    state.showExplanation = false;
    state.unknownCount += 1;
    render();
  }

  function nextQuestion() {
    if (state.index + 1 >= state.questions.length) {
      state.screen = "result";
      render();
      return;
    }
    state.index += 1;
    state.answered = false;
    state.userAnswer = null;
    state.result = null;
    state.showExplanation = false;
    render();
  }

  // ---------------- レンダリング: トップホーム(カテゴリ選択) ----------------

  function renderHome() {

    let html = `<div class="section-title">学習するカテゴリを選択</div>`;
    html += `<div class="level-list">`;
    GROUP_ORDER.forEach((group) => {
      const meta = GROUPS[group];
      const stats = loadGroupStats(group);
      const rate = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
      const questionCount = QUESTIONS.filter((q) => q.group === group).length;
      html += `<button class="level-card" data-group="${group}">
        <strong>${escapeHtml(meta.title)}(全${questionCount}問)</strong>
        <span>${escapeHtml(meta.desc)}</span>
        <span>解答数 ${stats.total} / 正答率 ${rate}%</span>
      </button>`;
    });
    html += `</div>`;

    appEl.innerHTML = html;

    appEl.querySelectorAll(".level-card[data-group]").forEach((btn) => {
      btn.addEventListener("click", () => goGroupHome(btn.dataset.group));
    });
  }

  // ---------------- レンダリング: カテゴリ内ホーム(分野選択) ----------------

  function getCategoriesForGroup(group) {
    return [...new Set(QUESTIONS.filter((q) => q.group === group).map((q) => q.category))];
  }

  function renderGroupHome() {
    const group = state.group;
    const meta = GROUPS[group];
    const stats = loadGroupStats(group);
    const wrongCount = loadWrongIds().filter((id) => {
      const q = QUESTIONS.find((x) => x.id === id);
      return q && q.group === group;
    }).length;
    const rate = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;

    const categories = getCategoriesForGroup(group);

    let html = `<div class="section-title">${escapeHtml(meta.title)}</div>`;

    html += `<div class="progress-summary">
      <div class="stat-box"><div class="num">${stats.total}</div><div class="label">解答した問題数</div></div>
      <div class="stat-box"><div class="num">${rate}%</div><div class="label">全体正答率</div></div>
      <div class="stat-box"><div class="num">${stats.unknown || 0}</div><div class="label">わからない</div></div>
    </div>`;

    html += `<div class="section-title">分野を選んで開始</div>`;
    html += `<div class="level-list">`;

    const allCount = QUESTIONS.filter((q) => q.group === group).length;
    html += `<button class="level-card" data-category="">
      <strong>すべての分野(全${allCount}問)</strong>
      <span>分野を絞らず、${escapeHtml(meta.title)}の全問題からまとめて出題します</span>
      <span>正答率 ${rate}%</span>
    </button>`;

    categories.forEach((cat) => {
      const c = stats.byCategory[cat] || { total: 0, correct: 0 };
      const pct = c.total > 0 ? Math.round((c.correct / c.total) * 100) : 0;
      const count = QUESTIONS.filter((q) => q.group === group && q.category === cat).length;
      html += `<button class="level-card" data-category="${escapeHtml(cat)}">
        <strong>${escapeHtml(cat)}(全${count}問)</strong>
        <span>解答数 ${c.total} / 正答率 ${pct}%</span>
      </button>`;
    });
    html += `</div>`;

    html += `<div class="section-title">復習</div>`;
    html += `<div class="level-list">
      <button class="level-card review-card" data-review="1" ${wrongCount === 0 ? "disabled" : ""}>
        <strong>間違えた問題だけ復習(${wrongCount}問)</strong>
        <span>${wrongCount === 0 ? "間違えた問題はまだありません" : "分野を問わず、過去に間違えた問題だけを出題します"}</span>
      </button>
    </div>`;

    appEl.innerHTML = html;

    appEl.querySelectorAll(".level-card[data-category]").forEach((btn) => {
      btn.addEventListener("click", () => goCategoryHome(group, btn.dataset.category || null));
    });
    const reviewBtn = appEl.querySelector(".level-card[data-review]");
    if (reviewBtn) {
      reviewBtn.addEventListener("click", () => startQuiz(group, null, null, { reviewOnly: true }));
    }
  }

  // ---------------- レンダリング: 分野内ホーム(レベル選択) ----------------

  function renderCategoryHome() {
    const group = state.group;
    const category = state.category;
    const meta = GROUPS[group];
    const stats = loadGroupStats(group);
    const categoryLabel = category || "すべての分野";

    let html = `<button class="link-back" id="backToGroupHomeBtn">← 分野一覧に戻る</button>`;

    html += `<div class="section-title">${escapeHtml(meta.title)} / ${escapeHtml(categoryLabel)}</div>`;

    let progressHtml = "";
    if (category) {
      const c = stats.byCategory[category] || { total: 0, correct: 0, unknown: 0 };
      const pct = c.total > 0 ? Math.round((c.correct / c.total) * 100) : 0;
      progressHtml = `<div class="progress-summary">
        <div class="stat-box"><div class="num">${c.total}</div><div class="label">解答した問題数</div></div>
        <div class="stat-box"><div class="num">${pct}%</div><div class="label">この分野の正答率</div></div>
        <div class="stat-box"><div class="num">${c.unknown || 0}</div><div class="label">わからない</div></div>
      </div>`;
    } else {
      const rate = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
      progressHtml = `<div class="progress-summary">
        <div class="stat-box"><div class="num">${stats.total}</div><div class="label">解答した問題数</div></div>
        <div class="stat-box"><div class="num">${rate}%</div><div class="label">全体正答率</div></div>
        <div class="stat-box"><div class="num">${stats.unknown || 0}</div><div class="label">わからない</div></div>
      </div>`;
    }
    html += progressHtml;

    html += `<div class="section-title">レベルを選んで開始</div>`;
    html += `<div class="level-list">`;
    ["choice", "fill", "write"].forEach((lvl) => {
      const count = QUESTIONS.filter((q) => q.group === group && (!category || q.category === category) && q.level === lvl).length;
      const label = LEVEL_LABELS[lvl];
      html += `<button class="level-card" data-level="${lvl}" ${count === 0 ? "disabled" : ""}>
        <strong>${label.title}(全${count}問)</strong>
        <span>${count === 0 ? "準備中です" : label.desc}</span>
      </button>`;
    });
    html += `</div>`;

    appEl.innerHTML = html;

    appEl.querySelector("#backToGroupHomeBtn").addEventListener("click", () => goGroupHome(group));

    appEl.querySelectorAll(".level-card[data-level]").forEach((btn) => {
      btn.addEventListener("click", () => startQuiz(group, category, btn.dataset.level));
    });
  }

  // ---------------- レンダリング: クイズ ----------------

  function renderQuestionBody(q) {
    return `<div class="question-text">${escapeHtml(q.question)}</div>`;
  }

  function renderDontKnowButton() {
    if (state.answered) return "";
    return `<div class="btn-row"><button class="btn btn-dontknow" id="dontKnowBtn">わからない</button></div>`;
  }

  function renderChoiceQuiz(q) {
    let html = renderQuestionBody(q);
    html += `<div class="options-list">`;
    q.options.forEach((opt, i) => {
      let cls = "option-btn";
      if (state.answered) {
        if (i === q.answerIndex) cls += " correct";
        else if (i === state.userAnswer) cls += " wrong";
      }
      html += `<button class="${cls}" data-index="${i}" ${state.answered ? "disabled" : ""}>${escapeHtml(opt)}</button>`;
    });
    html += `</div>`;
    html += renderDontKnowButton();
    return html;
  }

  function renderFillQuiz(q) {
    let html = renderQuestionBody(q);
    if (q.options && q.options.length) {
      html += `<select class="fill-select" ${state.answered ? "disabled" : ""}>
        <option value="">選択してください</option>
        ${q.options.map((o) => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join("")}
      </select>`;
    } else {
      html += `<input type="text" class="fill-input" placeholder="コードを入力" autocomplete="off" autocapitalize="off" ${state.answered ? "disabled" : ""} value="${state.answered ? escapeHtml(state.userAnswer || "") : ""}">`;
    }
    html += `<div class="btn-row"><button class="btn btn-primary" id="submitBtn" ${state.answered ? "disabled" : ""}>解答する</button></div>`;
    html += renderDontKnowButton();
    return html;
  }

  function renderWriteQuiz(q) {
    let html = renderQuestionBody(q);
    html += `<textarea class="write-input" placeholder="ここにコードを書いてください" autocomplete="off" autocapitalize="off" spellcheck="false" ${state.answered ? "disabled" : ""}>${state.answered ? escapeHtml(state.userAnswer || "") : ""}</textarea>`;
    html += `<div class="btn-row"><button class="btn btn-primary" id="submitBtn" ${state.answered ? "disabled" : ""}>解答する</button></div>`;
    html += renderDontKnowButton();
    return html;
  }

  function renderExplanationDetail(q) {
    let html = `<div class="explanation">${escapeHtml(q.reason || "")}</div>`;
    if (q.example) {
      html += `<div class="example-label">使用例</div>`;
      html += `<pre class="code-block">${escapeHtml(q.example)}</pre>`;
    }
    return html;
  }

  function renderFeedback(q) {
    if (!state.answered) return "";

    const cls = state.result === "correct" ? "correct" : state.result === "unknown" ? "unknown" : "wrong";
    const label = state.result === "correct" ? "◯ 正解!" : state.result === "unknown" ? "🤔 わからない" : "✗ 不正解";

    let html = `<div class="feedback-box ${cls}">`;
    html += `<div>${label}</div>`;

    if (state.result !== "correct" && (q.level === "fill" || q.level === "write")) {
      const sample = q.level === "fill" ? q.answer : q.sampleAnswer;
      html += `<div class="sample-answer">正解例: ${escapeHtml(sample || "")}</div>`;
    }

    if (state.result === "correct") {
      html += `<div class="btn-row"><button class="btn btn-secondary" id="toggleExplanationBtn">${state.showExplanation ? "解説を閉じる" : "解説を見る"}</button></div>`;
      if (state.showExplanation) {
        html += renderExplanationDetail(q);
      }
    } else {
      html += renderExplanationDetail(q);
    }

    html += `</div>`;
    return html;
  }

  function renderQuiz() {
    const q = state.questions[state.index];

    if (!q) {
      appEl.innerHTML = `<div class="empty-state">
        該当する問題がありません。<br>前の画面に戻ってください。
      </div>
      <div class="btn-row"><button class="btn btn-primary" id="backGroupHomeBtn">戻る</button></div>`;
      appEl.querySelector("#backGroupHomeBtn").addEventListener("click", () => {
        if (state.reviewOnly) goGroupHome(state.group);
        else goCategoryHome(state.group, state.category);
      });
      return;
    }

    const scopeLabel = [GROUPS[state.group].title, state.category, state.reviewOnly ? "復習モード" : LEVEL_LABELS[state.level].title]
      .filter(Boolean)
      .map(escapeHtml)
      .join(" / ");

    let html = `<div class="quiz-meta">
      <span>${scopeLabel}</span>
      <span>${state.index + 1} / ${state.questions.length}</span>
    </div>`;
    html += `<div class="question-category">${escapeHtml(q.category)}</div>`;

    html += `<div class="card">`;
    if (q.level === "choice") html += renderChoiceQuiz(q);
    else if (q.level === "fill") html += renderFillQuiz(q);
    else html += renderWriteQuiz(q);
    html += renderFeedback(q);
    html += `</div>`;

    if (state.answered) {
      html += `<div class="btn-row"><button class="btn btn-primary" id="nextBtn">${state.index + 1 >= state.questions.length ? "結果を見る" : "次の問題へ"}</button></div>`;
    }

    appEl.innerHTML = html;

    if (q.level === "choice" && !state.answered) {
      appEl.querySelectorAll(".option-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          submitAnswer(parseInt(btn.dataset.index, 10));
        });
      });
    }

    if ((q.level === "fill" || q.level === "write") && !state.answered) {
      const submitBtn = appEl.querySelector("#submitBtn");
      submitBtn.addEventListener("click", () => {
        let val;
        if (q.level === "fill") {
          const selectEl = appEl.querySelector(".fill-select");
          const inputEl = appEl.querySelector(".fill-input");
          val = selectEl ? selectEl.value : inputEl.value;
        } else {
          val = appEl.querySelector(".write-input").value;
        }
        if (!val || !val.trim()) return;
        submitAnswer(val);
      });
    }

    if (!state.answered) {
      const dontKnowBtn = appEl.querySelector("#dontKnowBtn");
      if (dontKnowBtn) {
        dontKnowBtn.addEventListener("click", submitUnknown);
      }
    }

    if (state.answered) {
      appEl.querySelector("#nextBtn").addEventListener("click", nextQuestion);
      const toggleBtn = appEl.querySelector("#toggleExplanationBtn");
      if (toggleBtn) {
        toggleBtn.addEventListener("click", () => {
          state.showExplanation = !state.showExplanation;
          render();
        });
      }
    }
  }

  // ---------------- レンダリング: 結果 ----------------

  function renderResult() {
    const total = state.questions.length;
    const correct = state.correctCount;
    const rate = total > 0 ? Math.round((correct / total) * 100) : 0;

    const scopeLabel = [GROUPS[state.group].title, state.category, state.reviewOnly ? "復習モード" : LEVEL_LABELS[state.level].title]
      .filter(Boolean)
      .map(escapeHtml)
      .join(" / ");

    let html = `<div class="card">
      <div class="result-sub">${scopeLabel} の結果</div>
      <div class="result-score">${correct} / ${total} 問正解</div>
      <div class="result-sub">正答率 ${rate}%${state.unknownCount > 0 ? `(わからない ${state.unknownCount}問を含む)` : ""}</div>
      <div class="btn-row">
        <button class="btn btn-secondary" id="retryBtn">もう一度</button>
        <button class="btn btn-primary" id="backToGroupBtn">戻る</button>
      </div>
    </div>`;

    appEl.innerHTML = html;
    appEl.querySelector("#retryBtn").addEventListener("click", () => startQuiz(state.group, state.category, state.level, { reviewOnly: state.reviewOnly }));
    appEl.querySelector("#backToGroupBtn").addEventListener("click", () => {
      if (state.reviewOnly) goGroupHome(state.group);
      else goCategoryHome(state.group, state.category);
    });
  }

  // ---------------- レンダリング: 設定 ----------------

  function confirmAndRun(message, fn) {
    if (window.confirm(message)) {
      fn();
      render();
    }
  }

  function renderSettings() {
    let html = `<div class="section-title">設定 / 進捗データのリセット</div>`;

    html += `<div class="settings-group">
      <div class="settings-group-title">全データリセット</div>
      <div class="settings-list">
        <div class="settings-item">
          <div class="settings-item-text">
            <strong>すべての進捗をリセット</strong>
            <span>全カテゴリの正答率・間違えた問題・正解履歴をすべて初期化します</span>
          </div>
          <button class="btn btn-danger" id="resetAllBtn">リセット</button>
        </div>
      </div>
    </div>`;

    html += `<div class="settings-group">
      <div class="settings-group-title">カテゴリ単位のリセット</div>
      <div class="settings-list">`;
    GROUP_ORDER.forEach((group) => {
      const meta = GROUPS[group];
      html += `<div class="settings-item">
          <div class="settings-item-text">
            <strong>${escapeHtml(meta.title)}のみリセット</strong>
            <span>${escapeHtml(meta.title)}の正答率・間違えた問題・正解履歴を初期化します</span>
          </div>
          <button class="btn btn-danger" data-reset-group="${group}">リセット</button>
        </div>`;
    });
    html += `</div></div>`;

    html += `<div class="settings-group">
      <div class="settings-group-title">履歴のみのリセット(正答率の記録は保持)</div>
      <div class="settings-list">
        <div class="settings-item">
          <div class="settings-item-text">
            <strong>間違えた問題の履歴のみリセット</strong>
            <span>復習モードの対象になる「間違えた問題」の記録だけを消去します</span>
          </div>
          <button class="btn btn-danger" id="resetWrongBtn">リセット</button>
        </div>
        <div class="settings-item">
          <div class="settings-item-text">
            <strong>正解した問題の履歴のみリセット</strong>
            <span>「一度正解した」という記録だけを消去します</span>
          </div>
          <button class="btn btn-danger" id="resetCorrectBtn">リセット</button>
        </div>
      </div>
    </div>`;

    html += `<div class="btn-row"><button class="btn btn-secondary" id="backFromSettingsBtn">戻る</button></div>`;

    appEl.innerHTML = html;

    appEl.querySelector("#resetAllBtn").addEventListener("click", () => {
      confirmAndRun(
        "全カテゴリの正答率・間違えた問題・正解履歴をすべて削除します。この操作は取り消せません。よろしいですか?",
        resetAllProgress
      );
    });

    appEl.querySelectorAll("[data-reset-group]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const group = btn.dataset.resetGroup;
        const title = GROUPS[group].title;
        confirmAndRun(
          `「${title}」の正答率・間違えた問題・正解履歴をすべて削除します。この操作は取り消せません。よろしいですか?`,
          () => resetGroupProgress(group)
        );
      });
    });

    appEl.querySelector("#resetWrongBtn").addEventListener("click", () => {
      confirmAndRun(
        "「間違えた問題」の履歴を削除します(正答率の記録は残ります)。復習モードの対象がなくなります。よろしいですか?",
        resetWrongHistory
      );
    });

    appEl.querySelector("#resetCorrectBtn").addEventListener("click", () => {
      confirmAndRun(
        "「正解した問題」の履歴を削除します(正答率の記録は残ります)。よろしいですか?",
        resetCorrectHistory
      );
    });

    appEl.querySelector("#backFromSettingsBtn").addEventListener("click", backFromSettings);
  }

  // ---------------- メインレンダー ----------------

  function render() {
    homeBtn.hidden = state.screen === "home";
    settingsBtn.hidden = state.screen === "quiz" || state.screen === "settings";

    if (state.screen === "home") renderHome();
    else if (state.screen === "groupHome") renderGroupHome();
    else if (state.screen === "categoryHome") renderCategoryHome();
    else if (state.screen === "quiz") renderQuiz();
    else if (state.screen === "result") renderResult();
    else if (state.screen === "settings") renderSettings();
  }

  homeBtn.addEventListener("click", goHome);
  settingsBtn.addEventListener("click", goSettings);

  render();
})();
