import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBbbkngVD_ReaCA9sOhL5hSmxpDu2dZJ0w",
  authDomain: "delivery-statistics.firebaseapp.com",
  projectId: "delivery-statistics",
  storageBucket: "delivery-statistics.firebasestorage.app",
  messagingSenderId: "739051231722",
  appId: "1:739051231722:web:927a5b615faa06e14ffa93",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const setupRef = doc(db, "settings", "app");

const legacyTripKeys = ["delivery-trips-v3", "delivery-trips-v2", "delivery-trips-v1"];
const legacyDirectoryKeys = {
  driver: "delivery-drivers-v1",
  vehicle: "delivery-vehicles-v1",
  store: "delivery-stores-v1",
};
const defaultRate = 700;
const fuelLitersPer100Km = 16;
const categories = {
  store: "Магазини",
  wholesale: "Оптові доставки",
};

const defaults = {
  drivers: ["Андрій", "Сергій"],
  vehicles: ["Renault Kangoo AA1234AA", "Volkswagen Caddy BB5678BB"],
  stores: ["Сільпо Оболонь", "АТБ Позняки"],
};

const moneyFormatter = new Intl.NumberFormat("uk-UA", {
  maximumFractionDigits: 0,
});
const fuelFormatter = new Intl.NumberFormat("uk-UA", {
  maximumFractionDigits: 2,
});

const refs = {
  trips: collection(db, "trips"),
  drivers: collection(db, "drivers"),
  vehicles: collection(db, "vehicles"),
  stores: collection(db, "stores"),
  weeklyReports: collection(db, "weeklyReports"),
};

const form = document.querySelector("#tripForm");
const rows = document.querySelector("#tripRows");
const rowTemplate = document.querySelector("#rowTemplate");
const emptyState = document.querySelector("#emptyState");
const search = document.querySelector("#search");
const monthFilter = document.querySelector("#monthFilter");
const printStats = document.querySelector("#printStats");
const importCsv = document.querySelector("#importCsv");
const importCsvFile = document.querySelector("#importCsvFile");
const liveCalc = document.querySelector("#liveCalc");
const formTitle = document.querySelector("#formTitle");
const formHint = document.querySelector("#formHint");
const submitButton = document.querySelector("#submitButton");
const cancelEdit = document.querySelector("#cancelEdit");
const driverReport = document.querySelector("#driverReport");
const storeReport = document.querySelector("#storeReport");
const vehicleReport = document.querySelector("#vehicleReport");
const driverReportCount = document.querySelector("#driverReportCount");
const storeReportCount = document.querySelector("#storeReportCount");
const vehicleReportCount = document.querySelector("#vehicleReportCount");
const driverDirectoryForm = document.querySelector("#driverDirectoryForm");
const vehicleDirectoryForm = document.querySelector("#vehicleDirectoryForm");
const storeDirectoryForm = document.querySelector("#storeDirectoryForm");
const driverName = document.querySelector("#driverName");
const vehicleName = document.querySelector("#vehicleName");
const storeName = document.querySelector("#storeName");
const driversList = document.querySelector("#driversList");
const vehiclesList = document.querySelector("#vehiclesList");
const storesList = document.querySelector("#storesList");
const driversCount = document.querySelector("#driversCount");
const vehiclesCount = document.querySelector("#vehiclesCount");
const storesCount = document.querySelector("#storesCount");
const folderButtons = document.querySelectorAll(".folder-button");
const storeFolderCount = document.querySelector("#storeFolderCount");
const wholesaleFolderCount = document.querySelector("#wholesaleFolderCount");
const recipientLabel = document.querySelector("#recipientLabel");
const weekPicker = document.querySelector("#weekPicker");
const saveWeeklyReport = document.querySelector("#saveWeeklyReport");
const weeklyReportList = document.querySelector("#weeklyReportList");
const weeklyReportHint = document.querySelector("#weeklyReportHint");
const periodStart = document.querySelector("#periodStart");
const periodEnd = document.querySelector("#periodEnd");
const savePeriodReport = document.querySelector("#savePeriodReport");
const completedReportDialog = document.querySelector("#completedReportDialog");
const completedReportTitle = document.querySelector("#completedReportTitle");
const completedReportContent = document.querySelector("#completedReportContent");
const closeCompletedReport = document.querySelector("#closeCompletedReport");

const totals = {
  trips: document.querySelector("#totalTrips"),
  deliveries: document.querySelector("#totalDeliveries"),
  km: document.querySelector("#totalKm"),
  money: document.querySelector("#totalMoney"),
  fuel: document.querySelector("#totalFuel"),
};

let trips = [];
let driverDocs = [];
let vehicleDocs = [];
let storeDocs = [];
let drivers = [];
let vehicles = [];
let stores = [];
let weeklyReports = [];
let editingId = null;
let hasLoadedRemote = false;
let activeCategory = "store";

function today() {
  return new Date().toISOString().slice(0, 10);
}

function createExampleTrips() {
  return [
    {
      id: crypto.randomUUID(),
      date: today(),
      driver: "Андрій",
      vehicle: "Renault Kangoo AA1234AA",
      store: "Сільпо Оболонь",
      route: "Склад - Сільпо Оболонь",
      kmStart: 124500,
      kmEnd: 124586,
      deliveries: 7,
      rate: defaultRate,
      category: "store",
      manualAmount: null,
      note: "Приклад",
    },
    {
      id: crypto.randomUUID(),
      date: today(),
      driver: "Сергій",
      vehicle: "Volkswagen Caddy BB5678BB",
      store: "АТБ Позняки",
      route: "Склад - АТБ Позняки",
      kmStart: 88210,
      kmEnd: 88264,
      deliveries: 5,
      rate: defaultRate,
      category: "store",
      manualAmount: null,
      note: "",
    },
  ];
}

