// Daybreak: the new tab page.
//
// Data sources (both free, no API key):
//   Photo of the day: Picsum (https://picsum.photos), which serves photos from Unsplash with the author's name.
//   Weather:          Open-Meteo (https://open-meteo.com), geocoding for the city name + current forecast.
// Everything the user types (name, focus, to-dos, settings) is saved with chrome.storage.local.
// When the page is opened outside Chrome's extension system (e.g. for a quick preview), the same code
// falls back to localStorage, so it still works.

const $ = (id) => document.getElementById(id);

// ---------- Storage (chrome.storage.local, or localStorage as a fallback) ----------

const hasChromeStorage = typeof chrome !== "undefined" && Boolean(chrome.storage?.local);
const PREFIX = "daybreak.";

const storage = {
  async get(keys) {
    if (hasChromeStorage) return chrome.storage.local.get(keys);
    const result = {};
    for (const key of keys) {
      try {
        const raw = localStorage.getItem(PREFIX + key);
        if (raw !== null) result[key] = JSON.parse(raw);
      } catch {}
    }
    return result;
  },
  async set(values) {
    if (hasChromeStorage) return chrome.storage.local.set(values);
    for (const [key, value] of Object.entries(values)) {
      try {
        localStorage.setItem(PREFIX + key, JSON.stringify(value));
      } catch {}
    }
  },
  async clear() {
    if (hasChromeStorage) return chrome.storage.local.clear();
    Object.keys(localStorage).filter((k) => k.startsWith(PREFIX)).forEach((k) => localStorage.removeItem(k));
  },
};

const KEYS = ["name", "focus", "todos", "settings", "photo", "weather"];
const DEFAULT_SETTINGS = {
  clock24: true,
  city: null, // { name, country, lat, lon }
  show: { search: true, weather: true, quote: true, todo: true },
};

let state = { name: "", focus: null, todos: [], settings: DEFAULT_SETTINGS, photo: null, weather: null };

async function loadState() {
  const data = await storage.get(KEYS);
  state = {
    name: data.name || "",
    focus: data.focus || null,
    todos: Array.isArray(data.todos) ? data.todos : [],
    settings: { ...DEFAULT_SETTINGS, ...data.settings, show: { ...DEFAULT_SETTINGS.show, ...data.settings?.show } },
    photo: data.photo || null,
    weather: data.weather || null,
  };
}

function save(key) {
  return storage.set({ [key]: state[key] });
}

// ---------- Dates ----------

// "2026-11-25" in the user's local time zone.
const todayKey = () => new Date().toLocaleDateString("en-CA");
// Days since 1 Jan 1970 in local time: changes at local midnight. Used to pick the photo and quote of the day.
const dayNumber = () => Math.floor((Date.now() - new Date().getTimezoneOffset() * 60_000) / 86_400_000);

// ---------- Clock and greeting ----------

function partOfDay(hour) {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "night";
}

function renderClock() {
  const now = new Date();
  let hours = now.getHours();
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const clock = $("clock");
  if (state.settings.clock24) {
    clock.textContent = `${String(hours).padStart(2, "0")}:${minutes}`;
  } else {
    const ampm = hours < 12 ? "AM" : "PM";
    hours = hours % 12 || 12;
    clock.textContent = `${hours}:${minutes}`;
    clock.append(Object.assign(document.createElement("span"), { className: "ampm", textContent: ampm }));
  }
  const part = partOfDay(now.getHours());
  $("greeting").textContent = part === "night" ? `Good night, ${state.name}.` : `Good ${part}, ${state.name}.`;
}

function startClock() {
  renderClock();
  // Tick exactly on the next full minute, then every minute.
  setTimeout(() => {
    renderClock();
    setInterval(renderClock, 60_000);
  }, 60_000 - (Date.now() % 60_000) + 50);
}

// ---------- Onboarding ----------

function renderScreen() {
  const named = Boolean(state.name);
  $("onboarding").hidden = named;
  $("dashboard").hidden = !named;
  if (!named) $("name-input").focus();
}

$("name-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = $("name-input").value.trim();
  if (!name) return;
  state.name = name;
  await save("name");
  renderScreen();
  renderClock();
  renderFocus();
});

// ---------- Main focus (resets every day) ----------

function currentFocus() {
  return state.focus && state.focus.date === todayKey() ? state.focus : null;
}

function renderFocus() {
  const focus = currentFocus();
  $("focus-form").hidden = Boolean(focus);
  $("focus-show").hidden = !focus;
  if (focus) {
    $("focus-text").textContent = focus.text;
    $("focus-done").checked = focus.done;
    $("focus-show").querySelector(".focus-row").classList.toggle("done", focus.done);
    $("focus-praise").hidden = !focus.done;
  } else {
    $("focus-input").value = "";
  }
}

