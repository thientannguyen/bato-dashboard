import { useState, useMemo, useEffect, useRef, Fragment } from "react";
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from "recharts";
import { Droplet, TrendingUp, TrendingDown, Waves, Gauge, RefreshCw, CheckCircle, AlertCircle, ChevronDown, CircleDot, Trophy, CalendarClock, MapPin, Clock } from "lucide-react";
import { fetchWorldCup, flag, ROUND_ORDER } from "./wc-data.js";

// Mực nước = (tổng bàn thắng cộng dồn / số trận) * 100
const MAX_LEVEL = 310; // mốc tràn/vỡ đập
const STORE_KEY = "bato:matches";
const FX_KEY = "bato:fixtures";
const KO_KEY = "bato:knockout";
const TZ_KEY = "bato:tz";
const TZ = "America/Vancouver"; // múi giờ tham chiếu của giải
const REFRESH_MS = 10 * 60 * 1000; // tự làm mới mỗi 10 phút
const LIVE_WINDOW_MS = 130 * 60 * 1000; // coi là "đang đá" trong ~130 phút sau giờ bóng lăn

// localStorage shim — giữ cùng hình dạng { value } như storage cũ.
const storage = {
  get: (k) => {
    try {
      const v = localStorage.getItem(k);
      return v ? { value: v } : null;
    } catch (e) {
      return null;
    }
  },
  set: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch (e) {}
  },
};

// Phát hiện múi giờ của máy; nếu không xác định được thì rơi về giờ Vancouver.
function detectMachineTz() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || TZ;
  } catch (e) {
    return TZ;
  }
}
// Nhãn thân thiện cho múi giờ đang chọn.
function tzNice(tz) {
  if (tz === TZ) return "giờ Vancouver (PT)";
  return `giờ máy (${String(tz).split("/").pop().replace(/_/g, " ")})`;
}

const fallbackMatches = [
  { id: 1, label: "Mexico vs Nam Phi", home: "Mexico", away: "Nam Phi", a: 2, b: 0, group: "A", stage: "group", motm: "", scorers: [] },
  { id: 2, label: "Hàn Quốc vs Czechia", home: "Hàn Quốc", away: "Czechia", a: 2, b: 1, group: "B", stage: "group", motm: "", scorers: [] },
];

// Trả về true khi màn hình hẹp (điện thoại) để chuyển layout sang xếp dọc.
function useIsNarrow(bp = 700) {
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && window.innerWidth <= bp);
  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth <= bp);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [bp]);
  return narrow;
}

