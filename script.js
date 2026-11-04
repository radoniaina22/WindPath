const API_BASE = "https://api.open-meteo.com/v1/forecast";
const GEOCODING_API = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST_CACHE_PREFIX = "windpath-forecast-cache-v1:";
const FORECAST_CACHE_TTL_MS = 60 * 60 * 1000;
const FORECAST_CACHE_MAX_ENTRIES = 3;
const PANEL_LAYOUT_STORAGE_KEY = "windpath-panel-layout-v1";
const PRESSURE_LEVELS = [
  ["975", 320], ["950", 540], ["925", 762], ["900", 988],
  ["850", 1457], ["800", 1949], ["700", 3012], ["600", 4206], ["500", 5574]
];
const HOURLY_FIELDS = [
  "wind_speed_10m", "wind_direction_10m", "wind_gusts_10m", "wind_speed_80m", "wind_direction_80m",
  "wind_speed_120m", "wind_direction_120m", "wind_speed_180m", "wind_direction_180m",
  ...PRESSURE_LEVELS.flatMap(([pressure]) => [`wind_speed_${pressure}hPa`, `wind_direction_${pressure}hPa`])
];
const NAV_COMMANDS = new Set([16, 17, 18, 19, 20, 21, 22, 82, 84, 85, 92, 93]);
const MISSION_COMMAND_NAMES = {
  16: "NAV_WAYPOINT",
  17: "NAV_LOITER_UNLIM",
  18: "NAV_LOITER_TURNS",
  19: "NAV_LOITER_TIME",
  20: "NAV_RETURN_TO_LAUNCH",
  21: "NAV_LAND",
  22: "NAV_TAKEOFF",
  82: "NAV_SPLINE_WAYPOINT",
  84: "NAV_VTOL_TAKEOFF",
  85: "NAV_VTOL_LAND",
  92: "NAV_GUIDED_ENABLE",
  93: "NAV_DELAY"
};
const MAX_PAYLOAD_KG = 5;
const DO_CHANGE_SPEED = 178;
const DO_SET_SERVO = 183;
const VERTICAL_CURRENT_ADJUSTMENT_AMPS_PER_MPS = 7;
const MAX_MODELED_VERTICAL_SPEED_MPS = 2.5;
const MIN_ESTIMATED_CURRENT_AMPS = 1;
const REFERENCE_CURRENT_P95_AMPS = 35.21;
const ROUTE_RESERVE_FRACTION = 0.2;
const PHASE_ALTITUDE_TOLERANCE_METERS = 2;
const DEFAULT_CENTER = [-19.0, 46.7];
const FLIGHT_REFERENCE = {
  payloadKg: 4.3,
  durationMinutes: 151.8483,
  usedMah: 36553,
  loadedCruiseCurrentAmps: 16.149,
  emptyCruiseCurrentAmps: 15.541,
  minimumVoltage: 33.91,
  voltageSamples: [
    { usedMah: 0, voltage: 49.97 },
    { usedMah: 3000, voltage: 48.56 },
    { usedMah: 5000, voltage: 48.34 },
    { usedMah: 7000, voltage: 48.13 },
    { usedMah: 9000, voltage: 48.13 },
    { usedMah: 11000, voltage: 47.81 },
    { usedMah: 13000, voltage: 47.50 },
    { usedMah: 15000, voltage: 47.19 },
    { usedMah: 17000, voltage: 46.59 },
    { usedMah: 19000, voltage: 46.25 },
    { usedMah: 21000, voltage: 45.94 },
    { usedMah: 23000, voltage: 45.06 },
    { usedMah: 25000, voltage: 44.81 },
    { usedMah: 27000, voltage: 44.31 },
    { usedMah: 29000, voltage: 43.78 },
    { usedMah: 31000, voltage: 43.28 },
    { usedMah: 33000, voltage: 42.59 },
    { usedMah: 35000, voltage: 42.09 },
    { usedMah: 36553, voltage: 42.09 }
  ]
};
const FLIGHT_PHASE_REFERENCE = {
  payloadKg: 4.3,
  takeoff: { durationSeconds: 32.4, usedMah: 86 },
  landing: { durationSeconds: 78, usedMah: 44 }
};
const EMPTY_CRUISE_CURRENT_AMPS = FLIGHT_REFERENCE.emptyCruiseCurrentAmps;
const LOADED_CRUISE_CURRENT_AMPS = FLIGHT_REFERENCE.loadedCruiseCurrentAmps;

const elements = {
  workspaceArea: document.querySelector(".workspace-area"),
  mapStage: document.querySelector(".map-stage"),
  energyDashboard: document.querySelector(".energy-dashboard"),
  dashboardResize: document.getElementById("dashboardResize"),
  waypointTablePanel: document.querySelector(".waypoint-table-panel"),
  tableResize: document.getElementById("tableResize"),
  analyzeButton: document.getElementById("analyzeButton"),
  clearMission: document.getElementById("clearMission"),
  emptyState: document.getElementById("emptyState"),
  exportButton: document.getElementById("exportButton"),
  printButton: document.getElementById("printButton"),
  fitMissionButton: document.getElementById("fitMissionButton"),
  loadingOverlay: document.getElementById("loadingOverlay"),
  loadingText: document.getElementById("loadingText"),
  locationSearch: document.getElementById("locationSearch"),
  mapCoordinates: document.getElementById("mapCoordinates"),
  message: document.getElementById("message"),
  missionFile: document.getElementById("missionFile"),
  summaryArrival: document.getElementById("summaryArrival"),
  summaryDrops: document.getElementById("summaryDrops"),
  summaryTakeoff: document.getElementById("summaryTakeoff"),
  summaryWind: document.getElementById("summaryWind"),
  sourceStatus: document.getElementById("sourceStatus"),
  takeoffTime: document.getElementById("takeoffTime"),
  themeToggle: document.getElementById("themeToggle"),
  batteryCapacity: document.getElementById("batteryCapacity"),
  capacityBadge: document.getElementById("capacityBadge"),
  defaultCruiseSpeed: document.getElementById("defaultCruiseSpeed"),
  departureVoltage: document.getElementById("departureVoltage"),
  payloadWeight: document.getElementById("payloadWeight"),
  estimatedTotalMah: document.getElementById("estimatedTotalMah"),
  actualTotalMah: document.getElementById("actualTotalMah"),
  estimatedFinalVoltage: document.getElementById("estimatedFinalVoltage"),
  estimatedCapacityUsed: document.getElementById("estimatedCapacityUsed"),
  payloadEnergyFactor: document.getElementById("payloadEnergyFactor"),
  energyWarning: document.getElementById("energyWarning"),
  estimatedTakeoffMah: document.getElementById("estimatedTakeoffMah"),
  estimatedLandingMah: document.getElementById("estimatedLandingMah"),
  batteryBudgetEstimate: document.getElementById("batteryBudgetEstimate"),
  batteryBudgetPlanned: document.getElementById("batteryBudgetPlanned"),
  batteryBudgetPlanPercent: document.getElementById("batteryBudgetPlanPercent"),
  batteryBudgetMeter: document.getElementById("batteryBudgetMeter"),
  batteryMeterUsed: document.getElementById("batteryMeterUsed"),
  batteryMeterReserve: document.getElementById("batteryMeterReserve"),
  batteryMeterRemaining: document.getElementById("batteryMeterRemaining"),
  batteryBudgetReserve: document.getElementById("batteryBudgetReserve"),
  batteryBudgetUsedPercent: document.getElementById("batteryBudgetUsedPercent"),
  batteryBudgetRemainingPercent: document.getElementById("batteryBudgetRemainingPercent"),
  batteryBudgetStatus: document.getElementById("batteryBudgetStatus"),
  consumptionChart: document.getElementById("consumptionChart"),
  cumulativeChart: document.getElementById("cumulativeChart"),
  voltageChart: document.getElementById("voltageChart"),
  followDrone: document.getElementById("followDrone"),
  missionAlert: document.getElementById("missionAlert"),
  waypointCount: document.getElementById("waypointCount"),
  waypointTable: document.getElementById("waypointTable"),
  waypointList: document.getElementById("waypointList"),
  uploadZone: document.getElementById("uploadZone")
};

const state = {
  waypoints: [],
  markers: [],
  droneMarker: null,
  routeLine: null,
  requestId: 0,
  forecastController: null,
  selectedWaypoint: null,
  forecasts: null,
  followDrone: false,
  lastMissionEventCheckAt: null,
  notifiedMissionEvents: new Set(),
  missionAlertQueue: [],
  missionAlertActive: false,
  missionAlertTimer: null,
  notificationAudioContext: null,
  panelResizeObserver: null,
  themeBeforePrint: null
};

const map = L.map("map", { zoomControl: false, preferCanvas: true }).setView(DEFAULT_CENTER, 6);
L.control.zoom({ position: "bottomright" }).addTo(map);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map);

function getSavedTheme() {
  try {
    const savedTheme = localStorage.getItem("windpath-theme");
    if (savedTheme === "light" || savedTheme === "dark") return savedTheme;
  } catch (error) {
    console.warn("Could not read the saved theme preference:", error);
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const isDark = theme === "dark";
  elements.themeToggle.setAttribute("aria-label", `Switch to ${isDark ? "light" : "dark"} mode`);
  elements.themeToggle.title = `Switch to ${isDark ? "light" : "dark"} mode`;
  document.querySelector('meta[name="theme-color"]').content = isDark ? "#111923" : "#f5f7fa";
}

function defaultTableHeight() {
  const fraction = window.matchMedia("(max-width: 660px)").matches
    ? 0.5
    : window.matchMedia("(max-width: 1100px)").matches ? 0.36 : 0.3;
  return Math.round(window.innerHeight * fraction);
}

function panelSizeLimits(panel) {
  if (panel === "dashboard") {
    if (window.matchMedia("(max-width: 1100px)").matches) return { min: 320, max: 560 };
    return {
      min: 320,
      max: Math.max(320, Math.min(560, elements.workspaceArea.clientWidth - 410))
    };
  }
  const min = window.matchMedia("(max-width: 660px)").matches ? 300 : 220;
  return { min, max: Math.max(min, Math.min(720, window.innerHeight - 420)) };
}

function applyPanelSize(panel, requestedSize) {
  const limits = panelSizeLimits(panel);
  const size = Math.round(Math.max(limits.min, Math.min(limits.max, requestedSize)));
  const property = panel === "dashboard" ? "--dashboard-width" : "--table-height";
  const handle = panel === "dashboard" ? elements.dashboardResize : elements.tableResize;
  elements.workspaceArea.style.setProperty(property, `${size}px`);
  handle.setAttribute("aria-valuemin", String(limits.min));
  handle.setAttribute("aria-valuemax", String(limits.max));
  handle.setAttribute("aria-valuenow", String(size));
  return size;
}

function savePanelLayout(panel) {
  try {
    const savedLayout = JSON.parse(localStorage.getItem(PANEL_LAYOUT_STORAGE_KEY) || "{}");
    const property = panel === "dashboard" ? "--dashboard-width" : "--table-height";
    const storedProperty = panel === "dashboard" ? "dashboardWidth" : "tableHeight";
    savedLayout[storedProperty] = Number.parseFloat(elements.workspaceArea.style.getPropertyValue(property));
    localStorage.setItem(PANEL_LAYOUT_STORAGE_KEY, JSON.stringify(savedLayout));
  } catch (error) {
    console.warn("Could not save panel sizes:", error);
  }
}

function setupPanelResize(panel, handle, defaultSize, initialSize = defaultSize) {
  const pointerPosition = event => panel === "dashboard" ? event.clientX : event.clientY;
  const currentSize = () => panel === "dashboard"
    ? elements.energyDashboard.getBoundingClientRect().width
    : elements.waypointTablePanel.getBoundingClientRect().height;

  handle.addEventListener("pointerdown", event => {
    if (event.button !== 0) return;
    event.preventDefault();
    const startPosition = pointerPosition(event);
    const startSize = currentSize();
    document.body.classList.add("panel-resizing");
    document.body.dataset.resizeAxis = panel === "dashboard" ? "column" : "row";
    const onMove = moveEvent => applyPanelSize(panel, startSize - (pointerPosition(moveEvent) - startPosition));
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      document.body.classList.remove("panel-resizing");
      delete document.body.dataset.resizeAxis;
      savePanelLayout(panel);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
    window.addEventListener("pointercancel", onUp, { once: true });
  });

  handle.addEventListener("keydown", event => {
    const step = event.shiftKey ? 40 : 12;
    const expandKey = panel === "dashboard" ? "ArrowLeft" : "ArrowUp";
    const contractKey = panel === "dashboard" ? "ArrowRight" : "ArrowDown";
    if (event.key === "Home") {
      event.preventDefault();
      applyPanelSize(panel, defaultSize);
      savePanelLayout(panel);
    } else if (event.key === "End") {
      event.preventDefault();
      applyPanelSize(panel, panelSizeLimits(panel).max);
      savePanelLayout(panel);
    } else if (event.key === expandKey || event.key === contractKey) {
      event.preventDefault();
      applyPanelSize(panel, currentSize() + (event.key === expandKey ? step : -step));
      savePanelLayout(panel);
    }
  });

  applyPanelSize(panel, initialSize);
}

function setupPanelSizing() {
  let savedLayout = {};
  try {
    savedLayout = JSON.parse(localStorage.getItem(PANEL_LAYOUT_STORAGE_KEY) || "{}");
  } catch (error) {
    console.warn("Could not read saved panel sizes:", error);
  }
  const defaultDashboardWidth = 360;
  const initialDashboardWidth = Number(savedLayout.dashboardWidth) || defaultDashboardWidth;
  const defaultHeight = defaultTableHeight();
  const initialTableHeight = Number(savedLayout.tableHeight) || defaultHeight;
  setupPanelResize("dashboard", elements.dashboardResize, defaultDashboardWidth, initialDashboardWidth);
  setupPanelResize("table", elements.tableResize, defaultHeight, initialTableHeight);
  if ("ResizeObserver" in window) {
    state.panelResizeObserver = new ResizeObserver(entries => {
      entries.forEach(entry => {
        if (entry.target === elements.energyDashboard) drawEnergyCharts();
        if (entry.target === elements.mapStage) map.invalidateSize({ pan: false });
      });
    });
    state.panelResizeObserver.observe(elements.energyDashboard);
    state.panelResizeObserver.observe(elements.mapStage);
  }
}

function resetMissionAlerts() {
  state.lastMissionEventCheckAt = Date.now();
  state.notifiedMissionEvents.clear();
  state.missionAlertQueue = [];
  state.missionAlertActive = false;
  window.clearTimeout(state.missionAlertTimer);
  elements.missionAlert.hidden = true;
}

function showNextMissionAlert() {
  const message = state.missionAlertQueue.shift();
  if (!message) {
    state.missionAlertActive = false;
    elements.missionAlert.hidden = true;
    return;
  }
  state.missionAlertActive = true;
  elements.missionAlert.textContent = message;
  elements.missionAlert.hidden = false;
  state.missionAlertTimer = window.setTimeout(() => {
    state.missionAlertActive = false;
    showNextMissionAlert();
  }, 4000);
}

function notifyMissionEvent(eventId, message) {
  if (state.notifiedMissionEvents.has(eventId)) return;
  state.notifiedMissionEvents.add(eventId);
  state.missionAlertQueue.push(message);
  if (!state.missionAlertActive) showNextMissionAlert();
  playNotificationTone();
}

function prepareNotificationAudio() {
  const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextConstructor) return;
  try {
    if (!state.notificationAudioContext) state.notificationAudioContext = new AudioContextConstructor();
    state.notificationAudioContext.resume().catch(error => {
      console.warn("Could not enable mission notification sounds:", error);
    });
  } catch (error) {
    console.warn("Could not enable mission notification sounds:", error);
  }
}

