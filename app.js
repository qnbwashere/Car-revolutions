// ==============================
// CONFIG
// ==============================

const storageKey = "car-revolutions-save";
const accountKey = "car-revolutions-account";
const maxOfflineHours = 8;

const googleSheetEndpoint =
  "https://script.google.com/macros/s/AKfycbzlwqIb2NhanoTlFm1hAf_biRO1f7IbYxT2uFXYESrE1C6ink9pkeqZl4DpG3NCMjia/exec";

// ==============================
// GAME DATA
// ==============================

const tracks = [
  { id: "beginner", name: "Beginner Oval", multiplier: 1, unlockCost: 0 },
  { id: "city", name: "City Circuit", multiplier: 2.5, unlockCost: 800 },
  { id: "desert", name: "Desert Raceway", multiplier: 6, unlockCost: 3500 },
  { id: "pro", name: "Professional Speedway", multiplier: 14, unlockCost: 12000 },
  { id: "future", name: "Futuristic Mega Track", multiplier: 35, unlockCost: 45000 },
];

const baseCarCost = 50;

const state = {
  money: 0,
  totalLaps: 0,
  prestige: 0,
  currentTrackIndex: 0,
  unlockedTracks: 1,
  cars: [
    { speedLevel: 0, incomeLevel: 0, gasLevel: 0, lapsRemaining: 0, lapProgress: 0 }
  ],
  lastSaved: Date.now(),
};

// ==============================
// DOM
// ==============================

const moneyEl = document.getElementById("money");
const totalLapsEl = document.getElementById("total-laps");
const prestigeEl = document.getElementById("prestige-level");
const currentTrackEl = document.getElementById("current-track");
const carListEl = document.getElementById("car-list");
const trackListEl = document.getElementById("track-list");
const buyCarButton = document.getElementById("buy-car");
const prestigeButton = document.getElementById("prestige-reset");
const syncButton = document.getElementById("sync-now");
const syncStatusEl = document.getElementById("sync-status");
const accountNameEl = document.getElementById("account-name");
const leaderboardEl = document.getElementById("leaderboard");

// ==============================
// UTILS
// ==============================

const format = (n) => {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return Math.floor(n);
};

const lapTime = (car) =>
  Math.max(0.6, 4 / (1 + car.speedLevel * 0.12 + state.prestige * 0.05));

const lapIncome = (car) =>
  tracks[state.currentTrackIndex].multiplier *
  (1 + car.incomeLevel * 0.15 + state.prestige * 0.08) *
  8;

// ==============================
// SAVE SYSTEM
// ==============================

function saveLocal() {
  state.lastSaved = Date.now();
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function loadLocal() {
  const saved = localStorage.getItem(storageKey);
  if (!saved) return;
  Object.assign(state, JSON.parse(saved));
}

// ==============================
// CLOUD
// ==============================

let account = JSON.parse(localStorage.getItem(accountKey));

function setSyncStatus(msg, err = false) {
  syncStatusEl.textContent = msg;
  syncStatusEl.style.color = err ? "#ff9d9d" : "";
}

async function syncToCloud() {
  if (!account) return setSyncStatus("No account.", true);

  setSyncStatus("Syncing...");

  try {
    const res = await fetch(googleSheetEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "save",
        account,
        state
      }),
    });

    if (!res.ok) throw new Error();

    setSyncStatus("Synced.");
  } catch {
    setSyncStatus("Sync failed.", true);
  }
}

async function loadFromCloud() {
  if (!account) return;

  try {
    const res = await fetch(
      `${googleSheetEndpoint}?action=load&id=${account.id}`
    );
    const data = await res.json();
    if (data.state) {
      Object.assign(state, data.state);
      render();
      saveLocal();
    }
  } catch {}
}

