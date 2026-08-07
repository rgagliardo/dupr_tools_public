// courtcast — iPhone widget (Scriptable)
// VERSION 1.1 — four looks in one script, chosen by the widget's
// Parameter field: 1/grade = Big Grade, 2/strip = Day Strip,
// 3/bars = Hour Bars, 4/next (or empty) = Next Window.
// Fetches the hourly courtcast.json feed; delivered to the phone by the
// courtcast loader stub, which pulls this file and caches it offline.
// Colors are Color.dynamic (device light/dark). v1.1: full dashboard
// match — monospaced type + dashboard background — and the tap-URL
// carries the widget version (?wv=) for the dashboard to display.
// v1.2: tap-URL also carries the active look (&look=) so the dashboard
// lands in a hero view matching this widget's Parameter.
// v1.3: small-widget Hour Bars cap the hour span (today's window, max 9
// columns) so cells stay wide enough for their cause letters.
// v1.4: now-conditions line skips null fields (dew/wind can be null
// independently of temp) instead of printing "null".
// v1.5: Parameter can also name a court — any token that isn't a look
// picks the matching feed (e.g. "rockwood", "bars rockwood"). Empty or
// "pouncey" keeps the primary feed.
// v1.6: new cause code "rnow" (radar shows rain on the court this hour).
const WIDGET_VERSION = "1.6";

const LIVE = true;
const FEED_BASE = "https://rgagliardo.github.io/dupr_tools_public/";
const DASH_URL = "https://rgagliardo.github.io/dupr_tools_public/courtcast.html";
const STALE_MS = 4 * 60 * 60 * 1000; // feed older than this => "AS OF" mode
const STATE = "wait"; // sample when LIVE = false (Next Window look only)

// Parameter: look and/or court, any order, space/comma separated.
const LOOKS = { "1": "grade", grade: "grade", "2": "strip", strip: "strip",
                "3": "bars", bars: "bars", "4": "next", next: "next" };
let look = "next";
let spotTag = "";
for (const tok of (args.widgetParameter || "").trim().toLowerCase().split(/[\s,:]+/)) {
  if (!tok) continue;
  if (LOOKS[tok]) look = LOOKS[tok];
  else spotTag = tok.replace(/[^a-z0-9_-]/g, "");
}
const FEED_URL = FEED_BASE +
  (spotTag && spotTag !== "pouncey" ? "courtcast-" + spotTag + ".json"
                                    : "courtcast.json");

const SAMPLES = {
  wait: {
    spot: "Pouncey Tract",
    updated: "2026-07-26T07:10:00",
    playable_now: false,
    kicker: "HOLD UP",
    headline: "Next window: Mon 3p",
    wet_note: "court wet — 4.2mm overnight, drying ~1p",
    reason: "Mon grades A, 3–9p clean · today: wet court, then thunder",
    ranked: [
      { day: "Mon", grade: "A" }, { day: "Thu", grade: "A" },
      { day: "Today", grade: "B" }, { day: "Tue", grade: "C" },
      { day: "Wed", grade: "F" },
    ],
  },
  play: {
    spot: "Pouncey Tract",
    updated: "2026-07-26T09:05:00",
    playable_now: true,
    kicker: "PLAY NOW",
    headline: "until 11a",
    wet_note: null,
    reason: "then heat · back 5p",
    ranked: [
      { day: "Mon", grade: "A" }, { day: "Thu", grade: "A" },
      { day: "Today", grade: "B" },
    ],
  },
};

const dyn = (l, d) => Color.dynamic(new Color(l), new Color(d));
const C = {
  bg: dyn("#f4f4f6", "#101216"),
  ink: dyn("#1d1d1f", "#f2f2f7"),
  dim: dyn("#6e6e73", "#98989f"),
  faint: dyn("#a0a0a6", "#636366"),
  green: dyn("#248a3d", "#30d158"),
  yellow: dyn("#b58a00", "#ffd60a"),
  red: dyn("#d92b20", "#ff453a"),
  pill: dyn("#e9e9ee", "#2c2c2e"),
  cell: { 2: dyn("#2fbf58", "#30d158"), 1: dyn("#f5c400", "#ffd60a"),
          0: dyn("#f04438", "#ff453a") },
  off: Color.dynamic(new Color("#e0e0e6"), new Color("#3a3a3c", 0.45)),
  line: dyn("#d8d8de", "#3a3a3c"),
  grade: {
    A: dyn("#1e9e4a", "#30d158"), B: dyn("#0a6fd6", "#64d2ff"),
    C: dyn("#a88a00", "#ffd60a"), D: dyn("#d96f00", "#ff9f0a"),
    F: dyn("#d92b20", "#ff453a"),
  },
};