function playNotificationTone() {
  const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextConstructor) {
    console.warn("Notification sounds are not supported by this browser.");
    return;
  }
  try {
    if (!state.notificationAudioContext) state.notificationAudioContext = new AudioContextConstructor();
    const audio = state.notificationAudioContext;
    const playTone = (frequency, startTime, duration) => {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.exponentialRampToValueAtTime(0.18, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
      oscillator.connect(gain);
      gain.connect(audio.destination);
      oscillator.start(startTime);
      oscillator.stop(startTime + duration);
    };
    audio.resume().then(() => {
      const startTime = audio.currentTime + 0.03;
      playTone(880, startTime, 0.16);
      playTone(1175, startTime + 0.2, 0.22);
    }).catch(error => console.warn("Could not play the mission notification sound:", error));
  } catch (error) {
    console.warn("Could not play the mission notification sound:", error);
  }
}

function checkMissionAlerts(now) {
  const previousCheck = state.lastMissionEventCheckAt;
  state.lastMissionEventCheckAt = now;
  if (!Number.isFinite(previousCheck) || now < previousCheck) return;
  state.waypoints.forEach((waypoint, index) => {
    if (!Number.isFinite(waypoint.etaTimestamp) || waypoint.etaTimestamp <= previousCheck || waypoint.etaTimestamp > now) return;
    const name = waypoint.name || `Waypoint ${index + 1}`;
    notifyMissionEvent(`waypoint:${waypoint.id}`, `Estimated waypoint reached: ${name}.`);
    if (waypoint.dropActionCount > 0) {
      const count = waypoint.dropActionCount > 1 ? ` (${waypoint.dropActionCount} actions)` : "";
      notifyMissionEvent(`drop:${waypoint.id}`, `Estimated drop at ${name}${count}.`);
    }
  });
}

applyTheme(getSavedTheme());
elements.themeToggle.addEventListener("click", () => {
  const theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(theme);
  try {
    localStorage.setItem("windpath-theme", theme);
  } catch (error) {
    console.warn("Could not save the theme preference:", error);
  }
});

function localDateTimeValue(date) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function setMessage(text, isError = false) {
  elements.message.textContent = text;
  elements.message.hidden = !text;
  elements.message.classList.toggle("error", isError);
}

function setSourceStatus(text, status = "") {
  elements.sourceStatus.textContent = text;
  const dot = document.querySelector(".source-dot");
  dot.className = `source-dot${status ? ` ${status}` : ""}`;
}

function describeWindDirection(degrees) {
  const directions = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return directions[Math.round(((degrees % 360) + 360) % 360 / 22.5) % 16];
}

function windComponents(speed, direction) {
  const radians = direction * Math.PI / 180;
  return { east: -speed * Math.sin(radians), north: -speed * Math.cos(radians) };
}

function interpolateWind(lower, upper, amount) {
  const first = windComponents(lower.speed, lower.direction);
  const second = windComponents(upper.speed, upper.direction);
  const east = first.east + (second.east - first.east) * amount;
  const north = first.north + (second.north - first.north) * amount;
  return {
    speed: Math.hypot(east, north),
    direction: (Math.atan2(-east, -north) * 180 / Math.PI + 360) % 360
  };
}

function nearestForecastIndex(times, selectedTime) {
  const target = selectedTime ? new Date(selectedTime).getTime() : Date.now();
  let nearest = 0;
  let difference = Infinity;
  times.forEach((time, index) => {
    const timeValue = new Date(`${time}Z`).getTime();
    const currentDifference = Math.abs(timeValue - target);
    if (currentDifference < difference) {
      nearest = index;
      difference = currentDifference;
    }
  });
  return nearest;
}

function getWindAtTime(waypoint, forecast, timestamp, homeElevation) {
  const firstTime = new Date(`${forecast.hourly.time[0]}Z`).getTime();
  const lastTime = new Date(`${forecast.hourly.time[forecast.hourly.time.length - 1]}Z`).getTime();
  if (timestamp < firstTime || timestamp > lastTime) {
    throw new Error(`The estimated arrival at ${waypoint.name || "a waypoint"} is outside the available forecast period.`);
  }
  const forecastIndex = nearestForecastIndex(forecast.hourly.time, new Date(timestamp).toISOString());
  const targetAltitude = altitudeAboveGround(waypoint, forecast.elevation, homeElevation);
  const layers = getWindLayers(forecast.hourly, forecastIndex, forecast.elevation);
  const wind = estimateWind(layers, targetAltitude);
  return {
    wind,
    gust: forecast.hourly.wind_gusts_10m?.[forecastIndex] ?? null,
    forecastTime: forecast.hourly.time[forecastIndex],
    targetAltitude,
    groundElevation: forecast.elevation
  };
}

function distanceAndBearing(from, to) {
  const radians = Math.PI / 180;
  const fromLat = from.lat * radians;
  const toLat = to.lat * radians;
  const latitudeDelta = (to.lat - from.lat) * radians;
  const longitudeDelta = (to.lon - from.lon) * radians;
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(fromLat) * Math.cos(toLat) * Math.sin(longitudeDelta / 2) ** 2;
  const distance = 6371000 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
  const bearing = (Math.atan2(
    Math.sin(longitudeDelta) * Math.cos(toLat),
    Math.cos(fromLat) * Math.sin(toLat) - Math.sin(fromLat) * Math.cos(toLat) * Math.cos(longitudeDelta)
  ) * 180 / Math.PI + 360) % 360;
  return { distance, bearing };
}

function estimateLegSpeeds(speedSetting, wind, bearing) {
  const windVector = windComponents(wind.speed, wind.direction);
  const radians = bearing * Math.PI / 180;
  if (speedSetting.type === 1) {
    const east = speedSetting.speed * Math.sin(radians) - windVector.east;
    const north = speedSetting.speed * Math.cos(radians) - windVector.north;
    return { groundSpeed: speedSetting.speed, airSpeed: Math.hypot(east, north), note: "" };
  }

  const tailwind = windVector.east * Math.sin(radians) + windVector.north * Math.cos(radians);
  const crosswind = windVector.east * Math.cos(radians) - windVector.north * Math.sin(radians);
  if (Math.abs(crosswind) >= speedSetting.speed) return { groundSpeed: null, airSpeed: speedSetting.speed, note: "Crosswind exceeds commanded airspeed; track cannot be maintained." };
  const groundSpeed = Math.sqrt(speedSetting.speed ** 2 - crosswind ** 2) + tailwind;
  if (groundSpeed <= 0) return { groundSpeed: null, airSpeed: speedSetting.speed, note: "Headwind prevents forward progress at commanded airspeed." };
  return { groundSpeed, airSpeed: speedSetting.speed, note: "" };
}

function formatArrivalTime(timestamp) {
  return new Date(timestamp).toLocaleString([], {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
  });
}

function updateMissionSummary() {
  const takeoffTimestamp = new Date(elements.takeoffTime.value).getTime();
  elements.summaryTakeoff.textContent = Number.isFinite(takeoffTimestamp)
    ? formatArrivalTime(takeoffTimestamp)
    : "Not set";

  const dropWaypoints = state.waypoints.filter(waypoint => waypoint.dropActionCount > 0);
  if (!dropWaypoints.length) {
    elements.summaryDrops.textContent = "No drop action in mission";
  } else {
    elements.summaryDrops.innerHTML = dropWaypoints.map((waypoint, index) => {
      const label = waypoint.name || `Waypoint ${waypointNumber(waypoint, state.waypoints.indexOf(waypoint))}`;
      const time = Number.isFinite(waypoint.etaTimestamp)
        ? formatClockTime(waypoint.etaTimestamp)
        : "Not estimated";
      const count = waypoint.dropActionCount > 1 ? ` (${waypoint.dropActionCount} actions)` : "";
      return `<span>${escapeHtml(label)}${count}: ${escapeHtml(time)}</span>`;
    }).join("");
  }

  const finalWaypoint = state.waypoints[state.waypoints.length - 1];
  elements.summaryArrival.textContent = Number.isFinite(finalWaypoint?.etaTimestamp)
    ? formatClockTime(finalWaypoint.etaTimestamp)
    : "Not estimated";

  let weightedWindSpeed = 0;
  let totalDistance = 0;
  for (let index = 1; index < state.waypoints.length; index += 1) {
    const waypoint = state.waypoints[index];
    if (!waypoint.wind || !Number.isFinite(waypoint.etaTimestamp)) continue;
    const { distance } = distanceAndBearing(state.waypoints[index - 1], waypoint);
    if (distance <= 0) continue;
    weightedWindSpeed += waypoint.wind.speed * distance;
    totalDistance += distance;
  }
  if (totalDistance === 0 && state.waypoints.length === 1 && state.waypoints[0].wind) {
    elements.summaryWind.textContent = `${state.waypoints[0].wind.speed.toFixed(1)} m/s`;
  } else {
    elements.summaryWind.textContent = totalDistance > 0
      ? `${(weightedWindSpeed / totalDistance).toFixed(1)} m/s`
      : "Not estimated";
  }
}

function updateWaypointEstimates(forecasts) {
  const takeoffTimestamp = new Date(elements.takeoffTime.value).getTime();
  if (!Number.isFinite(takeoffTimestamp)) throw new Error("Choose a valid takeoff date and time.");
  const defaultCruiseSpeed = Number(elements.defaultCruiseSpeed.value);
  if (!Number.isFinite(defaultCruiseSpeed) || defaultCruiseSpeed <= 0) {
    throw new Error("Enter a valid default cruise airspeed greater than zero.");
  }
  const home = state.waypoints.find(point => point.sequence === 0) || state.waypoints[0];
  const homeElevation = forecasts[state.waypoints.indexOf(home)].elevation;
  let previousArrival = takeoffTimestamp;
  const estimates = [];

  state.waypoints.forEach((waypoint, index) => {
    let arrivalTimestamp = index === 0 ? takeoffTimestamp : null;
    let groundSpeed = null;
    let airSpeed = null;
    let estimateNote = index === 0
      ? "Mission start"
      : !waypoint.speedSetting ? `Using default cruise airspeed: ${defaultCruiseSpeed.toFixed(1)} m/s.` : "";
    let sample;

    if (index > 0 && !Number.isFinite(previousArrival)) {
      estimateNote = "Cannot estimate after an unreachable leg.";
    } else if (index > 0) {
      const { distance, bearing } = distanceAndBearing(state.waypoints[index - 1], waypoint);
      const speedSetting = waypoint.speedSetting || { type: 0, speed: defaultCruiseSpeed };
      const initialGroundSpeed = speedSetting.speed;
      let candidateArrival = previousArrival + distance / initialGroundSpeed * 1000;
      let segmentEstimate;
      for (let iteration = 0; iteration < 4; iteration += 1) {
        sample = getWindAtTime(waypoint, forecasts[index], candidateArrival, homeElevation);
        segmentEstimate = estimateLegSpeeds(speedSetting, sample.wind, bearing);
        if (!Number.isFinite(segmentEstimate.groundSpeed)) break;
        const revisedArrival = previousArrival + distance / segmentEstimate.groundSpeed * 1000;
        if (Math.abs(revisedArrival - candidateArrival) < 60000) {
          candidateArrival = revisedArrival;
          break;
        }
        candidateArrival = revisedArrival;
      }

      if (segmentEstimate && Number.isFinite(segmentEstimate.groundSpeed)) {
        sample = getWindAtTime(waypoint, forecasts[index], candidateArrival, homeElevation);
        segmentEstimate = estimateLegSpeeds(speedSetting, sample.wind, bearing);
      }
      if (segmentEstimate && Number.isFinite(segmentEstimate.groundSpeed)) {
        groundSpeed = segmentEstimate.groundSpeed;
        airSpeed = segmentEstimate.airSpeed;
        arrivalTimestamp = previousArrival + distance / groundSpeed * 1000;
      } else {
        estimateNote = segmentEstimate?.note || "Could not estimate speed for this leg.";
      }
    }

    if (!sample) {
      sample = getWindAtTime(
        waypoint,
        forecasts[index],
        Number.isFinite(arrivalTimestamp) ? arrivalTimestamp : takeoffTimestamp,
        homeElevation
      );
    }
    estimates.push({
      wind: sample.wind,
      gust: sample.gust,
      forecastTime: sample.forecastTime,
      targetAltitudeAgl: sample.targetAltitude,
      groundElevation: sample.groundElevation,
      etaTimestamp: arrivalTimestamp,
      groundSpeed,
      airSpeed,
      speedSetting: waypoint.speedSetting,
      estimateNote
    });
    previousArrival = arrivalTimestamp;
  });
  state.waypoints.forEach((waypoint, index) => Object.assign(waypoint, estimates[index]));
  updateEnergyEstimates();
}

