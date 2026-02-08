const storageKey = "car-revolutions-save";
const accountKey = "car-revolutions-account";
const maxOfflineHours = 8;
const googleSheetEndpoint = "";
const googleSheetUrl =
  "https://docs.google.com/spreadsheets/d/139cyi66IfTqUk8hShsivaWR4MA2Pck0a6qGTLZ7F7Nw/edit?usp=sharing";

const baseCarCost = 50;
const baseCarSpeedUpgradeCost = 60;
const baseCarIncomeUpgradeCost = 70;
const baseCarGasUpgradeCost = 80;

const tracks = [
  { id: "beginner", name: "Beginner Oval", multiplier: 1, unlockCost: 0 },
  { id: "city", name: "City Circuit", multiplier: 2.5, unlockCost: 800 },
  { id: "desert", name: "Desert Raceway", multiplier: 6, unlockCost: 3500 },
  { id: "pro", name: "Professional Speedway", multiplier: 14, unlockCost: 12000 },
  { id: "future", name: "Futuristic Mega Track", multiplier: 35, unlockCost: 45000 },
];

const state = {
  money: 0,
  totalLaps: 0,
  cars: [{ speedLevel: 0, incomeLevel: 0, gasLevel: 0, lapsRemaining: 0, lapProgress: 0 }],
  currentTrackIndex: 0,
  unlockedTracks: 1,
  prestige: 0,
  sharedLapActive: false,
  sharedLapProgress: 0,
  sharedLapDuration: 4,
  sharedLapParticipants: [],
  lastSaved: Date.now(),
};

const moneyEl = document.getElementById("money");
const totalLapsEl = document.getElementById("total-laps");
const currentTrackEl = document.getElementById("current-track");
const prestigeEl = document.getElementById("prestige-level");
const accountNameEl = document.getElementById("account-name");
const carListEl = document.getElementById("car-list");
const trackListEl = document.getElementById("track-list");
const offlineSummaryEl = document.getElementById("offline-summary");
const trackCanvas = document.getElementById("track-canvas");
const trackContext = trackCanvas.getContext("2d");

const buyCarButton = document.getElementById("buy-car");
const prestigeButton = document.getElementById("prestige-reset");
const carModal = document.getElementById("car-modal");
const carModalTitle = document.getElementById("car-modal-title");
const carModalStats = document.getElementById("car-modal-stats");
const closeModalButton = document.getElementById("close-modal");
const carSpeedUpgradeButton = document.getElementById("car-speed-upgrade");
const carIncomeUpgradeButton = document.getElementById("car-income-upgrade");
const carGasUpgradeButton = document.getElementById("car-gas-upgrade");
const syncNowButton = document.getElementById("sync-now");
const switchAccountButton = document.getElementById("switch-account");
const syncStatusEl = document.getElementById("sync-status");
const accountModal = document.getElementById("account-modal");
const accountInput = document.getElementById("account-input");
const saveAccountButton = document.getElementById("save-account");

let selectedCarIndex = null;
let lastFrameTime = null;
let account = null;

const formatNumber = (value) => {
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return value.toFixed(0);
};

const calculateLapTime = (car) => {
  const baseLap = 4;
  const carBonus = car.speedLevel * 0.12;
  const speedBonus = 1 + carBonus + state.prestige * 0.05;
  return Math.max(0.6, baseLap / speedBonus);
};

const calculateSharedLapTime = (participants) => {
  if (participants.length === 0) return 4;
  const baseLap = 4;
  const avgSpeed =
    participants.reduce((sum, index) => sum + state.cars[index].speedLevel, 0) /
    participants.length;
  const speedBonus = 1 + avgSpeed * 0.12 + state.prestige * 0.05;
  return Math.max(0.6, baseLap / speedBonus);
};

const calculateLapIncome = (car) => {
  const track = tracks[state.currentTrackIndex];
  const carBonus = car.incomeLevel * 0.15;
  const incomeBonus = 1 + carBonus + state.prestige * 0.08;
  return track.multiplier * incomeBonus * 8;
};

const getCarCost = () => baseCarCost * Math.pow(1.6, state.cars.length - 1);
const getCarSpeedCost = (car) =>
  baseCarSpeedUpgradeCost * Math.pow(1.7, car.speedLevel);
const getCarIncomeCost = (car) =>
  baseCarIncomeUpgradeCost * Math.pow(1.7, car.incomeLevel);
const getCarGasCost = (car) => baseCarGasUpgradeCost * Math.pow(1.75, car.gasLevel);