const CAUSE_WORD = { thn: "thunder", rain: "rain", rnow: "raining now",
                     wet: "wet court", dry: "drying",
                     gst: "wind", wnd: "wind", hot: "heat", cold: "cold",
                     chl: "chilly", dew: "humidity" };
const CAUSE_LETTER = { thn: "T", rain: "R", rnow: "R", wet: "D", dry: "D",
                       gst: "W", wnd: "W", cold: "C", chl: "C" };

function fmtHour(h) { return ((h + 11) % 12 + 1) + (h < 12 ? "a" : "p"); }
function fmtClock(d) {
  const h = d.getHours(), m = d.getMinutes();
  return ((h + 11) % 12 + 1) + ":" + (m < 10 ? "0" : "") + m + (h < 12 ? "a" : "p");
}
function gradeColor(g) { return C.grade[g] || C.dim; }
function dominantCause(day) {
  const n = {};
  Object.values(day.cells || {}).forEach(c => { if (c.c) n[c.c] = (n[c.c] || 0) + 1; });
  const top = Object.keys(n).sort((a, b) => n[b] - n[a])[0];
  return top ? (CAUSE_WORD[top] || top) : "";
}

// ---- fetch ----
let data = null;
let fetchErr = null;
if (LIVE) {
  try {
    data = await new Request(FEED_URL + "?t=" + Date.now()).loadJSON();
  } catch (e) { fetchErr = "" + e; }
} else {
  data = SAMPLES[STATE];
}

const family = config.widgetFamily || "medium"; // in-app preview defaults to medium
const small = family === "small";
// look + spotTag parsed from the Parameter up top (before the feed fetch).

const db = (data && data.dashboard) || {};
const days = db.days || [];
const upd = data ? new Date(data.updated) : null;
const stale = upd && !isNaN(upd) && Date.now() - upd.getTime() > STALE_MS;

const w = new ListWidget();
w.backgroundColor = C.bg;
w.setPadding(14, 16, 12, 16);
w.refreshAfterDate = new Date(Date.now() + 30 * 60 * 1000);
w.url = DASH_URL + "?wv=" + WIDGET_VERSION + "&look=" + look +
        (spotTag ? "&spot=" + spotTag : "");

// ---- brand row (all looks) ----
const brand = w.addStack();
brand.centerAlignContent();
const b0 = brand.addText("court");
b0.font = Font.boldMonospacedSystemFont(11);
b0.textColor = C.ink;
const b1 = brand.addText("cast");
b1.font = Font.boldMonospacedSystemFont(11);
b1.textColor = C.green;
const bv = brand.addText(" v" + WIDGET_VERSION);
bv.font = Font.regularMonospacedSystemFont(8);
bv.textColor = C.faint;
if (!small && data && data.spot) {
  const b2 = brand.addText("  ·  " + data.spot.toLowerCase());
  b2.font = Font.mediumMonospacedSystemFont(9);
  b2.textColor = C.faint;
  b2.lineLimit = 1;
}
if (upd && !isNaN(upd)) {
  brand.addSpacer();
  const sameDay = upd.toDateString() === new Date().toDateString();
  const ts = brand.addText((stale ? "AS OF " : "") +
    (sameDay ? "" : upd.toLocaleDateString("en-US", { weekday: "short" }) + " ") + fmtClock(upd));
  ts.font = stale ? Font.boldMonospacedSystemFont(9) : Font.regularMonospacedSystemFont(9);
  ts.textColor = stale ? C.red : C.faint;
}

// ---- look renderers ----

function renderError() {
  w.addSpacer();
  const err = w.addText("feed unreachable");
  err.font = Font.heavyMonospacedSystemFont(small ? 18 : 24);
  err.textColor = C.dim;
  const det = w.addText(fetchErr || "no data");
  det.font = Font.regularMonospacedSystemFont(10);
  det.textColor = C.faint;
  det.lineLimit = 2;
  w.addSpacer();
}

