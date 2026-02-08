const storageKey = "car-revolutions-save";
const maxOfflineHours = 8;

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
const prestigeButton = document.getElementById("prestige-reset");
const carModal = document.getElementById("car-modal");
const carModalTitle = document.getElementById("car-modal-title");
const carModalStats = document.getElementById("car-modal-stats");
const closeModalButton = document.getElementById("close-modal");
const carSpeedUpgradeButton = document.getElementById("car-speed-upgrade");
const carIncomeUpgradeButton = document.getElementById("car-income-upgrade");
const carGasUpgradeButton = document.getElementById("car-gas-upgrade");

let selectedCarIndex = null;

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
  const parsed = JSON.parse(stored);
  Object.assign(state, parsed);
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
  const fastestLap = getFastestLapTime();
  lapTimeEl.textContent = `${fastestLap.toFixed(2)}s`;

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

  const lapTime = getFastestLapTime();
  const baseAngle = (timestamp / 1000 / lapTime) * Math.PI * 2;

  state.cars.forEach((car, index) => {
    const isActive = car.lapsRemaining > 0;
    const angleOffset = (index * Math.PI * 2) / state.cars.length;
    const angle = isActive ? baseAngle + angleOffset : angleOffset;
    const carX = centerX + Math.cos(angle) * radiusX;
    const carY = centerY + Math.sin(angle) * radiusY;
    trackContext.fillStyle = isActive
      ? `hsl(${(index * 60) % 360}, 80%, 60%)`
      : "rgba(140, 150, 170, 0.6)";
    trackContext.beginPath();
    trackContext.arc(carX, carY, 6, 0, Math.PI * 2);
    trackContext.fill();
  });

  requestAnimationFrame(drawTrack);
};

const tick = () => {
  let earnedIncome = 0;
  let earnedLaps = 0;
  state.cars.forEach((car) => {
    if (car.lapsRemaining <= 0) return;
    const lapTime = calculateLapTime(car);
    car.lapProgress += 1 / lapTime;
    if (car.lapProgress >= 1) {
      const completedLaps = Math.floor(car.lapProgress);
      const usableLaps = Math.min(completedLaps, car.lapsRemaining);
      car.lapsRemaining -= usableLaps;
      car.lapProgress -= completedLaps;
      earnedLaps += usableLaps;
      earnedIncome += usableLaps * calculateLapIncome(car);
    }
  });
  state.money += earnedIncome;
  state.totalLaps += earnedLaps;
  render();
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
resizeCanvas();
window.addEventListener("resize", resizeCanvas);
applyOfflineProgress();
render();

setInterval(tick, 1000);
setInterval(save, 5000);
requestAnimationFrame(drawTrack);
