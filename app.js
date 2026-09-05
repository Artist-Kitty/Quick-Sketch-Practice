const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/bmp", "image/avif"]);
const STREAK_KEY = "quick-sketch-streak";
const LAST_SETTINGS_KEY = "quick-sketch-settings";

const state = {
  images: [],
  sessionImages: [],
  currentIndex: 0,
  mode: "free",
  secondsPerImage: 120,
  sessionStartedAt: 0,
  currentImageStartedAt: 0,
  elapsedBeforeCurrent: 0,
  pausedAt: 0,
  totalPausedMs: 0,
  paused: false,
  mirror: false,
  flipHorizontal: false,
  gray: false,
  rafId: 0,
  confettiId: 0,
  lastSettings: null
};

const $ = (selector) => document.querySelector(selector);

const screens = {
  setup: $("#setupScreen"),
  countdown: $("#countdownScreen"),
  session: $("#sessionScreen"),
  finish: $("#finishScreen")
};

const els = {
  folderInput: $("#folderInput"),
  folderName: $("#folderName"),
  folderDetails: $("#folderDetails"),
  previewStrip: $("#previewStrip"),
  shuffleToggle: $("#shuffleToggle"),
  repeatToggle: $("#repeatToggle"),
  imageCount: $("#imageCount"),
  decreaseCount: $("#decreaseCount"),
  increaseCount: $("#increaseCount"),
  fixedTimePanel: $("#fixedTimePanel"),
  minutesInput: $("#minutesInput"),
  secondsInput: $("#secondsInput"),
  setupStatus: $("#setupStatus"),
  startButton: $("#startButton"),
  setupStreak: $("#setupStreak"),
  countdownNumber: $("#countdownNumber"),
  sessionImage: $("#sessionImage"),
  prevButton: $("#prevButton"),
  pauseButton: $("#pauseButton"),
  nextButton: $("#nextButton"),
  mirrorButton: $("#mirrorButton"),
  flipHorizontalButton: $("#flipHorizontalButton"),
  grayButton: $("#grayButton"),
  fullscreenButton: $("#fullscreenButton"),
  currentImageTime: $("#currentImageTime"),
  currentImageTimer: $("#currentImageTimer"),
  sessionCounter: $("#sessionCounter"),
  sessionTimer: $("#sessionTimer"),
  progressFill: $("#progressFill"),
  finishDialog: $("#finishDialog"),
  finishedCount: $("#finishedCount"),
  finishedDuration: $("#finishedDuration"),
  finishedStreak: $("#finishedStreak"),
  usedGrid: $("#usedGrid"),
  repeatButton: $("#repeatButton"),
  homeButton: $("#homeButton"),
  confettiCanvas: $("#confettiCanvas")
};

function showScreen(name) {
  Object.values(screens).forEach((screen) => screen.classList.remove("is-active"));
  screens[name].classList.add("is-active");
}