function renderNext() {
  w.addSpacer();
  const kick = w.addText(stale
    ? "AS OF " + upd.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase() + " " + fmtClock(upd)
    : data.kicker);
  kick.font = Font.boldMonospacedSystemFont(11);
  kick.textColor = stale ? C.faint : (data.playable_now ? C.green : C.yellow);

  const head = w.addText(data.headline);
  head.font = Font.heavyMonospacedSystemFont(small ? 19 : 24);
  head.textColor = stale ? C.dim : C.ink;
  head.lineLimit = 1;
  head.minimumScaleFactor = 0.7;

  if (data.wet_note && !small) {
    const wet = w.addText("💧 " + data.wet_note);
    wet.font = Font.mediumMonospacedSystemFont(12);
    wet.textColor = C.yellow;
    wet.lineLimit = 1;
  }
  if (data.reason) {
    const why = w.addText(data.reason);
    why.font = Font.regularMonospacedSystemFont(small ? 11 : 12);
    why.textColor = C.dim;
    why.lineLimit = 2;
  }
  w.addSpacer();

  const rank = w.addStack();
  rank.spacing = 6;
  (data.ranked || []).slice(0, small ? 3 : 5).forEach((r, i) => {
    const p = rank.addStack();
    p.backgroundColor = C.pill;
    p.cornerRadius = 6;
    p.setPadding(3, 7, 3, 7);
    const n = p.addText(String(i + 1) + " ");
    n.font = Font.boldMonospacedSystemFont(10);
    n.textColor = C.faint;
    const d = p.addText(r.day);
    d.font = Font.boldMonospacedSystemFont(10);
    d.textColor = C.ink;
    if (!small) {
      const g = p.addText(" " + r.grade);
      g.font = Font.boldMonospacedSystemFont(10);
      g.textColor = gradeColor(r.grade);
    }
  });
}

function addToday(stack, day, big) {
  const row = stack.addStack();
  row.centerAlignContent();
  row.spacing = 12;
  const letter = row.addText(day.grade);
  letter.font = Font.heavyMonospacedSystemFont(big ? 64 : 56);
  letter.textColor = gradeColor(day.grade);
  const meta = row.addStack();
  meta.layoutVertically();
  const dn = meta.addText(day.label);
  dn.font = Font.boldMonospacedSystemFont(13);
  dn.textColor = C.ink;
  const best = meta.addText(day.best ? "best " + day.best : dominantCause(day) || "—");
  best.font = Font.semiboldMonospacedSystemFont(11);
  best.textColor = day.best ? C.green : C.dim;
  const now = db.now || {};
  const parts = [];
  if (now.temp != null) parts.push(now.temp + "°");
  if (now.dew != null) parts.push("dew " + now.dew);
  if (now.wind != null) parts.push("wind " + now.wind);
  if (parts.length) {
    const cond = meta.addText(parts.join(" · "));
    cond.font = Font.regularMonospacedSystemFont(10);
    cond.textColor = C.dim;
  }
}

function renderGrade() {
  if (!days.length) { renderNext(); return; }
  w.addSpacer();
  if (small) {
    addToday(w, days[0], true);
    w.addSpacer();
    const foot = w.addText(dominantCause(days[0]) || "clean day");
    foot.font = Font.regularMonospacedSystemFont(10);
    foot.textColor = C.dim;
  } else {
    const cols = w.addStack();
    cols.centerAlignContent();
    const left = cols.addStack();
    left.layoutVertically();
    addToday(left, days[0], false);
    cols.addSpacer();
    const line = cols.addStack();
    line.size = new Size(1, 74);
    line.backgroundColor = C.line;
    cols.addSpacer();
    days.slice(1, 5).forEach(day => {
      const col = cols.addStack();
      col.layoutVertically();
      col.centerAlignContent();
      const d = col.addText(day.label);
      d.font = Font.semiboldMonospacedSystemFont(10);
      d.textColor = C.dim;
      const g = col.addText(day.grade);
      g.font = Font.heavyMonospacedSystemFont(22);
      g.textColor = gradeColor(day.grade);
      const b = col.addText(day.best || "—");
      b.font = Font.regularMonospacedSystemFont(8);
      b.textColor = C.faint;
      cols.addSpacer();
    });
    w.addSpacer();
  }
}