const save = () => {
  state.lastSaved = Date.now();
  localStorage.setItem(storageKey, JSON.stringify(state));
};

const load = () => {
  const stored = localStorage.getItem(storageKey);
  if (!stored) return;
  try {
    const parsed = JSON.parse(stored);
    Object.assign(state, parsed);
  } catch (error) {
    console.warn("Failed to parse save data, starting fresh.", error);
  }
};

const saveAccount = (data) => {
  account = data;
  localStorage.setItem(accountKey, JSON.stringify(data));
  accountNameEl.textContent = data?.name || "Unknown";
};

const loadAccount = () => {
  const stored = localStorage.getItem(accountKey);
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch (error) {
    console.warn("Failed to parse account data.", error);
    return null;
  }
};

const openAccountModal = () => {
  accountModal.classList.remove("hidden");
  accountModal.setAttribute("aria-hidden", "false");
  accountInput.value = account?.name || "";
  accountInput.focus();
};

const closeAccountModal = () => {
  accountModal.classList.add("hidden");
  accountModal.setAttribute("aria-hidden", "true");
};

const normalizeState = () => {
  state.money = Number(state.money) || 0;
  state.totalLaps = Number(state.totalLaps) || 0;
  state.currentTrackIndex = Number(state.currentTrackIndex) || 0;
  state.unlockedTracks = Number(state.unlockedTracks) || 1;
  state.prestige = Number(state.prestige) || 0;
  if (!Array.isArray(state.cars)) {
    const count = Math.max(1, Number(state.cars) || 1);
    state.cars = Array.from({ length: count }, () => ({
      speedLevel: 0,
      incomeLevel: 0,
      gasLevel: 0,
      lapsRemaining: 0,
      lapProgress: 0,
    }));
  } else {
    state.cars = state.cars.map((car) => ({
      speedLevel: car.speedLevel || 0,
      incomeLevel: car.incomeLevel || 0,
      gasLevel: car.gasLevel || 0,
      lapsRemaining: car.lapsRemaining || 0,
      lapProgress: car.lapProgress || 0,
    }));
  }
  if (state.cars.length === 0) {
    state.cars = [
      { speedLevel: 0, incomeLevel: 0, gasLevel: 0, lapsRemaining: 0, lapProgress: 0 },
    ];
  }
  const maxTrackIndex = tracks.length - 1;
  state.currentTrackIndex = Math.min(Math.max(state.currentTrackIndex, 0), maxTrackIndex);
  state.unlockedTracks = Math.min(Math.max(state.unlockedTracks, 1), tracks.length);
  state.sharedLapActive = Boolean(state.sharedLapActive);
  state.sharedLapProgress = Number(state.sharedLapProgress) || 0;
  state.sharedLapDuration = Number(state.sharedLapDuration) || 4;
  state.sharedLapParticipants = Array.isArray(state.sharedLapParticipants)
    ? state.sharedLapParticipants.filter((index) => index >= 0 && index < state.cars.length)
    : [];
  if (state.sharedLapParticipants.length === 0) {
    state.sharedLapActive = false;
    state.sharedLapProgress = 0;
  }
};

const setSyncStatus = (message, isError = false) => {
  syncStatusEl.textContent = message;
  syncStatusEl.style.color = isError ? "#ff9d9d" : "";
};

const syncToSheet = async () => {
  if (!googleSheetEndpoint) {
    setSyncStatus(`Cloud sync not configured. Add an Apps Script endpoint for ${googleSheetUrl}.`);
    return;
  }
  if (!account) {
    setSyncStatus("Create an account before syncing.", true);
    openAccountModal();
    return;
  }
  setSyncStatus("Syncing...");
  try {
    const response = await fetch(googleSheetEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "save",
        account,
        savedAt: new Date().toISOString(),
        state,
      }),
    });
    if (!response.ok) {
      throw new Error(`Sync failed: ${response.status}`);
    }
    setSyncStatus("Sync complete.");
  } catch (error) {
    setSyncStatus("Sync failed. Check the Apps Script endpoint.", true);
    console.error(error);
  }
};