function voltageForUsedMah(usedMah, departureVoltage) {
  const samples = FLIGHT_REFERENCE.voltageSamples;
  let referenceVoltage;
  if (usedMah <= samples[0].usedMah) {
    referenceVoltage = samples[0].voltage;
  } else if (usedMah >= samples[samples.length - 1].usedMah) {
    referenceVoltage = samples[samples.length - 1].voltage;
  } else {
    const upperIndex = samples.findIndex(sample => sample.usedMah >= usedMah);
    const lower = samples[Math.max(0, upperIndex - 1)];
    const upper = samples[upperIndex];
    const fraction = (usedMah - lower.usedMah) / (upper.usedMah - lower.usedMah);
    referenceVoltage = lower.voltage + (upper.voltage - lower.voltage) * fraction;
  }
  return {
    voltage: Number.isFinite(departureVoltage) ? departureVoltage + referenceVoltage - samples[0].voltage : null,
    beyondReference: usedMah > samples[samples.length - 1].usedMah
  };
}

function updateEnergyEstimates() {
  const payloadKg = Number(elements.payloadWeight.value);
  const departureVoltage = Number(elements.departureVoltage.value);
  const validDepartureVoltage = Number.isFinite(departureVoltage) && departureVoltage >= 30 && departureVoltage <= 51;
  const validPayload = Number.isFinite(payloadKg) && payloadKg >= 0 && payloadKg <= MAX_PAYLOAD_KG;
  const currentForPayload = weight => EMPTY_CRUISE_CURRENT_AMPS
    + (LOADED_CRUISE_CURRENT_AMPS - EMPTY_CRUISE_CURRENT_AMPS) * weight / FLIGHT_REFERENCE.payloadKg;
  const phaseScale = validPayload
    ? currentForPayload(payloadKg) / currentForPayload(FLIGHT_PHASE_REFERENCE.payloadKg)
    : 1;
  const takeoffMah = FLIGHT_PHASE_REFERENCE.takeoff.usedMah * phaseScale;
  const landingMah = FLIGHT_PHASE_REFERENCE.landing.usedMah * phaseScale;
  let cumulativeMah = 0;
  let previousArrival = null;
  let payloadOnboardKg = payloadKg;
  let estimateAvailable = true;
  state.waypoints.forEach((waypoint, index) => {
    const legPayloadKg = payloadOnboardKg;
    waypoint.legPayloadKg = validPayload ? legPayloadKg : null;
    if (!validPayload || !estimateAvailable || !Number.isFinite(waypoint.etaTimestamp)) {
      estimateAvailable = false;
      waypoint.estimatedUsedMah = null;
      waypoint.estimatedCurrentA = null;
      waypoint.verticalSpeedMps = null;
      waypoint.verticalCurrentAdjustmentA = null;
      waypoint.cumulativeEstimatedMah = null;
      waypoint.estimatedVoltage = null;
      previousArrival = null;
      if (waypoint.dropActionCount > 0) payloadOnboardKg = 0;
      return;
    }

    const groundspeedPowerFactor = waypoint.speedSetting?.type === 1 && Number.isFinite(waypoint.airSpeed)
      ? (waypoint.airSpeed / waypoint.speedSetting.speed) ** 3
      : 1;
    const durationHours = index === 0 || !Number.isFinite(previousArrival)
      ? 0
      : Math.max(0, (waypoint.etaTimestamp - previousArrival) / 3600000);
    const previousWaypoint = index > 0 ? state.waypoints[index - 1] : null;
    const previousAltitudeMsl = previousWaypoint
      && Number.isFinite(previousWaypoint.targetAltitudeAgl)
      && Number.isFinite(previousWaypoint.groundElevation)
      ? previousWaypoint.targetAltitudeAgl + previousWaypoint.groundElevation
      : null;
    const altitudeMsl = Number.isFinite(waypoint.targetAltitudeAgl)
      && Number.isFinite(waypoint.groundElevation)
      ? waypoint.targetAltitudeAgl + waypoint.groundElevation
      : null;
    const verticalSpeedMps = durationHours > 0
      && Number.isFinite(previousAltitudeMsl)
      && Number.isFinite(altitudeMsl)
      ? (altitudeMsl - previousAltitudeMsl) / (durationHours * 3600)
      : 0;
    const modeledVerticalSpeedMps = Math.max(
      -MAX_MODELED_VERTICAL_SPEED_MPS,
      Math.min(MAX_MODELED_VERTICAL_SPEED_MPS, verticalSpeedMps)
    );
    const verticalCurrentAdjustmentA = durationHours > 0
      ? modeledVerticalSpeedMps * VERTICAL_CURRENT_ADJUSTMENT_AMPS_PER_MPS
      : null;
    const estimatedCurrentA = durationHours > 0
      ? Math.max(
        MIN_ESTIMATED_CURRENT_AMPS,
        currentForPayload(legPayloadKg) * groundspeedPowerFactor + verticalCurrentAdjustmentA
      )
      : null;
    const segmentMah = durationHours > 0 ? durationHours * estimatedCurrentA * 1000 : 0;
    const phaseMah = (index === 0 ? takeoffMah : 0)
      + (index === state.waypoints.length - 1 ? landingMah : 0);
    cumulativeMah += segmentMah + phaseMah;
    waypoint.estimatedUsedMah = segmentMah + phaseMah;
    waypoint.estimatedCurrentA = estimatedCurrentA;
    waypoint.verticalSpeedMps = durationHours > 0 ? verticalSpeedMps : null;
    waypoint.verticalCurrentAdjustmentA = verticalCurrentAdjustmentA;
    waypoint.cumulativeEstimatedMah = cumulativeMah;
    waypoint.estimatedVoltage = voltageForUsedMah(cumulativeMah, validDepartureVoltage ? departureVoltage : null).voltage;
    previousArrival = waypoint.etaTimestamp;
    if (waypoint.dropActionCount > 0) payloadOnboardKg = 0;
  });
  updateEnergySummary();
  drawEnergyCharts();
}

function updateEnergySummary() {
  const capacityMah = Number(elements.batteryCapacity.value);
  const departureVoltage = Number(elements.departureVoltage.value);
  const validDepartureVoltage = Number.isFinite(departureVoltage) && departureVoltage >= 30 && departureVoltage <= 51;
  const payloadKg = Number(elements.payloadWeight.value);
  const validPayload = Number.isFinite(payloadKg) && payloadKg >= 0 && payloadKg <= MAX_PAYLOAD_KG;
  const payloadCurrentFactor = validPayload
    ? (EMPTY_CRUISE_CURRENT_AMPS
      + (LOADED_CRUISE_CURRENT_AMPS - EMPTY_CRUISE_CURRENT_AMPS) * payloadKg / FLIGHT_REFERENCE.payloadKg)
      / EMPTY_CRUISE_CURRENT_AMPS
    : null;
  const phaseScale = Number.isFinite(payloadCurrentFactor)
    ? payloadCurrentFactor * EMPTY_CRUISE_CURRENT_AMPS / LOADED_CRUISE_CURRENT_AMPS
    : null;
  const takeoffMah = Number.isFinite(phaseScale) ? FLIGHT_PHASE_REFERENCE.takeoff.usedMah * phaseScale : null;
  const landingMah = Number.isFinite(phaseScale) ? FLIGHT_PHASE_REFERENCE.landing.usedMah * phaseScale : null;
  const estimatedWaypoints = state.waypoints.filter(waypoint => Number.isFinite(waypoint.cumulativeEstimatedMah));
  const finalWaypoint = estimatedWaypoints[estimatedWaypoints.length - 1];
  const estimatedUsedMah = finalWaypoint?.cumulativeEstimatedMah ?? null;
  const reserveMah = Number.isFinite(estimatedUsedMah) ? estimatedUsedMah * ROUTE_RESERVE_FRACTION : null;
  const plannedMah = Number.isFinite(reserveMah) ? estimatedUsedMah + reserveMah : null;
  const validCapacity = Number.isFinite(capacityMah) && capacityMah > 0;
  const usedPercent = validCapacity && Number.isFinite(estimatedUsedMah) ? estimatedUsedMah / capacityMah * 100 : null;
  const reservePercent = validCapacity && Number.isFinite(reserveMah) ? reserveMah / capacityMah * 100 : null;
  const plannedPercent = validCapacity && Number.isFinite(plannedMah) ? plannedMah / capacityMah * 100 : null;
  const remainingPercent = Number.isFinite(plannedPercent) ? Math.max(0, 100 - plannedPercent) : null;
  const actualEntries = state.waypoints.filter(waypoint => Number.isFinite(waypoint.actualCumulativeMah));
  let actualTotal = null;
  state.waypoints.forEach(waypoint => {
    waypoint.cumulativeActualMah = Number.isFinite(waypoint.actualCumulativeMah)
      ? waypoint.actualCumulativeMah
      : null;
  });
  state.waypoints.forEach((waypoint, index) => {
    const currentCumulative = waypoint.actualCumulativeMah;
    const previousCumulative = index > 0 ? state.waypoints[index - 1].actualCumulativeMah : 0;
    waypoint.actualUsedMah = Number.isFinite(currentCumulative) && Number.isFinite(previousCumulative)
      ? currentCumulative - previousCumulative
      : null;
    if (Number.isFinite(currentCumulative)) actualTotal = currentCumulative;
  });

  elements.estimatedTotalMah.textContent = finalWaypoint
    ? `${Math.round(finalWaypoint.cumulativeEstimatedMah).toLocaleString()} mAh`
    : "—";
  elements.estimatedTakeoffMah.textContent = Number.isFinite(takeoffMah)
    ? `${Math.round(takeoffMah)} mAh · ${Math.round(FLIGHT_PHASE_REFERENCE.takeoff.durationSeconds)} s`
    : "—";
  elements.estimatedLandingMah.textContent = Number.isFinite(landingMah)
    ? `${Math.round(landingMah)} mAh · ${Math.round(FLIGHT_PHASE_REFERENCE.landing.durationSeconds)} s`
    : "—";
  elements.batteryBudgetEstimate.textContent = Number.isFinite(estimatedUsedMah)
    ? `${Math.round(estimatedUsedMah).toLocaleString()} mAh`
    : "—";
  elements.batteryBudgetPlanned.textContent = Number.isFinite(plannedMah)
    ? `${Math.round(plannedMah).toLocaleString()} mAh`
    : "—";
  elements.batteryBudgetPlanPercent.textContent = Number.isFinite(plannedPercent)
    ? `${plannedPercent.toFixed(1)}% of ${Math.round(capacityMah / 1000)} Ah`
    : "—";
  elements.batteryBudgetReserve.textContent = Number.isFinite(reserveMah)
    ? `${Math.round(reserveMah).toLocaleString()} mAh`
    : "—";
  elements.batteryBudgetUsedPercent.textContent = Number.isFinite(usedPercent) ? `${usedPercent.toFixed(1)}%` : "—";
  elements.batteryBudgetRemainingPercent.textContent = Number.isFinite(remainingPercent) ? `${remainingPercent.toFixed(1)}%` : "—";
  const usedMeterWidth = Number.isFinite(usedPercent) ? Math.min(100, Math.max(0, usedPercent)) : 0;
  const reserveMeterWidth = Number.isFinite(reservePercent)
    ? Math.min(100 - usedMeterWidth, Math.max(0, reservePercent))
    : 0;
  elements.batteryMeterUsed.style.width = `${usedMeterWidth}%`;
  elements.batteryMeterReserve.style.width = `${reserveMeterWidth}%`;
  elements.batteryMeterRemaining.style.width = `${Math.max(0, 100 - usedMeterWidth - reserveMeterWidth)}%`;
  elements.batteryBudgetMeter.setAttribute("aria-valuenow", String(Number.isFinite(plannedPercent) ? Math.min(100, plannedPercent) : 0));
  elements.batteryBudgetMeter.setAttribute("aria-valuetext", Number.isFinite(plannedPercent)
    ? `${usedPercent.toFixed(1)} percent estimated use, ${reservePercent.toFixed(1)} percent reserve, ${remainingPercent.toFixed(1)} percent remaining`
    : "Route estimate unavailable");
  elements.batteryBudgetStatus.textContent = !validCapacity
    ? "Enter a valid battery capacity to calculate the budget."
    : !Number.isFinite(plannedMah)
      ? "Check waypoint winds to calculate the route budget."
      : plannedMah > capacityMah
        ? `Over capacity by ${Math.round(plannedMah - capacityMah).toLocaleString()} mAh, including reserve.`
        : `${Math.round(capacityMah - plannedMah).toLocaleString()} mAh remains after estimated use and reserve.`;
  elements.actualTotalMah.textContent = !state.waypoints.length
    ? "—"
    : actualEntries.length
      ? `${Math.round(actualTotal).toLocaleString()} mAh (${actualEntries.length}/${state.waypoints.length} waypoints)`
      : "Enter real cumulative mAh";
  elements.estimatedFinalVoltage.textContent = finalWaypoint && Number.isFinite(finalWaypoint.estimatedVoltage)
    ? `${finalWaypoint.estimatedVoltage.toFixed(1)} V`
    : "—";
  elements.estimatedCapacityUsed.textContent = finalWaypoint && Number.isFinite(capacityMah) && capacityMah > 0
    ? `${(finalWaypoint.cumulativeEstimatedMah / capacityMah * 100).toFixed(1)}%`
    : "—";
  elements.payloadEnergyFactor.textContent = Number.isFinite(payloadCurrentFactor)
    ? `${payloadCurrentFactor.toFixed(3)}×`
    : "—";
  elements.capacityBadge.textContent = Number.isFinite(capacityMah) && capacityMah > 0
    ? `12S · ${(capacityMah / 1000).toFixed(capacityMah % 1000 === 0 ? 0 : 1)} Ah`
    : "12S · — Ah";

  const warnings = [];
  if (!Number.isFinite(payloadKg) || payloadKg < 0 || payloadKg > MAX_PAYLOAD_KG) {
    warnings.push(`Enter a payload between 0 and ${MAX_PAYLOAD_KG} kg to calculate battery use.`);
  }
  if (!validDepartureVoltage) {
    warnings.push("Enter a departure voltage between 30 and 51 V to calculate voltage estimates.");
  }
  if (Number.isFinite(capacityMah) && capacityMah > 0 && FLIGHT_REFERENCE.usedMah > capacityMah) {
    warnings.push(`Reference log reports ${FLIGHT_REFERENCE.usedMah.toLocaleString()} mAh, ${(FLIGHT_REFERENCE.usedMah - capacityMah).toLocaleString()} mAh above the configured capacity. Check the battery rating and current counter calibration.`);
  }
  if (finalWaypoint && Number.isFinite(capacityMah) && capacityMah > 0 && finalWaypoint.cumulativeEstimatedMah > capacityMah) {
    warnings.push("The route estimate exceeds the configured battery capacity.");
  }
  if (Number.isFinite(actualTotal) && Number.isFinite(capacityMah) && capacityMah > 0 && actualTotal > capacityMah) {
    warnings.push("Real cumulative battery use exceeds the configured battery capacity.");
  }
  if (finalWaypoint && finalWaypoint.cumulativeEstimatedMah > FLIGHT_REFERENCE.usedMah) {
    warnings.push("This estimate extends beyond the measured flight log; voltage holds at the final reference-bin drop offset to your departure voltage.");
  }
  if (state.waypoints.some(waypoint => waypoint.dropActionCount > 0)) {
    warnings.push("Payload is modeled as onboard through the drop waypoint and empty on subsequent legs. The CSV has no servo timestamp; the loaded/empty current rates are inferred from altitude-stable flight windows.");
  }
  elements.energyWarning.textContent = warnings.join(" ");
  elements.energyWarning.hidden = warnings.length === 0;
}