$("focus-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = $("focus-input").value.trim();
  if (!text) return;
  state.focus = { text, done: false, date: todayKey() };
  await save("focus");
  renderFocus();
});

$("focus-done").addEventListener("change", async () => {
  state.focus.done = $("focus-done").checked;
  await save("focus");
  renderFocus();
});

$("focus-clear").addEventListener("click", async () => {
  state.focus = null;
  await save("focus");
  renderFocus();
  $("focus-input").focus();
});

// ---------- To-dos ----------

function renderTodos() {
  const list = $("todos");
  list.replaceChildren(
    ...state.todos.map((todo) => {
      const li = document.createElement("li");
      li.classList.toggle("done", todo.done);

      const box = Object.assign(document.createElement("input"), { type: "checkbox", checked: todo.done });
      box.setAttribute("aria-label", `Mark "${todo.text}" as done`);
      box.addEventListener("change", () => updateTodos((todos) => todos.map((t) => (t.id === todo.id ? { ...t, done: box.checked } : t))));

      const text = Object.assign(document.createElement("span"), { textContent: todo.text });

      const del = Object.assign(document.createElement("button"), { type: "button", className: "icon-btn", textContent: "×" });
      del.setAttribute("aria-label", `Delete "${todo.text}"`);
      del.addEventListener("click", () => updateTodos((todos) => todos.filter((t) => t.id !== todo.id)));

      li.append(box, text, del);
      return li;
    })
  );
  const open = state.todos.filter((t) => !t.done).length;
  $("todo-count").textContent = state.todos.length ? `${open}` : "";
  $("todo-empty").hidden = state.todos.length > 0;
  $("todo-clear").hidden = !state.todos.some((t) => t.done);
}

async function updateTodos(change) {
  state.todos = change(state.todos);
  await save("todos");
  renderTodos();
}

$("todo-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const text = $("todo-input").value.trim();
  if (!text) return;
  $("todo-input").value = "";
  updateTodos((todos) => [...todos, { id: Date.now(), text, done: false }]);
});

$("todo-clear").addEventListener("click", () => updateTodos((todos) => todos.filter((t) => !t.done)));

// ---------- Quote of the day ----------

function renderQuote() {
  // The same quote all day; the next one at midnight. No server needed.
  const [text, author] = QUOTES[dayNumber() % QUOTES.length];
  $("quote-text").textContent = `“${text}”`;
  $("quote-author").textContent = author;
}

// ---------- Photo of the day (Picsum / Unsplash) ----------

// Until the photo has loaded (or if there is no internet), a gradient matching the time of day is shown.
const FALLBACKS = {
  morning: "linear-gradient(160deg, #6a85b6 0%, #bac8e0 50%, #f6d1a8 100%)",
  afternoon: "linear-gradient(160deg, #2e6fa7 0%, #6aa9d8 55%, #c8e3f2 100%)",
  evening: "linear-gradient(160deg, #2b2e4a 0%, #8e4a6b 55%, #f29f6a 100%)",
  night: "linear-gradient(160deg, #0b1026 0%, #1c2550 60%, #3a2f5c 100%)",
};

async function pickPhoto(shift) {
  // Picsum lists ~1000 photos in pages of 100. The day number picks a page and a landscape photo on it.
  const day = dayNumber() + shift * 37;
  const page = (day % 10) + 1;
  const response = await fetch(`https://picsum.photos/v2/list?page=${page}&limit=100`);
  if (!response.ok) throw new Error(`Picsum answered ${response.status}`);
  const landscape = (await response.json()).filter((photo) => photo.width > photo.height);
  const photo = landscape[(day * 7) % landscape.length];
  return { date: todayKey(), shift, id: photo.id, author: photo.author, source: photo.url };
}