const loadFromSheet = async () => {
  if (!googleSheetEndpoint || !account?.id) return;
  try {
    const response = await fetch(
      `${googleSheetEndpoint}?action=load&id=${encodeURIComponent(account.id)}`
    );
    if (!response.ok) return;
    const data = await response.json();
    if (data?.state) {
      Object.assign(state, data.state);
      normalizeState();
      render();
      save();
      setSyncStatus("Loaded cloud save.");
    }
  } catch (error) {
    console.error(error);
  }
};
const applyOfflineProgress = () => {
  const now = Date.now();
  const diffMs = now - state.lastSaved;
  const maxMs = maxOfflineHours * 60 * 60 * 1000;
  const clampedMs = Math.min(diffMs, maxMs);
  const laps = state.cars.reduce((sum, car) => {
    if (car.lapsRemaining <= 0) return sum;
    const carLapTime = calculateLapTime(car);
    return sum + Math.min(car.lapsRemaining, Math.floor(clampedMs / 1000 / carLapTime));
  }, 0);
  if (laps > 0) {
    const earnings = state.cars.reduce((sum, car) => {
      if (car.lapsRemaining <= 0) return sum;
      const carLapTime = calculateLapTime(car);
      const carLaps = Math.min(car.lapsRemaining, Math.floor(clampedMs / 1000 / carLapTime));
      return sum + carLaps * calculateLapIncome(car);
    }, 0);
    state.money += earnings;
    state.totalLaps += laps;
    state.cars.forEach((car) => {
      if (car.lapsRemaining > 0) {
        const carLapTime = calculateLapTime(car);
        const carLaps = Math.min(
          car.lapsRemaining,
          Math.floor(clampedMs / 1000 / carLapTime)
        );
        car.lapsRemaining -= carLaps;
        car.lapProgress = 0;
      }
    });
    offlineSummaryEl.textContent = `You were away for ${Math.floor(
      clampedMs / 1000 / 60
    )} minutes and earned ${formatNumber(earnings)}.`;
  } else {
    offlineSummaryEl.textContent = "No offline progress yet. Keep racing!";
  }
};

const renderCars = () => {
  carListEl.innerHTML = "";
  state.cars.forEach((car, index) => {
    const card = document.createElement("div");
    card.className = "card clickable";
    const lapTime = calculateLapTime(car);
    const income = calculateLapIncome(car);
    card.innerHTML = `
      <div>
        <h3>Car ${index + 1}</h3>
        <p>Lap time: ${lapTime.toFixed(2)}s · Income: ${formatNumber(
          income
        )}/lap</p>
        <p>Speed Lv. ${car.speedLevel} · Income Lv. ${car.incomeLevel} · Gas Lv. ${car.gasLevel}</p>
        <p>Queued laps: ${car.lapsRemaining}</p>
      </div>
      <div class="card-actions">
        <button class="small settings" type="button">Settings</button>
      </div>
    `;
    const settingsButton = card.querySelector(".settings");
    card.addEventListener("click", () => {
      car.lapsRemaining += 1 + car.gasLevel;
      render();
      save();
    });
    settingsButton.addEventListener("click", (event) => {
      event.stopPropagation();
      settingsButton.blur();
      openCarModal(index);
    });
    carListEl.appendChild(card);
  });
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

  buyCarButton.disabled = state.money < getCarCost();
};

const getFastestLapTime = () =>
  Math.min(...state.cars.map((car) => calculateLapTime(car)));

const render = () => {
  moneyEl.textContent = formatNumber(state.money);
  totalLapsEl.textContent = formatNumber(state.totalLaps);
  currentTrackEl.textContent = tracks[state.currentTrackIndex].name;
  prestigeEl.textContent = state.prestige;
  accountNameEl.textContent = account?.name || "Not signed in";

  renderCars();
  renderTracks();
  renderButtons();
};

const openCarModal = (index) => {
  selectedCarIndex = index;
  const car = state.cars[index];
  if (!car) return;
  carModalTitle.textContent = `Car ${index + 1} Settings`;
  carModalStats.textContent = `Speed Lv. ${car.speedLevel} · Income Lv. ${car.incomeLevel} · Gas Lv. ${car.gasLevel}`;

  const speedCost = getCarSpeedCost(car);
  const incomeCost = getCarIncomeCost(car);
  const gasCost = getCarGasCost(car);

  carSpeedUpgradeButton.textContent = `Upgrade (${formatNumber(speedCost)})`;
  carIncomeUpgradeButton.textContent = `Upgrade (${formatNumber(incomeCost)})`;
  carGasUpgradeButton.textContent = `Upgrade (${formatNumber(gasCost)})`;

  carSpeedUpgradeButton.disabled = state.money < speedCost;
  carIncomeUpgradeButton.disabled = state.money < incomeCost;
  carGasUpgradeButton.disabled = state.money < gasCost;

  carModal.classList.remove("hidden");
  carModal.setAttribute("aria-hidden", "false");
};