function drawEnergyCharts() {
  const points = state.waypoints.filter(waypoint => Number.isFinite(waypoint.estimatedUsedMah));
  drawCumulativeChart();
  if (!points.length) {
    elements.consumptionChart.classList.add("empty");
    elements.voltageChart.classList.add("empty");
    elements.consumptionChart.parentElement.classList.add("empty");
    elements.voltageChart.parentElement.classList.add("empty");
    const emptyWidth = Math.max(260, Math.floor(elements.consumptionChart.parentElement.getBoundingClientRect().width));
    elements.consumptionChart.setAttribute("viewBox", `0 0 ${emptyWidth} 76`);
    elements.voltageChart.setAttribute("viewBox", `0 0 ${emptyWidth} 76`);
    elements.consumptionChart.setAttribute("width", String(emptyWidth));
    elements.voltageChart.setAttribute("width", String(emptyWidth));
    elements.consumptionChart.innerHTML = `<text class="chart-empty" x="${emptyWidth / 2}" y="42" text-anchor="middle">Check winds to estimate battery use</text>`;
    elements.voltageChart.innerHTML = `<text class="chart-empty" x="${emptyWidth / 2}" y="42" text-anchor="middle">Voltage estimate appears after wind analysis</text>`;
    return;
  }

  elements.consumptionChart.classList.remove("empty");
  elements.voltageChart.classList.remove("empty");
  elements.consumptionChart.parentElement.classList.remove("empty");
  elements.voltageChart.parentElement.classList.remove("empty");
  const chartWidth = Math.max(260, Math.floor(elements.consumptionChart.parentElement.getBoundingClientRect().width));
  const width = chartWidth;
  const plotLeft = 42;
  const plotRight = width - 18;
  const plotTop = 34;
  const plotBottom = 142;
  const plotHeight = plotBottom - plotTop;
  const maxMah = Math.max(100, ...points.flatMap(waypoint => [
    waypoint.estimatedUsedMah,
    Number.isFinite(waypoint.actualUsedMah) ? waypoint.actualUsedMah : 0
  ]));
  const axisMax = Math.ceil(maxMah / 100) * 100 || 100;
  const groupWidth = (plotRight - plotLeft) / points.length;
  const barWidth = Math.min(17, groupWidth * 0.3);
  const consumptionParts = [
    `<text class="chart-legend estimate-legend" x="${plotLeft}" y="15">Estimated</text>`,
    `<text class="chart-legend actual-legend" x="${plotLeft + 86}" y="15">Real leg (from cumulative)</text>`
  ];
  [0, axisMax / 2, axisMax].forEach(tick => {
    const y = plotBottom - tick / axisMax * plotHeight;
    consumptionParts.push(`<line class="chart-grid" x1="${plotLeft}" y1="${y}" x2="${plotRight}" y2="${y}"></line>`);
    consumptionParts.push(`<text class="chart-axis" x="${plotLeft - 6}" y="${y + 3}" text-anchor="end">${Math.round(tick)}</text>`);
  });
  points.forEach((waypoint, index) => {
    const center = plotLeft + groupWidth * (index + 0.5);
    const estimatedHeight = waypoint.estimatedUsedMah / axisMax * plotHeight;
    consumptionParts.push(`<rect class="chart-bar-estimate" x="${center - barWidth - 1}" y="${plotBottom - estimatedHeight}" width="${barWidth}" height="${estimatedHeight}" rx="2"><title>Waypoint ${index + 1}: estimated ${Math.round(waypoint.estimatedUsedMah)} mAh</title></rect>`);
    if (Number.isFinite(waypoint.actualUsedMah)) {
      const actualHeight = waypoint.actualUsedMah / axisMax * plotHeight;
      consumptionParts.push(`<rect class="chart-bar-actual" x="${center + 1}" y="${plotBottom - actualHeight}" width="${barWidth}" height="${actualHeight}" rx="2"><title>Waypoint ${index + 1}: real ${Math.round(waypoint.actualUsedMah)} mAh</title></rect>`);
    }
    if (index % Math.ceil(points.length / 10) === 0 || index === points.length - 1) {
      consumptionParts.push(`<text class="chart-axis" x="${center}" y="${plotBottom + 16}" text-anchor="middle">WP ${waypointNumber(waypoint, state.waypoints.indexOf(waypoint))}</text>`);
    }
  });
  elements.consumptionChart.setAttribute("viewBox", `0 0 ${width} 170`);
  elements.consumptionChart.setAttribute("width", String(width));
  elements.consumptionChart.innerHTML = consumptionParts.join("");

  const validVoltagePoints = points
    .map((waypoint, index) => ({ waypoint, index }))
    .filter(({ waypoint }) => Number.isFinite(waypoint.estimatedVoltage));
  if (!validVoltagePoints.length) {
    elements.voltageChart.classList.add("empty");
    elements.voltageChart.parentElement.classList.add("empty");
    elements.voltageChart.setAttribute("viewBox", `0 0 ${width} 76`);
    elements.voltageChart.setAttribute("width", String(width));
    elements.voltageChart.innerHTML = `<text class="chart-empty" x="${width / 2}" y="42" text-anchor="middle">Enter a valid departure voltage</text>`;
    return;
  }

  const voltageValues = validVoltagePoints.map(({ waypoint }) => waypoint.estimatedVoltage);
  const minimumVoltage = Math.min(...voltageValues);
  const maximumVoltage = Math.max(...voltageValues);
  const voltageTickStep = Math.max(1, Math.ceil((maximumVoltage - minimumVoltage) / 4));
  const voltageBottom = Math.floor((minimumVoltage - voltageTickStep * 0.25) / voltageTickStep) * voltageTickStep;
  const voltageTop = Math.ceil((maximumVoltage + voltageTickStep * 0.25) / voltageTickStep) * voltageTickStep;
  const voltageY = voltage => plotBottom - (voltage - voltageBottom) / (voltageTop - voltageBottom) * plotHeight;
  const voltageParts = [];
  for (let tick = voltageBottom; tick <= voltageTop; tick += voltageTickStep) {
    const y = voltageY(tick);
    voltageParts.push(`<line class="chart-grid" x1="${plotLeft}" y1="${y}" x2="${plotRight}" y2="${y}"></line>`);
    voltageParts.push(`<text class="chart-axis" x="${plotLeft - 6}" y="${y + 3}" text-anchor="end">${tick.toFixed(0)} V</text>`);
  }
  const linePoints = validVoltagePoints.map(({ waypoint, index }) => ({
    waypoint,
    index,
    x: plotLeft + groupWidth * (index + 0.5),
    y: voltageY(waypoint.estimatedVoltage)
  }));
  voltageParts.push(`<polyline class="chart-voltage-line" points="${linePoints.map(point => `${point.x},${point.y}`).join(" ")}"></polyline>`);
  linePoints.forEach((point, index) => {
    const waypoint = point.waypoint;
    voltageParts.push(`<circle class="chart-voltage-point" cx="${point.x}" cy="${point.y}" r="3"><title>Waypoint ${point.index + 1}: ${waypoint.estimatedVoltage.toFixed(1)} V</title></circle>`);
    if (point.index % Math.ceil(points.length / 10) === 0 || point.index === points.length - 1) {
      voltageParts.push(`<text class="chart-axis" x="${point.x}" y="${plotBottom + 16}" text-anchor="middle">WP ${waypointNumber(waypoint, state.waypoints.indexOf(waypoint))}</text>`);
    }
  });
  elements.voltageChart.setAttribute("viewBox", `0 0 ${width} 170`);
  elements.voltageChart.setAttribute("width", String(width));
  elements.voltageChart.innerHTML = voltageParts.join("");
}

