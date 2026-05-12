import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
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

const legacyTripKeys = ["delivery-trips-v3", "delivery-trips-v2", "delivery-trips-v1"];
const legacyDirectoryKeys = {
  driver: "delivery-drivers-v1",
  vehicle: "delivery-vehicles-v1",
  store: "delivery-stores-v1",
};
const defaultRate = 700;

const defaults = {
  drivers: ["Андрій", "Сергій"],
  vehicles: ["Renault Kangoo AA1234AA", "Volkswagen Caddy BB5678BB"],
  stores: ["Сільпо Оболонь", "АТБ Позняки"],
};

const moneyFormatter = new Intl.NumberFormat("uk-UA", {
  maximumFractionDigits: 0,
});

const refs = {
  trips: collection(db, "trips"),
  drivers: collection(db, "drivers"),
  vehicles: collection(db, "vehicles"),
  stores: collection(db, "stores"),
};

const form = document.querySelector("#tripForm");
const rows = document.querySelector("#tripRows");
const rowTemplate = document.querySelector("#rowTemplate");
const emptyState = document.querySelector("#emptyState");
const search = document.querySelector("#search");
const monthFilter = document.querySelector("#monthFilter");
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

const totals = {
  trips: document.querySelector("#totalTrips"),
  deliveries: document.querySelector("#totalDeliveries"),
  km: document.querySelector("#totalKm"),
  money: document.querySelector("#totalMoney"),
};

let trips = [];
let driverDocs = [];
let vehicleDocs = [];
let storeDocs = [];
let drivers = [];
let vehicles = [];
let stores = [];
let editingId = null;
let hasLoadedRemote = false;

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
      kmStart: 124500,
      kmEnd: 124586,
      deliveries: 7,
      rate: defaultRate,
      note: "Приклад",
    },
    {
      id: crypto.randomUUID(),
      date: today(),
      driver: "Сергій",
      vehicle: "Volkswagen Caddy BB5678BB",
      store: "АТБ Позняки",
      kmStart: 88210,
      kmEnd: 88264,
      deliveries: 5,
      rate: defaultRate,
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
    kmStart: Number(trip.kmStart || 0),
    kmEnd: Number(trip.kmEnd || 0),
    deliveries: Number(trip.deliveries || 0),
    rate: Number(trip.rate || defaultRate),
    note: String(trip.note || "").trim(),
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
  const tripSnapshot = await getDocs(refs.trips);
  const remoteTrips = tripSnapshot.docs.map((item) => normalizeTrip({ id: item.id, ...item.data() }));
  const legacyTrips = loadLegacyTrips();
  const seedTrips = remoteTrips.length ? remoteTrips : legacyTrips.length ? legacyTrips : createExampleTrips();

  if (!remoteTrips.length) {
    const batch = writeBatch(db);
    seedTrips.forEach((trip) => {
      const id = trip.id && !trip.id.includes("/") ? trip.id : crypto.randomUUID();
      batch.set(doc(refs.trips, id), {
        ...tripPayload({ ...trip, id }),
        createdAt: serverTimestamp(),
      });
    });
    await batch.commit();
  }

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

function tripKm(trip) {
  return Math.max(0, Number(trip.kmEnd) - Number(trip.kmStart));
}

function tripMoney(trip) {
  return Number(trip.deliveries) * Number(trip.rate);
}

function formatMoney(value) {
  return `${moneyFormatter.format(value)} грн`;
}

function getVisibleTrips() {
  const queryText = search.value.trim().toLowerCase();
  const month = monthFilter.value;

  return trips.filter((trip) => {
    const matchesQuery =
      !queryText ||
      trip.driver.toLowerCase().includes(queryText) ||
      trip.vehicle.toLowerCase().includes(queryText) ||
      trip.store.toLowerCase().includes(queryText) ||
      trip.note.toLowerCase().includes(queryText);
    const matchesMonth = !month || trip.date.startsWith(month);
    return matchesQuery && matchesMonth;
  });
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
    current.km += tripKm(trip);
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
    cells[4].textContent = trip.kmStart;
    cells[5].textContent = trip.kmEnd;
    cells[6].textContent = `${tripKm(trip)} км`;
    cells[7].textContent = trip.deliveries;
    cells[8].textContent = formatMoney(tripMoney(trip));

    if (trip.note) {
      cells[3].title = trip.note;
    }

    editButton.addEventListener("click", () => startEdit(trip.id));
    deleteButton.addEventListener("click", () => deleteTrip(trip.id));

    rows.append(fragment);
  });

  const totalKm = visibleTrips.reduce((sum, trip) => sum + tripKm(trip), 0);
  const totalDeliveries = visibleTrips.reduce((sum, trip) => sum + Number(trip.deliveries), 0);
  const totalMoney = visibleTrips.reduce((sum, trip) => sum + tripMoney(trip), 0);

  totals.trips.textContent = visibleTrips.length;
  totals.deliveries.textContent = totalDeliveries;
  totals.km.textContent = `${totalKm} км`;
  totals.money.textContent = formatMoney(totalMoney);
  emptyState.classList.toggle("is-visible", visibleTrips.length === 0);

  renderReport(driverReport, driverReportCount, summarizeBy(visibleTrips, "driver"));
  renderReport(storeReport, storeReportCount, summarizeBy(visibleTrips, "store"));
  renderReport(vehicleReport, vehicleReportCount, summarizeBy(visibleTrips, "vehicle"));
  renderDirectories();
}

