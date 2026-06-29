// Lấy & chuẩn hoá dữ liệu World Cup 2026 từ openfootball (miễn phí, không cần API key, hỗ trợ CORS).
const WC_URL = "https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json";
const TZ = "America/Vancouver";

// openfootball dùng tên đội tiếng Anh — dịch sang tiếng Việt. Không có trong map thì giữ nguyên.
const TEAM_VI = {
  Mexico: "Mexico", "South Africa": "Nam Phi",
  "South Korea": "Hàn Quốc", "Korea Republic": "Hàn Quốc",
  "Czech Republic": "Czechia", Czechia: "Czechia",
  Canada: "Canada", "Bosnia & Herzegovina": "Bosnia & Herzegovina",
  Qatar: "Qatar", Switzerland: "Thụy Sĩ",
  Brazil: "Brazil", Morocco: "Maroc", Haiti: "Haiti", Scotland: "Scotland",
  USA: "Hoa Kỳ", "United States": "Hoa Kỳ", Paraguay: "Paraguay",
  Australia: "Úc", Turkey: "Thổ Nhĩ Kỳ", Türkiye: "Thổ Nhĩ Kỳ",
  Germany: "Đức", "Curaçao": "Curaçao",
  "Ivory Coast": "Bờ Biển Ngà", "Côte d'Ivoire": "Bờ Biển Ngà",
  Ecuador: "Ecuador", Netherlands: "Hà Lan", Japan: "Nhật Bản",
  Sweden: "Thụy Điển", Tunisia: "Tunisia", Belgium: "Bỉ", Egypt: "Ai Cập",
  Iran: "Iran", "IR Iran": "Iran", "New Zealand": "New Zealand",
  Spain: "Tây Ban Nha", "Cape Verde": "Cabo Verde", "Cabo Verde": "Cabo Verde",
  "Saudi Arabia": "Ả Rập Xê Út", Uruguay: "Uruguay",
  France: "Pháp", Senegal: "Senegal", Iraq: "Iraq", Norway: "Na Uy",
  Argentina: "Argentina", Algeria: "Algeria", Austria: "Áo", Jordan: "Jordan",
  Portugal: "Bồ Đào Nha", "DR Congo": "CHDC Congo", "Congo DR": "CHDC Congo",
  Uzbekistan: "Uzbekistan", Colombia: "Colombia",
  England: "Anh", Croatia: "Croatia", Ghana: "Ghana", Panama: "Panama",
  Italy: "Ý", Poland: "Ba Lan", Denmark: "Đan Mạch", Nigeria: "Nigeria",
  Cameroon: "Cameroon", Serbia: "Serbia", Wales: "Wales", Greece: "Hy Lạp",
};

const ROUND_VI = {
  "round of 32": "Vòng 32 đội",
  "round of 16": "Vòng 16 đội",
  "quarter-finals": "Tứ kết",
  "quarter-final": "Tứ kết",
  quarterfinals: "Tứ kết",
  "semi-finals": "Bán kết",
  "semi-final": "Bán kết",
  semifinals: "Bán kết",
  "match for third place": "Tranh hạng ba",
  "third place play-off": "Tranh hạng ba",
  final: "Chung kết",
};

const team = (name) => (name && TEAM_VI[name]) || name || "";