function drawCumulativeChart() {
  const waypoints = state.waypoints;
  const chart = elements.cumulativeChart;
  const estimates = waypoints.filter(point => Number.isFinite(point.cumulativeEstimatedMah));
  const actuals = waypoints.filter(point => Number.isFinite(point.actualCumulativeMah));
  if (!waypoints.length || (!estimates.length && !actuals.length)) {
    chart.classList.add("empty");
    chart.parentElement.classList.add("empty");
    chart.setAttribute("viewBox", "0 0 360 76");
    chart.setAttribute("width", "360");
    const emptyWidth = Math.max(260, Math.floor(chart.parentElement.getBoundingClientRect().width));
    chart.setAttribute("viewBox", `0 0 ${emptyWidth} 76`);
    chart.setAttribute("width", String(emptyWidth));
    chart.innerHTML = `<text class="chart-empty" x="${emptyWidth / 2}" y="42" text-anchor="middle">${waypoints.length ? "Enter real cumulative mAh or check winds" : "Add waypoints to compare cumulative use"}</text>`;
    return;
  }

  chart.classList.remove("empty");
  chart.parentElement.classList.remove("empty");
  const width = Math.max(260, Math.floor(chart.parentElement.getBoundingClientRect().width));
  const plotLeft = 42;
  const plotRight = width - 18;
  const plotTop = 34;
  const plotBottom = 142;
  const plotHeight = plotBottom - plotTop;
  const groupWidth = (plotRight - plotLeft) / waypoints.length;
  const maxMah = Math.max(1000, ...waypoints.flatMap(point => [
    Number.isFinite(point.cumulativeEstimatedMah) ? point.cumulativeEstimatedMah : 0,
    Number.isFinite(point.actualCumulativeMah) ? point.actualCumulativeMah : 0
  ]));
  const axisMax = Math.ceil(maxMah / 1000) * 1000;
  const yForMah = mah => plotBottom - mah / axisMax * plotHeight;
  const pointFor = (waypoint, index, value) => ({
    x: plotLeft + groupWidth * (index + 0.5),
    y: yForMah(value),
    waypoint,
    index
  });
  const parts = [
    `<text class="chart-legend estimate-legend" x="${plotLeft}" y="15">Estimated cumulative</text>`,
    `<text class="chart-legend actual-legend" x="${plotLeft + 133}" y="15">Real cumulative</text>`
  ];
  [0, axisMax / 2, axisMax].forEach(tick => {
    const y = yForMah(tick);
    parts.push(`<line class="chart-grid" x1="${plotLeft}" y1="${y}" x2="${plotRight}" y2="${y}"></line>`);
    parts.push(`<text class="chart-axis" x="${plotLeft - 6}" y="${y + 3}" text-anchor="end">${Math.round(tick).toLocaleString()}</text>`);
  });

  const estimatePoints = waypoints.map((waypoint, index) => Number.isFinite(waypoint.cumulativeEstimatedMah)
    ? pointFor(waypoint, index, waypoint.cumulativeEstimatedMah)
    : null).filter(Boolean);
  if (estimatePoints.length) {
    parts.push(`<polyline class="chart-cumulative-estimate" points="${estimatePoints.map(point => `${point.x},${point.y}`).join(" ")}"></polyline>`);
    estimatePoints.forEach(point => {
      parts.push(`<circle class="chart-cumulative-estimate-point" cx="${point.x}" cy="${point.y}" r="2.5"><title>Waypoint ${waypointNumber(point.waypoint, point.index)}: estimated ${Math.round(point.waypoint.cumulativeEstimatedMah).toLocaleString()} mAh</title></circle>`);
    });
  }

  const actualPoints = waypoints.map((waypoint, index) => Number.isFinite(waypoint.actualCumulativeMah)
    ? pointFor(waypoint, index, waypoint.actualCumulativeMah)
    : null);
  actualPoints.forEach((point, index) => {
    if (!point) return;
    const previous = actualPoints[index - 1];
    if (previous) parts.push(`<line class="chart-cumulative-actual" x1="${previous.x}" y1="${previous.y}" x2="${point.x}" y2="${point.y}"></line>`);
    parts.push(`<circle class="chart-cumulative-actual-point" cx="${point.x}" cy="${point.y}" r="3"><title>Waypoint ${waypointNumber(point.waypoint, point.index)}: real ${Math.round(point.waypoint.actualCumulativeMah).toLocaleString()} mAh</title></circle>`);
  });

  waypoints.forEach((waypoint, index) => {
    if (index % Math.ceil(waypoints.length / 10) === 0 || index === waypoints.length - 1) {
      const x = plotLeft + groupWidth * (index + 0.5);
      parts.push(`<text class="chart-axis" x="${x}" y="${plotBottom + 16}" text-anchor="middle">WP ${waypointNumber(waypoint, index)}</text>`);
    }
  });
  chart.setAttribute("viewBox", `0 0 ${width} 170`);
  chart.setAttribute("width", String(width));
  chart.innerHTML = parts.join("");
}

function parseWaypointsFile(text, fileName) {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("The selected file is empty.");
  if (fileName.toLowerCase().endsWith(".plan") || trimmed.startsWith("{")) {
    let plan;
    try {
      plan = JSON.parse(trimmed);
    } catch {
      throw new Error("This flight plan is not valid JSON.");
    }
    const items = plan.mission && Array.isArray(plan.mission.items) ? plan.mission.items : null;
    if (!items) throw new Error("No QGroundControl mission items were found in this .plan file.");
    const points = [];
    let activeSpeedSetting = null;
    let previousWaypointSpeedSetting = null;
    items.forEach((item, index) => {
      const command = Number(item.command ?? 16);
      if (command === DO_CHANGE_SPEED) {
        const params = Array.isArray(item.params) ? item.params : [];
        const speedType = Number(params[0]);
        const speed = Number(params[1]);
        if (Number.isFinite(speed) && speed > 0 && (speedType === 0 || speedType === 1)) {
          activeSpeedSetting = { type: speedType, speed };
        }
        return;
      }
      if (command === DO_SET_SERVO) {
        const previousWaypoint = points[points.length - 1];
        if (previousWaypoint) previousWaypoint.dropActionCount += 1;
        return;
      }
      if (!NAV_COMMANDS.has(command)) return;
      const coordinate = Array.isArray(item.coordinate)
        ? item.coordinate
        : Array.isArray(item.params) && item.params.length >= 7 ? item.params.slice(4, 7) : null;
      if (!coordinate || coordinate.length < 3) return;
      const frame = Number(item.frame ?? 3);
      const rawMode = typeof item.AltitudeMode === "string" ? item.AltitudeMode.toLowerCase() : "";
      const altitudeMode = rawMode.includes("absolute") || frame === 0 || frame === 5
        ? "absolute"
        : rawMode.includes("terrain") || frame === 6 || frame === 10 ? "terrain" : "relative";
      const waypoint = makeWaypoint({
        lat: Number(coordinate[0]),
        lon: Number(coordinate[1]),
        altitude: Number(coordinate[2]),
        frame,
        sequence: Number(item.sequence ?? item.doJumpId ?? index + 1),
        command,
        name: command === 22 ? "Takeoff" : command === 21 ? "Land" : `Waypoint ${item.sequence ?? item.doJumpId ?? index + 1}`,
        altitudeMode
      });
      if (waypoint) {
        waypoint.speedSetting = activeSpeedSetting;
        waypoint.speedChanged = Boolean(activeSpeedSetting && (
          !previousWaypointSpeedSetting
          || previousWaypointSpeedSetting.type !== activeSpeedSetting.type
          || previousWaypointSpeedSetting.speed !== activeSpeedSetting.speed
        ));
        previousWaypointSpeedSetting = activeSpeedSetting;
        points.push(waypoint);
      }
    });
    if (!points.length) throw new Error("No GPS waypoint coordinates were found in this .plan file.");
    return points;
  }

  const lines = trimmed.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const start = lines[0].startsWith("QGC WPL") ? 1 : 0;
  const points = [];
  let activeSpeedSetting = null;
  let previousWaypointSpeedSetting = null;
  for (const line of lines.slice(start)) {
    const fields = line.split(/\s+/);
    if (fields.length < 12) continue;
    const sequence = Number(fields[0]);
    const frame = Number(fields[2]);
    const command = Number(fields[3]);
    if (command === DO_CHANGE_SPEED) {
      const speedType = Number(fields[4]);
      const speed = Number(fields[5]);
      if (Number.isFinite(speed) && speed > 0 && (speedType === 0 || speedType === 1)) {
        activeSpeedSetting = { type: speedType, speed };
      }
      continue;
    }
    if (command === DO_SET_SERVO) {
      const previousWaypoint = points[points.length - 1];
      if (previousWaypoint) previousWaypoint.dropActionCount += 1;
      continue;
    }
    const lat = Number(fields[8]);
    const lon = Number(fields[9]);
    const altitude = Number(fields[10]);
    if (!Number.isFinite(sequence) || !NAV_COMMANDS.has(command)) continue;
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180 || !Number.isFinite(altitude)) continue;
    const waypoint = makeWaypoint({
      lat, lon, altitude, frame, sequence, command,
      name: command === 22 ? "Takeoff" : command === 21 ? "Land" : `Waypoint ${sequence}`,
      altitudeMode: frame === 0 || frame === 5 ? "absolute" : frame === 6 || frame === 10 ? "terrain" : "relative"
    });
    if (waypoint) {
      waypoint.speedSetting = activeSpeedSetting;
      waypoint.speedChanged = Boolean(activeSpeedSetting && (
        !previousWaypointSpeedSetting
        || previousWaypointSpeedSetting.type !== activeSpeedSetting.type
        || previousWaypointSpeedSetting.speed !== activeSpeedSetting.speed
      ));
      previousWaypointSpeedSetting = activeSpeedSetting;
      points.push(waypoint);
    }
  }
  if (!points.length) throw new Error("No supported GPS waypoints were found. Check that this is a Mission Planner .waypoints file.");
  return points;
}

function makeWaypoint({ lat, lon, altitude = 100, frame = 3, sequence, command = 16, name, altitudeMode = "relative" }) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || (lat === 0 && lon === 0)) return null;
  if (!Number.isFinite(altitude)) throw new Error(`Waypoint ${sequence ?? ""} has an invalid altitude.`);
  return {
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    lat, lon, altitude, frame, sequence, command, name, altitudeMode,
    dropActionCount: 0,
    wind: null, gust: null, forecastTime: null, sampledAltitude: null, altitudeNote: "",
    etaTimestamp: null, groundSpeed: null, airSpeed: null, speedSetting: null, speedChanged: false, estimateNote: "",
    estimatedUsedMah: null, estimatedCurrentA: null, cumulativeEstimatedMah: null, estimatedVoltage: null,
    legPayloadKg: null, verticalSpeedMps: null, verticalCurrentAdjustmentA: null,
    actualPassedAt: null,
    actualUsedMah: null, actualCumulativeMah: null, cumulativeActualMah: null
  };
}

function altitudeAboveGround(waypoint, groundElevation, homeElevation) {
  const absolute = waypoint.altitudeMode === "absolute" || waypoint.frame === 0 || waypoint.frame === 5;
  if (absolute) return waypoint.altitude - groundElevation;
  if (waypoint.altitudeMode === "terrain" || waypoint.frame === 6 || waypoint.frame === 10) return waypoint.altitude;
  if (waypoint.frame === 3 && Number.isFinite(homeElevation)) return waypoint.altitude + homeElevation - groundElevation;
  return waypoint.altitude;
}

function getWindLayers(hourly, index, groundElevation) {
  const layers = [];
  for (const height of [10, 80, 120, 180]) {
    const speed = hourly[`wind_speed_${height}m`]?.[index];
    const direction = hourly[`wind_direction_${height}m`]?.[index];
    if (Number.isFinite(speed) && Number.isFinite(direction)) layers.push({ altitude: height, speed, direction });
  }
  for (const [pressure, altitudeMsl] of PRESSURE_LEVELS) {
    const speed = hourly[`wind_speed_${pressure}hPa`]?.[index];
    const direction = hourly[`wind_direction_${pressure}hPa`]?.[index];
    const altitudeAgl = altitudeMsl - groundElevation;
    if (altitudeAgl > 180 && Number.isFinite(speed) && Number.isFinite(direction)) {
      layers.push({ altitude: altitudeAgl, speed, direction });
    }
  }
  return layers.sort((first, second) => first.altitude - second.altitude);
}

function estimateWind(layers, targetAltitude) {
  if (!layers.length) throw new Error("The forecast did not include wind data for this location.");
  if (targetAltitude <= layers[0].altitude) {
    return { ...layers[0], note: targetAltitude < layers[0].altitude ? `Nearest forecast level: ${layers[0].altitude} m` : "" };
  }
  for (let index = 1; index < layers.length; index += 1) {
    const upper = layers[index];
    const lower = layers[index - 1];
    if (targetAltitude <= upper.altitude) {
      const amount = (targetAltitude - lower.altitude) / (upper.altitude - lower.altitude);
      return { ...interpolateWind(lower, upper, amount), altitude: targetAltitude, note: "" };
    }
  }
  const highest = layers[layers.length - 1];
  return { ...highest, note: `Above forecast levels; using ${Math.round(highest.altitude)} m level` };
}

function formatForecastTime(value) {
  return new Date(`${value}Z`).toLocaleString([], {
    timeZone: "UTC", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
  });
}

function batchApiUrl(points) {
  const params = new URLSearchParams({
    latitude: points.map(point => point.lat.toFixed(5)).join(","),
    longitude: points.map(point => point.lon.toFixed(5)).join(","),
    hourly: HOURLY_FIELDS.join(","),
    wind_speed_unit: "ms",
    forecast_days: "3",
    timezone: "UTC"
  });
  return `${API_BASE}?${params.toString()}`;
}

async function fetchForecastBatch(points, signal) {
  const url = batchApiUrl(points);
  const cacheKey = `${FORECAST_CACHE_PREFIX}${url}`;
  const cachedResults = readForecastCache(cacheKey, points.length);
  if (cachedResults) return { results: cachedResults, fromCache: true };

  const response = await fetch(url, { signal });
  if (!response.ok) {
    if (response.status === 429) {
      throw new Error("Open-Meteo's daily request limit has been reached. Please try again after it resets; repeated retries will not help.");
    }
    const detail = await response.text();
    throw new Error(`Open-Meteo returned ${response.status}: ${detail.slice(0, 180)}`);
  }
  const data = await response.json();
  const results = Array.isArray(data) ? data : [data];
  if (results.length !== points.length) throw new Error("The forecast API returned an unexpected number of locations.");
  writeForecastCache(cacheKey, results);
  return { results, fromCache: false };
}

function readForecastCache(cacheKey, expectedCount) {
  try {
    const serialized = localStorage.getItem(cacheKey);
    if (!serialized) return null;

    const cached = JSON.parse(serialized);
    if (
      !cached ||
      !Number.isFinite(cached.expiresAt) ||
      cached.expiresAt <= Date.now() ||
      !Array.isArray(cached.results) ||
      cached.results.length !== expectedCount ||
      cached.results.some(result => !result || !result.hourly || !Array.isArray(result.hourly.time))
    ) {
      localStorage.removeItem(cacheKey);
      return null;
    }
    return cached.results;
  } catch (error) {
    console.warn("Could not read the cached forecast:", error);
    return null;
  }
}