function updateLiveCalc() {
  const kmStart = numberValue("#kmStart");
  const kmEnd = numberValue("#kmEnd");
  const deliveries = numberValue("#deliveries");
  const rate = numberValue("#rate");
  const km = Math.max(0, kmEnd - kmStart);
  liveCalc.textContent = `${km} км | ${formatMoney(deliveries * rate)}`;
}

function readForm() {
  return {
    id: editingId || crypto.randomUUID(),
    date: form.date.value,
    driver: form.driver.value.trim(),
    vehicle: form.vehicle.value.trim(),
    store: form.store.value.trim(),
    kmStart: numberValue("#kmStart"),
    kmEnd: numberValue("#kmEnd"),
    deliveries: numberValue("#deliveries"),
    rate: numberValue("#rate"),
    note: form.note.value.trim(),
  };
}

function resetForm() {
  const rate = form.rate.value || defaultRate;
  editingId = null;
  form.reset();
  form.date.value = today();
  form.rate.value = rate;
  formTitle.textContent = "Новий рейс";
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
  form.kmStart.value = trip.kmStart;
  form.kmEnd.value = trip.kmEnd;
  form.deliveries.value = trip.deliveries;
  form.rate.value = trip.rate;
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

function exportCsv() {
  const header = ["Дата", "Водій", "Авто", "Магазин", "Км старт", "Км кінець", "Км", "Доставок", "Ціна", "Сума", "Нотатка"];
  const lines = getVisibleTrips().map((trip) => [
    trip.date,
    trip.driver,
    trip.vehicle,
    trip.store,
    trip.kmStart,
    trip.kmEnd,
    tripKm(trip),
    trip.deliveries,
    trip.rate,
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

form.addEventListener("input", updateLiveCalc);

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const trip = readForm();

  if (trip.kmEnd < trip.kmStart) {
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
cancelEdit.addEventListener("click", resetForm);
document.querySelector("#exportCsv").addEventListener("click", exportCsv);

document.querySelector("#clearAll").addEventListener("click", async () => {
  if (!confirm("Очистити всі рейси? Довідники водіїв, авто і магазинів залишаться.")) {
    return;
  }

  const batch = writeBatch(db);
  trips.forEach((trip) => batch.delete(doc(refs.trips, trip.id)));
  await batch.commit();
  resetForm();
});

resetForm();
render();

try {
  await seedInitialData();
  subscribeToFirebase();
} catch (error) {
  showFirebaseError(error);
}