function formatTime(totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function todayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function readStreak() {
  try {
    return JSON.parse(localStorage.getItem(STREAK_KEY)) || { count: 0, lastDate: "" };
  } catch {
    return { count: 0, lastDate: "" };
  }
}

function writeStreak(data) {
  localStorage.setItem(STREAK_KEY, JSON.stringify(data));
  els.setupStreak.textContent = data.count;
}

function completeTodayStreak() {
  const data = readStreak();
  const today = todayKey();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayValue = todayKey(yesterday);

  if (data.lastDate === today) {
    writeStreak(data);
    return data.count;
  }

  const nextCount = data.lastDate === yesterdayValue ? data.count + 1 : 1;
  const nextData = { count: nextCount, lastDate: today };
  writeStreak(nextData);
  return nextCount;
}

function saveSettings() {
  const settings = gatherSettings();
  state.lastSettings = settings;
  localStorage.setItem(LAST_SETTINGS_KEY, JSON.stringify(settings));
}

function loadSettings() {
  try {
    const settings = JSON.parse(localStorage.getItem(LAST_SETTINGS_KEY));
    if (!settings) return;

    els.shuffleToggle.checked = Boolean(settings.shuffle);
    els.repeatToggle.checked = Boolean(settings.repeat);
    els.imageCount.value = settings.count || 12;
    document.querySelector(`input[name="sessionMode"][value="${settings.mode || "free"}"]`).checked = true;
    els.minutesInput.value = Math.floor((settings.secondsPerImage || 120) / 60);
    els.secondsInput.value = (settings.secondsPerImage || 120) % 60;
    updateModeVisibility();
  } catch {
    updateModeVisibility();
  }
}

function gatherSettings() {
  const mode = document.querySelector("input[name='sessionMode']:checked").value;
  const minutes = Math.max(0, Number(els.minutesInput.value) || 0);
  const seconds = Math.min(59, Math.max(0, Number(els.secondsInput.value) || 0));

  return {
    shuffle: els.shuffleToggle.checked,
    repeat: els.repeatToggle.checked,
    count: Math.max(1, Number(els.imageCount.value) || 1),
    mode,
    secondsPerImage: minutes * 60 + seconds
  };
}

function updateModeVisibility() {
  const mode = document.querySelector("input[name='sessionMode']:checked").value;
  els.fixedTimePanel.hidden = mode !== "fixed";
}

function refreshPreview() {
  els.previewStrip.textContent = "";

  const previews = state.images.slice(0, 5);
  previews.forEach((image) => {
    const img = document.createElement("img");
    img.src = image.url;
    img.alt = image.name;
    els.previewStrip.append(img);
  });

  if (state.images.length > 5) {
    const more = document.createElement("div");
    more.className = "thumb-more";
    more.textContent = `+${state.images.length - 5}`;
    els.previewStrip.append(more);
  }
}

function revokeOldImages() {
  state.images.forEach((image) => URL.revokeObjectURL(image.url));
}

function handleFolderSelection(event) {
  const files = Array.from(event.target.files || [])
    .filter((file) => IMAGE_TYPES.has(file.type) || /\.(jpe?g|png|webp|gif|bmp|avif)$/i.test(file.name))
    .sort((a, b) => a.webkitRelativePath.localeCompare(b.webkitRelativePath, "ru", { numeric: true }));

  revokeOldImages();
  state.images = files.map((file) => ({
    file,
    name: file.name,
    path: file.webkitRelativePath,
    url: URL.createObjectURL(file)
  }));

  const firstPath = state.images[0]?.path || "";
  const folder = firstPath.split("/")[0] || "Выбранная папка";
  els.folderName.textContent = state.images.length ? folder : "Папка не выбрана";
  els.folderDetails.textContent = state.images.length
    ? `${state.images.length} изображений найдено`
    : "В выбранной папке не найдено изображений";
  els.setupStatus.textContent = "";
  refreshPreview();
}

function shuffled(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function buildSessionImages(settings) {
  const pool = settings.shuffle ? shuffled(state.images) : [...state.images];
  if (!settings.repeat) {
    return pool.slice(0, Math.min(settings.count, pool.length));
  }

  const result = [];
  for (let i = 0; i < settings.count; i += 1) {
    if (settings.shuffle) {
      result.push(state.images[Math.floor(Math.random() * state.images.length)]);
    } else {
      result.push(pool[i % pool.length]);
    }
  }
  return result;
}

function validateSettings(settings) {
  if (!state.images.length) return "Сначала выберите папку с изображениями.";
  if (settings.count < 1) return "Укажите хотя бы одно изображение.";
  if (settings.mode === "fixed" && settings.secondsPerImage < 1) return "Для фиксированного режима укажите время больше нуля.";
  if (!settings.repeat && settings.count > state.images.length) {
    return `Без повторов доступно только ${state.images.length} изображений.`;
  }
  return "";
}

function startSession() {
  const settings = gatherSettings();
  const error = validateSettings(settings);
  if (error) {
    els.setupStatus.textContent = error;
    return;
  }

  saveSettings();
  state.sessionImages = buildSessionImages(settings);
  state.mode = settings.mode;
  state.secondsPerImage = settings.secondsPerImage;
  state.currentIndex = 0;
  state.elapsedBeforeCurrent = 0;
  state.totalPausedMs = 0;
  state.pausedAt = 0;
  state.paused = false;
  state.mirror = false;
  state.flipHorizontal = false;
  state.gray = false;
  runCountdown();
}

function runCountdown() {
  showScreen("countdown");
  let count = 5;
  els.countdownNumber.textContent = count;

  const timer = setInterval(() => {
    count -= 1;
    els.countdownNumber.textContent = count;
    if (count <= 0) {
      clearInterval(timer);
      beginActiveSession();
    }
  }, 1000);
}

function beginActiveSession() {
  state.sessionStartedAt = performance.now();
  state.currentImageStartedAt = performance.now();
  showScreen("session");
  renderCurrentImage();
  tick();
}

function renderCurrentImage() {
  const image = state.sessionImages[state.currentIndex];
  els.sessionImage.src = image.url;
  els.sessionImage.alt = image.name;
  els.sessionImage.style.setProperty("--mirror-x", state.mirror ? "-1" : "1");
  els.sessionImage.style.setProperty("--mirror-y", state.flipHorizontal ? "-1" : "1");
  els.sessionImage.style.setProperty("--gray", state.gray ? "1" : "0");
  els.mirrorButton.classList.toggle("is-active", state.mirror);
  els.flipHorizontalButton.classList.toggle("is-active", state.flipHorizontal);
  els.grayButton.classList.toggle("is-active", state.gray);
  els.pauseButton.classList.toggle("is-paused", state.paused);
  els.pauseButton.setAttribute("aria-label", state.paused ? "Продолжить" : "Пауза");
  els.pauseButton.title = state.paused ? "Продолжить" : "Пауза";
  els.currentImageTime.hidden = state.mode !== "fixed";
  els.sessionCounter.textContent = `${state.currentIndex + 1} / ${state.sessionImages.length}`;
  updateProgress();
}

function activeElapsedMs() {
  const now = state.paused ? state.pausedAt : performance.now();
  return now - state.sessionStartedAt - state.totalPausedMs;
}

function imageElapsedMs() {
  const now = state.paused ? state.pausedAt : performance.now();
  return now - state.currentImageStartedAt;
}

function updateProgress() {
  const elapsedSeconds = activeElapsedMs() / 1000;

  if (state.mode === "fixed") {
    const totalSeconds = state.sessionImages.length * state.secondsPerImage;
    const currentRemaining = Math.max(0, state.secondsPerImage - imageElapsedMs() / 1000);
    const progress = Math.min(100, (elapsedSeconds / totalSeconds) * 100);
    const remaining = Math.max(0, totalSeconds - elapsedSeconds);
    els.currentImageTime.hidden = false;
    els.currentImageTimer.textContent = formatTime(currentRemaining);
    els.sessionTimer.textContent = formatTime(remaining);
    els.progressFill.style.width = `${progress}%`;
  } else {
    const progress = ((state.currentIndex + imageElapsedMs() / 1000 / 60) / state.sessionImages.length) * 100;
    els.currentImageTime.hidden = true;
    els.sessionTimer.textContent = formatTime(elapsedSeconds);
    els.progressFill.style.width = `${Math.min(100, progress)}%`;
  }
}

function tick() {
  cancelAnimationFrame(state.rafId);
  updateProgress();

  if (!state.paused && state.mode === "fixed" && imageElapsedMs() >= state.secondsPerImage * 1000) {
    const wasLastImage = state.currentIndex >= state.sessionImages.length - 1;
    goNext(false);
    if (!wasLastImage) {
      state.rafId = requestAnimationFrame(tick);
    }
    return;
  }

  state.rafId = requestAnimationFrame(tick);
}

function resetImageTimer() {
  state.currentImageStartedAt = state.paused ? state.pausedAt : performance.now();
}

function goPrev() {
  if (state.currentIndex === 0) return;
  state.currentIndex -= 1;
  resetImageTimer();
  renderCurrentImage();
}

function goNext(askOnLast = true) {
  if (state.currentIndex >= state.sessionImages.length - 1) {
    if (askOnLast) {
      askFinish();
    } else {
      finishSession();
    }
    return;
  }

  state.currentIndex += 1;
  resetImageTimer();
  renderCurrentImage();
}

function askFinish() {
  if (typeof els.finishDialog.showModal === "function") {
    els.finishDialog.showModal();
  } else if (window.confirm("Вы точно хотите завершить текущую сессию?")) {
    finishSession();
  }
}

function togglePause() {
  if (state.paused) {
    state.totalPausedMs += performance.now() - state.pausedAt;
    state.currentImageStartedAt += performance.now() - state.pausedAt;
    state.paused = false;
    tick();
  } else {
    state.pausedAt = performance.now();
    state.paused = true;
    cancelAnimationFrame(state.rafId);
    updateProgress();
  }
  renderCurrentImage();
}

function toggleMirror() {
  state.mirror = !state.mirror;
  renderCurrentImage();
}

function toggleFlipHorizontal() {
  state.flipHorizontal = !state.flipHorizontal;
  renderCurrentImage();
}

function toggleGray() {
  state.gray = !state.gray;
  renderCurrentImage();
}

function toggleFullscreen() {
  if (document.fullscreenElement) {
    document.exitFullscreen();
  } else {
    document.documentElement.requestFullscreen();
  }
}

function finishSession() {
  cancelAnimationFrame(state.rafId);
  const elapsed = activeElapsedMs();
  const streak = completeTodayStreak();

  els.finishedCount.textContent = state.sessionImages.length;
  els.finishedDuration.textContent = formatTime(elapsed / 1000);
  els.finishedStreak.textContent = streak;
  renderUsedImages();
  showScreen("finish");
  launchConfetti();
}

function renderUsedImages() {
  els.usedGrid.textContent = "";
  state.sessionImages.forEach((image) => {
    const button = document.createElement("button");
    button.type = "button";
    button.title = image.name;
    const img = document.createElement("img");
    img.src = image.url;
    img.alt = image.name;
    button.append(img);
    button.addEventListener("click", () => window.open(image.url, "_blank", "noopener"));
    els.usedGrid.append(button);
  });
}

function repeatSession() {
  stopConfetti();
  if (!state.lastSettings) {
    state.lastSettings = gatherSettings();
  }
  const error = validateSettings(state.lastSettings);
  if (error) {
    showScreen("setup");
    els.setupStatus.textContent = error;
    return;
  }
  state.sessionImages = buildSessionImages(state.lastSettings);
  state.mode = state.lastSettings.mode;
  state.secondsPerImage = state.lastSettings.secondsPerImage;
  state.currentIndex = 0;
  state.elapsedBeforeCurrent = 0;
  state.totalPausedMs = 0;
  state.paused = false;
  state.mirror = false;
  state.flipHorizontal = false;
  state.gray = false;
  runCountdown();
}

function returnHome() {
  stopConfetti();
  showScreen("setup");
}

function launchConfetti() {
  const canvas = els.confettiCanvas;
  const context = canvas.getContext("2d");
  const colors = ["#863CB8", "#b34be0", "#ffffff", "#f4d35e", "#d8b4f8"];
  let pieces = [];

  function resize() {
    canvas.width = window.innerWidth * window.devicePixelRatio;
    canvas.height = window.innerHeight * window.devicePixelRatio;
    context.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
  }

  resize();
  pieces = Array.from({ length: 90 }, () => ({
    x: Math.random() * window.innerWidth,
    y: -20 - Math.random() * window.innerHeight * 0.4,
    size: 5 + Math.random() * 7,
    speed: 1.4 + Math.random() * 2.6,
    drift: -1.2 + Math.random() * 2.4,
    rotation: Math.random() * Math.PI,
    spin: -0.14 + Math.random() * 0.28,
    color: colors[Math.floor(Math.random() * colors.length)]
  }));

  function draw() {
    context.clearRect(0, 0, window.innerWidth, window.innerHeight);
    pieces.forEach((piece) => {
      piece.y += piece.speed;
      piece.x += piece.drift;
      piece.rotation += piece.spin;
      if (piece.y > window.innerHeight + 20) {
        piece.y = -20;
        piece.x = Math.random() * window.innerWidth;
      }

      context.save();
      context.translate(piece.x, piece.y);
      context.rotate(piece.rotation);
      context.fillStyle = piece.color;
      context.fillRect(-piece.size / 2, -piece.size / 3, piece.size, piece.size / 1.7);
      context.restore();
    });
    state.confettiId = requestAnimationFrame(draw);
  }

  window.addEventListener("resize", resize, { once: true });
  stopConfetti();
  draw();
}

function stopConfetti() {
  cancelAnimationFrame(state.confettiId);
  const context = els.confettiCanvas.getContext("2d");
  context.clearRect(0, 0, els.confettiCanvas.width, els.confettiCanvas.height);
}

function bindEvents() {
  els.folderInput.addEventListener("change", handleFolderSelection);
  els.decreaseCount.addEventListener("click", () => {
    els.imageCount.value = Math.max(1, Number(els.imageCount.value || 1) - 1);
  });
  els.increaseCount.addEventListener("click", () => {
    els.imageCount.value = Math.max(1, Number(els.imageCount.value || 1) + 1);
  });

  document.querySelectorAll("input[name='sessionMode']").forEach((input) => {
    input.addEventListener("change", updateModeVisibility);
  });

  document.querySelectorAll(".quick-times button").forEach((button) => {
    button.addEventListener("click", () => {
      const seconds = Number(button.dataset.time);
      els.minutesInput.value = Math.floor(seconds / 60);
      els.secondsInput.value = seconds % 60;
      document.querySelectorAll(".quick-times button").forEach((item) => item.classList.remove("is-selected"));
      button.classList.add("is-selected");
    });
  });

  els.startButton.addEventListener("click", startSession);
  els.prevButton.addEventListener("click", goPrev);
  els.nextButton.addEventListener("click", () => goNext(true));
  els.pauseButton.addEventListener("click", togglePause);
  els.mirrorButton.addEventListener("click", toggleMirror);
  els.flipHorizontalButton.addEventListener("click", toggleFlipHorizontal);
  els.grayButton.addEventListener("click", toggleGray);
  els.fullscreenButton.addEventListener("click", toggleFullscreen);
  els.repeatButton.addEventListener("click", repeatSession);
  els.homeButton.addEventListener("click", returnHome);

  els.finishDialog.addEventListener("close", () => {
    if (els.finishDialog.returnValue === "confirm") {
      finishSession();
    }
  });
}

bindEvents();
writeStreak(readStreak());
loadSettings();
