const storageKey = "car-revolutions-save";
const maxOfflineHours = 8;

const baseCarCost = 50;
const baseSpeedUpgradeCost = 75;
const baseIncomeUpgradeCost = 90;
const baseAutomationCost = 250;

const tracks = [
  { id: "beginner", name: "Beginner Oval", multiplier: 1, unlockCost: 0 },
  { id: "city", name: "City Circuit", multiplier: 2.5, unlockCost: 800 },
  { id: "desert", name: "Desert Raceway", multiplier: 6, unlockCost: 3500 },
  { id: "pro", name: "Professional Speedway", multiplier: 14, unlockCost: 12000 },
  { id: "future", name: "Futuristic Mega Track", multiplier: 35, unlockCost: 45000 },
];

const state = {
  money: 200,
  totalLaps: 0,
  cars: 1,
  speedLevel: 0,
  incomeLevel: 0,
  automationLevel: 0,
  currentTrackIndex: 0,
  unlockedTracks: 1,
  prestige: 0,
  lastSaved: Date.now(),
};

const moneyEl = document.getElementById("money");
const totalLapsEl = document.getElementById("total-laps");
const currentTrackEl = document.getElementById("current-track");
const prestigeEl = document.getElementById("prestige-level");
const lapTimeEl = document.getElementById("lap-time");
const carListEl = document.getElementById("car-list");
const trackListEl = document.getElementById("track-list");
const offlineSummaryEl = document.getElementById("offline-summary");
const trackCanvas = document.getElementById("track-canvas");
const trackContext = trackCanvas.getContext("2d");

const buyCarButton = document.getElementById("buy-car");
const speedButton = document.getElementById("upgrade-speed");
const incomeButton = document.getElementById("upgrade-income");
const automationButton = document.getElementById("upgrade-automation");
const prestigeButton = document.getElementById("prestige-reset");

const formatNumber = (value) => {
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return value.toFixed(0);
};

const calculateLapTime = () => {
  const baseLap = 4;
  const speedBonus = 1 + state.speedLevel * 0.12 + state.prestige * 0.05;
  return Math.max(0.6, baseLap / speedBonus);
};

const calculateLapIncome = () => {
  const track = tracks[state.currentTrackIndex];
  const incomeBonus = 1 + state.incomeLevel * 0.15 + state.prestige * 0.08;
  return track.multiplier * incomeBonus * 8;
};

const getCarCost = () => baseCarCost * Math.pow(1.35, state.cars - 1);
const getSpeedCost = () => baseSpeedUpgradeCost * Math.pow(1.6, state.speedLevel);
const getIncomeCost = () => baseIncomeUpgradeCost * Math.pow(1.6, state.incomeLevel);
const getAutomationCost = () => baseAutomationCost * Math.pow(2.1, state.automationLevel);

const save = () => {
  state.lastSaved = Date.now();
  localStorage.setItem(storageKey, JSON.stringify(state));
};

const load = () => {
  const stored = localStorage.getItem(storageKey);
  if (!stored) return;
  const parsed = JSON.parse(stored);
  Object.assign(state, parsed);
};

const applyOfflineProgress = () => {
  const now = Date.now();
  const diffMs = now - state.lastSaved;
  const maxMs = maxOfflineHours * 60 * 60 * 1000;
  const clampedMs = Math.min(diffMs, maxMs);
  const lapTime = calculateLapTime();
  const laps = Math.floor(clampedMs / 1000 / lapTime) * state.cars;
  if (laps > 0) {
    const earnings = laps * calculateLapIncome();
    state.money += earnings;
    state.totalLaps += laps;
    offlineSummaryEl.textContent = `You were away for ${Math.floor(
      clampedMs / 1000 / 60
    )} minutes and earned ${formatNumber(earnings)}.`;
  } else {
    offlineSummaryEl.textContent = "No offline progress yet. Keep racing!";
  }
};

const renderCars = () => {
  carListEl.innerHTML = "";
  for (let i = 0; i < state.cars; i += 1) {
    const card = document.createElement("div");
    card.className = "card";
    const lapTime = calculateLapTime();
    const income = calculateLapIncome();
    card.innerHTML = `
      <div>
        <h3>Car ${i + 1}</h3>
        <p>Lap time: ${lapTime.toFixed(2)}s · Income: ${formatNumber(
          income
        )}/lap</p>
      </div>
      <span class="pill">Active</span>
    `;
    carListEl.appendChild(card);
  }
};

const renderTracks = () => {
  trackListEl.innerHTML = "";
  tracks.forEach((track, index) => {
    const card = document.createElement("div");
    card.className = "card";
    const unlocked = index < state.unlockedTracks;
    const isActive = index === state.currentTrackIndex;
    const buttonLabel = isActive ? "Active" : unlocked ? "Select" : "Unlock";

    const button = document.createElement("button");
    button.textContent = buttonLabel;
    button.disabled = isActive;
    button.addEventListener("click", () => {
      if (unlocked) {
        state.currentTrackIndex = index;
      } else if (state.money >= track.unlockCost) {
        state.money -= track.unlockCost;
        state.unlockedTracks = index + 1;
        state.currentTrackIndex = index;
      }
      render();
      save();
    });

    card.innerHTML = `
      <div>
        <h3>${track.name}</h3>
        <p>Multiplier: x${track.multiplier} · Unlock: ${formatNumber(
      track.unlockCost
    )}</p>
      </div>
    `;
    card.appendChild(button);
    trackListEl.appendChild(card);
  });
};

