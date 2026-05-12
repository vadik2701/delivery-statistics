const storageKey = "delivery-trips-v3";
const legacyStorageKeys = ["delivery-trips-v2", "delivery-trips-v1"];
const driversKey = "delivery-drivers-v1";
const vehiclesKey = "delivery-vehicles-v1";
const storesKey = "delivery-stores-v1";
const defaultRate = 700;

const moneyFormatter = new Intl.NumberFormat("uk-UA", {
  maximumFractionDigits: 0,
});

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

let trips = loadTrips();
let drivers = loadDirectory(driversKey, ["Андрій", "Сергій"], "driver");
let vehicles = loadDirectory(vehiclesKey, ["Renault Kangoo AA1234AA", "Volkswagen Caddy BB5678BB"], "vehicle");
let stores = loadDirectory(storesKey, ["Сільпо Оболонь", "АТБ Позняки"], "store");
let editingId = null;

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

function loadTrips() {
  const saved = [storageKey, ...legacyStorageKeys].map((key) => localStorage.getItem(key)).find(Boolean);

  if (saved) {
    try {
      return JSON.parse(saved).map(normalizeTrip);
    } catch {
      [storageKey, ...legacyStorageKeys].forEach((key) => localStorage.removeItem(key));
    }
  }

  return createExampleTrips();
}

function loadDirectory(key, fallback, tripField) {
  const saved = localStorage.getItem(key);
  const fromTrips = trips.map((trip) => trip[tripField]).filter(Boolean);

  if (saved) {
    try {
      return uniqueNames([...JSON.parse(saved), ...fromTrips]);
    } catch {
      localStorage.removeItem(key);
    }
  }

  return uniqueNames([...fallback, ...fromTrips]);
}

function uniqueNames(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "uk"),
  );
}

function saveTrips() {
  localStorage.setItem(storageKey, JSON.stringify(trips));
}

function saveDirectories() {
  localStorage.setItem(driversKey, JSON.stringify(drivers));
  localStorage.setItem(vehiclesKey, JSON.stringify(vehicles));
  localStorage.setItem(storesKey, JSON.stringify(stores));
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
  const query = search.value.trim().toLowerCase();
  const month = monthFilter.value;

  return trips.filter((trip) => {
    const matchesQuery =
      !query ||
      trip.driver.toLowerCase().includes(query) ||
      trip.vehicle.toLowerCase().includes(query) ||
      trip.store.toLowerCase().includes(query) ||
      trip.note.toLowerCase().includes(query);
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
    option.textContent = "Спочатку додайте в довіднику";
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
    empty.textContent = "Список порожній.";
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

  visibleTrips
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))
    .forEach((trip) => {
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
  formHint.textContent = "Дані зберігаються у цьому браузері.";
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
  formHint.textContent = "Збережіть зміни або скасуйте редагування.";
  submitButton.textContent = "Зберегти зміни";
  cancelEdit.classList.remove("is-hidden");
  updateLiveCalc();
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function deleteTrip(id) {
  if (editingId === id) {
    resetForm();
  }

  trips = trips.filter((item) => item.id !== id);
  saveTrips();
  render();
}

function addDirectoryItem(type, name) {
  const cleanName = name.trim();
  if (!cleanName) {
    return;
  }

  if (type === "driver") {
    drivers = uniqueNames([...drivers, cleanName]);
  } else if (type === "vehicle") {
    vehicles = uniqueNames([...vehicles, cleanName]);
  } else {
    stores = uniqueNames([...stores, cleanName]);
  }

  saveDirectories();
  render();
}

function renameDirectoryItem(type, oldName) {
  const nextName = prompt("Нова назва:", oldName);
  if (!nextName || !nextName.trim()) {
    return;
  }

  const cleanName = nextName.trim();

  if (type === "driver") {
    drivers = uniqueNames(drivers.map((name) => (name === oldName ? cleanName : name)));
    trips = trips.map((trip) => (trip.driver === oldName ? { ...trip, driver: cleanName } : trip));
  } else if (type === "vehicle") {
    vehicles = uniqueNames(vehicles.map((name) => (name === oldName ? cleanName : name)));
    trips = trips.map((trip) => (trip.vehicle === oldName ? { ...trip, vehicle: cleanName } : trip));
  } else {
    stores = uniqueNames(stores.map((name) => (name === oldName ? cleanName : name)));
    trips = trips.map((trip) => (trip.store === oldName ? { ...trip, store: cleanName } : trip));
  }

  saveDirectories();
  saveTrips();
  render();
}

function deleteDirectoryItem(type, name) {
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

  if (type === "driver") {
    drivers = drivers.filter((item) => item !== name);
  } else if (type === "vehicle") {
    vehicles = vehicles.filter((item) => item !== name);
  } else {
    stores = stores.filter((item) => item !== name);
  }

  saveDirectories();
  render();
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

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const trip = readForm();

  if (trip.kmEnd < trip.kmStart) {
    form.kmEnd.setCustomValidity("Кілометраж в кінці має бути більший або рівний стартовому.");
    form.kmEnd.reportValidity();
    return;
  }

  form.kmEnd.setCustomValidity("");

  if (editingId) {
    trips = trips.map((item) => (item.id === editingId ? trip : item));
  } else {
    trips.unshift(trip);
  }

  drivers = uniqueNames([...drivers, trip.driver]);
  vehicles = uniqueNames([...vehicles, trip.vehicle]);
  stores = uniqueNames([...stores, trip.store]);
  saveDirectories();
  saveTrips();
  resetForm();
  render();
});

driverDirectoryForm.addEventListener("submit", (event) => {
  event.preventDefault();
  addDirectoryItem("driver", driverName.value);
  driverDirectoryForm.reset();
});

vehicleDirectoryForm.addEventListener("submit", (event) => {
  event.preventDefault();
  addDirectoryItem("vehicle", vehicleName.value);
  vehicleDirectoryForm.reset();
});

storeDirectoryForm.addEventListener("submit", (event) => {
  event.preventDefault();
  addDirectoryItem("store", storeName.value);
  storeDirectoryForm.reset();
});

search.addEventListener("input", render);
monthFilter.addEventListener("input", render);
cancelEdit.addEventListener("click", resetForm);

document.querySelector("#exportCsv").addEventListener("click", exportCsv);

document.querySelector("#clearAll").addEventListener("click", () => {
  if (!confirm("Очистити всі записи?")) {
    return;
  }

  trips = [];
  saveTrips();
  resetForm();
  render();
});

resetForm();
saveDirectories();
saveTrips();
render();