function renderStrip() {
  if (!days.length) { renderNext(); return; }
  const shown = days.slice(0, small ? 3 : 5);
  w.addSpacer();
  if (small) {
    shown.forEach(day => {
      const row = w.addStack();
      row.centerAlignContent();
      row.spacing = 8;
      const chip = row.addStack();
      chip.size = new Size(26, 26);
      chip.cornerRadius = 8;
      chip.backgroundColor = gradeColor(day.grade);
      chip.centerAlignContent();
      const g = chip.addText(day.grade);
      g.font = Font.heavyMonospacedSystemFont(14);
      g.textColor = new Color("#000000", 0.8);
      const d = row.addText(day.label);
      d.font = Font.boldMonospacedSystemFont(12);
      d.textColor = C.ink;
      row.addSpacer();
      const b = row.addText(day.best || dominantCause(day) || "—");
      b.font = Font.regularMonospacedSystemFont(10);
      b.textColor = C.dim;
      w.addSpacer(6);
    });
    w.addSpacer();
  } else {
    const row = w.addStack();
    shown.forEach((day, i) => {
      if (i) row.addSpacer();
      const col = row.addStack();
      col.layoutVertically();
      col.centerAlignContent();
      const d = col.addText(day.label);
      d.font = Font.boldMonospacedSystemFont(11);
      d.textColor = C.ink;
      col.addSpacer(5);
      const chipRow = col.addStack();
      const chip = chipRow.addStack();
      chip.size = new Size(34, 34);
      chip.cornerRadius = 10;
      chip.backgroundColor = gradeColor(day.grade);
      chip.centerAlignContent();
      const g = chip.addText(day.grade);
      g.font = Font.heavyMonospacedSystemFont(18);
      g.textColor = new Color("#000000", 0.8);
      col.addSpacer(5);
      const b = col.addText(day.best || dominantCause(day) || "—");
      b.font = Font.regularMonospacedSystemFont(9);
      b.textColor = C.dim;
    });
    w.addSpacer();
  }
}

function addBarRow(day, h0, h1, height) {
  const head = w.addStack();
  head.centerAlignContent();
  const d = head.addText(day.label);
  d.font = Font.boldMonospacedSystemFont(11);
  d.textColor = C.ink;
  if (!small && day.best) {
    head.addSpacer();
    const b = head.addText("best " + day.best);
    b.font = Font.regularMonospacedSystemFont(9);
    b.textColor = C.dim;
  }
  head.addSpacer();
  const g = head.addText(day.grade);
  g.font = Font.heavyMonospacedSystemFont(12);
  g.textColor = gradeColor(day.grade);
  w.addSpacer(3);
  const bar = w.addStack();
  bar.spacing = 2;
  for (let h = h0; h <= h1; h++) {
    const c = (day.cells || {})[String(h)];
    const cell = bar.addStack();
    cell.size = new Size(0, height); // width 0 = flexible, shared equally
    cell.cornerRadius = 3;
    cell.centerAlignContent();
    if (!c) {
      cell.backgroundColor = C.off;
    } else {
      cell.backgroundColor = C.cell[c.v];
      if (c.v === 0 && CAUSE_LETTER[c.c]) {
        const t = cell.addText(CAUSE_LETTER[c.c]);
        t.font = Font.boldMonospacedSystemFont(7);
        t.textColor = new Color("#000000", 0.75);
      }
    }
  }
  w.addSpacer(6);
}

function renderBars() {
  if (!days.length) { renderNext(); return; }
  const shown = days.slice(0, small ? 2 : 3);
  let h0 = 24, h1 = -1;
  shown.forEach(day => Object.keys(day.cells || {}).forEach(h => {
    h0 = Math.min(h0, +h); h1 = Math.max(h1, +h);
  }));
  if (h1 < 0) { renderNext(); return; }
  if (small) {
    // small widget: range from today's own window, capped at 9 columns so
    // cells stay wide enough for their cause letters
    let t0 = 24, t1 = -1;
    Object.keys(shown[0].cells || {}).forEach(h => {
      t0 = Math.min(t0, +h); t1 = Math.max(t1, +h);
    });
    if (t1 >= 0) { h0 = t0; h1 = t1; }
    if (h1 - h0 > 8) h1 = h0 + 8;
  }
  w.addSpacer();
  shown.forEach((day, i) => addBarRow(day, h0, h1, i === 0 ? (small ? 26 : 18) : 18));
  const axis = w.addStack();
  const a0 = axis.addText(fmtHour(h0));
  a0.font = Font.regularMonospacedSystemFont(8);
  a0.textColor = C.faint;
  axis.addSpacer();
  const a1 = axis.addText(fmtHour(h1));
  a1.font = Font.regularMonospacedSystemFont(8);
  a1.textColor = C.faint;
  w.addSpacer();
}

// ---- render ----
if (!data) {
  renderError();
} else {
  try {
    if (look === "grade") renderGrade();
    else if (look === "strip") renderStrip();
    else if (look === "bars") renderBars();
    else renderNext();
  } catch (e) {
    fetchErr = "" + e;
    renderError();
  }
}

Script.setWidget(w);
if (!config.runsInWidget) {
  if (small) await w.presentSmall();
  else await w.presentMedium();
}
Script.complete();