const renderButtons = () => {
  buyCarButton.textContent = `Buy New Car (${formatNumber(getCarCost())})`;
  speedButton.textContent = `Upgrade (${formatNumber(getSpeedCost())})`;
  incomeButton.textContent = `Upgrade (${formatNumber(getIncomeCost())})`;
  automationButton.textContent = `Upgrade (${formatNumber(
    getAutomationCost()
  )})`;

  buyCarButton.disabled = state.money < getCarCost();
  speedButton.disabled = state.money < getSpeedCost();
  incomeButton.disabled = state.money < getIncomeCost();
  automationButton.disabled = state.money < getAutomationCost();
};

const render = () => {
  moneyEl.textContent = formatNumber(state.money);
  totalLapsEl.textContent = formatNumber(state.totalLaps);
  currentTrackEl.textContent = tracks[state.currentTrackIndex].name;
  prestigeEl.textContent = state.prestige;
  lapTimeEl.textContent = `${calculateLapTime().toFixed(2)}s`;

  renderCars();
  renderTracks();
  renderButtons();
};

const resizeCanvas = () => {
  const { width, height } = trackCanvas.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  trackCanvas.width = Math.floor(width * scale);
  trackCanvas.height = Math.floor(height * scale);
  trackContext.setTransform(scale, 0, 0, scale, 0, 0);
};

const drawTrack = (timestamp) => {
  const { width, height } = trackCanvas.getBoundingClientRect();
  trackContext.clearRect(0, 0, width, height);

  const centerX = width / 2;
  const centerY = height / 2;
  const radiusX = width * 0.35;
  const radiusY = height * 0.28;

  trackContext.strokeStyle = "rgba(90, 140, 255, 0.35)";
  trackContext.lineWidth = 6;
  trackContext.beginPath();
  trackContext.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
  trackContext.stroke();

  const lapTime = calculateLapTime();
  const baseAngle = (timestamp / 1000 / lapTime) * Math.PI * 2;

  for (let i = 0; i < state.cars; i += 1) {
    const angle = baseAngle + (i * Math.PI * 2) / state.cars;
    const carX = centerX + Math.cos(angle) * radiusX;
    const carY = centerY + Math.sin(angle) * radiusY;
    trackContext.fillStyle = `hsl(${(i * 60) % 360}, 80%, 60%)`;
    trackContext.beginPath();
    trackContext.arc(carX, carY, 6, 0, Math.PI * 2);
    trackContext.fill();
  }

  requestAnimationFrame(drawTrack);
};

const autoBuy = () => {
  if (state.automationLevel === 0) return;
  const targets = [
    { cost: getSpeedCost, action: () => (state.speedLevel += 1) },
    { cost: getIncomeCost, action: () => (state.incomeLevel += 1) },
  ];
  targets.forEach((target) => {
    if (state.money >= target.cost()) {
      state.money -= target.cost();
      target.action();
    }
  });
};

const tick = () => {
  const lapIncome = calculateLapIncome();
  const lapTime = calculateLapTime();
  const lapsThisTick = (1 / lapTime) * state.cars;
  state.money += lapsThisTick * lapIncome;
  state.totalLaps += lapsThisTick;
  autoBuy();
  render();
};

buyCarButton.addEventListener("click", () => {
  const cost = getCarCost();
  if (state.money >= cost) {
    state.money -= cost;
    state.cars += 1;
    render();
    save();
  }
});

speedButton.addEventListener("click", () => {
  const cost = getSpeedCost();
  if (state.money >= cost) {
    state.money -= cost;
    state.speedLevel += 1;
    render();
    save();
  }
});

incomeButton.addEventListener("click", () => {
  const cost = getIncomeCost();
  if (state.money >= cost) {
    state.money -= cost;
    state.incomeLevel += 1;
    render();
    save();
  }
});

automationButton.addEventListener("click", () => {
  const cost = getAutomationCost();
  if (state.money >= cost) {
    state.money -= cost;
    state.automationLevel += 1;
    render();
    save();
  }
});

prestigeButton.addEventListener("click", () => {
  const bonus = Math.max(1, Math.floor(state.totalLaps / 5000));
  state.prestige += bonus;
  state.money = 0;
  state.totalLaps = 0;
  state.cars = 1;
  state.speedLevel = 0;
  state.incomeLevel = 0;
  state.automationLevel = 0;
  state.currentTrackIndex = 0;
  state.unlockedTracks = 1;
  render();
  save();
});

load();
resizeCanvas();
window.addEventListener("resize", resizeCanvas);
applyOfflineProgress();
render();

setInterval(tick, 1000);
setInterval(save, 5000);
requestAnimationFrame(drawTrack);