// Cờ quốc gia (emoji) theo tên tiếng Việt đang hiển thị. Không có trong map -> "".
const FLAGS = {
  "Mexico": "🇲🇽", "Nam Phi": "🇿🇦", "Hàn Quốc": "🇰🇷", "Czechia": "🇨🇿",
  "Canada": "🇨🇦", "Bosnia & Herzegovina": "🇧🇦", "Qatar": "🇶🇦", "Thụy Sĩ": "🇨🇭",
  "Brazil": "🇧🇷", "Maroc": "🇲🇦", "Haiti": "🇭🇹", "Scotland": "🏴󠁧󠁢󠁳󠁣󠁴󠁿",
  "Hoa Kỳ": "🇺🇸", "Paraguay": "🇵🇾", "Úc": "🇦🇺", "Thổ Nhĩ Kỳ": "🇹🇷",
  "Đức": "🇩🇪", "Curaçao": "🇨🇼", "Bờ Biển Ngà": "🇨🇮", "Ecuador": "🇪🇨",
  "Hà Lan": "🇳🇱", "Nhật Bản": "🇯🇵", "Thụy Điển": "🇸🇪", "Tunisia": "🇹🇳",
  "Bỉ": "🇧🇪", "Ai Cập": "🇪🇬", "Iran": "🇮🇷", "New Zealand": "🇳🇿",
  "Tây Ban Nha": "🇪🇸", "Cabo Verde": "🇨🇻", "Ả Rập Xê Út": "🇸🇦", "Uruguay": "🇺🇾",
  "Pháp": "🇫🇷", "Senegal": "🇸🇳", "Iraq": "🇮🇶", "Na Uy": "🇳🇴",
  "Argentina": "🇦🇷", "Algeria": "🇩🇿", "Áo": "🇦🇹", "Jordan": "🇯🇴",
  "Bồ Đào Nha": "🇵🇹", "CHDC Congo": "🇨🇩", "Uzbekistan": "🇺🇿", "Colombia": "🇨🇴",
  "Anh": "🏴󠁧󠁢󠁥󠁮󠁧󠁿", "Croatia": "🇭🇷", "Ghana": "🇬🇭", "Panama": "🇵🇦",
  "Ý": "🇮🇹", "Ba Lan": "🇵🇱", "Đan Mạch": "🇩🇰", "Nigeria": "🇳🇬",
  "Cameroon": "🇨🇲", "Serbia": "🇷🇸", "Wales": "🏴󠁧󠁢󠁷󠁬󠁳󠁿", "Hy Lạp": "🇬🇷",
};

export const flag = (name) => FLAGS[name] || "";

function vanDate(d) {
  return d.toLocaleDateString("en-CA", { timeZone: TZ }); // YYYY-MM-DD theo giờ Vancouver
}

function parseMinute(m) {
  if (m == null) return null;
  const n = parseInt(String(m), 10);
  return Number.isFinite(n) ? n : null;
}

// "13:00 UTC-6" + "2026-06-11" -> "2026-06-11T13:00:00-06:00". Không rõ múi giờ -> "".
function toIso(date, time) {
  if (!date || !time) return "";
  const m = String(time).match(/(\d{1,2}):(\d{2})\s*UTC\s*([+-]\d{1,2})/i);
  if (!m) return "";
  const hh = m[1].padStart(2, "0");
  const off = parseInt(m[3], 10);
  const sign = off < 0 ? "-" : "+";
  const oh = String(Math.abs(off)).padStart(2, "0");
  return `${date}T${hh}:${m[2]}:00${sign}${oh}:00`;
}

// World Cup 2026 có 16 sân cố định ở 3 nước. openfootball chỉ cung cấp tên thành phố
// trong trường "ground" — tra cứu sang tên sân + quốc gia bằng bảng tĩnh này.
const VENUES = {
  "Atlanta": { stadium: "Mercedes-Benz Stadium", country: "Hoa Kỳ" },
  "Boston (Foxborough)": { stadium: "Gillette Stadium", country: "Hoa Kỳ" },
  "Dallas (Arlington)": { stadium: "AT&T Stadium", country: "Hoa Kỳ" },
  "Houston": { stadium: "NRG Stadium", country: "Hoa Kỳ" },
  "Kansas City": { stadium: "Arrowhead Stadium", country: "Hoa Kỳ" },
  "Los Angeles (Inglewood)": { stadium: "SoFi Stadium", country: "Hoa Kỳ" },
  "Miami (Miami Gardens)": { stadium: "Hard Rock Stadium", country: "Hoa Kỳ" },
  "New York/New Jersey (East Rutherford)": { stadium: "MetLife Stadium", country: "Hoa Kỳ" },
  "Philadelphia": { stadium: "Lincoln Financial Field", country: "Hoa Kỳ" },
  "San Francisco Bay Area (Santa Clara)": { stadium: "Levi's Stadium", country: "Hoa Kỳ" },
  "Seattle": { stadium: "Lumen Field", country: "Hoa Kỳ" },
  "Toronto": { stadium: "BMO Field", country: "Canada" },
  "Vancouver": { stadium: "BC Place", country: "Canada" },
  "Mexico City": { stadium: "Estadio Azteca", country: "Mexico" },
  "Guadalajara (Zapopan)": { stadium: "Estadio Akron", country: "Mexico" },
  "Monterrey (Guadalupe)": { stadium: "Estadio BBVA", country: "Mexico" },
};