// The photo id and the Unsplash link come from Picsum's API. Only a numeric id and an https:// link
// are used, so an unexpected value can never become a "javascript:" link or a strange image URL.
function safeHttps(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function showPhoto(photo) {
  if (!/^\d+$/.test(String(photo.id))) throw new Error("Unexpected photo id");
  const width = Math.min(2560, Math.ceil(screen.width * (window.devicePixelRatio || 1)));
  const height = Math.round(width * (screen.height / screen.width));
  const url = `https://picsum.photos/id/${photo.id}/${width}/${height}`;

  const img = new Image();
  img.onload = () => {
    $("bg").style.backgroundImage = `url("${img.src}")`;
    $("bg").classList.add("loaded");
  };
  img.src = url;

  const source = safeHttps(photo.source);
  const author = source
    ? Object.assign(document.createElement("a"), { href: source, target: "_blank", rel: "noopener", textContent: photo.author })
    : photo.author;
  $("credit").replaceChildren("Photo by ", author, " on Unsplash");
}

async function loadPhoto(forceShift) {
  $("bg").style.setProperty("--fallback", FALLBACKS[partOfDay(new Date().getHours())]);
  try {
    let photo = state.photo;
    if (forceShift !== undefined || !photo || photo.date !== todayKey()) {
      photo = await pickPhoto(forceShift ?? 0);
      state.photo = photo;
      await save("photo");
    }
    showPhoto(photo);
  } catch {
    $("credit").textContent = "Offline: showing a gradient instead of today's photo";
  }
}

$("new-photo").addEventListener("click", () => {
  const shift = (state.photo?.date === todayKey() ? state.photo.shift : 0) + 1;
  loadPhoto(shift);
});

// ---------- Weather (Open-Meteo) ----------

// WMO weather codes used by Open-Meteo, grouped into a few readable conditions.
function describeWeather(code, isDay) {
  if (code === 0) return [isDay ? "☀️" : "🌙", "Clear sky"];
  if (code <= 2) return [isDay ? "🌤️" : "☁️", "Partly cloudy"];
  if (code === 3) return ["☁️", "Overcast"];
  if (code <= 48) return ["🌫️", "Fog"];
  if (code <= 57) return ["🌦️", "Drizzle"];
  if (code <= 67) return ["🌧️", "Rain"];
  if (code <= 77) return ["🌨️", "Snow"];
  if (code <= 82) return ["🌧️", "Rain showers"];
  if (code <= 86) return ["🌨️", "Snow showers"];
  return ["⛈️", "Thunderstorm"];
}

const WEATHER_MAX_AGE = 30 * 60_000; // ask Open-Meteo at most every 30 minutes

async function loadWeather() {
  const widget = $("weather");
  const city = state.settings.city;
  widget.hidden = !state.settings.show.weather;
  if (widget.hidden) return;

  if (!city) {
    $("weather-icon").textContent = "";
    $("weather-temp").textContent = "";
    $("weather-city").textContent = "Set your city for weather";
    return;
  }

  let cached = state.weather;
  const fresh = cached && cached.lat === city.lat && cached.lon === city.lon && Date.now() - cached.at < WEATHER_MAX_AGE;
  if (!fresh) {
    try {
      const url =
        `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}` +
        "&current=temperature_2m,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max" +
        "&timezone=auto&forecast_days=1";
      const response = await fetch(url);
      if (!response.ok) throw new Error();
      const data = await response.json();
      cached = {
        at: Date.now(),
        lat: city.lat,
        lon: city.lon,
        temp: data.current.temperature_2m,
        code: data.current.weather_code,
        isDay: data.current.is_day === 1,
        max: data.daily.temperature_2m_max[0],
        min: data.daily.temperature_2m_min[0],
        rain: data.daily.precipitation_probability_max?.[0],
      };
      state.weather = cached;
      await save("weather");
    } catch {
      if (!cached) {
        $("weather-city").textContent = `${city.name}: weather unavailable`;
        return;
      }
      // Otherwise keep showing the last known weather.
    }
  }

  const [icon, label] = describeWeather(cached.code, cached.isDay);
  $("weather-icon").textContent = icon;
  $("weather-temp").textContent = `${Math.round(cached.temp)}°`;
  $("weather-city").textContent = city.name;

  const card = $("weather-card");
  card.replaceChildren(
    Object.assign(document.createElement("h3"), { textContent: `${city.name}, ${city.country}` }),
    Object.assign(document.createElement("p"), {
      textContent: `${label} · ${Math.round(cached.temp)}°C now`,
    }),
    Object.assign(document.createElement("p"), {
      textContent: `Today ${Math.round(cached.min)}° to ${Math.round(cached.max)}°${cached.rain != null ? ` · ${cached.rain}% chance of rain` : ""}`,
    }),
    Object.assign(document.createElement("p"), { className: "hint", textContent: "Weather data by Open-Meteo.com" })
  );
}

$("weather-btn").addEventListener("click", () => {
  if (!state.settings.city) {
    openPanel("settings");
    $("set-city").focus();
    return;
  }
  togglePanel("weather");
});

// Finds a city with Open-Meteo's geocoding API and saves its coordinates.
$("city-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const query = $("set-city").value.trim();
  const status = $("city-status");
  if (!query) return;
  status.className = "hint";
  status.textContent = "Looking up…";
  try {
    const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=en`);
    const data = await response.json();
    const place = data.results?.[0];
    if (!place) {
      status.className = "hint error";
      status.textContent = `No place called “${query}” found.`;
      return;
    }
    state.settings.city = { name: place.name, country: place.country || place.country_code, lat: place.latitude, lon: place.longitude };
    await save("settings");
    status.textContent = `✓ Using ${place.name}, ${place.country || place.country_code}`;
    $("set-city").value = place.name;
    loadWeather();
  } catch {
    status.className = "hint error";
    status.textContent = "Couldn't reach the weather service. Check your connection.";
  }
});

// ---------- Search ----------

$("search-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const text = $("search").value.trim();
  if (!text) return;
  if (typeof chrome !== "undefined" && chrome.search?.query) {
    // Uses the search engine the user chose in Chrome's settings.
    chrome.search.query({ text, disposition: "CURRENT_TAB" });
  } else {
    location.href = `https://www.google.com/search?q=${encodeURIComponent(text)}`;
  }
});