const closeCarModal = () => {
  selectedCarIndex = null;
  carModal.classList.add("hidden");
  carModal.setAttribute("aria-hidden", "true");
};

const resizeCanvas = () => {
  const { width, height } = trackCanvas.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  trackCanvas.width = Math.floor(width * scale);
  trackCanvas.height = Math.floor(height * scale);
  trackContext.setTransform(scale, 0, 0, scale, 0, 0);
};

const drawTrack = (timestamp) => {
  if (!trackContext) return;
  advanceSharedLap(timestamp);
  const { width, height } = trackCanvas.getBoundingClientRect();
  trackContext.clearRect(0, 0, width, height);

  const trackStyleMap = {
    beginner: {
      outer: "rgba(90, 140, 255, 0.4)",
      inner: "rgba(120, 180, 255, 0.25)",
      glow: "rgba(70, 120, 240, 0.15)",
      lane: "rgba(140, 190, 255, 0.5)",
    },
    city: {
      outer: "rgba(180, 90, 255, 0.45)",
      inner: "rgba(210, 140, 255, 0.25)",
      glow: "rgba(160, 80, 230, 0.18)",
      lane: "rgba(240, 180, 255, 0.55)",
    },
    desert: {
      outer: "rgba(255, 160, 90, 0.5)",
      inner: "rgba(255, 190, 120, 0.25)",
      glow: "rgba(220, 120, 60, 0.18)",
      lane: "rgba(255, 210, 160, 0.55)",
    },
    pro: {
      outer: "rgba(90, 220, 140, 0.45)",
      inner: "rgba(120, 250, 180, 0.25)",
      glow: "rgba(60, 190, 120, 0.18)",
      lane: "rgba(180, 255, 220, 0.55)",
    },
    future: {
      outer: "rgba(90, 240, 255, 0.5)",
      inner: "rgba(140, 255, 255, 0.25)",
      glow: "rgba(60, 210, 230, 0.2)",
      lane: "rgba(200, 255, 255, 0.6)",
    },
  };

  const trackStyle = trackStyleMap[tracks[state.currentTrackIndex].id];

  const centerX = width / 2;
  const centerY = height / 2;
  const radiusX = width * 0.35;
  const radiusY = height * 0.28;

  const glowGradient = trackContext.createRadialGradient(
    centerX,
    centerY,
    10,
    centerX,
    centerY,
    radiusX * 1.2
  );
  glowGradient.addColorStop(0, trackStyle.glow);
  glowGradient.addColorStop(1, "rgba(0, 0, 0, 0)");
  trackContext.fillStyle = glowGradient;
  trackContext.fillRect(0, 0, width, height);

  trackContext.strokeStyle = trackStyle.outer;
  trackContext.lineWidth = 6;
  trackContext.beginPath();
  trackContext.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
  trackContext.stroke();

  trackContext.strokeStyle = trackStyle.inner;
  trackContext.lineWidth = 2;
  trackContext.beginPath();
  trackContext.ellipse(centerX, centerY, radiusX * 0.78, radiusY * 0.78, 0, 0, Math.PI * 2);
  trackContext.stroke();

  trackContext.strokeStyle = trackStyle.lane;
  trackContext.lineWidth = 3;
  trackContext.beginPath();
  trackContext.moveTo(centerX + radiusX, centerY);
  trackContext.lineTo(centerX + radiusX * 0.88, centerY);
  trackContext.stroke();

  state.cars.forEach((car, index) => {
    const delayFraction = (index / Math.max(state.cars.length, 1)) * 0.18;
    const lapProgress = car.lapsRemaining > 0 ? car.lapProgress : 0;
    const progress = (lapProgress - delayFraction + 1) % 1;
    const angle = progress * Math.PI * 2;
    const carX = centerX + Math.cos(angle) * radiusX;
    const carY = centerY + Math.sin(angle) * radiusY;
    trackContext.fillStyle = car.lapsRemaining > 0
      ? `hsl(${(index * 60) % 360}, 80%, 60%)`
      : "rgba(140, 150, 170, 0.6)";
    trackContext.beginPath();
    trackContext.arc(carX, carY, 6, 0, Math.PI * 2);
    trackContext.fill();
  });

  requestAnimationFrame(drawTrack);
};