function parseGround(g) {
  if (!g) return { stadium: "", city: "", country: "" };
  const raw = String(g).trim();
  const v = VENUES[raw] || {};
  const city = raw.replace(/\s*\([^)]*\)/g, "").trim(); // bỏ phần trong ngoặc, vd "Miami (Miami Gardens)" -> "Miami"
  return { stadium: v.stadium || "", city, country: v.country || "" };
}

function groupLetter(g) {
  if (!g) return "";
  const m = String(g).match(/Group\s+([A-L])/i);
  return m ? m[1].toUpperCase() : String(g).trim();
}

function knockoutLabel(round) {
  if (!round) return "";
  return ROUND_VI[String(round).trim().toLowerCase()] || String(round).trim();
}

function mapScorers(goals1, goals2) {
  const s = [];
  (Array.isArray(goals1) ? goals1 : []).forEach((g) => g && g.name && s.push({ team: "home", player: g.name, minute: parseMinute(g.minute) }));
  (Array.isArray(goals2) ? goals2 : []).forEach((g) => g && g.name && s.push({ team: "away", player: g.name, minute: parseMinute(g.minute) }));
  return s.sort((a, b) => (a.minute || 0) - (b.minute || 0));
}

function fullTime(score) {
  if (!score) return null;
  if (Array.isArray(score.et) && score.et.length === 2) return score.et; // tới hết hiệp phụ, bỏ luân lưu
  if (Array.isArray(score.ft) && score.ft.length === 2) return score.ft;
  return null;
}

export async function fetchWorldCup() {
  const res = await fetch(WC_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const all = Array.isArray(json.matches) ? json.matches : [];

  const sortKey = (m) => `${m.date || "9999"} ${m.time || "99:99"}`;
  const sorted = [...all].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));

  const played = [];
  const upcoming = [];
  const knockout = [];
  sorted.forEach((m) => {
    const ft = fullTime(m.score);
    // Luân lưu (nếu có) — chỉ để hiển thị & xác định đội đi tiếp, KHÔNG tính vào tổng bàn thắng/mực nước.
    const pens = m.score && Array.isArray(m.score.p) && m.score.p.length === 2 ? m.score.p : null;
    const isGroup = !!m.group;
    const base = {
      home: team(m.team1),
      away: team(m.team2),
      group: isGroup ? groupLetter(m.group) : knockoutLabel(m.round),
      stage: isGroup ? "group" : "knockout",
      kickoff_iso: toIso(m.date, m.time),
      kickoff_text: m.time || "",
      ...parseGround(m.ground),
    };
    if (ft) played.push({ ...base, a: ft[0], b: ft[1], pens, scorers: mapScorers(m.goals1, m.goals2) });
    else upcoming.push({ ...base, _date: m.date });
    // Gom toàn bộ trận knock-out (đã đá + sắp tới) để dựng sơ đồ cây đấu loại.
    if (!isGroup) {
      knockout.push({
        num: m.num,
        round: base.group,
        home: base.home,
        away: base.away,
        kickoff_iso: base.kickoff_iso,
        a: ft ? ft[0] : null,
        b: ft ? ft[1] : null,
        pens,
        played: !!ft,
      });
    }
  });

  const matches = played.map((m, i) => ({
    id: i + 1,
    label: `${m.home} vs ${m.away}`,
    home: m.home,
    away: m.away,
    a: m.a,
    b: m.b,
    pens: m.pens,
    group: m.group,
    stage: m.stage,
    kickoff_iso: m.kickoff_iso,
    stadium: m.stadium,
    city: m.city,
    country: m.country,
    motm: "", // openfootball không cung cấp Man of the Match
    scorers: m.scorers,
  }));

  const today = vanDate(new Date());
  const tmrw = vanDate(new Date(Date.now() + 86400000));
  const fixtures = upcoming
    .filter((f) => f._date === today || f._date === tmrw)
    .map((f, i) => ({
      id: i + 1,
      home: f.home,
      away: f.away,
      group: f.group,
      stage: f.stage,
      kickoff_iso: f.kickoff_iso,
      kickoff_text: f.kickoff_text,
      stadium: f.stadium,
      city: f.city,
      country: f.country,
    }));

  return { matches, fixtures, knockout };
}

// Thứ tự các vòng knock-out để xếp cột trong sơ đồ cây.
export const ROUND_ORDER = ["Vòng 32 đội", "Vòng 16 đội", "Tứ kết", "Bán kết", "Tranh hạng ba", "Chung kết"];