function writeForecastCache(cacheKey, results) {
  try {
    const cacheEntries = [];
    const cacheKeys = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key && key.startsWith(FORECAST_CACHE_PREFIX) && key !== cacheKey) {
        cacheKeys.push(key);
      }
    }
    for (const key of cacheKeys) {
      try {
        const entry = JSON.parse(localStorage.getItem(key));
        cacheEntries.push({ key, savedAt: entry && Number.isFinite(entry.savedAt) ? entry.savedAt : 0 });
      } catch {
        localStorage.removeItem(key);
      }
    }
    cacheEntries.sort((a, b) => a.savedAt - b.savedAt);
    while (cacheEntries.length >= FORECAST_CACHE_MAX_ENTRIES) {
      localStorage.removeItem(cacheEntries.shift().key);
    }
    const savedAt = Date.now();
    localStorage.setItem(cacheKey, JSON.stringify({
      savedAt,
      expiresAt: savedAt + FORECAST_CACHE_TTL_MS,
      results
    }));
  } catch (error) {
    console.warn("Could not save the forecast cache:", error);
  }
}

async function fetchForecastForMission() {
  if (!state.waypoints.length) return;
  const requestId = ++state.requestId;
  if (state.forecastController) state.forecastController.abort();
  state.forecastController = new AbortController();
  const { signal } = state.forecastController;
  setMessage("");
  elements.loadingOverlay.hidden = false;
  elements.loadingText.textContent = `Fetching ${state.waypoints.length} altitude-specific forecast${state.waypoints.length === 1 ? "" : "s"}…`;
  elements.analyzeButton.disabled = true;
  setSourceStatus("Fetching Open-Meteo forecast…", "loading");
  state.waypoints.forEach(waypoint => {
    waypoint.wind = null;
    waypoint.gust = null;
    waypoint.etaTimestamp = null;
    waypoint.groundSpeed = null;
    waypoint.airSpeed = null;
    waypoint.estimatedUsedMah = null;
    waypoint.estimatedCurrentA = null;
    waypoint.verticalSpeedMps = null;
    waypoint.verticalCurrentAdjustmentA = null;
    waypoint.cumulativeEstimatedMah = null;
    waypoint.estimatedVoltage = null;
  });
  updateEnergySummary();
  drawEnergyCharts();
  renderWaypoints();
  try {
    const batches = [];
    for (let offset = 0; offset < state.waypoints.length; offset += 80) {
      batches.push(state.waypoints.slice(offset, offset + 80));
    }
    const forecastBatches = await Promise.all(batches.map(batch => fetchForecastBatch(batch, signal)));
    if (requestId !== state.requestId) return;
    const forecasts = forecastBatches.flatMap(batch => batch.results);
    state.forecasts = forecasts;
    updateWaypointEstimates(forecasts);
    state.waypoints.forEach(waypoint => {
      waypoint.altitudeNote = waypoint.wind.note;
    });
    resetMissionAlerts();
    renderWaypoints();
    drawWindIndicators();
    const forecastLabel = state.waypoints[0].forecastTime;
    const cacheLabel = forecastBatches.every(batch => batch.fromCache) ? " · cached" : "";
    setSourceStatus(`Forecast · ${formatForecastTime(forecastLabel)} UTC${cacheLabel}`, "ready");
    elements.mapCoordinates.textContent = `${state.waypoints.length} waypoint${state.waypoints.length === 1 ? "" : "s"} · wind sampled at estimated arrival`;
  } catch (error) {
    if (error.name === "AbortError" || requestId !== state.requestId) return;
    state.forecasts = null;
    state.waypoints.forEach(waypoint => {
      waypoint.wind = null;
      waypoint.gust = null;
      waypoint.forecastTime = null;
      waypoint.etaTimestamp = null;
      waypoint.groundSpeed = null;
      waypoint.airSpeed = null;
      waypoint.estimateNote = "";
      waypoint.altitudeNote = "";
      waypoint.estimatedUsedMah = null;
      waypoint.estimatedCurrentA = null;
      waypoint.verticalSpeedMps = null;
      waypoint.verticalCurrentAdjustmentA = null;
      waypoint.cumulativeEstimatedMah = null;
      waypoint.estimatedVoltage = null;
    });
    renderWaypoints();
    console.error("Could not retrieve the wind forecast:", error);
    setMessage(`Could not load the forecast. ${error.message}`, true);
    setSourceStatus("Forecast unavailable — check your connection", "error");
  } finally {
    if (requestId === state.requestId) {
      elements.loadingOverlay.hidden = true;
      elements.analyzeButton.disabled = !state.waypoints.length;
    }
  }
}

function waypointNumber(waypoint, index) {
  return Number.isFinite(waypoint.sequence) ? waypoint.sequence : index + 1;
}

function waypointPhaseLabels(waypoint, index) {
  const phases = [];
  if ([22, 84].includes(waypoint.command)) phases.push("Takeoff");
  if ([21, 85].includes(waypoint.command)) phases.push("Landing");

  const previousWaypoint = index > 0 ? state.waypoints[index - 1] : null;
  const altitude = Number.isFinite(waypoint.targetAltitudeAgl) ? waypoint.targetAltitudeAgl : waypoint.altitude;
  const previousAltitude = previousWaypoint
    ? Number.isFinite(previousWaypoint.targetAltitudeAgl) ? previousWaypoint.targetAltitudeAgl : previousWaypoint.altitude
    : null;
  if (Number.isFinite(previousAltitude) && Number.isFinite(altitude)) {
    const altitudeChange = altitude - previousAltitude;
    if (altitudeChange > PHASE_ALTITUDE_TOLERANCE_METERS) phases.push("Climbing");
    else if (altitudeChange < -PHASE_ALTITUDE_TOLERANCE_METERS) phases.push("Descending");
    else phases.push("Level");
  } else if (!phases.length) {
    phases.push("Level");
  }

  if (waypoint.dropActionCount > 0) phases.push("Dropping");
  return phases;
}