function normalizeTrip(trip) {
  return {
    id: trip.id || crypto.randomUUID(),
    date: trip.date || today(),
    driver: String(trip.driver || "").trim(),
    vehicle: String(trip.vehicle || "Без авто").trim(),
    store: String(trip.store || "").trim(),
    route: String(trip.route || "").trim(),
    category: normalizeCategory(trip.category || trip.folder),
    kmStart: optionalNumber(trip.kmStart),
    kmEnd: optionalNumber(trip.kmEnd),
    deliveries: Number(trip.deliveries || 0),
    rate: Number(trip.rate || defaultRate),
    manualAmount: optionalNumber(trip.manualAmount),
    note: String(trip.note || "").trim(),
  };
}

function normalizeCategory(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "wholesale" || normalized.includes("оптов") ? "wholesale" : "store";
}

function categoryName(category) {
  return categories[normalizeCategory(category)];
}

function normalizeWeeklyReport(report) {
  return {
    id: report.id,
    type: report.type === "period" ? "period" : "week",
    week: String(report.week || ""),
    periodStart: String(report.periodStart || ""),
    periodEnd: String(report.periodEnd || ""),
    category: normalizeCategory(report.category),
    trips: Number(report.trips || 0),
    deliveries: Number(report.deliveries || 0),
    km: Number(report.km || 0),
    fuel: Number(report.fuel || 0),
    money: Number(report.money || 0),
    tripDetails: Array.isArray(report.tripDetails)
      ? report.tripDetails.map((trip) => ({
          date: String(trip.date || ""),
          driver: String(trip.driver || ""),
          vehicle: String(trip.vehicle || ""),
          store: String(trip.store || ""),
          route: String(trip.route || ""),
          kmStart: optionalNumber(trip.kmStart),
          kmEnd: optionalNumber(trip.kmEnd),
          km: Number(trip.km || 0),
          fuel: Number(trip.fuel || 0),
          deliveries: Number(trip.deliveries || 0),
          rate: Number(trip.rate || 0),
          money: Number(trip.money || 0),
          note: String(trip.note || ""),
        }))
      : [],
  };
}

function tripPayload(trip) {
  const normalized = normalizeTrip(trip);
  const { id, ...payload } = normalized;
  return {
    ...payload,
    updatedAt: serverTimestamp(),
  };
}

function loadLegacyTrips() {
  const saved = legacyTripKeys.map((key) => localStorage.getItem(key)).find(Boolean);
  if (!saved) {
    return [];
  }

  try {
    return JSON.parse(saved).map(normalizeTrip);
  } catch {
    return [];
  }
}

