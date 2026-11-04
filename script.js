const API_BASE = "https://api.open-meteo.com/v1/forecast";
const GEOCODING_API = "https://geocoding-api.open-meteo.com/v1/search";
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
const DEFAULT_CENTER = [-19.0, 46.7];

const elements = {
  analyzeButton: document.getElementById("analyzeButton"),
  clearMission: document.getElementById("clearMission"),
  emptyState: document.getElementById("emptyState"),
  exportButton: document.getElementById("exportButton"),
  cruiseSpeed: document.getElementById("cruiseSpeed"),
  droneModel: document.getElementById("droneModel"),
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
  waypointCount: document.getElementById("waypointCount"),
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
  forecasts: null
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

function estimateGroundSpeed(cruiseSpeed, wind, bearing) {
  const windVector = windComponents(wind.speed, wind.direction);
  const radians = bearing * Math.PI / 180;
  const tailwind = windVector.east * Math.sin(radians) + windVector.north * Math.cos(radians);
  const crosswind = windVector.east * Math.cos(radians) - windVector.north * Math.sin(radians);
  if (Math.abs(crosswind) >= cruiseSpeed) return { speed: null, note: "Crosswind exceeds cruise speed; track cannot be maintained." };
  const speed = Math.sqrt(cruiseSpeed ** 2 - crosswind ** 2) + tailwind;
  if (speed <= 0) return { speed: null, note: "Headwind prevents forward progress at cruise speed." };
  return { speed, note: "" };
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
        ? formatArrivalTime(waypoint.etaTimestamp)
        : "Not estimated";
      const count = waypoint.dropActionCount > 1 ? ` (${waypoint.dropActionCount} actions)` : "";
      return `<span>${escapeHtml(label)}${count}: ${escapeHtml(time)}</span>`;
    }).join("");
  }

  const finalWaypoint = state.waypoints[state.waypoints.length - 1];
  elements.summaryArrival.textContent = Number.isFinite(finalWaypoint?.etaTimestamp)
    ? formatArrivalTime(finalWaypoint.etaTimestamp)
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
  const cruiseSpeed = Number(elements.cruiseSpeed.value);
  const hasCruiseSpeed = Number.isFinite(cruiseSpeed) && cruiseSpeed > 0;
  const home = state.waypoints.find(point => point.sequence === 0) || state.waypoints[0];
  const homeElevation = forecasts[state.waypoints.indexOf(home)].elevation;
  let previousArrival = takeoffTimestamp;
  const estimates = [];

  state.waypoints.forEach((waypoint, index) => {
    let arrivalTimestamp = index === 0 ? takeoffTimestamp : null;
    let groundSpeed = null;
    let estimateNote = index === 0 ? "Mission start" : "";
    let sample;

    if (index > 0 && !hasCruiseSpeed) {
      estimateNote = "Enter cruise speed to estimate arrival.";
    } else if (index > 0 && !Number.isFinite(previousArrival)) {
      estimateNote = "Cannot estimate after an unreachable leg.";
    } else if (index > 0) {
      const { distance, bearing } = distanceAndBearing(state.waypoints[index - 1], waypoint);
      let candidateArrival = previousArrival + distance / cruiseSpeed * 1000;
      let segmentEstimate;
      for (let iteration = 0; iteration < 4; iteration += 1) {
        sample = getWindAtTime(waypoint, forecasts[index], candidateArrival, homeElevation);
        segmentEstimate = estimateGroundSpeed(cruiseSpeed, sample.wind, bearing);
        if (!Number.isFinite(segmentEstimate.speed)) break;
        const revisedArrival = previousArrival + distance / segmentEstimate.speed * 1000;
        if (Math.abs(revisedArrival - candidateArrival) < 60000) {
          candidateArrival = revisedArrival;
          break;
        }
        candidateArrival = revisedArrival;
      }

      if (segmentEstimate && Number.isFinite(segmentEstimate.speed)) {
        sample = getWindAtTime(waypoint, forecasts[index], candidateArrival, homeElevation);
        segmentEstimate = estimateGroundSpeed(cruiseSpeed, sample.wind, bearing);
      }
      if (segmentEstimate && Number.isFinite(segmentEstimate.speed)) {
        groundSpeed = segmentEstimate.speed;
        arrivalTimestamp = previousArrival + distance / groundSpeed * 1000;
      } else {
        estimateNote = segmentEstimate?.note || "Could not estimate ground speed for this leg.";
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
      estimateNote
    });
    previousArrival = arrivalTimestamp;
  });
  state.waypoints.forEach((waypoint, index) => Object.assign(waypoint, estimates[index]));
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
    items.forEach((item, index) => {
      const command = Number(item.command ?? 16);
      if (command === 183) {
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
      if (waypoint) points.push(waypoint);
    });
    if (!points.length) throw new Error("No GPS waypoint coordinates were found in this .plan file.");
    return points;
  }

  const lines = trimmed.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const start = lines[0].startsWith("QGC WPL") ? 1 : 0;
  const points = [];
  for (const line of lines.slice(start)) {
    const fields = line.split(/\s+/);
    if (fields.length < 12) continue;
    const sequence = Number(fields[0]);
    const frame = Number(fields[2]);
    const command = Number(fields[3]);
    if (command === 183) {
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
    if (waypoint) points.push(waypoint);
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
    etaTimestamp: null, groundSpeed: null, estimateNote: ""
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
  const response = await fetch(batchApiUrl(points), { signal });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Open-Meteo returned ${response.status}: ${detail.slice(0, 180)}`);
  }
  const data = await response.json();
  const results = Array.isArray(data) ? data : [data];
  if (results.length !== points.length) throw new Error("The forecast API returned an unexpected number of locations.");
  return results;
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
  });
  renderWaypoints();
  try {
    const batches = [];
    for (let offset = 0; offset < state.waypoints.length; offset += 80) {
      batches.push(state.waypoints.slice(offset, offset + 80));
    }
    const forecastBatches = await Promise.all(batches.map(batch => fetchForecastBatch(batch, signal)));
    if (requestId !== state.requestId) return;
    const forecasts = forecastBatches.flat();
    state.forecasts = forecasts;
    updateWaypointEstimates(forecasts);
    state.waypoints.forEach(waypoint => {
      waypoint.altitudeNote = waypoint.wind.note;
    });
    renderWaypoints();
    drawWindIndicators();
    const forecastLabel = state.waypoints[0].forecastTime;
    setSourceStatus(`Forecast · ${formatForecastTime(forecastLabel)} UTC`, "ready");
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
      waypoint.estimateNote = "";
      waypoint.altitudeNote = "";
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
    ? `<div class="popup-detail">Estimated arrival: ${formatArrivalTime(waypoint.etaTimestamp)}</div>${waypoint.dropActionCount ? `<div class="popup-detail">Estimated drop: ${formatArrivalTime(waypoint.etaTimestamp)} (${waypoint.dropActionCount} DO_SET_SERVO action${waypoint.dropActionCount === 1 ? "" : "s"})</div>` : ""}<div class="popup-detail">Wind sample: ${formatForecastTime(waypoint.forecastTime)} UTC</div><div class="popup-detail">Ground speed: ${Number.isFinite(waypoint.groundSpeed) ? `${waypoint.groundSpeed.toFixed(1)} m/s` : "Mission start"}</div>`
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
    return;
  }

  const now = Date.now();
  let position = { lat: first.lat, lon: first.lon };
  let bearing = 0;
  let status = now < first.etaTimestamp ? "UPCOMING" : "IN FLIGHT";
  let positionedOnLeg = false;
  let currentGroundSpeed = null;

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
    }
    break;
  }

  const last = waypoints[waypoints.length - 1];
  if (Number.isFinite(last.etaTimestamp) && now >= last.etaTimestamp) {
    position = { lat: last.lat, lon: last.lon };
    status = "ARRIVED";
    currentGroundSpeed = 0;
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

  const markerElement = state.droneMarker.getElement();
  if (markerElement) {
    const plane = markerElement.querySelector(".live-drone-plane");
    const statusLabel = markerElement.querySelector(".live-drone-status");
    const speedsLabel = markerElement.querySelector(".live-drone-speeds");
    if (plane) plane.style.transform = `rotate(${positionedOnLeg ? bearing : 0}deg)`;
    if (statusLabel) statusLabel.textContent = status;
    if (speedsLabel) {
      const airSpeed = Number(elements.cruiseSpeed.value);
      const airSpeedText = Number.isFinite(airSpeed) && airSpeed > 0 ? `${airSpeed.toFixed(1)}` : "—";
      const groundSpeedText = Number.isFinite(currentGroundSpeed) ? currentGroundSpeed.toFixed(1) : "—";
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
  elements.waypointCount.textContent = String(state.waypoints.length);
  elements.emptyState.hidden = state.waypoints.length > 0;
  elements.clearMission.disabled = state.waypoints.length === 0;
  elements.exportButton.disabled = state.waypoints.length === 0;
  elements.analyzeButton.disabled = state.waypoints.length === 0 || !elements.loadingOverlay.hidden;
  elements.waypointList.innerHTML = state.waypoints.map((waypoint, index) => {
    const windMarkup = waypoint.wind
      ? `<span class="wind-arrow" aria-hidden="true" style="transform:rotate(${waypoint.wind.direction + 180}deg)">↑</span>${waypoint.wind.speed.toFixed(1)} m/s · from ${Math.round(waypoint.wind.direction)}° (${describeWindDirection(waypoint.wind.direction)})`
      : `<span class="wind-result pending">Wind not checked</span>`;
    const altitudeNote = waypoint.wind && Number.isFinite(waypoint.targetAltitudeAgl)
      ? `<div class="height-note">Wind at ${waypoint.targetAltitudeAgl.toFixed(0)} m AGL · forecast level ${waypoint.wind.altitude.toFixed(0)} m${waypoint.altitudeNote ? ` · ${escapeHtml(waypoint.altitudeNote)}` : ""}</div>`
      : waypoint.altitudeNote ? `<div class="height-note">${escapeHtml(waypoint.altitudeNote)}</div>` : "";
    const gustMarkup = waypoint.wind
      ? `<div class="gust-result">10 m gust: ${Number.isFinite(waypoint.gust) ? `${waypoint.gust.toFixed(1)} m/s` : "Unavailable"}</div>`
      : "";
    const estimateMarkup = Number.isFinite(waypoint.etaTimestamp)
      ? `<div class="estimate-result"><span>ETA ${formatArrivalTime(waypoint.etaTimestamp)}</span><span>Wind sample ${formatForecastTime(waypoint.forecastTime)} UTC</span><span>${Number.isFinite(waypoint.groundSpeed) ? `${waypoint.groundSpeed.toFixed(1)} m/s ground speed` : "Mission start"}</span></div>`
      : waypoint.estimateNote ? `<div class="estimate-result pending">${escapeHtml(waypoint.estimateNote)}</div>` : "";
    return `<article class="waypoint-card${waypoint.id === state.selectedWaypoint ? " selected" : ""}" data-id="${waypoint.id}">
      <div class="waypoint-top">
        <span class="waypoint-badge">${waypointNumber(waypoint, index)}</span>
        <div class="waypoint-info"><span class="waypoint-name">${escapeHtml(waypoint.name || `Waypoint ${index + 1}`)}</span><span class="waypoint-coords">${waypoint.lat.toFixed(4)}°, ${waypoint.lon.toFixed(4)}°</span></div>
        <button class="remove-waypoint" type="button" data-action="remove" aria-label="Remove waypoint ${waypointNumber(waypoint, index)}" title="Remove waypoint">×</button>
      </div>
      <div class="altitude-row">
        <label class="altitude-edit">ALT <input type="number" step="1" value="${escapeHtml(waypoint.altitude)}" data-action="altitude" aria-label="Waypoint ${waypointNumber(waypoint, index)} altitude in meters"> m</label>
        <span class="wind-result${waypoint.wind ? "" : " pending"}">${windMarkup}</span>
      </div>${altitudeNote}${gustMarkup}${estimateMarkup}
    </article>`;
  }).join("");
  renderMap();
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
  document.querySelectorAll(".waypoint-card").forEach(card => card.classList.toggle("selected", card.dataset.id === id));
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
  state.waypoints.forEach(waypoint => {
    waypoint.wind = null;
    waypoint.gust = null;
    waypoint.forecastTime = null;
    waypoint.etaTimestamp = null;
    waypoint.groundSpeed = null;
    waypoint.estimateNote = "";
    waypoint.altitudeNote = "";
  });
  elements.loadingOverlay.hidden = true;
  elements.analyzeButton.disabled = state.waypoints.length === 0;
  if (state.waypoints.length) setSourceStatus("Route changed — check winds again");
}

function zoomToMission() {
  if (!state.waypoints.length) return;
  const bounds = L.latLngBounds(state.waypoints.map(point => [point.lat, point.lon]));
  if (state.waypoints.length === 1) map.setView(bounds.getCenter(), Math.max(map.getZoom(), 12));
  else map.fitBounds(bounds, { padding: [70, 55], maxZoom: 14 });
}

function exportCsv() {
  const rows = [
    ["Drone", "Cruise speed (m/s)", "Takeoff time", "Waypoint", "Latitude", "Longitude", "Mission altitude (m)", "Altitude above ground (m)", "Ground elevation (m)", "Wind speed (m/s)", "Wind gust at 10 m (m/s)", "Wind direction (degrees from north)", "Wind direction", "Ground speed (m/s)", "Estimated arrival", "Forecast time UTC"],
    ...state.waypoints.map((point, index) => [
      elements.droneModel.value.trim(),
      elements.cruiseSpeed.value,
      elements.takeoffTime.value ? `${new Date(elements.takeoffTime.value).toISOString().replace("T", " ").slice(0, 16)} UTC` : "",
      point.name || `Waypoint ${index + 1}`,
      point.lat.toFixed(6),
      point.lon.toFixed(6),
      point.altitude,
      Number.isFinite(point.targetAltitudeAgl) ? point.targetAltitudeAgl.toFixed(1) : "",
      Number.isFinite(point.groundElevation) ? point.groundElevation.toFixed(1) : "",
      point.wind ? point.wind.speed.toFixed(2) : "",
      Number.isFinite(point.gust) ? point.gust.toFixed(2) : "",
      point.wind ? Math.round(point.wind.direction) : "",
      point.wind ? describeWindDirection(point.wind.direction) : "",
      Number.isFinite(point.groundSpeed) ? point.groundSpeed.toFixed(2) : "",
      Number.isFinite(point.etaTimestamp) ? `${new Date(point.etaTimestamp).toISOString().replace("T", " ").slice(0, 16)} UTC` : "",
      point.forecastTime ? `${point.forecastTime.replace("T", " ")} UTC` : ""
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
    zoomToMission();
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

elements.analyzeButton.addEventListener("click", fetchForecastForMission);
elements.clearMission.addEventListener("click", clearMission);
elements.exportButton.addEventListener("click", exportCsv);
elements.missionFile.addEventListener("change", event => loadMissionFile(event.target.files[0]));
document.getElementById("searchForm").addEventListener("submit", searchLocation);
elements.waypointList.addEventListener("click", event => {
  const button = event.target.closest("[data-action='remove']");
  if (!button) return;
  const id = button.closest(".waypoint-card").dataset.id;
  state.waypoints = state.waypoints.filter(waypoint => waypoint.id !== id);
  if (state.selectedWaypoint === id) state.selectedWaypoint = null;
  cancelForecastRequest();
  renderWaypoints();
});
elements.waypointList.addEventListener("change", event => {
  if (event.target.dataset.action !== "altitude") return;
  const waypoint = state.waypoints.find(point => point.id === event.target.closest(".waypoint-card").dataset.id);
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
elements.cruiseSpeed.addEventListener("change", () => {
  const value = Number(elements.cruiseSpeed.value);
  if (elements.cruiseSpeed.value && (!Number.isFinite(value) || value <= 0)) {
    setMessage("Cruise speed must be greater than zero meters per second.", true);
    return;
  }
  refreshMissionEstimates();
});

elements.takeoffTime.value = localDateTimeValue(new Date());
updateMissionSummary();
renderWaypoints();
window.setInterval(updateDronePosition, 1000);