const startSharedLap = () => {
  const participants = state.cars
    .map((car, index) => (car.lapsRemaining > 0 ? index : null))
    .filter((value) => value !== null);

  if (participants.length === 0) {
    state.sharedLapActive = false;
    state.sharedLapParticipants = [];
    state.sharedLapProgress = 0;
    return;
  }

  state.sharedLapParticipants = participants;
  state.sharedLapDuration = calculateSharedLapTime(participants);
  state.sharedLapProgress = 0;
  state.sharedLapActive = true;
};

const advanceSharedLap = (timestamp) => {
  if (lastFrameTime === null) {
    lastFrameTime = timestamp;
    return;
  }

  const deltaSeconds = Math.min((timestamp - lastFrameTime) / 1000, 0.2);
  lastFrameTime = timestamp;

  let earnedIncome = 0;
  let earnedLaps = 0;

  state.cars.forEach((car) => {
    if (car.lapsRemaining <= 0) {
      car.lapProgress = 0;
      return;
    }
    const lapTime = calculateLapTime(car);
    car.lapProgress += deltaSeconds / Math.max(lapTime, 0.6);
    while (car.lapProgress >= 1 && car.lapsRemaining > 0) {
      car.lapProgress -= 1;
      car.lapsRemaining -= 1;
      earnedLaps += 1;
      earnedIncome += calculateLapIncome(car);
    }
  });

  if (earnedLaps > 0) {
    state.money += earnedIncome;
    state.totalLaps += earnedLaps;
    render();
  }
};

buyCarButton.addEventListener("click", () => {
  const cost = getCarCost();
  if (state.money >= cost) {
    state.money -= cost;
    state.cars.push({
      speedLevel: 0,
      incomeLevel: 0,
      gasLevel: 0,
      lapsRemaining: 0,
      lapProgress: 0,
    });
    render();
    save();
  }
});

closeModalButton.addEventListener("click", closeCarModal);
carModal.addEventListener("click", (event) => {
  if (event.target === carModal) {
    closeCarModal();
  }
});

accountModal.addEventListener("click", (event) => {
  if (event.target === accountModal) {
    closeAccountModal();
  }
});

saveAccountButton.addEventListener("click", () => {
  const name = accountInput.value.trim();
  if (!name) return;
  const id = account?.id || (crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}`);
  saveAccount({ id, name, createdAt: account?.createdAt || new Date().toISOString() });
  closeAccountModal();
  loadFromSheet();
});

syncNowButton.addEventListener("click", () => {
  syncToSheet();
});

switchAccountButton.addEventListener("click", () => {
  openAccountModal();
});

carSpeedUpgradeButton.addEventListener("click", () => {
  const car = state.cars[selectedCarIndex];
  if (!car) return;
  const cost = getCarSpeedCost(car);
  if (state.money >= cost) {
    state.money -= cost;
    car.speedLevel += 1;
    openCarModal(selectedCarIndex);
    render();
    save();
  }
});

carIncomeUpgradeButton.addEventListener("click", () => {
  const car = state.cars[selectedCarIndex];
  if (!car) return;
  const cost = getCarIncomeCost(car);
  if (state.money >= cost) {
    state.money -= cost;
    car.incomeLevel += 1;
    openCarModal(selectedCarIndex);
    render();
    save();
  }
});

carGasUpgradeButton.addEventListener("click", () => {
  const car = state.cars[selectedCarIndex];
  if (!car) return;
  const cost = getCarGasCost(car);
  if (state.money >= cost) {
    state.money -= cost;
    car.gasLevel += 1;
    openCarModal(selectedCarIndex);
    render();
    save();
  }
});

prestigeButton.addEventListener("click", () => {
  const bonus = Math.max(1, Math.floor(state.totalLaps / 5000));
  state.prestige += bonus;
  state.money = 0;
  state.totalLaps = 0;
  state.cars = [{ speedLevel: 0, incomeLevel: 0, gasLevel: 0, lapsRemaining: 0, lapProgress: 0 }];
  state.currentTrackIndex = 0;
  state.unlockedTracks = 1;
  render();
  save();
});

load();
normalizeState();
account = loadAccount();
if (!account) {
  openAccountModal();
} else {
  accountNameEl.textContent = account.name;
}
resizeCanvas();
window.addEventListener("resize", resizeCanvas);
applyOfflineProgress();
render();
setSyncStatus(
  googleSheetEndpoint
    ? "Cloud sync ready. Use Sync Now to save."
    : `Cloud sync not configured. Add an Apps Script endpoint for ${googleSheetUrl}.`
);
loadFromSheet();

setInterval(save, 5000);
requestAnimationFrame(drawTrack);