function loadLegacyDirectory(type) {
  const saved = localStorage.getItem(legacyDirectoryKeys[type]);
  if (!saved) {
    return [];
  }

  try {
    return JSON.parse(saved).map((name) => String(name || "").trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function uniqueNames(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "uk"),
  );
}

function directoryCollection(type) {
  if (type === "driver") {
    return refs.drivers;
  }
  if (type === "vehicle") {
    return refs.vehicles;
  }
  return refs.stores;
}

function directoryDocs(type) {
  if (type === "driver") {
    return driverDocs;
  }
  if (type === "vehicle") {
    return vehicleDocs;
  }
  return storeDocs;
}

function directoryId(name) {
  return encodeURIComponent(name.trim().toLowerCase()).replaceAll(".", "%2E");
}

async function setDirectoryItem(type, name) {
  const cleanName = name.trim();
  if (!cleanName) {
    return;
  }

  await setDoc(
    doc(directoryCollection(type), directoryId(cleanName)),
    {
      name: cleanName,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

async function seedInitialData() {
  setStatus("Підключаю Firebase...");
  const setupSnapshot = await getDoc(setupRef);

  if (setupSnapshot.exists() && setupSnapshot.data().initialized) {
    return;
  }

  const tripSnapshot = await getDocs(refs.trips);
  const remoteTrips = tripSnapshot.docs.map((item) => normalizeTrip({ id: item.id, ...item.data() }));

  if (remoteTrips.length) {
    await setDoc(
      setupRef,
      {
        initialized: true,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
    return;
  }

  const legacyTrips = loadLegacyTrips();
  const seedTrips = legacyTrips.length ? legacyTrips : createExampleTrips();
  const batch = writeBatch(db);

  seedTrips.forEach((trip) => {
    const id = trip.id && !trip.id.includes("/") ? trip.id : crypto.randomUUID();
    batch.set(doc(refs.trips, id), {
      ...tripPayload({ ...trip, id }),
      createdAt: serverTimestamp(),
    });
  });
  await batch.commit();

  await Promise.all([
    ...uniqueNames([...defaults.drivers, ...loadLegacyDirectory("driver"), ...seedTrips.map((trip) => trip.driver)]).map((name) =>
      setDirectoryItem("driver", name),
    ),
    ...uniqueNames([...defaults.vehicles, ...loadLegacyDirectory("vehicle"), ...seedTrips.map((trip) => trip.vehicle)]).map((name) =>
      setDirectoryItem("vehicle", name),
    ),
    ...uniqueNames([...defaults.stores, ...loadLegacyDirectory("store"), ...seedTrips.map((trip) => trip.store)]).map((name) =>
      setDirectoryItem("store", name),
    ),
  ]);

  await setDoc(
    setupRef,
    {
      initialized: true,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

function subscribeToFirebase() {
  onSnapshot(
    query(refs.trips, orderBy("date", "desc")),
    (snapshot) => {
      trips = snapshot.docs.map((item) => normalizeTrip({ id: item.id, ...item.data() }));
      hasLoadedRemote = true;
      setStatus("Підключено до Firebase. Дані спільні для телефону і ноутбука.");
      render();
    },
    showFirebaseError,
  );

  onSnapshot(
    query(refs.drivers, orderBy("name")),
    (snapshot) => {
      driverDocs = snapshot.docs.map((item) => ({ id: item.id, name: item.data().name }));
      drivers = uniqueNames(driverDocs.map((item) => item.name));
      render();
    },
    showFirebaseError,
  );

  onSnapshot(
    query(refs.vehicles, orderBy("name")),
    (snapshot) => {
      vehicleDocs = snapshot.docs.map((item) => ({ id: item.id, name: item.data().name }));
      vehicles = uniqueNames(vehicleDocs.map((item) => item.name));
      render();
    },
    showFirebaseError,
  );

  onSnapshot(
    query(refs.stores, orderBy("name")),
    (snapshot) => {
      storeDocs = snapshot.docs.map((item) => ({ id: item.id, name: item.data().name }));
      stores = uniqueNames(storeDocs.map((item) => item.name));
      render();
    },
    showFirebaseError,
  );

  onSnapshot(
    refs.weeklyReports,
    (snapshot) => {
      weeklyReports = snapshot.docs
        .map((item) => normalizeWeeklyReport({ id: item.id, ...item.data() }))
        .sort((a, b) => b.periodEnd.localeCompare(a.periodEnd) || b.week.localeCompare(a.week));
      renderWeeklyReports();
    },
    showFirebaseError,
  );
}

function showFirebaseError(error) {
  console.error(error);
  setStatus("Firebase не дав доступ. Перевір Firestore Database і Rules.");
}

function setStatus(text) {
  formHint.textContent = text;
}

function numberValue(selector) {
  return Number(document.querySelector(selector).value || 0);
}

function optionalNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function optionalNumberValue(selector) {
  return optionalNumber(document.querySelector(selector).value);
}

function tripKm(trip) {
  if (trip.kmStart === null || trip.kmEnd === null) {
    return null;
  }

  return Math.max(0, Number(trip.kmEnd) - Number(trip.kmStart));
}

function tripMoney(trip) {
  if (trip.manualAmount !== null && trip.manualAmount !== undefined) {
    return Number(trip.manualAmount);
  }

  return Number(trip.deliveries) * Number(trip.rate);
}

function tripFuel(trip) {
  const km = tripKm(trip);
  return km === null ? null : (km * fuelLitersPer100Km) / 100;
}

function formatKm(value) {
  return value === null ? "Очікує" : `${value} км`;
}

function formatMoney(value) {
  return `${moneyFormatter.format(value)} грн`;
}

function formatFuel(value) {
  if (value === null) {
    return "Очікує кілометраж";
  }

  return `${fuelFormatter.format(value)} л`;
}

function stableImportId(trip, index) {
  const text = [
    index,
    trip.date,
    trip.driver,
    trip.vehicle,
    trip.store,
    trip.category,
    trip.kmStart ?? "",
    trip.kmEnd ?? "",
    trip.deliveries,
    trip.rate,
    trip.manualAmount ?? "",
  ].join("|");
  let hash = 5381;

  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) >>> 0;
  }

  return `csv-${index + 1}-${hash.toString(16)}`;
}

function getVisibleTrips() {
  const queryText = search.value.trim().toLowerCase();
  const month = monthFilter.value;

  return trips.filter((trip) => {
    const matchesCategory = trip.category === activeCategory;
    const matchesQuery =
      !queryText ||
      trip.driver.toLowerCase().includes(queryText) ||
      trip.vehicle.toLowerCase().includes(queryText) ||
      trip.store.toLowerCase().includes(queryText) ||
      trip.route.toLowerCase().includes(queryText) ||
      trip.note.toLowerCase().includes(queryText);
    const matchesMonth = !month || trip.date.startsWith(month);
    return matchesCategory && matchesQuery && matchesMonth;
  });
}

function summarizeTrips(tripsToSummarize) {
  return {
    trips: tripsToSummarize.length,
    deliveries: tripsToSummarize.reduce((sum, trip) => sum + Number(trip.deliveries), 0),
    km: tripsToSummarize.reduce((sum, trip) => sum + (tripKm(trip) || 0), 0),
    fuel: tripsToSummarize.reduce((sum, trip) => sum + (tripFuel(trip) || 0), 0),
    money: tripsToSummarize.reduce((sum, trip) => sum + tripMoney(trip), 0),
  };
}

function weekRange(week) {
  const match = /^(\d{4})-W(\d{2})$/.exec(week);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const weekNumber = Number(match[2]);
  const januaryFourth = new Date(Date.UTC(year, 0, 4));
  const daysFromMonday = (januaryFourth.getUTCDay() + 6) % 7;
  const start = new Date(januaryFourth);
  start.setUTCDate(januaryFourth.getUTCDate() - daysFromMonday + (weekNumber - 1) * 7);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);

  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

function currentWeek() {
  const now = new Date();
  const date = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNumber = Math.ceil((((date - yearStart) / 86400000 + 1) / 7));
  return `${date.getUTCFullYear()}-W${String(weekNumber).padStart(2, "0")}`;
}

function formatWeekRange(week, periodStart, periodEnd) {
  const range = periodStart && periodEnd ? { start: periodStart, end: periodEnd } : weekRange(week);
  if (!range) {
    return week || "Тиждень не вказано";
  }

  const formatter = new Intl.DateTimeFormat("uk-UA", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const toDate = (date) => new Date(`${date}T12:00:00`);
  return `${formatter.format(toDate(range.start))} — ${formatter.format(toDate(range.end))}`;
}

function formatSavedReportTitle(report) {
  const prefix = report.type === "period" ? "Період" : "Тиждень";
  return `${prefix}: ${formatWeekRange(report.week, report.periodStart, report.periodEnd)}`;
}

function reportTripDetails(tripsToInclude) {
  return tripsToInclude.map((trip) => ({
    date: trip.date,
    driver: trip.driver,
    vehicle: trip.vehicle,
    store: trip.store,
    route: trip.route,
    kmStart: trip.kmStart,
    kmEnd: trip.kmEnd,
    km: tripKm(trip) || 0,
    fuel: tripFuel(trip) || 0,
    deliveries: Number(trip.deliveries),
    rate: Number(trip.rate),
    money: tripMoney(trip),
    note: trip.note,
  }));
}

function summarizeBy(tripsToSummarize, key) {
  const result = new Map();

  tripsToSummarize.forEach((trip) => {
    const name = trip[key] || "Без назви";
    const current = result.get(name) || {
      name,
      trips: 0,
      deliveries: 0,
      km: 0,
      money: 0,
    };

    current.trips += 1;
    current.deliveries += Number(trip.deliveries);
    current.km += tripKm(trip) || 0;
    current.money += tripMoney(trip);
    result.set(name, current);
  });

  return [...result.values()].sort((a, b) => b.km - a.km || b.money - a.money);
}

function renderReport(target, countTarget, items) {
  target.innerHTML = "";
  countTarget.textContent = items.length;

  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "report-empty";
    empty.textContent = "Немає даних для поточного фільтра.";
    target.append(empty);
    return;
  }

  items.forEach((item) => {
    const row = document.createElement("div");
    row.className = "report-row";
    row.innerHTML = `
      <div class="report-name"></div>
      <div class="report-stat"></div>
      <div class="report-stat"></div>
      <div class="report-money"></div>
    `;

    row.children[0].textContent = item.name;
    row.children[1].textContent = `${item.trips} рейс.`;
    row.children[2].textContent = `${item.km} км`;
    row.children[3].textContent = formatMoney(item.money);
    target.append(row);
  });
}

function renderOptions(select, items, currentValue) {
  select.innerHTML = "";

  if (!items.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = hasLoadedRemote ? "Спочатку додайте в довіднику" : "Завантаження...";
    select.append(option);
    return;
  }

  items.forEach((item) => {
    const option = document.createElement("option");
    option.value = item;
    option.textContent = item;
    select.append(option);
  });

  if (currentValue && items.includes(currentValue)) {
    select.value = currentValue;
  }
}

function renderDirectory(target, countTarget, items, type) {
  target.innerHTML = "";
  countTarget.textContent = items.length;

  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "report-empty";
    empty.textContent = hasLoadedRemote ? "Список порожній." : "Завантаження...";
    target.append(empty);
    return;
  }

  items.forEach((name) => {
    const row = document.createElement("div");
    row.className = "directory-row";
    row.innerHTML = `
      <div class="directory-name"></div>
      <div class="directory-actions">
        <button class="small-button edit-row" type="button">Ред.</button>
        <button class="small-button delete-row" type="button">×</button>
      </div>
    `;

    row.querySelector(".directory-name").textContent = name;
    row.querySelector(".edit-row").addEventListener("click", () => renameDirectoryItem(type, name));
    row.querySelector(".delete-row").addEventListener("click", () => deleteDirectoryItem(type, name));
    target.append(row);
  });
}

function renderDirectories() {
  const currentDriver = form.driver.value;
  const currentVehicle = form.vehicle.value;
  const currentStore = form.store.value;

  renderOptions(form.driver, drivers, currentDriver);
  renderOptions(form.vehicle, vehicles, currentVehicle);
  renderOptions(form.store, stores, currentStore);
  renderDirectory(driversList, driversCount, drivers, "driver");
  renderDirectory(vehiclesList, vehiclesCount, vehicles, "vehicle");
  renderDirectory(storesList, storesCount, stores, "store");
}

function renderFolderInterface() {
  const storeTrips = trips.filter((trip) => trip.category === "store").length;
  const wholesaleTrips = trips.filter((trip) => trip.category === "wholesale").length;

  storeFolderCount.textContent = storeTrips;
  wholesaleFolderCount.textContent = wholesaleTrips;
  folderButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.category === activeCategory);
  });

  recipientLabel.textContent = form.category.value === "wholesale" ? "Оптовий клієнт" : "Магазин";
  weeklyReportHint.textContent = `Тижневий або періодичний підсумок для «${categoryName(activeCategory)}» збережеться тут і залишиться доступним для перегляду.`;
}

function renderWeeklyReports() {
  weeklyReportList.innerHTML = "";

  if (!weeklyReports.length) {
    const empty = document.createElement("div");
    empty.className = "report-empty";
    empty.textContent = "Завершених звітів ще немає.";
    weeklyReportList.append(empty);
    return;
  }

  weeklyReports.forEach((report) => {
    const card = document.createElement("div");
    card.className = "weekly-report-card";

    const title = document.createElement("div");
    title.className = "weekly-report-title";
    const weekTitle = document.createElement("strong");
    weekTitle.textContent = formatSavedReportTitle(report);
    const category = document.createElement("span");
    category.textContent = categoryName(report.category);
    title.append(weekTitle, category);
    card.append(title);

    const stats = [
      ["Рейсів", report.trips],
      ["Доставок", report.deliveries],
      ["Км", `${report.km} км`],
      ["Пальне", formatFuel(report.fuel)],
      ["Сума", formatMoney(report.money), "is-money"],
    ];
    stats.forEach(([label, value, extraClass]) => {
      const stat = document.createElement("div");
      stat.className = `weekly-report-stat${extraClass ? ` ${extraClass}` : ""}`;
      const labelElement = document.createElement("span");
      labelElement.textContent = label;
      const valueElement = document.createElement("strong");
      valueElement.textContent = value;
      stat.append(labelElement, valueElement);
      card.append(stat);
    });

    const openButton = document.createElement("button");
    openButton.className = "small-button edit-row";
    openButton.type = "button";
    openButton.textContent = "Відкрити";
    openButton.addEventListener("click", () => openCompletedReport(report));
    card.append(openButton);

    const printButton = document.createElement("button");
    printButton.className = "small-button print-report";
    printButton.type = "button";
    printButton.textContent = "Друк";
    printButton.addEventListener("click", () => printCompletedReport(report));
    card.append(printButton);

    const deleteButton = document.createElement("button");
    deleteButton.className = "small-button delete-row";
    deleteButton.type = "button";
    deleteButton.title = "Видалити завершений тиждень";
    deleteButton.textContent = "×";
    deleteButton.addEventListener("click", () => deleteWeeklyReport(report));
    card.append(deleteButton);
    weeklyReportList.append(card);
  });
}

function getReportDetails(report) {
  if (report.tripDetails.length) {
    return report.tripDetails;
  }

  return reportTripDetails(
    trips.filter((trip) => trip.category === report.category && trip.date >= report.periodStart && trip.date <= report.periodEnd),
  );
}

function openCompletedReport(report) {
  completedReportTitle.textContent = `${formatSavedReportTitle(report)} — ${categoryName(report.category)}`;
  completedReportContent.innerHTML = "";

  const summary = document.createElement("div");
  summary.className = "completed-report-summary";
  [
    ["Рейсів", report.trips],
    ["Доставок", report.deliveries],
    ["Кілометрів", `${report.km} км`],
    ["Пальне", formatFuel(report.fuel)],
    ["Сума", formatMoney(report.money)],
  ].forEach(([label, value]) => {
    const item = document.createElement("div");
    const labelElement = document.createElement("span");
    labelElement.textContent = label;
    const valueElement = document.createElement("strong");
    valueElement.textContent = value;
    item.append(labelElement, valueElement);
    summary.append(item);
  });
  completedReportContent.append(summary);

  const details = getReportDetails(report);

  if (!details.length) {
    const message = document.createElement("p");
    message.className = "report-empty";
    message.textContent = "Для цього звіту немає рейсів, доступних для перегляду. Підсумок збережено вище.";
    completedReportContent.append(message);
  } else {
    if (!report.tripDetails.length) {
      const note = document.createElement("p");
      note.className = "report-empty";
      note.textContent = "Цей старіший звіт відновлено з поточного журналу за його датами.";
      completedReportContent.append(note);
    }
    const wrap = document.createElement("div");
    wrap.className = "completed-trip-table-wrap";
    const table = document.createElement("table");
    table.className = "completed-trip-table";
    const header = document.createElement("thead");
    const headerRow = document.createElement("tr");
    const columns = ["Дата", "Водій", "Авто", "Точка доставки", "Маршрут", "Старт", "Кінець", "Км", "Пальне", "Доставок", "Ціна", "Сума", "Нотатка"];
    columns.forEach((label) => {
      const cell = document.createElement("th");
      cell.textContent = label;
      headerRow.append(cell);
    });
    header.append(headerRow);
    const body = document.createElement("tbody");
    details.forEach((trip) => {
      const row = document.createElement("tr");
      const values = [
        trip.date,
        trip.driver,
        trip.vehicle,
        trip.store,
        trip.route || "-",
        trip.kmStart ?? "-",
        trip.kmEnd ?? "-",
        `${trip.km} км`,
        formatFuel(trip.fuel),
        trip.deliveries,
        formatMoney(trip.rate),
        formatMoney(trip.money),
        trip.note || "-",
      ];
      values.forEach((value, index) => {
        const cell = document.createElement("td");
        cell.dataset.label = columns[index];
        cell.textContent = value;
        row.append(cell);
      });
      body.append(row);
    });
    table.append(header, body);
    wrap.append(table);
    completedReportContent.append(wrap);
  }

  if (typeof completedReportDialog.showModal === "function") {
    completedReportDialog.showModal();
  } else {
    completedReportDialog.setAttribute("open", "");
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function printCompletedReport(report) {
  const details = getReportDetails(report);
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    alert("Браузер заблокував вікно друку. Дозвольте спливні вікна для цієї програми та спробуйте ще раз.");
    return;
  }

  const title = `${formatSavedReportTitle(report)} — ${categoryName(report.category)}`;
  const columns = ["Дата", "Водій", "Авто", "Точка доставки", "Маршрут", "Старт", "Кінець", "Км", "Пальне", "Доставок", "Ціна", "Сума", "Нотатка"];
  const rowsHtml = details
    .map((trip) => {
      const values = [
        trip.date,
        trip.driver,
        trip.vehicle,
        trip.store,
        trip.route || "-",
        trip.kmStart ?? "-",
        trip.kmEnd ?? "-",
        `${trip.km} км`,
        formatFuel(trip.fuel),
        trip.deliveries,
        formatMoney(trip.rate),
        formatMoney(trip.money),
        trip.note || "-",
      ];
      return `<tr>${values.map((value) => `<td>${escapeHtml(value)}</td>`).join("")}</tr>`;
    })
    .join("");

  printWindow.document.write(`<!doctype html>
    <html lang="uk">
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(title)}</title>
        <style>
          @page { size: A4 landscape; margin: 10mm; }
          * { box-sizing: border-box; }
          body { margin: 0; color: #1d2522; font-family: Arial, sans-serif; font-size: 11px; }
          h1 { margin: 0 0 4px; font-size: 22px; }
          p { margin: 0 0 14px; color: #52605a; font-weight: 700; }
          .summary { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin-bottom: 14px; }
          .summary div { padding: 9px; border: 1px solid #cfd7d0; border-radius: 6px; }
          .summary span { display: block; margin-bottom: 4px; color: #52605a; font-size: 10px; font-weight: 700; }
          .summary strong { font-size: 14px; }
          table { width: 100%; border-collapse: collapse; table-layout: fixed; }
          th, td { padding: 5px 4px; border: 1px solid #cfd7d0; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
          th { color: #46534d; background: #edf7f4; font-size: 9px; text-transform: uppercase; }
          td { font-size: 9px; }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(title)}</h1>
        <p>Надруковано: ${escapeHtml(new Date().toLocaleString("uk-UA"))}</p>
        <section class="summary">
          <div><span>Рейсів</span><strong>${escapeHtml(report.trips)}</strong></div>
          <div><span>Доставок</span><strong>${escapeHtml(report.deliveries)}</strong></div>
          <div><span>Кілометрів</span><strong>${escapeHtml(`${report.km} км`)}</strong></div>
          <div><span>Пальне</span><strong>${escapeHtml(formatFuel(report.fuel))}</strong></div>
          <div><span>Сума</span><strong>${escapeHtml(formatMoney(report.money))}</strong></div>
        </section>
        <table>
          <thead><tr>${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr></thead>
          <tbody>${rowsHtml || `<tr><td colspan="${columns.length}">Детальні рейси для цього звіту відсутні.</td></tr>`}</tbody>
        </table>
      </body>
    </html>`);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 250);
}

function setActiveCategory(category) {
  activeCategory = normalizeCategory(category);
  resetForm();
  render();
}

function render() {
  const visibleTrips = getVisibleTrips();
  rows.innerHTML = "";

  visibleTrips.forEach((trip) => {
    const fragment = rowTemplate.content.cloneNode(true);
    const cells = fragment.querySelectorAll("td");
    const editButton = fragment.querySelector(".edit-row");
    const deleteButton = fragment.querySelector(".delete-row");

    cells[0].textContent = trip.date;
    cells[1].textContent = trip.driver;
    cells[2].textContent = trip.vehicle;
    cells[3].textContent = trip.store;
    cells[4].textContent = trip.route || "-";
    cells[5].textContent = trip.kmStart ?? "-";
    cells[6].textContent = trip.kmEnd ?? "-";
    cells[7].textContent = formatKm(tripKm(trip));
    cells[8].textContent = formatFuel(tripFuel(trip));
    cells[9].textContent = trip.deliveries;
    cells[10].textContent = formatMoney(Number(trip.rate || 0));
    cells[11].textContent = formatMoney(tripMoney(trip));

    if (trip.note) {
      cells[4].title = trip.note;
    }

    editButton.addEventListener("click", () => startEdit(trip.id));
    deleteButton.addEventListener("click", () => deleteTrip(trip.id));

    rows.append(fragment);
  });

  const summary = summarizeTrips(visibleTrips);

  totals.trips.textContent = summary.trips;
  totals.deliveries.textContent = summary.deliveries;
  totals.km.textContent = `${summary.km} км`;
  totals.money.textContent = formatMoney(summary.money);
  totals.fuel.textContent = formatFuel(summary.fuel);
  emptyState.classList.toggle("is-visible", visibleTrips.length === 0);

  renderReport(driverReport, driverReportCount, summarizeBy(visibleTrips, "driver"));
  renderReport(storeReport, storeReportCount, summarizeBy(visibleTrips, "store"));
  renderReport(vehicleReport, vehicleReportCount, summarizeBy(visibleTrips, "vehicle"));
  renderDirectories();
  renderFolderInterface();
  renderWeeklyReports();
}

function updateLiveCalc() {
  const kmStart = optionalNumberValue("#kmStart");
  const kmEnd = optionalNumberValue("#kmEnd");
  const deliveries = numberValue("#deliveries");
  const rate = numberValue("#rate");
  const manualAmount = optionalNumberValue("#manualAmount");
  const km = kmStart !== null && kmEnd !== null ? Math.max(0, kmEnd - kmStart) : null;
  const fuel = km === null ? null : (km * fuelLitersPer100Km) / 100;
  const money = manualAmount !== null ? manualAmount : deliveries * rate;
  form.fuelUsed.value = formatFuel(fuel);
  liveCalc.textContent = `${formatKm(km)} | ${formatFuel(fuel)} | ${formatMoney(money)}`;
}

function readForm() {
  return {
    id: editingId || crypto.randomUUID(),
    date: form.date.value,
    driver: form.driver.value.trim(),
    vehicle: form.vehicle.value.trim(),
    store: form.store.value.trim(),
    route: form.route.value.trim(),
    category: normalizeCategory(form.category.value),
    kmStart: optionalNumberValue("#kmStart"),
    kmEnd: optionalNumberValue("#kmEnd"),
    deliveries: numberValue("#deliveries"),
    rate: numberValue("#rate"),
    manualAmount: optionalNumberValue("#manualAmount"),
    note: form.note.value.trim(),
  };
}

function resetForm() {
  const rate = form.rate.value || defaultRate;
  editingId = null;
  form.reset();
  form.date.value = today();
  form.category.value = activeCategory;
  form.rate.value = rate;
  formTitle.textContent = `Новий рейс — ${categoryName(activeCategory)}`;
  submitButton.textContent = "Додати рейс";
  cancelEdit.classList.add("is-hidden");
  renderDirectories();
  updateLiveCalc();
}

function startEdit(id) {
  const trip = trips.find((item) => item.id === id);
  if (!trip) {
    return;
  }

  editingId = id;
  renderOptions(form.driver, uniqueNames([...drivers, trip.driver]), trip.driver);
  renderOptions(form.vehicle, uniqueNames([...vehicles, trip.vehicle]), trip.vehicle);
  renderOptions(form.store, uniqueNames([...stores, trip.store]), trip.store);
  form.date.value = trip.date;
  form.driver.value = trip.driver;
  form.vehicle.value = trip.vehicle;
  form.store.value = trip.store;
  form.route.value = trip.route;
  form.category.value = trip.category;
  form.kmStart.value = trip.kmStart ?? "";
  form.kmEnd.value = trip.kmEnd ?? "";
  form.deliveries.value = trip.deliveries;
  form.rate.value = trip.rate;
  form.manualAmount.value = trip.manualAmount ?? "";
  form.note.value = trip.note;
  formTitle.textContent = "Редагування рейсу";
  setStatus("Збережіть зміни або скасуйте редагування.");
  submitButton.textContent = "Зберегти зміни";
  cancelEdit.classList.remove("is-hidden");
  updateLiveCalc();
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function deleteTrip(id) {
  if (editingId === id) {
    resetForm();
  }

  await deleteDoc(doc(refs.trips, id));
}

async function addDirectoryItem(type, name) {
  await setDirectoryItem(type, name);
}

async function renameDirectoryItem(type, oldName) {
  const nextName = prompt("Нова назва:", oldName);
  if (!nextName || !nextName.trim()) {
    return;
  }

  const cleanName = nextName.trim();
  const item = directoryDocs(type).find((entry) => entry.name === oldName);
  const batch = writeBatch(db);

  if (item) {
    batch.delete(doc(directoryCollection(type), item.id));
  }
  batch.set(doc(directoryCollection(type), directoryId(cleanName)), {
    name: cleanName,
    updatedAt: serverTimestamp(),
  });

  trips
    .filter((trip) => {
      if (type === "driver") {
        return trip.driver === oldName;
      }
      if (type === "vehicle") {
        return trip.vehicle === oldName;
      }
      return trip.store === oldName;
    })
    .forEach((trip) => {
      batch.set(
        doc(refs.trips, trip.id),
        {
          [type]: cleanName,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
    });

  await batch.commit();
}

async function deleteDirectoryItem(type, name) {
  const isUsed = trips.some((trip) => {
    if (type === "driver") {
      return trip.driver === name;
    }
    if (type === "vehicle") {
      return trip.vehicle === name;
    }
    return trip.store === name;
  });
  const message = isUsed
    ? "Цей пункт вже є в рейсах. Видалити його тільки з довідника? Старі рейси залишаться без змін."
    : "Видалити з довідника?";

  if (!confirm(message)) {
    return;
  }

  const item = directoryDocs(type).find((entry) => entry.name === name);
  if (item) {
    await deleteDoc(doc(directoryCollection(type), item.id));
  }
}

async function finishWeek() {
  const week = weekPicker.value;
  const range = weekRange(week);
  if (!range) {
    alert("Оберіть тиждень для завершення.");
    return;
  }

  const weekTrips = trips.filter(
    (trip) => trip.category === activeCategory && trip.date >= range.start && trip.date <= range.end,
  );
  const summary = summarizeTrips(weekTrips);
  const title = formatWeekRange(week, range.start, range.end);

  if (!summary.trips) {
    alert(`У папці «${categoryName(activeCategory)}» за ${title} немає рейсів.`);
    return;
  }

  const reportId = `${week}-${activeCategory}`;
  const message = `Завершити тиждень ${title}?\nПапка: ${categoryName(activeCategory)}\nРейсів: ${summary.trips}\nДоставок: ${summary.deliveries}\nКм: ${summary.km}\nПальне: ${formatFuel(summary.fuel)}\nСума: ${formatMoney(summary.money)}\n\nПідсумок збережеться в папці «Завершені звіти».`;
  if (!confirm(message)) {
    return;
  }

  saveWeeklyReport.disabled = true;
  try {
    await setDoc(
      doc(refs.weeklyReports, reportId),
      {
        type: "week",
        week,
        periodStart: range.start,
        periodEnd: range.end,
        category: activeCategory,
        ...summary,
        tripDetails: reportTripDetails(weekTrips),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
    setStatus(`Тиждень завершено. Звіт збережено в папці «Завершені звіти».`);
  } catch (error) {
    showFirebaseError(error);
  } finally {
    saveWeeklyReport.disabled = false;
  }
}

async function savePeriod() {
  const start = periodStart.value;
  const end = periodEnd.value;
  if (!start || !end) {
    alert("Оберіть дати «Від» і «До» для звіту.");
    return;
  }
  if (end < start) {
    alert("Дата «До» має бути не раніше за дату «Від».");
    return;
  }

  const periodTrips = trips.filter(
    (trip) => trip.category === activeCategory && trip.date >= start && trip.date <= end,
  );
  const summary = summarizeTrips(periodTrips);
  const title = formatWeekRange("", start, end);
  if (!summary.trips) {
    alert(`У папці «${categoryName(activeCategory)}» за період ${title} немає рейсів.`);
    return;
  }

  const message = `Зберегти звіт за період ${title}?\nПапка: ${categoryName(activeCategory)}\nРейсів: ${summary.trips}\nДоставок: ${summary.deliveries}\nКм: ${summary.km}\nПальне: ${formatFuel(summary.fuel)}\nСума: ${formatMoney(summary.money)}`;
  if (!confirm(message)) {
    return;
  }

  savePeriodReport.disabled = true;
  try {
    await setDoc(
      doc(refs.weeklyReports, `period-${activeCategory}-${start}-${end}`),
      {
        type: "period",
        week: "",
        periodStart: start,
        periodEnd: end,
        category: activeCategory,
        ...summary,
        tripDetails: reportTripDetails(periodTrips),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
    setStatus(`Звіт за період збережено в папці «Завершені звіти».`);
  } catch (error) {
    showFirebaseError(error);
  } finally {
    savePeriodReport.disabled = false;
  }
}

async function deleteWeeklyReport(report) {
  const title = formatSavedReportTitle(report);
  if (!confirm(`Видалити завершений звіт «${title}» (${categoryName(report.category)})?`)) {
    return;
  }

  try {
    await deleteDoc(doc(refs.weeklyReports, report.id));
  } catch (error) {
    showFirebaseError(error);
  }
}

function exportCsv() {
  const header = ["Папка", "Дата", "Водій", "Авто", "Магазин", "Маршрут", "Км старт", "Км кінець", "Км", "Пальне (л)", "Доставок", "Ціна", "Сума вручну", "Сума", "Нотатка"];
  const lines = getVisibleTrips().map((trip) => [
    categoryName(trip.category),
    trip.date,
    trip.driver,
    trip.vehicle,
    trip.store,
    trip.route,
    trip.kmStart ?? "",
    trip.kmEnd ?? "",
    tripKm(trip) ?? "",
    tripFuel(trip) ?? "",
    trip.deliveries,
    trip.rate,
    trip.manualAmount ?? "",
    tripMoney(trip),
    trip.note,
  ]);

  const csv = [header, ...lines]
    .map((line) => line.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "delivery-statistics.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      value += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(value);
      value = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        i += 1;
      }
      row.push(value);
      if (row.some((cell) => cell.trim())) {
        rows.push(row);
      }
      row = [];
      value = "";
    } else {
      value += char;
    }
  }

  row.push(value);
  if (row.some((cell) => cell.trim())) {
    rows.push(row);
  }

  return rows;
}

function csvRowsToObjects(rows) {
  if (!rows.length) {
    return [];
  }

  const headers = rows[0].map((header) => header.replace(/^\uFEFF/, "").trim());
  return rows.slice(1).map((row) =>
    Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])),
  );
}

function csvTripToRecord(row, index) {
  const trip = normalizeTrip({
    category: row["Папка"],
    date: row["Дата"],
    driver: row["Водій"],
    vehicle: row["Авто"],
    store: row["Магазин"],
    route: row["Маршрут"],
    kmStart: row["Км старт"],
    kmEnd: row["Км кінець"],
    deliveries: row["Доставок"],
    rate: row["Ціна"],
    manualAmount: row["Сума вручну"],
    note: row["Нотатка"],
  });

  trip.id = stableImportId(trip, index);
  return trip;
}

async function importCsvText(text) {
  const importedTrips = csvRowsToObjects(parseCsv(text)).map(csvTripToRecord);

  if (!importedTrips.length) {
    alert("CSV файл порожній або не має рейсів.");
    return;
  }

  const totalKm = importedTrips.reduce((sum, trip) => sum + (tripKm(trip) || 0), 0);
  const totalDeliveries = importedTrips.reduce((sum, trip) => sum + Number(trip.deliveries), 0);
  const totalMoney = importedTrips.reduce((sum, trip) => sum + tripMoney(trip), 0);
  const message = `Імпортувати ${importedTrips.length} рейсів?\\nДоставок: ${totalDeliveries}\\nКм: ${totalKm}\\nСума: ${formatMoney(totalMoney)}`;

  if (!confirm(message)) {
    return;
  }

  const batch = writeBatch(db);
  importedTrips.forEach((trip) => {
    batch.set(doc(refs.trips, trip.id), {
      ...tripPayload(trip),
      createdAt: serverTimestamp(),
    });
  });
  await batch.commit();

  await Promise.all([
    ...uniqueNames(importedTrips.map((trip) => trip.driver)).map((name) => setDirectoryItem("driver", name)),
    ...uniqueNames(importedTrips.map((trip) => trip.vehicle)).map((name) => setDirectoryItem("vehicle", name)),
    ...uniqueNames(importedTrips.map((trip) => trip.store)).map((name) => setDirectoryItem("store", name)),
    setDoc(setupRef, { initialized: true, updatedAt: serverTimestamp() }, { merge: true }),
  ]);

  alert(`Готово. Імпортовано ${importedTrips.length} рейсів.`);
}

form.addEventListener("input", updateLiveCalc);

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const trip = readForm();

  if (trip.kmStart !== null && trip.kmEnd !== null && trip.kmEnd < trip.kmStart) {
    form.kmEnd.setCustomValidity("Кілометраж в кінці має бути більший або рівний стартовому.");
    form.kmEnd.reportValidity();
    return;
  }

  form.kmEnd.setCustomValidity("");
  submitButton.disabled = true;

  try {
    await Promise.all([
      setDirectoryItem("driver", trip.driver),
      setDirectoryItem("vehicle", trip.vehicle),
      setDirectoryItem("store", trip.store),
    ]);

    if (editingId) {
      await setDoc(doc(refs.trips, editingId), tripPayload(trip), { merge: true });
    } else {
      await addDoc(refs.trips, {
        ...tripPayload(trip),
        createdAt: serverTimestamp(),
      });
    }

    resetForm();
  } catch (error) {
    showFirebaseError(error);
  } finally {
    submitButton.disabled = false;
  }
});

driverDirectoryForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await addDirectoryItem("driver", driverName.value);
  driverDirectoryForm.reset();
});

vehicleDirectoryForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await addDirectoryItem("vehicle", vehicleName.value);
  vehicleDirectoryForm.reset();
});

storeDirectoryForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await addDirectoryItem("store", storeName.value);
  storeDirectoryForm.reset();
});

search.addEventListener("input", render);
monthFilter.addEventListener("input", render);
form.category.addEventListener("change", renderFolderInterface);
folderButtons.forEach((button) => {
  button.addEventListener("click", () => setActiveCategory(button.dataset.category));
});
saveWeeklyReport.addEventListener("click", finishWeek);
savePeriodReport.addEventListener("click", savePeriod);
closeCompletedReport.addEventListener("click", () => completedReportDialog.close());
cancelEdit.addEventListener("click", resetForm);
printStats.addEventListener("click", () => window.print());
importCsv.addEventListener("click", () => importCsvFile.click());
importCsvFile.addEventListener("change", async () => {
  const [file] = importCsvFile.files;
  if (!file) {
    return;
  }

  try {
    await importCsvText(await file.text());
  } catch (error) {
    console.error(error);
    alert("Не вдалося імпортувати CSV. Перевірте файл і спробуйте ще раз.");
  } finally {
    importCsvFile.value = "";
  }
});
document.querySelector("#exportCsv").addEventListener("click", exportCsv);

document.querySelector("#clearAll").addEventListener("click", async () => {
  if (!confirm("Очистити всі рейси? Довідники водіїв, авто і магазинів та завершені тижні залишаться.")) {
    return;
  }

  const batch = writeBatch(db);
  trips.forEach((trip) => batch.delete(doc(refs.trips, trip.id)));
  await batch.commit();
  resetForm();
});

weekPicker.value = currentWeek();
periodStart.value = `${today().slice(0, 8)}01`;
periodEnd.value = today();
resetForm();
render();

try {
  await seedInitialData();
  subscribeToFirebase();
} catch (error) {
  showFirebaseError(error);
}