// ---------- Panels (to-dos, settings, weather details) ----------

const PANELS = {
  todo: { panel: "todo-panel", button: "todo-btn" },
  settings: { panel: "settings-panel", button: "settings-btn" },
  weather: { panel: "weather-card", button: "weather-btn" },
};

function openPanel(name) {
  for (const [key, { panel, button }] of Object.entries(PANELS)) {
    const open = key === name;
    $(panel).hidden = !open;
    $(button).setAttribute("aria-expanded", String(open));
  }
  if (name === "todo") $("todo-input").focus();
  if (name === "settings") fillSettings();
}

function closePanels() {
  openPanel(null);
}

function togglePanel(name) {
  if ($(PANELS[name].panel).hidden) openPanel(name);
  else closePanels();
}

$("todo-btn").addEventListener("click", () => togglePanel("todo"));
$("settings-btn").addEventListener("click", () => togglePanel("settings"));

// Clicking anywhere outside a panel, or pressing Escape, closes it.
document.addEventListener("click", (event) => {
  const inside = Object.values(PANELS).some(({ panel, button }) => $(panel).contains(event.target) || $(button).contains(event.target));
  if (!inside) closePanels();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closePanels();
});

// ---------- Settings ----------

function fillSettings() {
  $("set-name").value = state.name;
  $("set-city").value = state.settings.city?.name || "";
  $("city-status").textContent = state.settings.city ? `Using ${state.settings.city.name}, ${state.settings.city.country}` : "";
  $("city-status").className = "hint";
  $("set-24h").checked = state.settings.clock24;
  document.querySelectorAll("[data-show]").forEach((box) => (box.checked = state.settings.show[box.dataset.show]));
}

$("set-name").addEventListener("change", async () => {
  const name = $("set-name").value.trim();
  if (!name) return;
  state.name = name;
  await save("name");
  renderClock();
});

$("set-24h").addEventListener("change", async () => {
  state.settings.clock24 = $("set-24h").checked;
  await save("settings");
  renderClock();
});

document.querySelectorAll("[data-show]").forEach((box) =>
  box.addEventListener("change", async () => {
    state.settings.show[box.dataset.show] = box.checked;
    await save("settings");
    applyVisibility();
  })
);

function applyVisibility() {
  const show = state.settings.show;
  $("search-form").hidden = !show.search;
  $("quote").hidden = !show.quote;
  $("todo-btn").hidden = !show.todo;
  if (!show.todo) $("todo-panel").hidden = true;
  loadWeather();
}

$("reset").addEventListener("click", async () => {
  if (!confirm("Delete your name, focus, to-dos and settings from Daybreak? This can't be undone.")) return;
  await storage.clear();
  location.reload();
});

// ---------- Keep several open new tabs in sync ----------

async function reloadFromStorage() {
  await loadState();
  renderScreen();
  renderClock();
  renderFocus();
  renderTodos();
  applyVisibility();
}

if (hasChromeStorage) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && ["name", "focus", "todos", "settings"].some((key) => key in changes)) reloadFromStorage();
  });
} else {
  window.addEventListener("storage", (event) => {
    if (event.key?.startsWith(PREFIX)) reloadFromStorage();
  });
}

// ---------- Start ----------

(async function start() {
  await loadState();
  loadPhoto();
  renderScreen();
  startClock();
  renderFocus();
  renderTodos();
  renderQuote();
  applyVisibility();
})();
