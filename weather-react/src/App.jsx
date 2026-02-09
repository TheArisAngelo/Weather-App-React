import { useEffect, useMemo, useState } from "react";
import "./App.css";

const API_KEY = import.meta.env.VITE_VC_API_KEY;

const BASE_URL =
  "https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/";

const UNIT_GROUP = "metric"; // metric | us | uk

const ELEMENTS = [
  "datetime",
  "datetimeEpoch",
  "temp",
  "windspeed",
  "precipprob",
  "conditions",
  "icon",
].join(",");

const ICON_EMOJI = {
  "clear-day": "☀️",
  "clear-night": "🌙",
  "partly-cloudy-day": "⛅",
  "partly-cloudy-night": "☁️🌙",
  cloudy: "☁️",
  rain: "🌧️",
  snow: "❄️",
  wind: "💨",
  fog: "🌫️",
  "thunder-rain": "⛈️",
  "thunder-showers-day": "⛈️",
  "thunder-showers-night": "⛈️",
  "showers-day": "🌦️",
  "showers-night": "🌧️",
};

function iconToEmoji(icon) {
  return ICON_EMOJI[icon] || "⛅";
}

function formatTemp(v) {
  if (typeof v !== "number") return "—";
  const unit = UNIT_GROUP === "us" ? "°F" : "°C";
  return `${Math.round(v)}${unit}`;
}

function formatWind(v) {
  if (typeof v !== "number") return "—";
  const unit = UNIT_GROUP === "us" ? "mph" : "kph";
  return `${Math.round(v)} ${unit}`;
}

function formatRainChance(v) {
  if (typeof v !== "number") return "—";
  return `${Math.round(v)}%`;
}

function formatHour(epochSec, tz) {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: tz,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(epochSec * 1000));
}

function formatAsOf(epochSec, tz) {
  const ms = typeof epochSec === "number" ? epochSec * 1000 : Date.now();
  return new Intl.DateTimeFormat(undefined, {
    timeZone: tz,
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ms));
}

function buildUrl(locationQuery) {
  const path = `${BASE_URL}${encodeURIComponent(locationQuery)}/yesterday/tomorrow`;
  const params = new URLSearchParams({
    key: API_KEY,
    unitGroup: UNIT_GROUP,
    include: "days,hours,current",
    elements: ELEMENTS,
    contentType: "json",
    options: "nonulls",
  });
  return `${path}?${params.toString()}`;
}