function passTimeDifference(waypoint) {
  if (!Number.isFinite(waypoint.actualPassedAt)) return { label: "Not recorded", status: "pending" };
  if (!Number.isFinite(waypoint.etaTimestamp)) return { label: "ETA unavailable", status: "pending" };
  const differenceMs = waypoint.actualPassedAt - waypoint.etaTimestamp;
  if (Math.abs(differenceMs) < 30000) return { label: "On time", status: "on-time" };
  const totalSeconds = Math.round(Math.abs(differenceMs) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const duration = minutes ? `${minutes}m ${seconds}s` : `${seconds}s`;
  return differenceMs > 0
    ? { label: `${duration} late`, status: "late" }
    : { label: `${duration} early`, status: "early" };
}

function formatPassTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function missionCommandLabel(waypoint) {
  const commandName = MISSION_COMMAND_NAMES[waypoint.command] || `MAV_CMD_${waypoint.command}`;
  return `${waypoint.command} — ${commandName}`;
}

function markerIcon(waypoint, index, selected) {
  const number = waypointNumber(waypoint, index);
  const gust = Number.isFinite(waypoint.gust) ? `${waypoint.gust.toFixed(1)} m/s` : null;
  const dropEstimate = waypoint.dropActionCount && Number.isFinite(waypoint.etaTimestamp)
    ? `<div class="map-drop-label"><span>DROP ${formatArrivalTime(waypoint.etaTimestamp)}</span></div>`
    : "";
  const wind = waypoint.wind
    ? `<div class="map-wind-label" title="Wind ${waypoint.wind.speed.toFixed(1)} m/s from ${Math.round(waypoint.wind.direction)}°${gust ? `; 10 m gust ${gust}` : ""}"><span class="map-wind-arrow" style="transform:rotate(${(waypoint.wind.direction + 180) % 360}deg)">↑</span><span>${waypoint.wind.speed.toFixed(1)} m/s</span><span class="map-wind-direction">from ${Math.round(waypoint.wind.direction)}°</span>${gust ? `<span class="map-wind-gust">gust ${gust}</span>` : ""}</div>`
    : "";
  return L.divIcon({
    className: `waypoint-marker${selected ? " selected" : ""}`,
    html: `<div class="map-waypoint-label"><div class="map-waypoint-top"><div class="waypoint-marker-inner"><span>${number}</span></div>${wind}</div>${dropEstimate}</div>`,
    iconSize: [390, 76],
    iconAnchor: [14, 33]
  });
}

function renderMap() {
  state.markers.forEach(marker => marker.remove());
  state.markers = state.waypoints.map((waypoint, index) => {
    const marker = L.marker([waypoint.lat, waypoint.lon], { icon: markerIcon(waypoint, index, waypoint.id === state.selectedWaypoint) }).addTo(map);
    marker.on("click", () => selectWaypoint(waypoint.id));
    marker.bindPopup(popupContent(waypoint, index));
    return marker;
  });
  if (state.routeLine) state.routeLine.remove();
  if (state.waypoints.length > 1) {
    state.routeLine = L.polyline(state.waypoints.map(point => [point.lat, point.lon]), {
      color: "#238d74",
      weight: 3,
      opacity: .8,
      dashArray: "7 8"
    }).addTo(map);
    state.routeLine.bringToBack();
  } else {
    state.routeLine = null;
  }
  drawWindIndicators();
  updateDronePosition();
}

function popupContent(waypoint, index) {
  const gust = Number.isFinite(waypoint.gust) ? `${waypoint.gust.toFixed(1)} m/s` : "Unavailable";
  const wind = waypoint.wind
    ? `<div class="popup-wind">${waypoint.wind.speed.toFixed(1)} m/s · wind from ${Math.round(waypoint.wind.direction)}° (${describeWindDirection(waypoint.wind.direction)})</div><div class="popup-detail">10 m gust: ${gust}</div><div class="popup-detail">Wind altitude: ${waypoint.targetAltitudeAgl.toFixed(0)} m AGL · forecast level ${waypoint.wind.altitude.toFixed(0)} m</div>`
    : '<div class="popup-detail">Wind forecast not loaded</div>';
  const estimate = Number.isFinite(waypoint.etaTimestamp)
    ? `<div class="popup-detail">Estimated arrival: ${formatArrivalTime(waypoint.etaTimestamp)}</div>${waypoint.dropActionCount ? `<div class="popup-detail">Estimated drop: ${formatArrivalTime(waypoint.etaTimestamp)} (${waypoint.dropActionCount} DO_SET_SERVO action${waypoint.dropActionCount === 1 ? "" : "s"})</div>` : ""}<div class="popup-detail">Wind sample: ${formatForecastTime(waypoint.forecastTime)} UTC</div><div class="popup-detail">Ground speed: ${Number.isFinite(waypoint.groundSpeed) ? `${waypoint.groundSpeed.toFixed(1)} m/s` : "Mission start"}</div><div class="popup-detail">Airspeed: ${Number.isFinite(waypoint.airSpeed) ? `${waypoint.airSpeed.toFixed(1)} m/s` : "Unavailable"}</div>${Number.isFinite(waypoint.estimatedUsedMah) && Number.isFinite(waypoint.estimatedVoltage) ? `<div class="popup-detail">Estimated battery use: ${Math.round(waypoint.estimatedUsedMah)} mAh · voltage ${waypoint.estimatedVoltage.toFixed(1)} V</div>` : ""}`
    : waypoint.estimateNote ? `<div class="popup-detail">${escapeHtml(waypoint.estimateNote)}</div>` : "";
  return `<div class="popup-title">${escapeHtml(waypoint.name || `Waypoint ${index + 1}`)}</div><div class="popup-detail">${waypoint.lat.toFixed(5)}, ${waypoint.lon.toFixed(5)}</div><div class="popup-detail">Mission altitude: ${waypoint.altitude} m</div>${estimate}${wind}`;
}

function drawWindIndicators() {
  state.waypoints.forEach((waypoint, index) => {
    if (!state.markers[index]) return;
    state.markers[index].setIcon(markerIcon(waypoint, index, waypoint.id === state.selectedWaypoint));
    state.markers[index].setPopupContent(popupContent(waypoint, index));
  });
}

function updateDronePosition() {
  const waypoints = state.waypoints;
  const first = waypoints[0];
  if (!first || !Number.isFinite(first.etaTimestamp)) {
    if (state.droneMarker) {
      state.droneMarker.remove();
      state.droneMarker = null;
    }
    state.followDrone = false;
    elements.followDrone.checked = false;
    elements.followDrone.disabled = true;
    return;
  }

  const now = Date.now();
  checkMissionAlerts(now);
  let position = { lat: first.lat, lon: first.lon };
  let bearing = 0;
  let status = now < first.etaTimestamp ? "UPCOMING" : "IN FLIGHT";
  let positionedOnLeg = false;
  let currentGroundSpeed = null;
  let currentAirSpeed = null;

  for (let index = 1; index < waypoints.length; index += 1) {
    const from = waypoints[index - 1];
    const to = waypoints[index];
    if (!Number.isFinite(from.etaTimestamp) || !Number.isFinite(to.etaTimestamp)) break;
    if (now >= to.etaTimestamp) {
      position = { lat: to.lat, lon: to.lon };
      continue;
    }
    if (now >= from.etaTimestamp) {
      const duration = to.etaTimestamp - from.etaTimestamp;
      const progress = duration > 0 ? (now - from.etaTimestamp) / duration : 0;
      position = {
        lat: from.lat + (to.lat - from.lat) * progress,
        lon: from.lon + (to.lon - from.lon) * progress
      };
      bearing = distanceAndBearing(from, to).bearing;
      positionedOnLeg = true;
      currentGroundSpeed = to.groundSpeed;
      currentAirSpeed = to.airSpeed;
    }
    break;
  }

  const last = waypoints[waypoints.length - 1];
  if (Number.isFinite(last.etaTimestamp) && now >= last.etaTimestamp) {
    position = { lat: last.lat, lon: last.lon };
    status = "ARRIVED";
    currentGroundSpeed = 0;
    currentAirSpeed = 0;
  }

  if (!state.droneMarker) {
    const icon = L.divIcon({
      className: "live-drone-marker",
      html: '<div class="live-drone-symbol" title="Estimated drone position"><svg class="live-drone-plane" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2 3 11 6 4v3l-7-2-2 4-2-4-7 2v-3l6-4 3-11Z"/></svg></div><div class="live-drone-details"><span class="live-drone-status"></span><span class="live-drone-speeds"></span></div>',
      iconSize: [176, 54],
      iconAnchor: [18, 19]
    });
    state.droneMarker = L.marker([position.lat, position.lon], {
      icon,
      keyboard: false,
      interactive: false,
      zIndexOffset: 1000
    }).addTo(map);
  } else {
    state.droneMarker.setLatLng([position.lat, position.lon]);
  }
  elements.followDrone.disabled = false;
  if (state.followDrone && map.getCenter().distanceTo([position.lat, position.lon]) > 25) {
    map.panTo([position.lat, position.lon], { animate: true, duration: 0.35 });
  }

  const markerElement = state.droneMarker.getElement();
  if (markerElement) {
    const plane = markerElement.querySelector(".live-drone-plane");
    const statusLabel = markerElement.querySelector(".live-drone-status");
    const speedsLabel = markerElement.querySelector(".live-drone-speeds");
    if (plane) plane.style.transform = `rotate(${positionedOnLeg ? bearing : 0}deg)`;
    if (statusLabel) statusLabel.textContent = status;
    if (speedsLabel) {
      const groundSpeedText = Number.isFinite(currentGroundSpeed) ? currentGroundSpeed.toFixed(1) : "—";
      const airSpeedText = Number.isFinite(currentAirSpeed) ? currentAirSpeed.toFixed(1) : "—";
      speedsLabel.textContent = `GS ${groundSpeedText} · AS ${airSpeedText} m/s`;
    }
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function renderWaypoints() {
  updateMissionSummary();
  updateEnergySummary();
  elements.waypointCount.textContent = String(state.waypoints.length);
  elements.emptyState.hidden = state.waypoints.length > 0;
  elements.waypointTable.hidden = state.waypoints.length === 0;
  elements.clearMission.disabled = state.waypoints.length === 0;
  elements.exportButton.disabled = state.waypoints.length === 0;
  elements.printButton.disabled = state.waypoints.length === 0;
  elements.fitMissionButton.disabled = state.waypoints.length === 0;
  elements.analyzeButton.disabled = state.waypoints.length === 0 || !elements.loadingOverlay.hidden;
  elements.waypointList.innerHTML = state.waypoints.map((waypoint, index) => {
    const displayedAirSpeed = Number.isFinite(waypoint.airSpeed)
      ? waypoint.airSpeed
      : waypoint.speedSetting?.type === 0 ? waypoint.speedSetting.speed : null;
    const speedCommand = Number.isFinite(displayedAirSpeed) ? `${displayedAirSpeed.toFixed(1)} m/s` : "—";
    const wind = waypoint.wind
      ? `${waypoint.wind.speed.toFixed(1)} m/s from ${Math.round(waypoint.wind.direction)}°`
      : "Not checked";
    const estimatedUsed = Number.isFinite(waypoint.estimatedUsedMah) ? Math.round(waypoint.estimatedUsedMah).toLocaleString() : "—";
    const estimatedCurrent = Number.isFinite(waypoint.estimatedCurrentA)
      ? `<span class="estimate-mark current-mark" style="--mark-hue:${120 - colorScaleHue(waypoint.estimatedCurrentA, MIN_ESTIMATED_CURRENT_AMPS, REFERENCE_CURRENT_P95_AMPS)}" title="Estimated current; red begins at the log p95 of ${REFERENCE_CURRENT_P95_AMPS} A">${waypoint.estimatedCurrentA.toFixed(1)} A</span>`
      : "—";
    const estimatedVoltage = Number.isFinite(waypoint.estimatedVoltage)
      ? `<span class="estimate-mark voltage-mark" style="--mark-hue:${colorScaleHue(waypoint.estimatedVoltage, FLIGHT_REFERENCE.minimumVoltage, FLIGHT_REFERENCE.voltageSamples[0].voltage)}" title="Estimated voltage from ${FLIGHT_REFERENCE.minimumVoltage.toFixed(1)} V logged minimum to ${FLIGHT_REFERENCE.voltageSamples[0].voltage.toFixed(1)} V full-charge reference">${waypoint.estimatedVoltage.toFixed(1)} V</span>`
      : "—";
    const estimatedCumulative = Number.isFinite(waypoint.cumulativeEstimatedMah) ? Math.round(waypoint.cumulativeEstimatedMah).toLocaleString() : "—";
    const phaseLabels = waypointPhaseLabels(waypoint, index);
    const phaseMarkup = phaseLabels.map(phase => `<span class="phase-label phase-label--${phase.toLowerCase()}">${phase}</span>`).join("");
    const passDifference = passTimeDifference(waypoint);
    const actualPassTime = Number.isFinite(waypoint.actualPassedAt) ? formatPassTime(waypoint.actualPassedAt) : "Not passed";
    const passButtonLabel = Number.isFinite(waypoint.actualPassedAt) ? "Clear" : "Mark passed";
    const realCumulativeValue = Number.isFinite(waypoint.actualCumulativeMah) ? escapeHtml(waypoint.actualCumulativeMah) : "";
    const realUsed = Number.isFinite(waypoint.actualUsedMah) ? Math.round(waypoint.actualUsedMah).toLocaleString() : "—";
    const realCumulative = Number.isFinite(waypoint.actualCumulativeMah) ? Math.round(waypoint.actualCumulativeMah).toLocaleString() : "—";
    return `<tr class="mission-row${waypoint.id === state.selectedWaypoint ? " selected" : ""}${waypoint.dropActionCount ? " drop-point" : ""}" data-id="${escapeHtml(waypoint.id)}">
      <td><button class="table-waypoint-name" type="button" data-action="select">${waypointNumber(waypoint, index)} · ${escapeHtml(waypoint.name || `Waypoint ${index + 1}`)}</button><span class="table-coordinates">${waypoint.lat.toFixed(5)}, ${waypoint.lon.toFixed(5)}</span></td>
      <td>${escapeHtml(speedCommand)}${waypoint.speedChanged ? '<span class="speed-changed">CHANGED</span>' : ""}</td>
      <td><input class="table-altitude-input" type="number" step="1" value="${escapeHtml(waypoint.altitude)}" data-action="altitude" aria-label="Waypoint ${waypointNumber(waypoint, index)} altitude in meters"><span class="print-only">${escapeHtml(waypoint.altitude)} m</span></td>
      <td>${escapeHtml(wind)}</td>
      <td>${Number.isFinite(waypoint.groundSpeed) ? `${waypoint.groundSpeed.toFixed(1)} m/s` : "—"}</td>
      <td>${Number.isFinite(waypoint.etaTimestamp) ? escapeHtml(formatClockTime(waypoint.etaTimestamp)) : "—"}</td>
      <td><div class="phase-labels">${phaseMarkup}</div></td>
      <td class="numeric-cell">${estimatedUsed}</td>
      <td class="numeric-cell">${estimatedCurrent}</td>
      <td class="numeric-cell">${estimatedVoltage}</td>
      <td class="numeric-cell">${estimatedCumulative}</td>
      <td class="numeric-cell" data-cell="actual-used">${realUsed}</td>
      <td><input class="table-real-input" type="number" min="0" step="10" value="${realCumulativeValue}" data-action="actual-cumulative" aria-label="Cumulative battery use at waypoint ${waypointNumber(waypoint, index)} in milliamp hours"><span class="print-only">${Number.isFinite(waypoint.actualCumulativeMah) ? `${Math.round(waypoint.actualCumulativeMah).toLocaleString()} mAh` : "—"}</span></td>
      <td class="pass-cell"><button class="pass-button${Number.isFinite(waypoint.actualPassedAt) ? " recorded" : ""}" type="button" data-action="toggle-pass" aria-label="${passButtonLabel} pass time for ${escapeHtml(waypoint.name || `Waypoint ${index + 1}`)}" title="${Number.isFinite(waypoint.actualPassedAt) ? "Clear recorded pass time" : "Record the actual pass time now"}">${passButtonLabel}</button><span class="pass-time">${actualPassTime}</span><span class="pass-delta ${passDifference.status}">${passDifference.label}</span></td>
      <td><button class="table-remove-button" type="button" data-action="remove" aria-label="Remove waypoint ${waypointNumber(waypoint, index)}">×</button></td>
    </tr>`;
  }).join("");
  drawEnergyCharts();
  renderMap();
}

function colorScaleHue(value, minimum, maximum) {
  const ratio = Math.max(0, Math.min(1, (value - minimum) / (maximum - minimum)));
  return Math.round(ratio * 120);
}

function formatClockTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function addWaypoint(lat, lon, altitude = 100) {
  const waypoint = makeWaypoint({
    lat, lon, altitude, frame: 3, command: 16, name: `Waypoint ${state.waypoints.length + 1}`, altitudeMode: "relative"
  });
  if (!waypoint) return;
  state.waypoints.push(waypoint);
  cancelForecastRequest();
  setMessage("");
  renderWaypoints();
}

function selectWaypoint(id) {
  state.selectedWaypoint = id;
  const waypoint = state.waypoints.find(point => point.id === id);
  if (!waypoint) return;
  document.querySelectorAll(".mission-row").forEach(row => row.classList.toggle("selected", row.dataset.id === id));
  renderMap();
  const marker = state.markers[state.waypoints.indexOf(waypoint)];
  if (marker) marker.openPopup();
}

function clearMission() {
  state.waypoints = [];
  state.selectedWaypoint = null;
  cancelForecastRequest();
  setMessage("");
  setSourceStatus("Ready when you are");
  renderWaypoints();
}

function cancelForecastRequest() {
  if (state.forecastController) state.forecastController.abort();
  state.requestId += 1;
  state.forecastController = null;
  state.forecasts = null;
  state.lastMissionEventCheckAt = null;
  state.notifiedMissionEvents.clear();
  state.missionAlertQueue = [];
  state.missionAlertActive = false;
  window.clearTimeout(state.missionAlertTimer);
  elements.missionAlert.hidden = true;
  state.waypoints.forEach(waypoint => {
    waypoint.wind = null;
    waypoint.gust = null;
    waypoint.forecastTime = null;
    waypoint.etaTimestamp = null;
    waypoint.groundSpeed = null;
    waypoint.airSpeed = null;
    waypoint.estimateNote = "";
    waypoint.altitudeNote = "";
    waypoint.estimatedUsedMah = null;
    waypoint.estimatedCurrentA = null;
    waypoint.verticalSpeedMps = null;
    waypoint.verticalCurrentAdjustmentA = null;
    waypoint.cumulativeEstimatedMah = null;
    waypoint.estimatedVoltage = null;
  });
  updateEnergySummary();
  drawEnergyCharts();
  elements.loadingOverlay.hidden = true;
  elements.analyzeButton.disabled = state.waypoints.length === 0;
  if (state.waypoints.length) setSourceStatus("Route changed — check winds again");
}

function zoomToMission() {
  if (!state.waypoints.length) return;
  map.invalidateSize({ pan: false });
  const bounds = L.latLngBounds(state.waypoints.map(point => [point.lat, point.lon]));
  if (state.waypoints.length === 1) map.setView(bounds.getCenter(), 12, { animate: false });
  else map.fitBounds(bounds, { padding: [70, 55], maxZoom: 14, animate: false });
}

function exportCsv() {
  const rows = [
    ["Takeoff time", "Payload (kg)", "Battery capacity (mAh)", "Departure voltage (V)", "Waypoint", "Command ID", "Mission Planner command", "Speed command", "Speed changed at waypoint", "Latitude", "Longitude", "Mission altitude (m)", "Altitude above ground (m)", "Ground elevation (m)", "Wind speed (m/s)", "Wind gust at 10 m (m/s)", "Wind direction (degrees from north)", "Wind direction", "Ground speed (m/s)", "Airspeed (m/s)", "Estimated arrival", "Forecast time UTC", "Payload on leg (kg)", "Estimated vertical rate (m/s)", "Vertical current adjustment (A)", "Estimated current (A)", "Estimated leg used (mAh)", "Cumulative estimated used (mAh)", "Real leg used (mAh)", "Cumulative real used (mAh)", "Estimated voltage (V)", "Actual pass time", "Pass time versus ETA"],
    ...state.waypoints.map((point, index) => [
      elements.takeoffTime.value ? `${new Date(elements.takeoffTime.value).toISOString().replace("T", " ").slice(0, 16)} UTC` : "",
      elements.payloadWeight.value,
      elements.batteryCapacity.value,
      elements.departureVoltage.value,
      point.name || `Waypoint ${index + 1}`,
      point.command,
      MISSION_COMMAND_NAMES[point.command] || `MAV_CMD_${point.command}`,
      point.speedSetting ? `178 DO_CHANGE_SPEED · ${point.speedSetting.type === 0 ? "Airspeed" : "Ground speed"} · ${point.speedSetting.speed.toFixed(2)} m/s` : `Default airspeed · ${Number(elements.defaultCruiseSpeed.value).toFixed(2)} m/s`,
      point.speedChanged ? "Yes" : "No",
      point.lat.toFixed(6),
      point.lon.toFixed(6),
      point.altitude,
      Number.isFinite(point.targetAltitudeAgl) ? point.targetAltitudeAgl.toFixed(1) : "",
      Number.isFinite(point.groundElevation) ? point.groundElevation.toFixed(1) : "",
      point.wind ? point.wind.speed.toFixed(2) : "",
      Number.isFinite(point.gust) ? point.gust.toFixed(2) : "",
      point.wind ? Math.round(point.wind.direction) : "",
      point.wind ? describeWindDirection(point.wind.direction) : "",
      point.speedSetting ? point.speedSetting.type === 0 ? "Airspeed" : "Ground speed" : "",
      point.speedSetting ? point.speedSetting.speed.toFixed(2) : "",
      Number.isFinite(point.groundSpeed) ? point.groundSpeed.toFixed(2) : "",
      Number.isFinite(point.airSpeed) ? point.airSpeed.toFixed(2) : "",
      Number.isFinite(point.etaTimestamp) ? `${new Date(point.etaTimestamp).toISOString().replace("T", " ").slice(0, 16)} UTC` : "",
      point.forecastTime ? `${point.forecastTime.replace("T", " ")} UTC` : "",
      Number.isFinite(point.legPayloadKg) ? point.legPayloadKg.toFixed(2) : "",
      Number.isFinite(point.verticalSpeedMps) ? point.verticalSpeedMps.toFixed(2) : "",
      Number.isFinite(point.verticalCurrentAdjustmentA) ? point.verticalCurrentAdjustmentA.toFixed(2) : "",
      Number.isFinite(point.estimatedCurrentA) ? point.estimatedCurrentA.toFixed(2) : "",
      Number.isFinite(point.estimatedUsedMah) ? Math.round(point.estimatedUsedMah) : "",
      Number.isFinite(point.cumulativeEstimatedMah) ? Math.round(point.cumulativeEstimatedMah) : "",
      Number.isFinite(point.actualUsedMah) ? Math.round(point.actualUsedMah) : "",
      Number.isFinite(point.actualCumulativeMah) ? Math.round(point.actualCumulativeMah) : "",
      Number.isFinite(point.estimatedVoltage) ? point.estimatedVoltage.toFixed(2) : "",
      Number.isFinite(point.actualPassedAt) ? `${new Date(point.actualPassedAt).toISOString().replace("T", " ").slice(0, 19)} UTC` : "",
      passTimeDifference(point).label
    ])
  ];
  const csv = rows.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  link.download = "windpath-waypoint-winds.csv";
  link.click();
  URL.revokeObjectURL(link.href);
}

async function loadMissionFile(file) {
  if (!file) return;
  try {
    const text = await file.text();
    const points = parseWaypointsFile(text, file.name);
    if (points.length > 200) throw new Error("This mission has more than 200 GPS waypoints. Split it into smaller routes to request the forecast.");
    state.waypoints = points;
    state.selectedWaypoint = null;
    cancelForecastRequest();
    setMessage(`Loaded ${points.length} GPS waypoint${points.length === 1 ? "" : "s"} from ${file.name}.`);
    renderWaypoints();
    window.requestAnimationFrame(zoomToMission);
    elements.missionFile.value = "";
  } catch (error) {
    console.error("Could not read the mission file:", error);
    setMessage(error.message, true);
  }
}

async function searchLocation(event) {
  event.preventDefault();
  const query = elements.locationSearch.value.trim();
  if (!query) return;
  const coordinates = query.match(/^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (coordinates) {
    const first = Number(coordinates[1]);
    const second = Number(coordinates[2]);
    const lat = Math.abs(first) <= 90 ? first : second;
    const lon = lat === first ? second : first;
    if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
      map.setView([lat, lon], 12);
      return;
    }
    setMessage("Enter coordinates as latitude, longitude.", true);
    return;
  }
  try {
    const params = new URLSearchParams({ name: query, count: "1", language: "en", format: "json" });
    const response = await fetch(`${GEOCODING_API}?${params.toString()}`);
    if (!response.ok) throw new Error(`Location search returned ${response.status}.`);
    const result = await response.json();
    if (!result.results || !result.results.length) throw new Error(`No results found for “${query}”.`);
    const place = result.results[0];
    map.setView([place.latitude, place.longitude], 12);
    setMessage(`Showing ${place.name}${place.country ? `, ${place.country}` : ""}. Click the map to add a waypoint.`);
  } catch (error) {
    console.error("Could not search for this location:", error);
    setMessage(error.message, true);
  }
}

map.on("click", event => addWaypoint(event.latlng.lat, event.latlng.lng));
map.on("mousemove", event => {
  elements.mapCoordinates.textContent = `${event.latlng.lat.toFixed(5)}°, ${event.latlng.lng.toFixed(5)}°`;
});
map.on("mouseout", () => {
  if (!state.waypoints.length) elements.mapCoordinates.textContent = "Move over the map to see coordinates";
});
elements.analyzeButton.addEventListener("click", () => {
  prepareNotificationAudio();
  fetchForecastForMission();
});
elements.clearMission.addEventListener("click", clearMission);
elements.exportButton.addEventListener("click", exportCsv);
elements.printButton.addEventListener("click", () => {
  drawEnergyCharts();
  window.print();
});
elements.fitMissionButton.addEventListener("click", zoomToMission);
window.addEventListener("beforeprint", () => {
  state.themeBeforePrint = document.documentElement.dataset.theme || "light";
  applyTheme("light");
});
window.addEventListener("afterprint", () => {
  if (state.themeBeforePrint) applyTheme(state.themeBeforePrint);
  state.themeBeforePrint = null;
  map.invalidateSize({ pan: false });
});
elements.followDrone.addEventListener("change", () => {
  state.followDrone = elements.followDrone.checked;
  if (state.followDrone && state.droneMarker) {
    map.panTo(state.droneMarker.getLatLng(), { animate: true, duration: 0.35 });
  }
});
elements.missionFile.addEventListener("change", event => loadMissionFile(event.target.files[0]));
document.getElementById("searchForm").addEventListener("submit", searchLocation);
elements.waypointList.addEventListener("click", event => {
  const row = event.target.closest(".mission-row");
  if (!row) return;
  if (event.target.closest("[data-action='toggle-pass']")) {
    const waypoint = state.waypoints.find(point => point.id === row.dataset.id);
    if (!waypoint) return;
    waypoint.actualPassedAt = Number.isFinite(waypoint.actualPassedAt) ? null : Date.now();
    renderWaypoints();
    return;
  }
  const button = event.target.closest("[data-action='remove']");
  if (button) {
    const id = row.dataset.id;
    state.waypoints = state.waypoints.filter(waypoint => waypoint.id !== id);
    if (state.selectedWaypoint === id) state.selectedWaypoint = null;
    cancelForecastRequest();
    renderWaypoints();
    return;
  }
  if (event.target.closest("[data-action='select']")) selectWaypoint(row.dataset.id);
});
elements.waypointList.addEventListener("change", event => {
  if (event.target.dataset.action === "actual-cumulative") {
    const waypoint = state.waypoints.find(point => point.id === event.target.closest(".mission-row").dataset.id);
    if (!waypoint) return;
    if (event.target.value === "") {
      waypoint.actualCumulativeMah = null;
      setMessage("");
    } else {
      const actualCumulativeMah = Number(event.target.value);
      const waypointIndex = state.waypoints.indexOf(waypoint);
      const previousCumulativeMah = state.waypoints.slice(0, waypointIndex)
        .map(point => point.actualCumulativeMah)
        .filter(Number.isFinite)
        .at(-1);
      const nextCumulativeMah = state.waypoints.slice(waypointIndex + 1)
        .map(point => point.actualCumulativeMah)
        .find(Number.isFinite);
      if (!Number.isFinite(actualCumulativeMah) || actualCumulativeMah < 0) {
        setMessage("Enter a non-negative cumulative battery use in mAh.", true);
        renderWaypoints();
        return;
      }
      if (
        (Number.isFinite(previousCumulativeMah) && actualCumulativeMah < previousCumulativeMah) ||
        (Number.isFinite(nextCumulativeMah) && actualCumulativeMah > nextCumulativeMah)
      ) {
        setMessage("Cumulative used mAh must not be lower than an earlier waypoint or higher than a later waypoint.", true);
        renderWaypoints();
        return;
      }
      waypoint.actualCumulativeMah = actualCumulativeMah;
      setMessage("");
    }
    updateEnergySummary();
    state.waypoints.forEach((point, index) => {
      const row = elements.waypointList.rows[index];
      if (!row) return;
      row.querySelector("[data-cell='actual-used']").textContent = Number.isFinite(point.actualUsedMah) ? Math.round(point.actualUsedMah).toLocaleString() : "—";
      row.querySelector("[data-action='actual-cumulative']").value = Number.isFinite(point.actualCumulativeMah) ? point.actualCumulativeMah : "";
    });
    drawEnergyCharts();
    return;
  }
  if (event.target.dataset.action !== "altitude") return;
  const waypoint = state.waypoints.find(point => point.id === event.target.closest(".mission-row").dataset.id);
  const altitude = Number(event.target.value);
  if (!waypoint || !Number.isFinite(altitude)) {
    setMessage("Enter a valid waypoint altitude in meters.", true);
    return;
  }
  waypoint.altitude = altitude;
  waypoint.wind = null;
  waypoint.gust = null;
  waypoint.altitudeNote = "";
  cancelForecastRequest();
  renderWaypoints();
});
elements.uploadZone.addEventListener("dragover", event => {
  event.preventDefault();
  elements.uploadZone.classList.add("dragging");
});
elements.uploadZone.addEventListener("dragleave", () => elements.uploadZone.classList.remove("dragging"));
elements.uploadZone.addEventListener("drop", event => {
  event.preventDefault();
  elements.uploadZone.classList.remove("dragging");
  loadMissionFile(event.dataTransfer.files[0]);
});
document.getElementById("locateButton").addEventListener("click", () => {
  if (!navigator.geolocation) {
    setMessage("This browser does not support location access.", true);
    return;
  }
  navigator.geolocation.getCurrentPosition(
    position => map.setView([position.coords.latitude, position.coords.longitude], 12),
    error => setMessage(`Could not get your location: ${error.message}`, true),
    { enableHighAccuracy: true, timeout: 10000 }
  );
});
function refreshMissionEstimates() {
  if (!state.forecasts) return;
  try {
    setMessage("");
    updateWaypointEstimates(state.forecasts);
    state.waypoints.forEach(waypoint => {
      waypoint.altitudeNote = waypoint.wind.note;
    });
    resetMissionAlerts();
    renderWaypoints();
    drawWindIndicators();
  } catch (error) {
    console.error("Could not update waypoint estimates:", error);
    setMessage(error.message, true);
  }
}

elements.takeoffTime.addEventListener("change", () => {
  updateMissionSummary();
  refreshMissionEstimates();
});
elements.batteryCapacity.addEventListener("input", () => {
  const capacityMah = Number(elements.batteryCapacity.value);
  if (!Number.isFinite(capacityMah) || capacityMah <= 0) {
    setMessage("Enter a battery capacity greater than zero mAh.", true);
  } else {
    setMessage("");
  }
  updateEnergyEstimates();
});
elements.departureVoltage.addEventListener("input", () => {
  const departureVoltage = Number(elements.departureVoltage.value);
  if (!Number.isFinite(departureVoltage) || departureVoltage < 30 || departureVoltage > 51) {
    setMessage("Enter a departure voltage between 30 and 51 V.", true);
  } else {
    setMessage("");
  }
  updateEnergyEstimates();
  renderWaypoints();
});
elements.defaultCruiseSpeed.addEventListener("change", () => {
  const speed = Number(elements.defaultCruiseSpeed.value);
  if (!Number.isFinite(speed) || speed <= 0) {
    setMessage("Enter a default cruise airspeed greater than zero m/s.", true);
    return;
  }
  setMessage("");
  refreshMissionEstimates();
});
elements.payloadWeight.addEventListener("change", () => {
  const payloadKg = Number(elements.payloadWeight.value);
  if (!Number.isFinite(payloadKg) || payloadKg < 0 || payloadKg > MAX_PAYLOAD_KG) {
    setMessage(`Enter a payload between 0 and ${MAX_PAYLOAD_KG} kg.`, true);
    updateEnergyEstimates();
    renderWaypoints();
    return;
  }
  setMessage("");
  updateEnergyEstimates();
  renderWaypoints();
});
elements.takeoffTime.value = localDateTimeValue(new Date());
setupPanelSizing();
updateMissionSummary();
updateEnergySummary();
drawEnergyCharts();
renderWaypoints();
window.setInterval(updateDronePosition, 1000);
window.addEventListener("resize", drawEnergyCharts);