async function loadLeaderboard() {
  try {
    const res = await fetch(
      `${googleSheetEndpoint}?action=leaderboard`
    );
    const data = await res.json();
    if (!data.leaderboard) return;

    leaderboardEl.innerHTML = data.leaderboard
      .map(
        (p, i) => `
        <div class="card">
          <div>
            <strong>#${i + 1} ${p.name}</strong>
            <p>Prestige: ${p.prestige} · Laps: ${format(p.totalLaps)}</p>
          </div>
        </div>`
      )
      .join("");
  } catch {}
}

// ==============================
// GAME LOOP
// ==============================

function update(delta) {
  state.cars.forEach((car) => {
    if (car.lapsRemaining <= 0) return;

    car.lapProgress += delta / lapTime(car);

    while (car.lapProgress >= 1 && car.lapsRemaining > 0) {
      car.lapProgress -= 1;
      car.lapsRemaining--;
      state.money += lapIncome(car);
      state.totalLaps++;
    }
  });
}

let last = performance.now();
function loop(now) {
  const delta = Math.min((now - last) / 1000, 0.2);
  last = now;

  update(delta);
  render();
  requestAnimationFrame(loop);
}

// ==============================
// RENDER
// ==============================

function render() {
  moneyEl.textContent = format(state.money);
  totalLapsEl.textContent = format(state.totalLaps);
  prestigeEl.textContent = state.prestige;
  currentTrackEl.textContent = tracks[state.currentTrackIndex].name;
  accountNameEl.textContent = account?.name || "Not signed in";

  renderCars();
  renderTracks();
}

function renderCars() {
  carListEl.innerHTML = "";

  state.cars.forEach((car, i) => {
    const div = document.createElement("div");
    div.className = "card clickable";
    div.innerHTML = `
      <div>
        <h3>Car ${i + 1}</h3>
        <p>Lap: ${lapTime(car).toFixed(2)}s · ${format(lapIncome(car))}/lap</p>
        <p>Speed ${car.speedLevel} · Income ${car.incomeLevel}</p>
      </div>
    `;
    div.onclick = () => {
      car.lapsRemaining += 1 + car.gasLevel;
      saveLocal();
    };
    carListEl.appendChild(div);
  });
}

function renderTracks() {
  trackListEl.innerHTML = "";

  tracks.forEach((track, i) => {
    const div = document.createElement("div");
    div.className = "card";

    div.innerHTML = `
      <div>
        <h3>${track.name}</h3>
        <p>x${track.multiplier} · ${format(track.unlockCost)}</p>
      </div>
    `;

    div.onclick = () => {
      if (i < state.unlockedTracks) {
        state.currentTrackIndex = i;
      } else if (state.money >= track.unlockCost) {
        state.money -= track.unlockCost;
        state.unlockedTracks = i + 1;
        state.currentTrackIndex = i;
      }
      saveLocal();
    };

    trackListEl.appendChild(div);
  });
}

// ==============================
// EVENTS
// ==============================

buyCarButton.onclick = () => {
  const cost = baseCarCost * Math.pow(1.6, state.cars.length - 1);
  if (state.money < cost) return;

  state.money -= cost;
  state.cars.push({
    speedLevel: 0,
    incomeLevel: 0,
    gasLevel: 0,
    lapsRemaining: 0,
    lapProgress: 0,
  });
  saveLocal();
};

prestigeButton.onclick = () => {
  const bonus = Math.max(1, Math.floor(state.totalLaps / 5000));
  state.prestige += bonus;
  state.money = 0;
  state.totalLaps = 0;
  state.cars = [{ speedLevel: 0, incomeLevel: 0, gasLevel: 0, lapsRemaining: 0, lapProgress: 0 }];
  state.currentTrackIndex = 0;
  state.unlockedTracks = 1;
  saveLocal();
};

syncButton.onclick = syncToCloud;

// ==============================
// STARTUP
// ==============================

loadLocal();
render();
loadFromCloud();
loadLeaderboard();

setInterval(saveLocal, 5000);
setInterval(syncToCloud, 30000);
setInterval(loadLeaderboard, 60000);

requestAnimationFrame(loop);