function HourTable({ title, rows, tz }) {
  return (
    <section className="card">
      <h3>{title}</h3>
      <div className="tableWrap">
        <table className="table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Temp</th>
              <th>Wind</th>
              <th>Rain %</th>
              <th>Conditions</th>
            </tr>
          </thead>
          <tbody>
            {!rows.length ? (
              <tr>
                <td colSpan={5} className="muted">
                  No data available for this period.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.datetimeEpoch}>
                  <td>{formatHour(r.datetimeEpoch, tz)}</td>
                  <td>{formatTemp(r.temp)}</td>
                  <td>{formatWind(r.windspeed)}</td>
                  <td>{formatRainChance(r.precipprob)}</td>
                  <td>
                    {iconToEmoji(r.icon)} {r.conditions || "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function App() {
  const [input, setInput] = useState("");
  const [lastQuery, setLastQuery] = useState(null);

  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  const [data, setData] = useState(null);

  const tz = data?.timezone || "UTC";
  const cc = data?.currentConditions || null;

  const { prev24, next24 } = useMemo(() => {
    if (!data?.days?.length || !cc?.datetimeEpoch)
      return { prev24: [], next24: [] };

    const hours = [];
    for (const day of data.days) {
      for (const h of day.hours || []) {
        if (typeof h.datetimeEpoch === "number") hours.push(h);
      }
    }
    hours.sort((a, b) => a.datetimeEpoch - b.datetimeEpoch);

    const now = cc.datetimeEpoch;
    const startPrev = now - 24 * 3600;
    const endNext = now + 24 * 3600;

    return {
      prev24: hours.filter(
        (h) => h.datetimeEpoch >= startPrev && h.datetimeEpoch < now,
      ),
      next24: hours.filter(
        (h) => h.datetimeEpoch >= now && h.datetimeEpoch < endNext,
      ),
    };
  }, [data, cc?.datetimeEpoch]);

  async function fetchWeather(locationQuery) {
    const url = buildUrl(locationQuery);
    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`API error ${res.status}: ${text || res.statusText}`);
    }
    return res.json();
  }

  async function loadWeather(locationQuery, { silent = false } = {}) {
    if (!API_KEY) {
      setStatus(
        "Missing API key. Set VITE_VC_API_KEY in .env and restart dev server.",
      );
      return;
    }

    try {
      setLoading(true);
      if (!silent) setStatus("Fetching weather…");
      setLastQuery(locationQuery);

      const json = await fetchWeather(locationQuery);
      setData(json);
      setStatus("");
    } catch (e) {
      console.error(e);
      setStatus(
        "Couldn’t fetch weather. Check the location and API key, then try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e) {
    e.preventDefault();
    const q = input.trim();
    if (!q) return;
    loadWeather(q);
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      setStatus("Geolocation not supported. Enter a location to search.");
      return;
    }

    setStatus("Requesting your location…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        const q = `${lat},${lon}`;
        setInput(`${lat.toFixed(4)}, ${lon.toFixed(4)}`);
        loadWeather(q, { silent: true });
      },
      () =>
        setStatus("Location permission denied. Enter a location to search."),
      { enableHighAccuracy: false, timeout: 8000 },
    );
  }

  // Stretch goal: default view = user's current location
  useEffect(() => {
    if (!API_KEY) return;
    useMyLocation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <header className="container">
        <h1>Weather</h1>

        <form className="search" onSubmit={onSubmit} autoComplete="off">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Enter a location (e.g., Manila, PH or 40.7128,-74.0060)"
            required
          />
          <button type="submit">Search</button>
          <button type="button" onClick={useMyLocation}>
            Use my location
          </button>
          <button
            type="button"
            onClick={() =>
              lastQuery && loadWeather(lastQuery, { silent: true })
            }
            disabled={!lastQuery || loading}
          >
            Refresh
          </button>
        </form>

        <p className="status" aria-live="polite">
          {status}
        </p>
      </header>

      <main className="container">
        {data && cc && (
          <section className="card">
            <div className="cardHeader">
              <div>
                <h2>
                  {data.resolvedAddress || data.address || lastQuery || "—"}
                </h2>
                <p className="muted">
                  As of {formatAsOf(cc.datetimeEpoch, tz)} ({tz})
                </p>
              </div>
              <div className="bigIcon">{iconToEmoji(cc.icon)}</div>
            </div>

            <div className="grid">
              <div className="metric">
                <div className="label">Temperature</div>
                <div className="value">{formatTemp(cc.temp)}</div>
              </div>

              <div className="metric">
                <div className="label">Wind speed</div>
                <div className="value">{formatWind(cc.windspeed)}</div>
              </div>

              <div className="metric">
                <div className="label">Likelihood of rain</div>
                <div className="value">{formatRainChance(cc.precipprob)}</div>
              </div>

              <div className="metric">
                <div className="label">Conditions</div>
                <div className="value">{cc.conditions || "—"}</div>
              </div>
            </div>
          </section>
        )}

        <HourTable title="Previous 24 hours" rows={prev24} tz={tz} />
        <HourTable title="Next 24 hours" rows={next24} tz={tz} />
      </main>

      {!loading ? null : (
        <div className="loading" aria-hidden="false">
          <div className="spinner" />
          <div>Loading weather…</div>
        </div>
      )}
    </>
  );
}