export default function Dashboard() {
  const narrow = useIsNarrow();
  const [matches, setMatches] = useState(fallbackMatches);
  const [fixtures, setFixtures] = useState([]);
  const [knockout, setKnockout] = useState([]);
  const [status, setStatus] = useState("idle");
  const [statusMsg, setStatusMsg] = useState("");
  const [fxStatus, setFxStatus] = useState("idle");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const machineTz = useMemo(detectMachineTz, []);
  const [tz, setTz] = useState(machineTz); // mặc định giờ máy (hoặc Vancouver nếu không rõ)
  const chooseTz = (z) => { setTz(z); storage.set(TZ_KEY, z); };
  const [simLevel, setSimLevel] = useState(null);
  // Cổng bí mật: thanh mô phỏng vỡ đập chỉ hiện khi URL có ?vodap hoặc #vodap.
  const [showSim] = useState(() => {
    if (typeof window === "undefined") return false;
    return /vodap/i.test(window.location.search + window.location.hash);
  });

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    try {
      const res = storage.get(STORE_KEY);
      if (res && res.value) {
        const saved = JSON.parse(res.value);
        if (saved.matches?.length) setMatches(saved.matches);
        if (saved.lastUpdated) setLastUpdated(saved.lastUpdated);
      }
    } catch (e) {}
    try {
      const r2 = storage.get(FX_KEY);
      if (r2 && r2.value) {
        const sv = JSON.parse(r2.value);
        if (Array.isArray(sv.fixtures)) setFixtures(sv.fixtures);
      }
    } catch (e) {}
    try {
      const r3 = storage.get(KO_KEY);
      if (r3 && r3.value) {
        const sv = JSON.parse(r3.value);
        if (Array.isArray(sv.knockout)) setKnockout(sv.knockout);
      }
    } catch (e) {}
    try {
      const rt = storage.get(TZ_KEY);
      // Chỉ nhận lại lựa chọn hợp lệ: giờ Vancouver hoặc đúng giờ máy hiện tại.
      if (rt && rt.value && (rt.value === TZ || rt.value === machineTz)) setTz(rt.value);
    } catch (e) {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Lấy kết quả + lịch từ openfootball/worldcup.json (miễn phí, không cần API key).
  const refreshAll = async () => {
    setStatus("loading");
    setStatusMsg("Đang cập nhật kết quả & lịch...");
    setFxStatus("loading");
    try {
      const { matches: cleaned, fixtures: fx, knockout: ko } = await fetchWorldCup();
      const ts = new Date().toISOString();
      if (cleaned.length) {
        setMatches(cleaned);
        storage.set(STORE_KEY, JSON.stringify({ matches: cleaned, lastUpdated: ts }));
      }
      setFixtures(fx);
      storage.set(FX_KEY, JSON.stringify({ fixtures: fx, fxUpdated: ts }));
      setKnockout(Array.isArray(ko) ? ko : []);
      storage.set(KO_KEY, JSON.stringify({ knockout: ko || [], koUpdated: ts }));
      setLastUpdated(ts);
      setStatus("ok");
      setStatusMsg(`Đã cập nhật ${cleaned.length} trận, ${fx.length} sắp tới`);
      setFxStatus("ok");
    } catch (e) {
      setStatus("error");
      setStatusMsg("Không lấy được dữ liệu, thử lại sau");
      setFxStatus("error");
    }
  };

  // Tự động tải dữ liệu mới một lần khi mở app (khỏi phải bấm "Cập nhật kết quả").
  useEffect(() => {
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tự động làm mới kết quả & lịch mỗi 10 phút (dừng khi tab ẩn để khỏi gọi mạng vô ích).
  useEffect(() => {
    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      refreshAll();
    }, REFRESH_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const data = useMemo(() => {
    let cumGoals = 0;
    return matches.map((m, i) => {
      cumGoals += m.a + m.b;
      const level = (cumGoals / (i + 1)) * 100;
      return { ...m, day: i + 1, goals: m.a + m.b, cumGoals, level: Math.round(level), score: `${m.a}-${m.b}` };
    });
  }, [matches]);

  const current = data[data.length - 1];
  const prev = data[data.length - 2];
  const delta = current && prev ? current.level - prev.level : 0;
  const realLevel = current?.level ?? 0;
  // Mô phỏng: nếu simLevel != null thì đập hiển thị theo mức mô phỏng (không đụng dữ liệu thật).
  const dispLevel = showSim && simLevel != null ? simLevel : realLevel;
  const fillPct = Math.min(dispLevel / MAX_LEVEL, 1);
  const broken = dispLevel >= MAX_LEVEL;

  const verified = useMemo(() => {
    const seen = {};
    data.forEach((m) => {
      const d = m.level % 10;
      if (seen[d] === undefined) seen[d] = { day: m.day, count: 0 };
      seen[d].count += 1;
    });
    return seen;
  }, [data]);
  const verifiedCount = Object.keys(verified).length;

  const standings = useMemo(() => {
    const groups = {};
    data.forEach((m) => {
      if (m.stage === "knockout" || !m.group) return;
      const g = m.group;
      if (!groups[g]) groups[g] = {};
      const ensure = (name) => { if (!groups[g][name]) groups[g][name] = { team: name, P: 0, W: 0, D: 0, L: 0, GF: 0, GA: 0 }; return groups[g][name]; };
      const H = ensure(m.home), A = ensure(m.away);
      H.P++; A.P++; H.GF += m.a; H.GA += m.b; A.GF += m.b; A.GA += m.a;
      if (m.a > m.b) { H.W++; A.L++; } else if (m.a < m.b) { A.W++; H.L++; } else { H.D++; A.D++; }
    });
    const result = {};
    Object.keys(groups).sort().forEach((g) => {
      const teams = Object.values(groups[g]).map((t) => ({ ...t, GD: t.GF - t.GA, Pts: t.W * 3 + t.D }));
      teams.sort((x, y) => y.Pts - x.Pts || y.GD - x.GD || y.GF - x.GF || x.team.localeCompare(y.team));
      result[g] = teams;
    });
    return result;
  }, [data]);

  const teamInfo = useMemo(() => {
    const map = {};
    Object.entries(standings).forEach(([g, teams]) => { teams.forEach((t, idx) => { map[t.team] = { group: g, pts: t.Pts, rank: idx + 1 }; }); });
    return map;
  }, [standings]);

  const topScorers = useMemo(() => {
    const tally = {};
    data.forEach((m) => {
      (m.scorers || []).forEach((s) => {
        const teamName = s.team === "away" ? m.away : m.home;
        const key = `${s.player}__${teamName}`;
        if (!tally[key]) tally[key] = { player: s.player, team: teamName, goals: 0 };
        tally[key].goals += 1;
      });
    });
    return Object.values(tally)
      .sort((x, y) => y.goals - x.goals || x.player.localeCompare(y.player))
      .slice(0, 10);
  }, [data]);

  const nextMatch = useMemo(() => {
    return fixtures
      .filter((f) => f.kickoff_iso && new Date(f.kickoff_iso).getTime() > now)
      .sort((a, b) => new Date(a.kickoff_iso) - new Date(b.kickoff_iso))[0] || null;
  }, [fixtures, now]);

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(160deg,#0a1628 0%,#0d2137 50%,#0a1f33 100%)", color: "#e2f1ff", fontFamily: "system-ui,-apple-system,sans-serif", padding: narrow ? "14px" : "24px" }}>
      {broken && <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 50, background: "radial-gradient(ellipse at center, transparent 35%, rgba(220,38,38,.55) 100%)", animation: "dangerFlash 0.9s ease-in-out infinite" }} />}
      <div style={{ maxWidth: 1100, margin: "0 auto", animation: broken ? "quake .35s ease-in-out infinite" : "none" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 14, marginBottom: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ background: "linear-gradient(135deg,#0ea5e9,#06b6d4)", borderRadius: 14, padding: 10, display: "flex", boxShadow: "0 0 24px rgba(14,165,233,.5)" }}>
              <Waves size={28} color="#fff" />
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: -0.5 }}>Hồ thủy điện BA TO</h1>
              <p style={{ margin: 0, color: "#7da8c9", fontSize: 13 }}>Mực nước tính theo kết quả World Cup 2026</p>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <TzToggle tz={tz} machineTz={machineTz} onSet={chooseTz} />
            <button onClick={refreshAll} disabled={status === "loading"} style={{ background: status === "loading" ? "#1a4a63" : "linear-gradient(135deg,#0ea5e9,#06b6d4)", border: "none", borderRadius: 11, color: "#fff", padding: "11px 18px", fontWeight: 700, fontSize: 14, cursor: status === "loading" ? "wait" : "pointer", display: "flex", alignItems: "center", gap: 8, boxShadow: "0 4px 14px rgba(14,165,233,.35)" }}>
              <RefreshCw size={16} style={{ animation: status === "loading" ? "spin 1s linear infinite" : "none" }} />
              {status === "loading" ? "Đang cập nhật..." : "Cập nhật kết quả"}
            </button>
            </div>
            <StatusLine status={status} msg={statusMsg} lastUpdated={lastUpdated} tz={tz} />
          </div>
        </div>

        <Reveal delay={60}>
        <div style={{ display: "grid", gridTemplateColumns: narrow ? "1fr" : "340px 1fr", gap: narrow ? 14 : 20, marginTop: narrow ? 14 : 20 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <DamVisual fillPct={fillPct} level={dispLevel} broken={broken} />
            {showSim && <SimControl level={dispLevel} simOn={simLevel != null} broken={broken} onSet={setSimLevel} />}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: narrow ? 8 : 12 }}>
              <Stat icon={<Gauge size={18} />} label="Mực nước hiện tại" value={<CountUp value={current?.level ?? 0} suffix=" m" />} accent="#0ea5e9" />
              <Stat icon={delta >= 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />} label="So với trận trước" value={<CountUp value={delta} suffix=" m" signed />} accent={delta >= 0 ? "#22c55e" : "#f87171"} />
              <Stat icon={<Droplet size={18} />} label="Tổng bàn / số trận" value={<><CountUp value={current?.cumGoals ?? 0} /> / <CountUp value={data.length} /></>} accent="#a78bfa" />
            </div>
            <div style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 16, padding: "18px 16px 8px" }}>
              <h3 style={{ margin: "0 0 12px 4px", fontSize: 15, fontWeight: 700, color: "#bcdcf2" }}>Diễn biến mực nước</h3>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="waterGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.6} />
                      <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.07)" />
                  <XAxis dataKey="day" tick={{ fill: "#7da8c9", fontSize: 12 }} tickFormatter={(d) => `Ngày ${d}`} />
                  <YAxis tick={{ fill: "#7da8c9", fontSize: 12 }} unit="m" />
                  <Tooltip contentStyle={{ background: "#0d2137", border: "1px solid rgba(14,165,233,.4)", borderRadius: 10, color: "#e2f1ff" }} labelFormatter={(d) => `Ngày ${d}`} formatter={(v, _n, p) => [`${v} m`, `Mực nước (${p.payload.score})`]} />
                  <Area type="monotone" dataKey="level" stroke="#0ea5e9" strokeWidth={3} fill="url(#waterGrad)" dot={{ fill: "#06b6d4", r: 4 }} activeDot={{ r: 6 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
        </Reveal>

        {/* Đếm ngược trận tiếp theo */}
        <Reveal delay={120}><NextMatchCountdown match={nextMatch} now={now} /></Reveal>

        {/* Fixtures */}
        <Reveal delay={180}><FixturesSection fixtures={fixtures} status={fxStatus} now={now} tz={tz} /></Reveal>

        {/* Standings */}
        <Reveal delay={240}><StandingsSection standings={standings} /></Reveal>

        {/* Sơ đồ cây đấu loại */}
        <Reveal delay={270}><BracketSection knockout={knockout} now={now} narrow={narrow} tz={tz} /></Reveal>

        {/* Digit tracker */}
        <Reveal delay={300}><DigitTracker verified={verified} verifiedCount={verifiedCount} narrow={narrow} /></Reveal>

        {/* Vua phá lưới */}
        <Reveal delay={360}><TopScorersSection scorers={topScorers} /></Reveal>

        {/* Table */}
        <Reveal delay={420}>
        <div style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 16, padding: 18, marginTop: 20 }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 700, color: "#bcdcf2" }}>Lịch sử trận đấu</h3>
          <div style={{ maxHeight: 320, overflowY: "auto", overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ color: "#7da8c9", textAlign: "left" }}>
                  <th style={th}></th><th style={th}>Ngày</th><th style={th}>Bảng</th><th style={th}>Trận</th><th style={th}>Tỉ số</th><th style={{ ...th, textAlign: "right" }}>Mực nước</th>
                </tr>
              </thead>
              <tbody>
                {data.map((m) => {
                  const open = expanded === m.id;
                  return (
                    <Fragment key={m.id}>
                      <tr onClick={() => setExpanded(open ? null : m.id)} style={{ borderTop: "1px solid rgba(255,255,255,.06)", cursor: "pointer", background: open ? "rgba(14,165,233,.08)" : "transparent" }}>
                        <td style={{ ...td, width: 24 }}>
                          <ChevronDown size={15} color="#7da8c9" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
                        </td>
                        <td style={td}>{m.day}</td>
                        <td style={td}><GroupBadge group={m.group} stage={m.stage} /></td>
                        <td style={{ ...td, color: "#cfe6f7" }}>{flag(m.home)} {m.home} <span style={{ color: "#5d83a3" }}>vs</span> {m.away} {flag(m.away)}</td>
                        <td style={td}><span style={{ background: "rgba(14,165,233,.15)", padding: "2px 8px", borderRadius: 6, fontWeight: 700 }}>{m.score}</span></td>
                        <td style={{ ...td, textAlign: "right", fontWeight: 700, color: "#38bdf8" }}>{m.level} m</td>
                      </tr>
                      {open && (
                        <tr style={{ background: "rgba(14,165,233,.05)" }}>
                          <td></td>
                          <td colSpan={5} style={{ padding: "4px 8px 14px" }}>
                            <MatchDetail match={m} teamInfo={teamInfo} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p style={{ margin: "12px 2px 0", fontSize: 12, color: "#5d83a3" }}>Mực nước = (tổng bàn cộng dồn ÷ số trận) × 100. Bấm vào một trận để xem người ghi bàn, phút và điểm hai đội.</p>
        </div>
        </Reveal>
      </div>

      <style>{`
        @keyframes wave { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }
        @keyframes wave2 { 0%{transform:translateX(-50%)} 100%{transform:translateX(0)} }
        @keyframes bubble { 0%{transform:translateY(0) scale(.7);opacity:0} 12%{opacity:.7} 100%{transform:translateY(-340px) scale(1.1);opacity:0} }
        @keyframes spin { 100%{transform:rotate(360deg)} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(18px)} to{opacity:1;transform:none} }
        @keyframes tickIn { from{opacity:0;transform:translateY(-65%)} to{opacity:1;transform:none} }
        @keyframes confettiFall { 0%{transform:translateY(-10px) rotate(0);opacity:1} 100%{transform:translateY(360px) rotate(540deg);opacity:0} }
        @keyframes shake { 0%,100%{transform:translate(0,0)} 10%{transform:translate(-7px,3px) rotate(-.4deg)} 30%{transform:translate(7px,-3px) rotate(.4deg)} 50%{transform:translate(-6px,2px)} 70%{transform:translate(6px,-2px) rotate(.3deg)} 90%{transform:translate(-3px,1px)} }
        @keyframes quake { 0%,100%{transform:translate(0,0)} 25%{transform:translate(-2px,1px)} 50%{transform:translate(2px,-1px)} 75%{transform:translate(-1px,1px)} }
        @keyframes gush { 0%{transform:translateY(-100%);opacity:.9} 100%{transform:translateY(0);opacity:.3} }
        @keyframes alertPulse { 0%,100%{opacity:1;transform:scale(1) rotate(-1deg)} 50%{opacity:.65;transform:scale(1.09) rotate(1deg)} }
        @keyframes dangerFlash { 0%,100%{opacity:.12} 50%{opacity:.5} }
        @keyframes livePulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.35;transform:scale(.7)} }
        @keyframes jet { 0%{transform:translate(0,0) scale(1);opacity:.95} 100%{transform:translate(var(--jx),var(--jy)) scale(.3);opacity:0} }
        @keyframes crackDraw { from{stroke-dashoffset:220} to{stroke-dashoffset:0} }
        .lift{transition:transform .2s ease, box-shadow .2s ease, border-color .2s ease}
        .lift:hover{transform:translateY(-3px);box-shadow:0 10px 24px rgba(0,0,0,.38);border-color:rgba(14,165,233,.45)}
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after { animation-duration:.001ms !important; animation-iteration-count:1 !important; transition-duration:.001ms !important; scroll-behavior:auto !important; }
        }
      `}</style>
    </div>
  );
}

function tzDate(d, tz) {
  return d.toLocaleDateString("en-CA", { timeZone: tz }); // YYYY-MM-DD theo múi giờ đang chọn
}
function fxDayLabel(iso, tz) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";
  const ds = tzDate(d, tz);
  if (ds === tzDate(new Date(), tz)) return "Hôm nay";
  if (ds === tzDate(new Date(Date.now() + 86400000), tz)) return "Ngày mai";
  return d.toLocaleDateString("vi-VN", { timeZone: tz, weekday: "short", day: "2-digit", month: "2-digit" });
}
function fxTimeLabel(f, tz) {
  if (f.kickoff_iso) {
    const d = new Date(f.kickoff_iso);
    if (!isNaN(d)) return d.toLocaleString("vi-VN", { timeZone: tz, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  }
  return f.kickoff_text || "Chưa rõ giờ";
}

// Nút chọn múi giờ hiển thị: giờ máy vs giờ Vancouver.
// Ẩn khi giờ máy trùng giờ Vancouver (hoặc không phát hiện được) — lúc đó luôn dùng Vancouver.
function TzToggle({ tz, machineTz, onSet }) {
  const opts = [{ key: machineTz, label: "Giờ máy" }, { key: TZ, label: "Giờ Vancouver" }];
  const uniq = opts.filter((o, i) => opts.findIndex((x) => x.key === o.key) === i);
  if (uniq.length < 2) return null;
  return (
    <div style={{ display: "flex", background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 9, padding: 2 }}>
      {uniq.map((o) => {
        const active = tz === o.key;
        return (
          <button key={o.key} onClick={() => onSet(o.key)} title={o.key} style={{ border: "none", borderRadius: 7, cursor: "pointer", fontSize: 11.5, fontWeight: 700, padding: "5px 11px", background: active ? "linear-gradient(135deg,#0ea5e9,#06b6d4)" : "transparent", color: active ? "#fff" : "#9cc2dd" }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// Trận coi như "đang đá" khi giờ bóng lăn đã qua nhưng chưa quá ~130 phút và chưa có kết quả.
function isLive(f, now) {
  if (!f.kickoff_iso) return false;
  const t = new Date(f.kickoff_iso).getTime();
  if (isNaN(t)) return false;
  return now >= t && now < t + LIVE_WINDOW_MS;
}

function FixturesSection({ fixtures, status, now, tz }) {
  const liveCount = fixtures.filter((f) => isLive(f, now)).length;
  return (
    <div style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 16, padding: 18, marginTop: 20 }}>
      <h3 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 700, color: "#bcdcf2", display: "flex", alignItems: "center", gap: 8 }}>
        <CalendarClock size={16} color="#38bdf8" /> Trận sắp tới — hôm nay & ngày mai
        {liveCount > 0 && <LiveBadge label={`${liveCount} trận đang đá`} />}
      </h3>
      <p style={{ margin: "0 0 14px", fontSize: 12, color: "#5d83a3" }}>Giờ hiển thị theo {tzNice(tz)}. Tự làm mới mỗi 10 phút, hoặc bấm "Cập nhật kết quả".</p>
      {fixtures.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: "#5d83a3", fontStyle: "italic" }}>
          {status === "loading" ? "Đang tải lịch thi đấu..." : status === "error" ? "Không lấy được lịch, thử lại sau." : "Chưa có lịch — bấm \"Cập nhật kết quả\" để lấy các trận hôm nay và ngày mai."}
        </p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 12 }}>
          {fixtures.map((f) => {
            const live = isLive(f, now);
            const day = fxDayLabel(f.kickoff_iso, tz);
            const venue = [f.stadium, f.city, f.country].filter(Boolean).join(", ");
            return (
              <div key={f.id} className="lift" style={{ background: live ? "rgba(239,68,68,.07)" : "rgba(255,255,255,.03)", border: `1px solid ${live ? "rgba(239,68,68,.45)" : "rgba(255,255,255,.08)"}`, borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <GroupBadge group={f.group} stage={f.stage} />
                  {live ? <LiveBadge label="ĐANG ĐÁ" /> : day && <span style={{ fontSize: 11, fontWeight: 700, color: day === "Hôm nay" ? "#fbbf24" : "#7dd3fc", background: day === "Hôm nay" ? "rgba(251,191,36,.15)" : "rgba(14,165,233,.12)", padding: "2px 8px", borderRadius: 6 }}>{day}</span>}
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#e2f1ff" }}>{flag(f.home)} {f.home} <span style={{ color: "#5d83a3", fontWeight: 400 }}>vs</span> {f.away} {flag(f.away)}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "#9cc2dd" }}>
                  <Clock size={13} color="#38bdf8" /> {fxTimeLabel(f, tz)}
                </div>
                {venue && (
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: 12.5, color: "#9cc2dd" }}>
                    <MapPin size={13} color="#a78bfa" style={{ marginTop: 2, flexShrink: 0 }} /> <span>{venue}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Nhãn "đang đá" — chấm đỏ nhấp nháy.
function LiveBadge({ label }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 800, color: "#fca5a5", background: "rgba(239,68,68,.16)", border: "1px solid rgba(239,68,68,.4)", padding: "2px 8px", borderRadius: 999, whiteSpace: "nowrap" }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#ef4444", boxShadow: "0 0 6px #ef4444", animation: "livePulse 1.1s ease-in-out infinite" }} />
      {label}
    </span>
  );
}

// Sơ đồ cây đấu loại trực tiếp — xếp các vòng thành cột, cuộn ngang trên mobile.
// Mặc định thu gọn khi chưa có trận knock-out nào đá; tự mở khi vòng loại trực tiếp bắt đầu.
function BracketSection({ knockout, now, narrow, tz }) {
  const rounds = useMemo(() => {
    const by = {};
    (knockout || []).forEach((m) => {
      const r = m.round || "Khác";
      (by[r] = by[r] || []).push(m);
    });
    const ordered = ROUND_ORDER.filter((r) => by[r]);
    Object.keys(by).forEach((r) => { if (!ordered.includes(r)) ordered.push(r); });
    return ordered.map((r) => ({ round: r, matches: by[r] }));
  }, [knockout]);

  const started = useMemo(() => (knockout || []).some((m) => m.played || isLive(m, now)), [knockout, now]);
  const total = (knockout || []).length;
  const [open, setOpen] = useState(false);
  const [touched, setTouched] = useState(false);
  // Tự mở khi knock-out bắt đầu (trừ khi người dùng đã tự bật/tắt).
  useEffect(() => { if (started && !touched) setOpen(true); }, [started, touched]);
  const toggle = () => { setTouched(true); setOpen((o) => !o); };

  if (rounds.length === 0) {
    return (
      <div style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 16, padding: 18, marginTop: 20 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#bcdcf2", display: "flex", alignItems: "center", gap: 8 }}><Trophy size={16} color="#a78bfa" /> Sơ đồ đấu loại trực tiếp</h3>
        <p style={{ margin: "8px 0 0", fontSize: 12, color: "#5d83a3" }}>Chưa có cặp đấu loại trực tiếp — sơ đồ sẽ hiện khi có lịch knock-out.</p>
      </div>
    );
  }

  return (
    <div style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 16, padding: 18, marginTop: 20 }}>
      <div onClick={toggle} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, cursor: "pointer" }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#bcdcf2", display: "flex", alignItems: "center", gap: 8 }}>
          <Trophy size={16} color="#a78bfa" /> Sơ đồ đấu loại trực tiếp
          <span style={{ fontSize: 11, fontWeight: 700, color: started ? "#86efac" : "#7da8c9", background: started ? "rgba(34,197,94,.15)" : "rgba(255,255,255,.06)", padding: "2px 8px", borderRadius: 999 }}>
            {started ? "đang diễn ra" : `${total} cặp dự kiến`}
          </span>
        </h3>
        <ChevronDown size={18} color="#7da8c9" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .2s", flexShrink: 0 }} />
      </div>
      {!open ? (
        <p style={{ margin: "8px 0 0", fontSize: 12, color: "#5d83a3" }}>
          {started ? "Bấm để xem sơ đồ các vòng." : "Chưa tới vòng knock-out — bấm để xem các cặp dự kiến."}
        </p>
      ) : (
        <>
          <p style={{ margin: "10px 0 14px", fontSize: 12, color: "#5d83a3" }}>Mỗi cột là một vòng. Trận đã đá hiện tỉ số, trận chưa đá hiện giờ bóng lăn ({tzNice(tz)}).</p>
          <div style={{ display: "flex", gap: 16, overflowX: "auto", paddingBottom: 6 }}>
            {rounds.map(({ round, matches }) => (
              <div key={round} style={{ minWidth: narrow ? 220 : 240, flex: "0 0 auto", display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ fontWeight: 800, color: "#c4b5fd", fontSize: 13, textAlign: "center", padding: "4px 0", background: "rgba(167,139,250,.1)", borderRadius: 8 }}>{round}</div>
                {matches.map((m, i) => (
                  <BracketMatch key={i} m={m} now={now} tz={tz} />
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function BracketMatch({ m, now, tz }) {
  const live = isLive(m, now);
  const hWin = m.played && m.a > m.b;
  const aWin = m.played && m.b > m.a;
  const row = (name, score, win) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
      <span style={{ fontSize: 13, fontWeight: win ? 800 : 600, color: win ? "#fff" : "#cfe6f7", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{flag(name)} {name || "—"}</span>
      {m.played && <span style={{ fontSize: 13, fontWeight: 800, color: win ? "#34d399" : "#7da8c9", minWidth: 16, textAlign: "right" }}>{score}</span>}
    </div>
  );
  return (
    <div className="lift" style={{ background: live ? "rgba(239,68,68,.07)" : "rgba(255,255,255,.03)", border: `1px solid ${live ? "rgba(239,68,68,.45)" : "rgba(255,255,255,.08)"}`, borderRadius: 10, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
      {row(m.home, m.a, hWin)}
      <div style={{ height: 1, background: "rgba(255,255,255,.07)" }} />
      {row(m.away, m.b, aWin)}
      <div style={{ fontSize: 10.5, color: live ? "#fca5a5" : "#5d83a3", marginTop: 2, display: "flex", alignItems: "center", gap: 6 }}>
        {live ? <LiveBadge label="ĐANG ĐÁ" /> : m.played ? "Kết thúc" : (m.kickoff_iso ? fxTimeLabel({ kickoff_iso: m.kickoff_iso }, tz) : "Chưa rõ giờ")}
      </div>
    </div>
  );
}

function NextMatchCountdown({ match, now }) {
  if (!match || !match.kickoff_iso) return null;
  const ms = new Date(match.kickoff_iso).getTime() - now;
  if (!(ms > 0)) return null;
  const totalSec = Math.floor(ms / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const mm = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n) => String(n).padStart(2, "0");
  const units = d > 0 ? [["ngày", d], ["giờ", h], ["phút", mm], ["giây", s]] : [["giờ", h], ["phút", mm], ["giây", s]];
  return (
    <div style={{ background: "linear-gradient(135deg,rgba(14,165,233,.15),rgba(167,139,250,.12))", border: "1px solid rgba(14,165,233,.3)", borderRadius: 16, padding: 18, marginTop: 20, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
      <div>
        <div style={{ fontSize: 12, color: "#7da8c9", fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}><CalendarClock size={14} color="#38bdf8" /> Trận tiếp theo bắt đầu sau</div>
        <div style={{ fontSize: 17, fontWeight: 800, color: "#e2f1ff", marginTop: 4 }}>{flag(match.home)} {match.home} <span style={{ color: "#5d83a3", fontWeight: 400 }}>vs</span> {match.away} {flag(match.away)}</div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        {units.map(([lbl, val]) => (
          <div key={lbl} style={{ textAlign: "center", background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 10, padding: "8px 12px", minWidth: 56 }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: "#38bdf8", fontVariantNumeric: "tabular-nums", overflow: "hidden", height: 30, lineHeight: "30px" }}>
              <span key={pad(val)} style={{ display: "inline-block", animation: "tickIn .4s cubic-bezier(.2,.7,.3,1)" }}>{pad(val)}</span>
            </div>
            <div style={{ fontSize: 10, color: "#7da8c9", textTransform: "uppercase", letterSpacing: 0.5 }}>{lbl}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TopScorersSection({ scorers }) {
  if (!scorers || scorers.length === 0) return null;
  const medal = ["🥇", "🥈", "🥉"];
  return (
    <div style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 16, padding: 18, marginTop: 20 }}>
      <h3 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 700, color: "#bcdcf2", display: "flex", alignItems: "center", gap: 8 }}><Trophy size={16} color="#fbbf24" /> Vua phá lưới</h3>
      <p style={{ margin: "0 0 12px", fontSize: 12, color: "#5d83a3" }}>Tổng hợp từ người ghi bàn các trận đã đá. Top 10.</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {scorers.map((s, i) => (
          <div key={`${s.player}-${s.team}`} className="lift" style={{ display: "flex", alignItems: "center", gap: 10, background: i < 3 ? "rgba(251,191,36,.08)" : "rgba(255,255,255,.03)", border: `1px solid ${i < 3 ? "rgba(251,191,36,.25)" : "rgba(255,255,255,.06)"}`, borderRadius: 8, padding: "4px 12px" }}>
            <span style={{ minWidth: 22, textAlign: "center", fontSize: i < 3 ? 15 : 12, fontWeight: 700, color: "#7da8c9" }}>{medal[i] || i + 1}</span>
            <span style={{ flex: 1, fontWeight: 600, color: "#e2f1ff", fontSize: 13 }}>{s.player}</span>
            <span style={{ fontSize: 12, color: "#9cc2dd" }}>{flag(s.team)} {s.team}</span>
            <span style={{ fontWeight: 800, color: "#fbbf24", fontSize: 13.5, minWidth: 46, textAlign: "right" }}>{s.goals} bàn</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function GroupBadge({ group, stage }) {
  if (!group) return <span style={{ color: "#3a5a72", fontSize: 11 }}>—</span>;
  const knock = stage === "knockout";
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6, whiteSpace: "nowrap", background: knock ? "rgba(167,139,250,.18)" : "rgba(14,165,233,.15)", color: knock ? "#c4b5fd" : "#7dd3fc", border: `1px solid ${knock ? "rgba(167,139,250,.35)" : "rgba(14,165,233,.3)"}` }}>
      {knock ? group : `Bảng ${group}`}
    </span>
  );
}

function MatchDetail({ match, teamInfo }) {
  const hasScorers = match.scorers && match.scorers.length > 0;
  const hInfo = teamInfo[match.home];
  const aInfo = teamInfo[match.away];
  const venue = [match.stadium, match.city, match.country].filter(Boolean).join(", ");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {(hInfo || aInfo) && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <TeamPts name={match.home} info={hInfo} />
          <TeamPts name={match.away} info={aInfo} />
        </div>
      )}
      {hasScorers ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {match.scorers.map((s, i) => {
            const teamName = s.team === "away" ? match.away : match.home;
            const isAway = s.team === "away";
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
                <span style={{ minWidth: 38, fontWeight: 800, color: "#38bdf8", textAlign: "right" }}>{s.minute != null ? `${s.minute}'` : "—"}</span>
                <CircleDot size={13} color={isAway ? "#a78bfa" : "#22c55e"} />
                <span style={{ color: "#e2f1ff", fontWeight: 600 }}>{s.player}</span>
                <span style={{ color: "#7da8c9" }}>({teamName})</span>
              </div>
            );
          })}
        </div>
      ) : (
        <span style={{ fontSize: 12, color: "#5d83a3", fontStyle: "italic" }}>Chưa có dữ liệu người ghi bàn.</span>
      )}
      {venue && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: 12.5, color: "#cfe6f7" }}>
          <MapPin size={13} color="#a78bfa" style={{ marginTop: 2, flexShrink: 0 }} /> <span>{venue}</span>
        </div>
      )}
    </div>
  );
}

function TeamPts({ name, info }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 9, padding: "6px 12px" }}>
      <span style={{ fontWeight: 700, color: "#e2f1ff", fontSize: 13 }}>{flag(name)} {name}</span>
      {info ? (
        <>
          <span style={{ fontSize: 11, color: "#7dd3fc" }}>Bảng {info.group}</span>
          <span style={{ fontSize: 13, fontWeight: 800, color: "#fbbf24" }}>{info.pts}đ</span>
        </>
      ) : (
        <span style={{ fontSize: 11, color: "#5d83a3" }}>(vòng knock-out)</span>
      )}
    </div>
  );
}

function StandingsSection({ standings }) {
  const keys = Object.keys(standings);
  if (keys.length === 0) {
    return (
      <div style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 16, padding: 18, marginTop: 20 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#bcdcf2", display: "flex", alignItems: "center", gap: 8 }}><Trophy size={16} color="#fbbf24" /> Bảng xếp hạng</h3>
        <p style={{ margin: "8px 0 0", fontSize: 12, color: "#5d83a3" }}>Chưa có dữ liệu bảng. Bấm "Cập nhật kết quả" để lấy nhãn bảng và tính điểm.</p>
      </div>
    );
  }
  return (
    <div style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 16, padding: 18, marginTop: 20 }}>
      <h3 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 700, color: "#bcdcf2", display: "flex", alignItems: "center", gap: 8 }}><Trophy size={16} color="#fbbf24" /> Bảng xếp hạng</h3>
      <p style={{ margin: "0 0 14px", fontSize: 12, color: "#5d83a3" }}>Tự tính từ kết quả vòng bảng — thắng 3đ, hòa 1đ. Xếp theo Điểm → Hiệu số → Bàn thắng. 2 đội đầu (xanh) đi tiếp.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 14 }}>
        {keys.map((g) => (
          <div key={g} className="lift" style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 12, padding: 12 }}>
            <div style={{ fontWeight: 800, color: "#7dd3fc", fontSize: 13, marginBottom: 8 }}>Bảng {g}</div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ color: "#7da8c9", textAlign: "center" }}>
                  <th style={{ ...stTh, textAlign: "left" }}>#</th>
                  <th style={{ ...stTh, textAlign: "left" }}>Đội</th>
                  <th style={stTh}>Tr</th><th style={stTh}>T</th><th style={stTh}>H</th><th style={stTh}>B</th><th style={stTh}>HS</th><th style={stTh}>Đ</th>
                </tr>
              </thead>
              <tbody>
                {standings[g].map((t, idx) => {
                  const qualify = idx < 2;
                  return (
                    <tr key={t.team} style={{ borderTop: "1px solid rgba(255,255,255,.05)" }}>
                      <td style={{ ...stTd, textAlign: "left" }}>
                        <span style={{ display: "inline-block", width: 16, height: 16, lineHeight: "16px", textAlign: "center", borderRadius: 4, fontSize: 10, fontWeight: 700, background: qualify ? "rgba(34,197,94,.25)" : "rgba(255,255,255,.06)", color: qualify ? "#86efac" : "#7da8c9" }}>{idx + 1}</span>
                      </td>
                      <td style={{ ...stTd, textAlign: "left", color: "#e2f1ff", fontWeight: 600 }}>{flag(t.team)} {t.team}</td>
                      <td style={stTd}>{t.P}</td><td style={stTd}>{t.W}</td><td style={stTd}>{t.D}</td><td style={stTd}>{t.L}</td>
                      <td style={stTd}>{t.GD > 0 ? `+${t.GD}` : t.GD}</td>
                      <td style={{ ...stTd, fontWeight: 800, color: "#fbbf24" }}>{t.Pts}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusLine({ status, msg, lastUpdated, tz }) {
  const timeText = lastUpdated ? new Date(lastUpdated).toLocaleString("vi-VN", { timeZone: tz }) : null;
  const Last = () => timeText
    ? <span style={{ fontSize: 12, color: "#5d83a3" }}>Cập nhật lần cuối: {timeText}</span>
    : <span style={{ fontSize: 12, color: "#5d83a3" }}>Chưa cập nhật</span>;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
      {status === "loading" && <span style={{ fontSize: 12, color: "#7da8c9" }}>{msg}</span>}
      {status === "ok" && <span style={{ fontSize: 12, color: "#22c55e", display: "flex", alignItems: "center", gap: 4 }}><CheckCircle size={13} /> {msg}</span>}
      {status === "error" && <span style={{ fontSize: 12, color: "#f87171", display: "flex", alignItems: "center", gap: 4 }}><AlertCircle size={13} /> {msg}</span>}
      <Last />
    </div>
  );
}

function DigitTracker({ verified, verifiedCount, narrow }) {
  const allDone = verifiedCount === 10;
  const pct = (verifiedCount / 10) * 100;
  return (
    <div style={{ position: "relative", overflow: "hidden", background: "rgba(255,255,255,.04)", border: `1px solid ${allDone ? "rgba(34,197,94,.5)" : "rgba(255,255,255,.08)"}`, borderRadius: 16, padding: 18, marginTop: 20 }}>
      {allDone && <Confetti />}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#bcdcf2" }}>Bộ sưu tập chữ số mực nước</h3>
          <p style={{ margin: "2px 0 0", fontSize: 12, color: "#5d83a3" }}>Mỗi chữ số tận cùng của mực nước được xác thực một lần (×N = số lần đã xuất hiện). Mục tiêu: đủ 0–9 trước khi World Cup kết thúc.</p>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: allDone ? "#22c55e" : "#fff" }}><CountUp value={verifiedCount} />/10</div>
          <div style={{ fontSize: 11, color: "#7da8c9" }}>đã xác thực</div>
        </div>
      </div>
      <div style={{ height: 10, borderRadius: 99, background: "rgba(255,255,255,.07)", overflow: "hidden", marginBottom: 16 }}>
        <div style={{ height: "100%", width: `${pct}%`, borderRadius: 99, background: allDone ? "linear-gradient(90deg,#22c55e,#4ade80)" : "linear-gradient(90deg,#0ea5e9,#06b6d4)", transition: "width .8s cubic-bezier(.4,0,.2,1)" }} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${narrow ? 5 : 10},1fr)`, gap: 8 }}>
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => {
          const entry = verified[d];
          const on = entry !== undefined;
          const day = entry?.day;
          const count = entry?.count;
          return (
            <div key={d} style={{ position: "relative", aspectRatio: narrow ? "1 / 1.18" : "1", borderRadius: 12, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: narrow ? "flex-end" : "center", paddingBottom: narrow ? 8 : 0, background: on ? "linear-gradient(135deg,rgba(34,197,94,.22),rgba(14,165,233,.18))" : "rgba(255,255,255,.03)", border: `1px solid ${on ? "rgba(34,197,94,.55)" : "rgba(255,255,255,.08)"}`, boxShadow: on ? "0 0 16px rgba(34,197,94,.25)" : "none", transition: "all .4s" }}>
              <span style={{ fontSize: narrow ? 22 : 26, fontWeight: 800, color: on ? "#fff" : "#3a5a72", lineHeight: 1 }}>{d}</span>
              {on ? <span style={{ fontSize: 9, color: "#86efac", fontWeight: 600, marginTop: 3 }}>Ngày {day}</span> : <span style={{ fontSize: 9, color: "#3a5a72", marginTop: 3 }}>chờ</span>}
              {on && <span title={`Xuất hiện ${count} lần`} style={{ position: "absolute", top: 5, left: 5, fontSize: narrow ? 9 : 11, fontWeight: 800, color: "#bbf7d0", background: "rgba(34,197,94,.28)", borderRadius: 7, padding: narrow ? "1px 4px" : "1px 6px", lineHeight: 1.3 }}>×{count}</span>}
              {on && <CheckCircle size={narrow ? 11 : 13} color="#22c55e" style={{ position: "absolute", top: 5, right: 5 }} />}
            </div>
          );
        })}
      </div>
      {allDone && (
        <div style={{ marginTop: 14, padding: "12px 16px", borderRadius: 12, background: "linear-gradient(135deg,rgba(34,197,94,.18),rgba(14,165,233,.14))", border: "1px solid rgba(34,197,94,.4)", display: "flex", alignItems: "center", gap: 10 }}>
          <CheckCircle size={20} color="#22c55e" />
          <span style={{ fontWeight: 700, color: "#bbf7d0" }}>Hoàn thành! Tất cả các số 0–9 đã được xác thực.</span>
        </div>
      )}
    </div>
  );
}

// Bọt khí cố định (vị trí/tốc độ không đổi để tránh nhảy mỗi lần render).
const BUBBLES = [
  { left: "16%", size: 6, dur: 5, delay: 0 },
  { left: "34%", size: 4, dur: 6.5, delay: 1.3 },
  { left: "52%", size: 7, dur: 4.6, delay: 2.2 },
  { left: "70%", size: 5, dur: 7, delay: 0.7 },
  { left: "86%", size: 4, dur: 5.6, delay: 3.1 },
];

// Tia nước bắn ra khi vỡ đập — mỗi tia có gốc (x,y) và hướng (jx,jy).
const JETS = [
  { x: "30%", y: "2%", jx: "-34px", jy: "78px", size: 7, dur: 1.1, delay: 0 },
  { x: "50%", y: "0%", jx: "2px", jy: "96px", size: 8, dur: 1.0, delay: 0.18 },
  { x: "68%", y: "3%", jx: "34px", jy: "80px", size: 7, dur: 1.2, delay: 0.1 },
  { x: "16%", y: "42%", jx: "-46px", jy: "30px", size: 6, dur: 1.3, delay: 0.32 },
  { x: "82%", y: "46%", jx: "48px", jy: "26px", size: 6, dur: 1.15, delay: 0.14 },
  { x: "40%", y: "18%", jx: "-22px", jy: "86px", size: 6, dur: 1.05, delay: 0.4 },
  { x: "60%", y: "14%", jx: "28px", jy: "90px", size: 7, dur: 1.25, delay: 0.26 },
];

function DamVisual({ fillPct, level, broken }) {
  const waterTop = 100 - fillPct * 100;
  // Màu nước leo thang theo mức nguy hiểm: thấp -> xanh nhạt, bình thường -> xanh dương,
  // sắp tràn -> cam cảnh báo, vỡ đập -> đỏ. Càng gần mốc tràn màu càng nóng.
  const water = broken
    ? { from: "#ef4444", to: "#991b1b", crest: "#f87171", glow: "239,68,68" }
    : fillPct >= 0.85
    ? { from: "#f97316", to: "#c2410c", crest: "#fb923c", glow: "249,115,22" }
    : fillPct <= 0.25
    ? { from: "#7dd3fc", to: "#38bdf8", crest: "#bae6fd", glow: "125,211,252" }
    : { from: "#0ea5e9", to: "#0369a1", crest: "#22a7e0", glow: "14,165,233" };
  return (
    <div style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 16, padding: 18, position: "relative", overflow: "hidden" }}>
      <h3 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 700, color: "#bcdcf2" }}>Đập thủy điện BA TO</h3>
      <div style={{ position: "relative", height: 360, borderRadius: 12, overflow: "hidden", background: "linear-gradient(#1a3a52,#13293d)", border: `2px solid ${broken ? "rgba(239,68,68,.85)" : "rgba(255,255,255,.1)"}`, boxShadow: broken ? "0 0 30px rgba(239,68,68,.5)" : "none", animation: broken ? "shake .4s ease-in-out infinite" : "none" }}>
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, top: `${waterTop}%`, transition: "top 1s cubic-bezier(.4,0,.2,1), background 1s ease", background: `linear-gradient(180deg,${water.from},${water.to})`, overflow: "hidden", boxShadow: `0 0 40px rgba(${water.glow},.4)` }}>
          <div style={{ position: "absolute", top: -8, left: 0, width: "200%", height: 16, animation: "wave 4s linear infinite" }}>
            <svg width="100%" height="16" viewBox="0 0 1200 16" preserveAspectRatio="none">
              <path d="M0,8 Q150,0 300,8 T600,8 T900,8 T1200,8 V16 H0 Z" fill={water.crest} opacity="0.7" />
            </svg>
          </div>
          <div style={{ position: "absolute", top: -5, left: 0, width: "200%", height: 14, animation: "wave2 7s linear infinite" }}>
            <svg width="100%" height="14" viewBox="0 0 1200 14" preserveAspectRatio="none">
              <path d="M0,7 Q150,14 300,7 T600,7 T900,7 T1200,7 V14 H0 Z" fill={water.crest} opacity="0.35" />
            </svg>
          </div>
          {BUBBLES.map((b, i) => (
            <div key={i} style={{ position: "absolute", bottom: 0, left: b.left, width: b.size, height: b.size, borderRadius: "50%", background: "rgba(255,255,255,.55)", animation: `bubble ${b.dur}s ease-in ${b.delay}s infinite` }} />
          ))}
        </div>
        {[0, 100, 200, 300].map((mk) => (
          <div key={mk} style={{ position: "absolute", left: 0, right: 0, bottom: `${(mk / MAX_LEVEL) * 100}%`, borderTop: "1px dashed rgba(255,255,255,.18)", fontSize: 10, color: "#9cc2dd", paddingLeft: 6 }}>{mk}m</div>
        ))}
        <div style={{ position: "absolute", right: 10, top: `calc(${waterTop}% - 12px)`, transition: "top 1s cubic-bezier(.4,0,.2,1), background 1s ease", background: water.from, color: "#fff", fontWeight: 800, fontSize: 14, padding: "3px 10px", borderRadius: 8, boxShadow: "0 2px 10px rgba(0,0,0,.4)" }}><CountUp value={level} suffix=" m" /></div>
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 8, background: "linear-gradient(90deg,#3a5a72,#2a4358)" }} />
        <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 8, background: "linear-gradient(90deg,#2a4358,#3a5a72)" }} />
        {broken && (
          <>
            {/* nước cuộn tràn qua đỉnh */}
            <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: "100%", background: "linear-gradient(180deg,rgba(248,113,113,.6),rgba(248,113,113,0) 55%)", animation: "gush 1.1s ease-out infinite", pointerEvents: "none" }} />
            {/* vết nứt trên thân đập — vẽ dần ra */}
            <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }} viewBox="0 0 100 100" preserveAspectRatio="none">
              <polyline points="22,0 28,16 17,33 30,50 19,70 31,100" fill="none" stroke="rgba(255,255,255,.8)" strokeWidth="1" style={{ strokeDasharray: 220, animation: "crackDraw .55s ease-out both" }} />
              <polyline points="70,0 64,20 77,38 67,58 79,80 69,100" fill="none" stroke="rgba(255,255,255,.6)" strokeWidth="0.9" style={{ strokeDasharray: 220, animation: "crackDraw .65s ease-out .1s both" }} />
              <polyline points="46,8 52,30 42,52 54,78" fill="none" stroke="rgba(255,255,255,.55)" strokeWidth="0.8" style={{ strokeDasharray: 220, animation: "crackDraw .5s ease-out .2s both" }} />
            </svg>
            {/* tia nước bắn ra từ thân đập */}
            {JETS.map((j, i) => (
              <div key={i} style={{ position: "absolute", left: j.x, top: j.y, width: j.size, height: j.size, borderRadius: "50%", background: "rgba(255,255,255,.85)", boxShadow: "0 0 6px rgba(255,255,255,.6)", pointerEvents: "none", "--jx": j.jx, "--jy": j.jy, animation: `jet ${j.dur}s ease-out ${j.delay}s infinite` }} />
            ))}
            {/* cảnh báo */}
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
              <div style={{ background: "rgba(220,38,38,.94)", color: "#fff", fontWeight: 900, fontSize: 18, lineHeight: 1.3, padding: "12px 18px", borderRadius: 12, boxShadow: "0 6px 26px rgba(0,0,0,.55)", textAlign: "center", animation: "alertPulse 1s ease-in-out infinite" }}>💥 VỠ ĐẬP!<br /><span style={{ fontSize: 12, fontWeight: 700 }}>Mực nước {level}m vượt mốc tràn {MAX_LEVEL}m</span></div>
            </div>
          </>
        )}
      </div>
      <p style={{ margin: "10px 2px 0", fontSize: 11, color: broken ? "#fca5a5" : "#5d83a3", textAlign: "center" }}>{broken ? "⚠️ Đập đã vỡ — vượt mốc tràn!" : `Mốc tràn đập: ${MAX_LEVEL}m`}</p>
    </div>
  );
}

// Thanh mô phỏng mực nước — kéo lên để xem hiệu ứng vỡ đập (không đụng dữ liệu thật).
function SimControl({ level, simOn, broken, onSet }) {
  return (
    <div style={{ background: "rgba(255,255,255,.04)", border: `1px solid ${broken ? "rgba(239,68,68,.4)" : "rgba(255,255,255,.08)"}`, borderRadius: 14, padding: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#bcdcf2" }}>🧪 Mô phỏng mực nước</span>
        <span style={{ fontSize: 12, fontWeight: 800, color: broken ? "#f87171" : "#38bdf8" }}>{level} m{simOn ? "" : " (thật)"}</span>
      </div>
      <input type="range" min={0} max={500} step={1} value={level} onChange={(e) => onSet(Number(e.target.value))}
        style={{ width: "100%", accentColor: broken ? "#ef4444" : "#0ea5e9", cursor: "pointer" }} />
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button onClick={() => onSet(MAX_LEVEL + 40)} style={{ flex: 1, background: "linear-gradient(135deg,#ef4444,#b91c1c)", border: "none", borderRadius: 9, color: "#fff", padding: "8px 10px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>💥 Thử vỡ đập</button>
        <button onClick={() => onSet(null)} disabled={!simOn} style={{ flex: 1, background: simOn ? "rgba(255,255,255,.08)" : "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.12)", borderRadius: 9, color: simOn ? "#cfe6f7" : "#5d83a3", padding: "8px 10px", fontWeight: 700, fontSize: 13, cursor: simOn ? "pointer" : "default" }}>↺ Về thực tế</button>
      </div>
      <p style={{ margin: "8px 2px 0", fontSize: 11, color: "#5d83a3" }}>Kéo thanh hoặc bấm "Thử vỡ đập" để xem hiệu ứng khi vượt mốc tràn {MAX_LEVEL}m. Chỉ ảnh hưởng hình ảnh, không đổi dữ liệu.</p>
    </div>
  );
}

// Hiệu ứng #1 — khối xuất hiện dần (fade + trượt lên) theo độ trễ stagger.
function Reveal({ delay = 0, children }) {
  return <div style={{ animation: "fadeUp .55s cubic-bezier(.2,.7,.3,1) both", animationDelay: `${delay}ms` }}>{children}</div>;
}

// Hiệu ứng #2 — số chạy từ giá trị cũ tới giá trị mới (count-up).
function CountUp({ value, suffix = "", signed = false, duration = 900 }) {
  const [val, setVal] = useState(value);
  const fromRef = useRef(value);
  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) { setVal(to); return; }
    let raf, start = null;
    const step = (t) => {
      if (start === null) start = t;
      const p = Math.min((t - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(from + (to - from) * eased));
      if (p < 1) raf = requestAnimationFrame(step);
      else fromRef.current = to;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  const sign = signed && val >= 0 ? "+" : "";
  return <>{sign}{val}{suffix}</>;
}

// Hiệu ứng #5 — pháo giấy khi đủ 0–9.
const CONFETTI = Array.from({ length: 60 }, (_, i) => ({
  left: (i * 137.5) % 100,
  color: ["#0ea5e9", "#22c55e", "#fbbf24", "#a78bfa", "#f472b6", "#34d399"][i % 6],
  dur: 2.4 + ((i * 7) % 18) / 10,
  delay: ((i * 13) % 20) / 10,
  size: 6 + (i % 4) * 2,
}));
function Confetti() {
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", borderRadius: 16 }}>
      {CONFETTI.map((c, i) => (
        <div key={i} style={{ position: "absolute", top: 0, left: `${c.left}%`, width: c.size, height: c.size * 1.6, background: c.color, borderRadius: 2, animation: `confettiFall ${c.dur}s linear ${c.delay}s infinite` }} />
      ))}
    </div>
  );
}

function Stat({ icon, label, value, accent }) {
  return (
    <div className="lift" style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 14, padding: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, color: accent, marginBottom: 8 }}>
        {icon}
        <span style={{ fontSize: 11, color: "#7da8c9", fontWeight: 600 }}>{label}</span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: "#fff" }}>{value}</div>
    </div>
  );
}

const th = { padding: "6px 8px", fontWeight: 600, fontSize: 11 };
const td = { padding: "8px" };
const stTh = { padding: "4px 5px", fontWeight: 600, fontSize: 10, textAlign: "center" };
const stTd = { padding: "5px", textAlign: "center", color: "#9cc2dd" };
