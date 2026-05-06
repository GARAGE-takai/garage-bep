import { useState, useCallback, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_KEY
);

const MAX_DAYS = 14;

const TIME_OPTIONS = [];
for (let h = 0; h < 24; h++) {
  for (let m = 0; m < 60; m += 30) {
    TIME_OPTIONS.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  }
}

const fmt = (n) => Math.round(n).toLocaleString("ja-JP") + " 円";
const fmtShort = (n) => {
  const abs = Math.abs(Math.round(n));
  if (abs >= 10000) return (Math.round(n / 1000) / 10).toFixed(1) + "万円";
  return Math.round(n).toLocaleString("ja-JP") + "円";
};
const timeToMin = (t) => {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
const durHours = (start, end) => {
  const s = timeToMin(start), e = timeToMin(end);
  return (s !== null && e !== null && e > s) ? (e - s) / 60 : 0;
};

// 開始日から同月のmin値（YYYY-MM-01）と、終了日の自動補完を返す
const sameMonthMin = (dateStart) => {
  if (!dateStart) return "";
  const [y, m] = dateStart.split("-");
  return `${y}-${m}-01`;
};
const autoEndDate = (dateStart, dateEnd) => {
  if (!dateStart) return dateEnd;
  if (!dateEnd) return dateStart;
  const [sy, sm] = dateStart.split("-");
  const [ey, em] = dateEnd.split("-");
  if (sy !== ey || sm !== em) return dateStart;
  return dateEnd;
};

// イベント用集計
const calcEventTotals = (d, visibleDays) => {
  let actualSales = 0;
  for (let i = 1; i <= MAX_DAYS; i++) actualSales += (d[`sales_d${i}`] || 0);
  const boothCost = d.booth_type === "rate" ? (actualSales * (d.booth_rate || 0) / 100) : (d.booth || 0);
  const shipping = (d.ship_out || 0) + (d.ship_in || 0) + (d.ship_other || 0);
  const fixedCost = boothCost + (d.transport || 0) + (d.hotel || 0) + shipping + (d.rental || 0) + (d.ad || 0) + (d.other || 0);
  let totalDurH = 0;
  const days = visibleDays || MAX_DAYS;
  for (let i = 1; i <= days; i++) {
    totalDurH += durHours(d[`time_start_d${i}`] || d.time_start, d[`time_end_d${i}`] || d.time_end);
  }
  const laborCost = totalDurH * (d.hourly_rate || 3000);
  const cogsCost = actualSales > 0 ? actualSales * ((d.cogs_rate || 30) / 100) : 0;
  const totalCost = fixedCost + laborCost + cogsCost;
  const pl = actualSales > 0 ? actualSales - totalCost : null;
  const grossPl = actualSales > 0 ? actualSales - (totalCost - laborCost) : null;
  const recPct = totalCost > 0 && actualSales > 0 ? Math.round(actualSales / totalCost * 100) : 0;
  const tPct = (d.target_sales || 0) > 0 && actualSales > 0 ? Math.round(actualSales / d.target_sales * 100) : 0;
  return { totalCost, actualSales, pl, grossPl, recPct, tPct, boothCost, laborCost, totalDurH };
};

// web用集計（BASE:6時間、Pinkoi:2時間、時給3000円固定）
const calcWebTotals = (d) => {
  const sales = d.sales || 0;
  const feeCost = sales * ((d.platform_fee_rate || 7) / 100);
  const cogsCost = sales > 0 ? sales * ((d.cogs_rate || 30) / 100) : 0;
  const laborHours = d.platform === "Pinkoi" ? 2 : 6;
  const laborCost = laborHours * 3000;
  const fixedCost = (d.ship_out || 0) + (d.ad || 0) + feeCost;
  const totalCost = fixedCost + laborCost + cogsCost;
  const pl = sales > 0 ? sales - totalCost : null;
  const grossPl = sales > 0 ? sales - (totalCost - laborCost) : null;
  const recPct = totalCost > 0 && sales > 0 ? Math.round(sales / totalCost * 100) : 0;
  return { totalCost, actualSales: sales, pl, grossPl, recPct, feeCost, laborCost, laborHours, cogsCost, fixedCost };
};

// 委託用集計（人件費固定12時間×3000円=36,000円）
const calcConsignmentTotals = (d) => {
  const sales = d.sales || 0;
  const commissionCost = sales * ((d.consignment_rate || 30) / 100);
  const cogsCost = sales > 0 ? sales * ((d.cogs_rate || 30) / 100) : 0;
  const laborCost = 12 * 3000;
  const shipping = (d.ship_out || 0) + (d.ship_in || 0);
  const fixedCost = shipping + (d.ad || 0) + commissionCost;
  const totalCost = fixedCost + laborCost + cogsCost;
  const pl = sales > 0 ? sales - totalCost : null;
  const grossPl = sales > 0 ? sales - (totalCost - laborCost) : null;
  const recPct = totalCost > 0 && sales > 0 ? Math.round(sales / totalCost * 100) : 0;
  return { totalCost, actualSales: sales, pl, grossPl, recPct, commissionCost, laborCost, cogsCost, fixedCost };
};

function TimeSelect({ value, onChange }) {
  return (
    <select value={value || ""} onChange={e => onChange(e.target.value)}
      style={{ fontSize: 13, padding: "4px 6px", borderRadius: 6, border: "0.5px solid var(--c-border)", background: "var(--c-surface)", color: "var(--c-text)", cursor: "pointer" }}>
      {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
    </select>
  );
}

function Bar({ pct, success }) {
  const fill = Math.min(pct, 100);
  return (
    <div style={{ background: "var(--c-border)", borderRadius: 4, height: 5, overflow: "hidden", marginTop: 6 }}>
      <div style={{ height: "100%", borderRadius: 4, width: fill + "%", background: success ? "var(--c-success)" : "var(--c-accent)", transition: "width 0.4s ease" }} />
    </div>
  );
}

function MetricCard({ label, value, accent, children }) {
  return (
    <div style={{ background: "var(--c-surface)", borderRadius: 10, padding: "14px 16px" }}>
      <p style={{ fontSize: 11, color: "var(--c-muted)", marginBottom: 4 }}>{label}</p>
      <p style={{ fontSize: 20, fontWeight: 500, color: accent ? "var(--c-accent)" : "var(--c-text)" }}>{value}</p>
      {children}
    </div>
  );
}

function Row({ label, value, onChange, unit = "円", readOnly = false, note }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 14, color: "var(--c-text)" }}>{label}{note && <span style={{ fontSize: 11, color: "var(--c-muted)", marginLeft: 6 }}>{note}</span>}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <input type="number" value={value} min={0} step={unit === "日" ? 0.5 : 100} onChange={onChange} readOnly={readOnly}
            style={{ width: 110, textAlign: "right", background: readOnly ? "transparent" : undefined, border: readOnly ? "none" : undefined, color: readOnly ? "var(--c-muted)" : undefined, pointerEvents: readOnly ? "none" : undefined }} />
          <span style={{ fontSize: 13, color: "var(--c-muted)" }}>{unit}</span>
        </div>
      </div>
    </div>
  );
}

function Section({ title }) {
  return <p style={{ fontSize: 14, fontWeight: 500, color: "var(--c-text)", marginBottom: 14, marginTop: 4 }}>{title}</p>;
}
function Divider() {
  return <hr style={{ border: "none", borderTop: "0.5px solid var(--c-border)", margin: "1rem 0" }} />;
}
function Card({ children }) {
  return <div style={{ background: "var(--c-card)", border: "0.5px solid var(--c-border)", borderRadius: 12, padding: "1.25rem", marginBottom: "1rem" }}>{children}</div>;
}
function SectionLabel({ children }) {
  return <p style={{ fontSize: 12, color: "var(--c-muted)", letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 12 }}>{children}</p>;
}

const TYPE_LABEL = { event: "対面", web: "WEB", consignment: "委託" };
const TYPE_COLOR = {
  event:       { bg: "rgba(210,130,30,0.15)",  color: "#c47d10" },  // アンバー：対面
  web:         { bg: "rgba(60,130,210,0.15)",  color: "#3a7fd4" },  // ブルー：WEB
  consignment: { bg: "rgba(60,180,120,0.15)",  color: "#2a9e68" },  // グリーン：委託
};
function TypeBadge({ type }) {
  const s = TYPE_COLOR[type] || TYPE_COLOR.event;
  return (
    <span style={{ fontSize: 10, fontWeight: 500, padding: "2px 8px", borderRadius: 20, background: s.bg, color: s.color }}>
      {TYPE_LABEL[type] || type}
    </span>
  );
}

function ListCard({ ev, type, onSelect }) {
  let totals;
  if (type === "web") totals = calcWebTotals(ev);
  else if (type === "consignment") totals = calcConsignmentTotals(ev);
  else totals = calcEventTotals(ev, ev.visible_days || 2);
  const { totalCost, actualSales, pl, grossPl, recPct, tPct } = totals;

  return (
    <div onClick={() => onSelect(ev, type)} style={{ background: "var(--c-card)", border: "0.5px solid var(--c-border)", borderRadius: 12, padding: "1rem 1.25rem", cursor: "pointer" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <TypeBadge type={type} />
            <p style={{ fontSize: 15, fontWeight: 500, color: "var(--c-text)" }}>{ev.name || "無題"}</p>
          </div>
          <p style={{ fontSize: 12, color: "var(--c-muted)" }}>
            {type === "event" ? (ev.location || "―") + "　" : ""}
            {ev.date_start || "―"}{ev.date_end && ev.date_end !== ev.date_start ? " 〜 " + ev.date_end : ""}
          </p>
        </div>
        {pl !== null && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 10, color: "var(--c-muted)" }}>粗利</span>
              <span style={{ fontSize: 12, fontWeight: 500, padding: "2px 8px", borderRadius: 20, background: grossPl >= 0 ? "rgba(52,199,89,0.12)" : "rgba(255,59,48,0.12)", color: grossPl >= 0 ? "var(--c-success)" : "var(--c-danger)" }}>
                {grossPl >= 0 ? "+" : ""}{fmtShort(grossPl)}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 10, color: "var(--c-muted)" }}>最終</span>
              <span style={{ fontSize: 12, fontWeight: 500, padding: "2px 8px", borderRadius: 20, background: pl >= 0 ? "rgba(52,199,89,0.12)" : "rgba(255,59,48,0.12)", color: pl >= 0 ? "var(--c-success)" : "var(--c-danger)" }}>
                {pl >= 0 ? "+" : ""}{fmtShort(pl)}
              </span>
            </div>
          </div>
        )}
      </div>
      <div style={{ background: "var(--c-surface)", borderRadius: 8, padding: "10px 12px", marginBottom: 8 }}>
        <p style={{ fontSize: 10, color: "var(--c-muted)", marginBottom: 2 }}>売上合計</p>
        <p style={{ fontSize: 20, fontWeight: 600, color: "var(--c-text)" }}>{actualSales > 0 ? actualSales.toLocaleString("ja-JP") + " 円" : "― 円"}</p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: actualSales > 0 ? 10 : 0 }}>
        {[
          ["目標金額", type === "event" && ev.target_sales > 0 ? fmtShort(ev.target_sales) : "―"],
          ["目標達成率", type === "event" && ev.target_sales > 0 && actualSales > 0 ? (tPct || 0) + "%" : "―"],
          ["総コスト", fmtShort(totalCost)],
          ["コスト回収進捗", actualSales > 0 ? recPct + "%" : "―"],
        ].map(([l, v]) => (
          <div key={l} style={{ background: "var(--c-surface)", borderRadius: 8, padding: "8px 10px" }}>
            <p style={{ fontSize: 10, color: "var(--c-muted)", marginBottom: 2 }}>{l}</p>
            <p style={{ fontSize: 13, fontWeight: 500 }}>{v}</p>
          </div>
        ))}
      </div>
      {actualSales > 0 && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--c-muted)", marginBottom: 2 }}><span>コスト回収進捗</span><span>{recPct}%</span></div>
          <Bar pct={recPct} success={recPct >= 100} />
          {type === "event" && ev.target_sales > 0 && (<>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--c-muted)", marginBottom: 2, marginTop: 6 }}><span>目標達成率</span><span>{tPct}%</span></div>
            <Bar pct={tPct} success={tPct >= 100} />
          </>)}
        </div>
      )}
    </div>
  );
}

function EventList({ onSelect }) {
  const [events, setEvents] = useState([]);
  const [webSales, setWebSales] = useState([]);
  const [consignments, setConsignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState("card");
  const [listTab, setListTab] = useState("all"); // all / event / web / consignment

  useEffect(() => {
    const load = async () => {
      const [{ data: ev }, { data: ws }, { data: co }] = await Promise.all([
        supabase.from("events").select("*").order("date_start", { ascending: false }),
        supabase.from("web_sales").select("*").order("date_start", { ascending: false }),
        supabase.from("consignments").select("*").order("date_start", { ascending: false }),
      ]);
      setEvents(ev || []);
      setWebSales(ws || []);
      setConsignments(co || []);
      setLoading(false);
    };
    load();
  }, []);

  if (loading) return <p style={{ color: "var(--c-muted)", fontSize: 14, padding: "2rem 0", textAlign: "center" }}>読み込み中...</p>;

  const allItems = [
    ...(events || []).map(ev => ({ ...ev, _type: "event", _date: ev.date_start })),
    ...(webSales || []).map(ev => ({ ...ev, _type: "web", _date: ev.date_start })),
    ...(consignments || []).map(ev => ({ ...ev, _type: "consignment", _date: ev.date_start })),
  ].sort((a, b) => (b._date || "").localeCompare(a._date || ""));

  const filtered = listTab === "all" ? allItems
    : allItems.filter(ev => ev._type === listTab);

  if (allItems.length === 0) return (
    <p style={{ color: "var(--c-muted)", fontSize: 14, padding: "2rem 0", textAlign: "center" }}>保存済みのデータがありません</p>
  );

  const grouped = [];
  const seenKeys = {};
  for (const ev of filtered) {
    const d = ev._date ? new Date(ev._date) : null;
    const key = d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` : "unknown";
    const label = d ? `${d.getFullYear()}年${d.getMonth() + 1}月` : "日付なし";
    if (!seenKeys[key]) { seenKeys[key] = true; grouped.push({ key, label, items: [] }); }
    grouped[grouped.length - 1].items.push(ev);
  }

  return (
    <div>
      {/* ジャンルタブ */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
        {[["all", "総合"], ["event", "対面"], ["web", "WEB"], ["consignment", "委託"]].map(([key, label]) => (
          <button key={key} onClick={() => setListTab(key)} style={{ fontSize: 12, padding: "5px 14px", borderRadius: 8, border: "none", cursor: "pointer", background: listTab === key ? "var(--c-accent)" : "var(--c-surface)", color: listTab === key ? "#fff" : "var(--c-muted)", fontWeight: listTab === key ? 500 : 400 }}>
            {label}
          </button>
        ))}
        <div style={{ marginLeft: "auto", display: "flex", background: "var(--c-surface)", borderRadius: 8, padding: 3, gap: 2 }}>
          {["card", "list"].map(mode => (
            <button key={mode} onClick={() => setViewMode(mode)} style={{ fontSize: 12, padding: "4px 12px", borderRadius: 6, border: "none", cursor: "pointer", background: viewMode === mode ? "var(--c-card)" : "transparent", color: viewMode === mode ? "var(--c-text)" : "var(--c-muted)", fontWeight: viewMode === mode ? 500 : 400 }}>
              {mode === "card" ? "カード" : "リスト"}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 && (
        <p style={{ color: "var(--c-muted)", fontSize: 14, padding: "2rem 0", textAlign: "center" }}>このジャンルのデータがありません</p>
      )}

      {grouped.map(({ key, label, items }) => (
        <div key={key} style={{ marginBottom: 28 }}>
          <p style={{ fontSize: 11, color: "var(--c-muted)", letterSpacing: "0.06em", marginBottom: 10, paddingBottom: 6, borderBottom: "0.5px solid var(--c-border)" }}>{label}</p>
          {viewMode === "card" ? (
            <div style={{ display: "grid", gap: 12 }}>
              {items.map(ev => <ListCard key={`${ev._type}-${ev.id}`} ev={ev} type={ev._type} onSelect={onSelect} />)}
            </div>
          ) : (
            <div style={{ background: "var(--c-card)", border: "0.5px solid var(--c-border)", borderRadius: 12, overflow: "hidden" }}>
              {items.map((ev, i) => {
                let totals;
                if (ev._type === "web") totals = calcWebTotals(ev);
                else if (ev._type === "consignment") totals = calcConsignmentTotals(ev);
                else totals = calcEventTotals(ev, ev.visible_days || 2);
                const { totalCost, actualSales, pl, grossPl, recPct } = totals;
                return (
                  <div key={`${ev._type}-${ev.id}`} onClick={() => onSelect(ev, ev._type)} style={{ display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 12, padding: "12px 16px", cursor: "pointer", borderTop: i > 0 ? "0.5px solid var(--c-border)" : "none" }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                        {listTab === "all" && <TypeBadge type={ev._type} />}
                        <p style={{ fontSize: 14, fontWeight: 500, color: "var(--c-text)" }}>{ev.name || "無題"}</p>
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", fontSize: 12, color: "var(--c-muted)" }}>
                        <span>{ev.date_start || "―"}</span>
                        {ev._type === "event" && <span>{ev.location || "―"}</span>}
                        <span>コスト {fmtShort(totalCost)}</span>
                        {actualSales > 0 && <span>売上 {fmtShort(actualSales)}</span>}
                        {actualSales > 0 && <span>回収 {recPct}%</span>}
                      </div>
                    </div>
                    {pl !== null && (
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <span style={{ fontSize: 10, color: "var(--c-muted)" }}>粗利</span>
                          <span style={{ fontSize: 12, fontWeight: 500, padding: "2px 8px", borderRadius: 20, whiteSpace: "nowrap", background: grossPl >= 0 ? "rgba(52,199,89,0.12)" : "rgba(255,59,48,0.12)", color: grossPl >= 0 ? "var(--c-success)" : "var(--c-danger)" }}>
                            {grossPl >= 0 ? "+" : ""}{fmtShort(grossPl)}
                          </span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <span style={{ fontSize: 10, color: "var(--c-muted)" }}>最終</span>
                          <span style={{ fontSize: 12, fontWeight: 500, padding: "2px 8px", borderRadius: 20, whiteSpace: "nowrap", background: pl >= 0 ? "rgba(52,199,89,0.12)" : "rgba(255,59,48,0.12)", color: pl >= 0 ? "var(--c-success)" : "var(--c-danger)" }}>
                            {pl >= 0 ? "+" : ""}{fmtShort(pl)}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// --- WEB入力フォーム ---
function WebForm({ initData, onNew }) {
  const [recordId, setRecordId] = useState(initData?.id || null);
  const [saveStatus, setSaveStatus] = useState("idle");
  const [name, setName] = useState(initData?.name || "");
  const [platform, setPlatform] = useState(initData?.platform || "BASE");
  const [platformFeeRate, setPlatformFeeRate] = useState(initData?.platform_fee_rate ?? 7);
  const [dateStart, setDateStart] = useState(initData?.date_start || "");
  const [dateEnd, setDateEnd] = useState(initData?.date_end || "");
  const [sales, setSales] = useState(initData?.sales || 0);
  const [shipOut, setShipOut] = useState(initData?.ship_out || 0);
  const [ad, setAd] = useState(initData?.ad || 0);
  const [cogsRate, setCogsRate] = useState(initData?.cogs_rate ?? 30);
  const [avgPrice, setAvgPrice] = useState(initData?.avg_price || 0);
  const [memo, setMemo] = useState(initData?.memo || "");
  const [isDirty, setIsDirty] = useState(false);

  // 未保存変更の検知（beforeunload）
  useEffect(() => {
    const handler = (e) => { if (isDirty) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const handlePlatformChange = (p) => {
    setPlatform(p);
    if (!initData) setPlatformFeeRate(p === "BASE" ? 7 : 13);
  };

  const { totalCost, actualSales, pl, grossPl, recPct, feeCost, laborCost, laborHours, cogsCost } = calcWebTotals({
    sales, platform, platform_fee_rate: platformFeeRate, ship_out: shipOut, ad, cogs_rate: cogsRate,
  });
  const bepCount = avgPrice > 0 ? Math.ceil(totalCost / avgPrice) : 0;

  const handleSave = async () => {
    setSaveStatus("saving");
    const payload = { name, platform, platform_fee_rate: platformFeeRate, date_start: dateStart, date_end: dateEnd, sales, ship_out: shipOut, ad, cogs_rate: cogsRate, avg_price: avgPrice, memo };
    let error;
    if (recordId) {
      ({ error } = await supabase.from("web_sales").update(payload).eq("id", recordId));
    } else {
      const { data, error: e } = await supabase.from("web_sales").insert(payload).select().single();
      error = e;
      if (!error && data) setRecordId(data.id);
    }
    if (error) { setSaveStatus("error"); setTimeout(() => setSaveStatus("idle"), 3000); }
    else { setSaveStatus("saved"); setIsDirty(false); setTimeout(() => setSaveStatus("idle"), 2000); }
  };

  const saveLabel = saveStatus === "saving" ? "保存中..." : saveStatus === "saved" ? "✓ 保存済" : saveStatus === "error" ? "エラー" : "保存";
  const saveColor = saveStatus === "saved" ? "var(--c-success)" : saveStatus === "error" ? "var(--c-danger)" : "var(--c-accent)";

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 12, color: "var(--c-muted)", alignSelf: "center" }}>{recordId ? "ID: " + recordId : "新規"}</span>
        <button onClick={onNew} style={{ fontSize: 13, padding: "6px 14px", borderRadius: 8, background: "var(--c-surface)", border: "0.5px solid var(--c-border)", color: "var(--c-text)", cursor: "pointer" }}>新規</button>
        <button onClick={handleSave} disabled={saveStatus === "saving"} style={{ fontSize: 13, padding: "6px 14px", borderRadius: 8, background: saveColor, border: "none", color: "#fff", cursor: "pointer", fontWeight: 500 }}>{saveLabel}</button>
      </div>

      <SectionLabel>販売情報</SectionLabel>
      <Card>
        <div style={{ marginBottom: 10, display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14, color: "var(--c-text)" }}>販売名</span>
          <input type="text" value={name} onChange={e => setName(e.target.value)} style={{ width: 210, textAlign: "left" }} />
        </div>
        <div style={{ marginBottom: 10, display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14, color: "var(--c-text)" }}>プラットフォーム</span>
          <div style={{ display: "flex", background: "var(--c-surface)", borderRadius: 8, padding: 3, gap: 2 }}>
            {["BASE", "Pinkoi"].map(p => (
              <button key={p} onClick={() => handlePlatformChange(p)} style={{ fontSize: 12, padding: "3px 12px", borderRadius: 6, border: "none", cursor: "pointer", background: platform === p ? "var(--c-card)" : "transparent", color: platform === p ? "var(--c-text)" : "var(--c-muted)", fontWeight: platform === p ? 500 : 400 }}>{p}</button>
            ))}
          </div>
        </div>
        <div style={{ marginBottom: 10, display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14, color: "var(--c-text)" }}>販売期間</span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input type="date" value={dateStart} onChange={e => { setDateStart(e.target.value); setDateEnd(autoEndDate(e.target.value, dateEnd)); setEventDirty(true); }} style={{ width: 145 }} />
            <span style={{ fontSize: 13, color: "var(--c-muted)" }}>〜</span>
            <input type="date" value={dateEnd} min={sameMonthMin(dateStart)} onChange={e => setDateEnd(e.target.value)} style={{ width: 145 }} />
          </div>
        </div>
        <Divider />
        <div style={{ background: "var(--c-surface)", borderRadius: 10, padding: "14px 16px", marginBottom: 10 }}>
          <p style={{ fontSize: 11, color: "var(--c-muted)", marginBottom: 4 }}>売上合計</p>
          <p style={{ fontSize: 28, fontWeight: 600, color: "var(--c-text)" }}>{actualSales > 0 ? actualSales.toLocaleString("ja-JP") + " 円" : "― 円"}</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <MetricCard label="総コスト" value={fmt(totalCost)} />
          <MetricCard label="目安の販売点数" value={bepCount + " 点"} accent />
          <MetricCard label="粗利（人件費除く）" value={grossPl !== null ? (grossPl >= 0 ? "+" : "") + fmt(grossPl) : "― 円"}>
            {grossPl !== null && <p style={{ fontSize: 12, color: grossPl >= 0 ? "var(--c-success)" : "var(--c-danger)", marginTop: 2 }}>{grossPl >= 0 ? "黒字" : "赤字"}</p>}
          </MetricCard>
          <MetricCard label="最終利益（人件費込）" value={pl !== null ? (pl >= 0 ? "+" : "") + fmt(pl) : "― 円"}>
            {pl !== null && <p style={{ fontSize: 12, color: pl >= 0 ? "var(--c-success)" : "var(--c-danger)", marginTop: 2 }}>{pl >= 0 ? "黒字" : "赤字"}</p>}
          </MetricCard>
          <div style={{ gridColumn: "1 / -1", background: "var(--c-surface)", borderRadius: 10, padding: "14px 16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--c-muted)", marginBottom: 2 }}><span>コスト回収進捗</span><span>{actualSales > 0 ? recPct + "%" : "―"}</span></div>
            <Bar pct={recPct} success={recPct >= 100} />
            {actualSales > 0 && <p style={{ fontSize: 11, color: "var(--c-muted)", marginTop: 6 }}>{recPct >= 100 ? "損益分岐点を超えています" : "あと " + fmt(totalCost - actualSales) + " で回収"}</p>}
          </div>
        </div>
      </Card>

      <SectionLabel>売上・コスト入力</SectionLabel>
      <Card>
        <Row label="売上合計" value={sales} onChange={e => { setSales(Number(e.target.value)); setIsDirty(true); }} />
        <Row label="平均単価" value={avgPrice} onChange={e => setAvgPrice(Number(e.target.value))} />
        <Divider />
        <Section title="コスト" />
        <div style={{ marginBottom: 10, display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14, color: "var(--c-text)" }}>手数料率</span>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <input type="number" value={platformFeeRate} min={0} max={100} step={0.1} onChange={e => setPlatformFeeRate(Number(e.target.value))} style={{ width: 70, textAlign: "right" }} />
            <span style={{ fontSize: 13, color: "var(--c-muted)" }}>%</span>
          </div>
        </div>
        {sales > 0 && <div style={{ fontSize: 12, color: "var(--c-muted)", padding: "6px 10px", background: "var(--c-surface)", borderRadius: 8, marginBottom: 10 }}>{platform}手数料：{sales.toLocaleString("ja-JP")} 円 × {platformFeeRate}% = {fmt(feeCost)}</div>}
        <Row label="作品送料" value={shipOut} onChange={e => setShipOut(Number(e.target.value))} />
        <Row label="広告費" value={ad} onChange={e => setAd(Number(e.target.value))} />
        <Divider />
        <Section title="原価" />
        <Row label="原価率" value={cogsRate} onChange={e => setCogsRate(Number(e.target.value))} unit="%" />
        {sales > 0 && <div style={{ fontSize: 12, color: "var(--c-muted)", padding: "6px 10px", background: "var(--c-surface)", borderRadius: 8, marginBottom: 10 }}>{sales.toLocaleString("ja-JP")} 円 × {cogsRate}% = {fmt(cogsCost)}</div>}
        <Divider />
        <div style={{ fontSize: 13, color: "var(--c-muted)", padding: "8px 10px", background: "var(--c-surface)", borderRadius: 8 }}>
          人件費（固定）：{laborHours} 時間 × 3,000 円 = {fmt(laborCost)}
        </div>
      </Card>

      <SectionLabel>コスト内訳</SectionLabel>
      <div style={{ fontSize: 12, color: "var(--c-muted)", marginBottom: "1rem", padding: "10px 12px", background: "var(--c-surface)", borderRadius: 10 }}>
        {[
          [`${platform}手数料（${platformFeeRate}%）`, fmt(feeCost)],
          ["作品送料", fmt(shipOut)],
          ["広告費", fmt(ad)],
          ["人件費（固定）", fmt(laborCost)],
          [`原価（${cogsRate}%）`, sales > 0 ? fmt(cogsCost) : "― 円"],
        ].map(([label, val]) => (
          <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
            <span>{label}</span><span>{val}</span>
          </div>
        ))}
        <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0 3px", marginTop: 4, borderTop: "0.5px solid var(--c-border)", fontWeight: 500, fontSize: 13, color: "var(--c-text)" }}>
          <span>総コスト</span><span>{fmt(totalCost)}</span>
        </div>
      </div>

      <SectionLabel>メモ</SectionLabel>
      <Card>
        <textarea value={memo} onChange={e => setMemo(e.target.value)} placeholder="販売の所感など"
          style={{ width: "100%", minHeight: 100, fontSize: 13, background: "var(--c-surface)", border: "none", color: "var(--c-text)", borderRadius: 8, padding: 10, resize: "vertical", boxSizing: "border-box" }} />
      </Card>
    </div>
  );
}

// --- 委託入力フォーム ---
function ConsignmentForm({ initData, onNew }) {
  const [recordId, setRecordId] = useState(initData?.id || null);
  const [saveStatus, setSaveStatus] = useState("idle");
  const [name, setName] = useState(initData?.name || "");
  const [consignmentRate, setConsignmentRate] = useState(initData?.consignment_rate ?? 30);
  const [dateStart, setDateStart] = useState(initData?.date_start || "");
  const [dateEnd, setDateEnd] = useState(initData?.date_end || "");
  const [sales, setSales] = useState(initData?.sales || 0);
  const [shipOut, setShipOut] = useState(initData?.ship_out || 0);
  const [shipIn, setShipIn] = useState(initData?.ship_in || 0);
  const [ad, setAd] = useState(initData?.ad || 0);
  const [cogsRate, setCogsRate] = useState(initData?.cogs_rate ?? 30);
  const [avgPrice, setAvgPrice] = useState(initData?.avg_price || 0);
  const [memo, setMemo] = useState(initData?.memo || "");
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    const handler = (e) => { if (isDirty) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const { totalCost, actualSales, pl, grossPl, recPct, commissionCost, laborCost, cogsCost } = calcConsignmentTotals({
    sales, consignment_rate: consignmentRate, ship_out: shipOut, ship_in: shipIn, ad, cogs_rate: cogsRate,
  });
  const bepCount = avgPrice > 0 ? Math.ceil(totalCost / avgPrice) : 0;

  const handleSave = async () => {
    setSaveStatus("saving");
    const payload = { name, consignment_rate: consignmentRate, date_start: dateStart, date_end: dateEnd, sales, ship_out: shipOut, ship_in: shipIn, ad, cogs_rate: cogsRate, avg_price: avgPrice, memo };
    let error;
    if (recordId) {
      ({ error } = await supabase.from("consignments").update(payload).eq("id", recordId));
    } else {
      const { data, error: e } = await supabase.from("consignments").insert(payload).select().single();
      error = e;
      if (!error && data) setRecordId(data.id);
    }
    if (error) { setSaveStatus("error"); setTimeout(() => setSaveStatus("idle"), 3000); }
    else { setSaveStatus("saved"); setIsDirty(false); setTimeout(() => setSaveStatus("idle"), 2000); }
  };

  const saveLabel = saveStatus === "saving" ? "保存中..." : saveStatus === "saved" ? "✓ 保存済" : saveStatus === "error" ? "エラー" : "保存";
  const saveColor = saveStatus === "saved" ? "var(--c-success)" : saveStatus === "error" ? "var(--c-danger)" : "var(--c-accent)";

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 12, color: "var(--c-muted)", alignSelf: "center" }}>{recordId ? "ID: " + recordId : "新規"}</span>
        <button onClick={onNew} style={{ fontSize: 13, padding: "6px 14px", borderRadius: 8, background: "var(--c-surface)", border: "0.5px solid var(--c-border)", color: "var(--c-text)", cursor: "pointer" }}>新規</button>
        <button onClick={handleSave} disabled={saveStatus === "saving"} style={{ fontSize: 13, padding: "6px 14px", borderRadius: 8, background: saveColor, border: "none", color: "#fff", cursor: "pointer", fontWeight: 500 }}>{saveLabel}</button>
      </div>

      <SectionLabel>委託情報</SectionLabel>
      <Card>
        <div style={{ marginBottom: 10, display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14, color: "var(--c-text)" }}>委託先名</span>
          <input type="text" value={name} onChange={e => setName(e.target.value)} style={{ width: 210, textAlign: "left" }} />
        </div>
        <div style={{ marginBottom: 10, display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14, color: "var(--c-text)" }}>委託期間</span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input type="date" value={dateStart} onChange={e => { setDateStart(e.target.value); setDateEnd(autoEndDate(e.target.value, dateEnd)); setEventDirty(true); }} style={{ width: 145 }} />
            <span style={{ fontSize: 13, color: "var(--c-muted)" }}>〜</span>
            <input type="date" value={dateEnd} min={sameMonthMin(dateStart)} onChange={e => setDateEnd(e.target.value)} style={{ width: 145 }} />
          </div>
        </div>
        <Divider />
        <div style={{ background: "var(--c-surface)", borderRadius: 10, padding: "14px 16px", marginBottom: 10 }}>
          <p style={{ fontSize: 11, color: "var(--c-muted)", marginBottom: 4 }}>売上合計</p>
          <p style={{ fontSize: 28, fontWeight: 600, color: "var(--c-text)" }}>{actualSales > 0 ? actualSales.toLocaleString("ja-JP") + " 円" : "― 円"}</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <MetricCard label="総コスト" value={fmt(totalCost)} />
          <MetricCard label="目安の販売点数" value={bepCount + " 点"} accent />
          <MetricCard label="粗利（人件費除く）" value={grossPl !== null ? (grossPl >= 0 ? "+" : "") + fmt(grossPl) : "― 円"}>
            {grossPl !== null && <p style={{ fontSize: 12, color: grossPl >= 0 ? "var(--c-success)" : "var(--c-danger)", marginTop: 2 }}>{grossPl >= 0 ? "黒字" : "赤字"}</p>}
          </MetricCard>
          <MetricCard label="最終利益（人件費込）" value={pl !== null ? (pl >= 0 ? "+" : "") + fmt(pl) : "― 円"}>
            {pl !== null && <p style={{ fontSize: 12, color: pl >= 0 ? "var(--c-success)" : "var(--c-danger)", marginTop: 2 }}>{pl >= 0 ? "黒字" : "赤字"}</p>}
          </MetricCard>
          <div style={{ gridColumn: "1 / -1", background: "var(--c-surface)", borderRadius: 10, padding: "14px 16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--c-muted)", marginBottom: 2 }}><span>コスト回収進捗</span><span>{actualSales > 0 ? recPct + "%" : "―"}</span></div>
            <Bar pct={recPct} success={recPct >= 100} />
            {actualSales > 0 && <p style={{ fontSize: 11, color: "var(--c-muted)", marginTop: 6 }}>{recPct >= 100 ? "損益分岐点を超えています" : "あと " + fmt(totalCost - actualSales) + " で回収"}</p>}
          </div>
        </div>
      </Card>

      <SectionLabel>売上・コスト入力</SectionLabel>
      <Card>
        <Row label="売上合計" value={sales} onChange={e => { setSales(Number(e.target.value)); setIsDirty(true); }} />
        <Row label="平均単価" value={avgPrice} onChange={e => setAvgPrice(Number(e.target.value))} />
        <Divider />
        <Section title="コスト" />
        <div style={{ marginBottom: 10, display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14, color: "var(--c-text)" }}>委託掛け率</span>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <input type="number" value={consignmentRate} min={0} max={100} step={1} onChange={e => setConsignmentRate(Number(e.target.value))} style={{ width: 70, textAlign: "right" }} />
            <span style={{ fontSize: 13, color: "var(--c-muted)" }}>%</span>
          </div>
        </div>
        {sales > 0 && <div style={{ fontSize: 12, color: "var(--c-muted)", padding: "6px 10px", background: "var(--c-surface)", borderRadius: 8, marginBottom: 10 }}>委託手数料：{sales.toLocaleString("ja-JP")} 円 × {consignmentRate}% = {fmt(commissionCost)}</div>}
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 14, color: "var(--c-text)" }}>搬送費</span>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <input type="number" value={shipOut + shipIn} readOnly style={{ width: 110, textAlign: "right", background: "transparent", border: "none", color: "var(--c-muted)", pointerEvents: "none" }} />
              <span style={{ fontSize: 13, color: "var(--c-muted)" }}>円</span>
            </div>
          </div>
          <div style={{ padding: "10px 12px", background: "var(--c-surface)", borderRadius: 8 }}>
            {[["作品（往路）", shipOut, setShipOut], ["作品（復路）", shipIn, setShipIn]].map(([label, val, setter]) => (
              <div key={label} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", alignItems: "center", gap: 6, marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: "var(--c-muted)" }}>{label}</span>
                <input type="number" value={val} min={0} step={100} onChange={e => setter(Number(e.target.value))} style={{ width: 90, fontSize: 13, textAlign: "right" }} />
                <span style={{ fontSize: 12, color: "var(--c-muted)" }}>円</span>
              </div>
            ))}
          </div>
        </div>
        <Row label="広告費" value={ad} onChange={e => setAd(Number(e.target.value))} />
        <Divider />
        <Section title="原価" />
        <Row label="原価率" value={cogsRate} onChange={e => setCogsRate(Number(e.target.value))} unit="%" />
        {sales > 0 && <div style={{ fontSize: 12, color: "var(--c-muted)", padding: "6px 10px", background: "var(--c-surface)", borderRadius: 8, marginBottom: 10 }}>{sales.toLocaleString("ja-JP")} 円 × {cogsRate}% = {fmt(cogsCost)}</div>}
        <Divider />
        <div style={{ fontSize: 13, color: "var(--c-muted)", padding: "8px 10px", background: "var(--c-surface)", borderRadius: 8 }}>
          人件費（固定）：12 時間 × 3,000 円 = {fmt(laborCost)}
        </div>
      </Card>

      <SectionLabel>コスト内訳</SectionLabel>
      <div style={{ fontSize: 12, color: "var(--c-muted)", marginBottom: "1rem", padding: "10px 12px", background: "var(--c-surface)", borderRadius: 10 }}>
        {[
          [`委託手数料（${consignmentRate}%）`, fmt(commissionCost)],
          ["搬送費（往復）", fmt(shipOut + shipIn)],
          ["広告費", fmt(ad)],
          ["人件費（固定）", fmt(laborCost)],
          [`原価（${cogsRate}%）`, sales > 0 ? fmt(cogsCost) : "― 円"],
        ].map(([label, val]) => (
          <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
            <span>{label}</span><span>{val}</span>
          </div>
        ))}
        <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0 3px", marginTop: 4, borderTop: "0.5px solid var(--c-border)", fontWeight: 500, fontSize: 13, color: "var(--c-text)" }}>
          <span>総コスト</span><span>{fmt(totalCost)}</span>
        </div>
      </div>

      <SectionLabel>メモ</SectionLabel>
      <Card>
        <textarea value={memo} onChange={e => setMemo(e.target.value)} placeholder="委託の所感など"
          style={{ width: "100%", minHeight: 100, fontSize: 13, background: "var(--c-surface)", border: "none", color: "var(--c-text)", borderRadius: 8, padding: 10, resize: "vertical", boxSizing: "border-box" }} />
      </Card>
    </div>
  );
}

// --- イベント入力フォーム ---
const LOCATION_HINTS = {
  "サッポロ": "北海道 札幌市", "札幌": "北海道 札幌市",
  "東京": "東京都", "渋谷": "東京都 渋谷区", "新宿": "東京都 新宿区",
  "大阪": "大阪府 大阪市", "京都": "京都府 京都市",
  "名古屋": "愛知県 名古屋市", "福岡": "福岡県 福岡市",
  "仙台": "宮城県 仙台市", "広島": "広島県 広島市",
  "神戸": "兵庫県 神戸市", "横浜": "神奈川県 横浜市",
};

function ImportModal({ onClose, onImport }) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const handleImport = () => {
    try { onImport(JSON.parse(text.trim())); setError(""); }
    catch { setError("JSONの形式が正しくありません。もう一度確認してください。"); }
  };
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
      <div style={{ background: "var(--c-card)", borderRadius: 14, padding: "1.5rem", width: "100%", maxWidth: 500, border: "0.5px solid var(--c-border)" }}>
        <p style={{ fontSize: 15, fontWeight: 500, color: "var(--c-text)", marginBottom: 6 }}>JSONインポート</p>
        <p style={{ fontSize: 12, color: "var(--c-muted)", marginBottom: 12 }}>このチャットで生成したJSONをここに貼り付けてください。新規イベントとして取り込まれます。</p>
        <textarea value={text} onChange={e => { setText(e.target.value); setError(""); }}
          placeholder={'{\n  "name": "デザインフェスタ vol.61",\n  ...\n}'}
          style={{ width: "100%", height: 200, fontSize: 12, fontFamily: "monospace", background: "var(--c-surface)", border: "0.5px solid var(--c-border)", color: "var(--c-text)", borderRadius: 8, padding: 10, resize: "none", boxSizing: "border-box" }} />
        {error && <p style={{ fontSize: 12, color: "var(--c-danger)", marginTop: 6 }}>{error}</p>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
          <button onClick={onClose} style={{ fontSize: 13, padding: "7px 16px", borderRadius: 8, background: "var(--c-surface)", border: "0.5px solid var(--c-border)", color: "var(--c-text)", cursor: "pointer" }}>キャンセル</button>
          <button onClick={handleImport} style={{ fontSize: 13, padding: "7px 16px", borderRadius: 8, background: "var(--c-accent)", border: "none", color: "#fff", cursor: "pointer", fontWeight: 500 }}>取り込む</button>
        </div>
      </div>
    </div>
  );
}

const initDayData = (defaultStart = "10:00", defaultEnd = "17:00") => {
  const times = {}, sales = {};
  for (let i = 1; i <= MAX_DAYS; i++) {
    times[i] = { start: defaultStart, end: defaultEnd };
    sales[i] = 0;
  }
  return { times, sales };
};

export default function App() {
  const [tab, setTab] = useState("list");
  const [inputType, setInputType] = useState("event");
  const [showImport, setShowImport] = useState(false);
  const [eventDirty, setEventDirty] = useState(false);

  // web/委託フォームのリセット用キーとデータ
  const [webFormKey, setWebFormKey] = useState(0);
  const [consignmentFormKey, setConsignmentFormKey] = useState(0);
  const [webInitData, setWebInitData] = useState(null);
  const [consignmentInitData, setConsignmentInitData] = useState(null);

  // イベントフォーム用state
  const [eventId, setEventId] = useState(null);
  const [saveStatus, setSaveStatus] = useState("idle");
  const [visibleDays, setVisibleDays] = useState(2);
  const [eventName, setEventName] = useState("");
  const [location, setLocation] = useState("");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [targetSales, setTargetSales] = useState(0);
  const [boothType, setBoothType] = useState("fixed");
  const [booth, setBooth] = useState(0);
  const [boothRate, setBoothRate] = useState(20);
  const [transport, setTransport] = useState(0);
  const [hotel, setHotel] = useState(0);
  const [shipOut, setShipOut] = useState(0);
  const [shipIn, setShipIn] = useState(0);
  const [shipOther, setShipOther] = useState(0);
  const [rental, setRental] = useState(0);
  const [ad, setAd] = useState(0);
  const [other, setOther] = useState(0);
  const [hourlyRate, setHourlyRate] = useState(3000);
  const [workDays, setWorkDays] = useState(1);
  const [cogsRate, setCogsRate] = useState(30);
  const [stayBudget, setStayBudget] = useState(0);
  const [stayUsed, setStayUsed] = useState(0);
  const [avgPrice, setAvgPrice] = useState(0);
  const [memo, setMemo] = useState("");
  const { times: initTimes, sales: initSales } = initDayData("10:00", "17:00");
  const [dayTimes, setDayTimes] = useState(initTimes);
  const [salesDays, setSalesDays] = useState(initSales);

  // イベントフォームのbeforeunload
  useEffect(() => {
    const handler = (e) => { if (eventDirty) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [eventDirty]);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from("events").select("*").order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (data) applyEventData(data);
    };
    load();
  }, []);

  const applyEventData = (d) => {
    setEventId(d.id);
    setEventName(d.name ?? ""); setLocation(d.location ?? "");
    setDateStart(d.date_start ?? ""); setDateEnd(d.date_end ?? "");
    setTargetSales(d.target_sales ?? 0); setBoothType(d.booth_type ?? "fixed");
    setBooth(d.booth ?? 0); setBoothRate(d.booth_rate ?? 20);
    setTransport(d.transport ?? 0); setHotel(d.hotel ?? 0);
    setShipOut(d.ship_out ?? 0); setShipIn(d.ship_in ?? 0); setShipOther(d.ship_other ?? 0);
    setRental(d.rental ?? 0); setAd(d.ad ?? 0); setOther(d.other ?? 0);
    setHourlyRate(d.hourly_rate ?? 3000); setWorkDays(d.work_days ?? 1); setCogsRate(d.cogs_rate ?? 30);
    setStayBudget(d.stay_budget ?? 0); setStayUsed(d.stay_used ?? 0); setAvgPrice(d.avg_price ?? 0);
    setMemo(d.memo ?? "");
    const newTimes = {}, newSales = {};
    let maxDay = 2;
    const fallbackStart = d.time_start || "10:00";
    const fallbackEnd = d.time_end || "17:00";
    for (let i = 1; i <= MAX_DAYS; i++) {
      newTimes[i] = { start: d[`time_start_d${i}`] || fallbackStart, end: d[`time_end_d${i}`] || fallbackEnd };
      newSales[i] = d[`sales_d${i}`] ?? 0;
      if (newSales[i] > 0) maxDay = i;
    }
    setDayTimes(newTimes); setSalesDays(newSales);
    setVisibleDays(d.visible_days || Math.max(2, maxDay));
    setEventDirty(false);
  };

  const buildEventPayload = () => {
    const payload = {
      name: eventName, location, date_start: dateStart, date_end: dateEnd,
      target_sales: targetSales, booth_type: boothType, booth, booth_rate: boothRate,
      transport, hotel, ship_out: shipOut, ship_in: shipIn, ship_other: shipOther,
      rental, ad, other, hourly_rate: hourlyRate, work_days: workDays, cogs_rate: cogsRate,
      stay_budget: stayBudget, stay_used: stayUsed, avg_price: avgPrice, memo, visible_days: visibleDays,
    };
    for (let i = 1; i <= MAX_DAYS; i++) {
      payload[`time_start_d${i}`] = dayTimes[i]?.start || "10:00";
      payload[`time_end_d${i}`] = dayTimes[i]?.end || "17:00";
      payload[`sales_d${i}`] = salesDays[i] ?? 0;
    }
    return payload;
  };

  const handleEventSave = async () => {
    setSaveStatus("saving");
    const payload = buildEventPayload();
    let error;
    if (eventId) {
      ({ error } = await supabase.from("events").update(payload).eq("id", eventId));
    } else {
      const { data, error: e } = await supabase.from("events").insert(payload).select().single();
      error = e;
      if (!error && data) setEventId(data.id);
    }
    if (error) { setSaveStatus("error"); setTimeout(() => setSaveStatus("idle"), 3000); }
    else { setSaveStatus("saved"); setEventDirty(false); setTimeout(() => setSaveStatus("idle"), 2000); }
  };

  const handleEventNew = () => {
    setEventId(null); setEventName(""); setLocation(""); setDateStart(""); setDateEnd("");
    setTargetSales(0); setBoothType("fixed"); setBooth(0); setBoothRate(20);
    setTransport(0); setHotel(0); setShipOut(0); setShipIn(0); setShipOther(0);
    setRental(0); setAd(0); setOther(0);
    setHourlyRate(3000); setWorkDays(1); setCogsRate(30);
    setStayBudget(0); setStayUsed(0); setAvgPrice(0); setMemo("");
    const { times, sales } = initDayData();
    setDayTimes(times); setSalesDays(sales); setVisibleDays(2); setSaveStatus("idle"); setEventDirty(false);
  };

  const handleSelectEvent = (ev, type) => {
    setInputType(type);
    setTab("input");
    setEventDirty(false);
    window.scrollTo({ top: 0, behavior: "instant" });
    if (type === "event") {
      applyEventData(ev);
    } else if (type === "web") {
      setWebInitData(ev);
      setWebFormKey(k => k + 1);
    } else if (type === "consignment") {
      setConsignmentInitData(ev);
      setConsignmentFormKey(k => k + 1);
    }
  };

  const handleImport = (data) => {
    setEventId(null);
    setEventName(data.name ?? ""); setLocation(data.location ?? "");
    setDateStart(data.date_start ?? ""); setDateEnd(data.date_end ?? "");
    setTargetSales(data.target_sales ?? 0);
    setBoothType(data.booth_type ?? "fixed"); setBooth(data.booth ?? 0); setBoothRate(data.booth_rate ?? 20);
    setTransport(data.transport ?? 0); setHotel(data.hotel ?? 0);
    setShipOut(data.ship_out ?? 0); setShipIn(data.ship_in ?? 0); setShipOther(data.ship_other ?? 0);
    setRental(data.rental ?? 0); setAd(data.ad ?? 0); setOther(data.other ?? 0);
    setHourlyRate(data.hourly_rate ?? 3000); setWorkDays(data.work_days ?? 1); setCogsRate(data.cogs_rate ?? 30);
    setStayBudget(data.stay_budget ?? 0); setStayUsed(data.stay_used ?? 0);
    setAvgPrice(data.avg_price ?? 0); setMemo(data.memo ?? "");
    const newTimes = {}, newSales = {};
    let maxDay = 2;
    const fallbackStart = data.time_start_d1 || "10:00";
    const fallbackEnd = data.time_end_d1 || "17:00";
    for (let i = 1; i <= MAX_DAYS; i++) {
      newTimes[i] = { start: data[`time_start_d${i}`] || fallbackStart, end: data[`time_end_d${i}`] || fallbackEnd };
      newSales[i] = data[`sales_d${i}`] ?? 0;
      if (newSales[i] > 0) maxDay = i;
    }
    setDayTimes(newTimes); setSalesDays(newSales); setVisibleDays(data.visible_days || Math.max(2, maxDay));
    setSaveStatus("idle"); setShowImport(false); setInputType("event"); setTab("input");
  };

  const addDay = () => {
    const next = visibleDays + 1;
    setDayTimes(prev => ({ ...prev, [next]: { start: prev[visibleDays]?.start || "10:00", end: prev[visibleDays]?.end || "17:00" } }));
    setVisibleDays(next);
  };

  const actualSales = Object.values(salesDays).reduce((a, b) => a + b, 0);
  const boothCost = boothType === "rate" ? (actualSales * boothRate / 100) : booth;
  const shipping = shipOut + shipIn + shipOther;
  let totalDurH = 0;
  for (let i = 1; i <= visibleDays; i++) totalDurH += durHours(dayTimes[i]?.start, dayTimes[i]?.end);
  const laborCost = totalDurH * hourlyRate;
  const fixedCost = boothCost + transport + hotel + shipping + rental + ad + other;
  const cogsCost = actualSales > 0 ? actualSales * (cogsRate / 100) : 0;
  const totalCost = fixedCost + laborCost + cogsCost;
  const bepCount = avgPrice > 0 ? Math.ceil(totalCost / avgPrice) : 0;
  const pl = actualSales > 0 ? actualSales - totalCost : null;
  const grossPl = actualSales > 0 ? actualSales - (totalCost - laborCost) : null;
  const recPct = totalCost > 0 && actualSales > 0 ? Math.round(actualSales / totalCost * 100) : 0;
  const tPct = targetSales > 0 && actualSales > 0 ? Math.round(actualSales / targetSales * 100) : 0;
  const stayRemaining = stayBudget - stayUsed;

  const onEventNameChange = useCallback((e) => {
    const v = e.target.value; setEventName(v); setEventDirty(true);
    for (const [key, loc] of Object.entries(LOCATION_HINTS)) { if (v.includes(key)) { setLocation(loc); break; } }
  }, []);

  const saveLabel = saveStatus === "saving" ? "保存中..." : saveStatus === "saved" ? "✓ 保存済" : saveStatus === "error" ? "エラー" : "保存";
  const saveColor = saveStatus === "saved" ? "var(--c-success)" : saveStatus === "error" ? "var(--c-danger)" : "var(--c-accent)";

  return (
    <div style={{ maxWidth: 640, margin: "0 auto" }}>
      {showImport && <ImportModal onClose={() => setShowImport(false)} onImport={handleImport} />}

      <div style={{ position: "sticky", top: 0, zIndex: 10, background: "var(--c-bg)", borderBottom: "0.5px solid var(--c-border)", padding: "0.75rem 1rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", gap: 4 }}>
            {[["input", "入力"], ["list", "一覧"]].map(([key, label]) => (
              <button key={key} onClick={() => { if (key !== tab && eventDirty && !window.confirm("保存されていない変更があります。移動しますか？")) return; setTab(key); }} style={{ fontSize: 14, padding: "6px 16px", borderRadius: 8, border: "none", cursor: "pointer", background: tab === key ? "var(--c-accent)" : "var(--c-surface)", color: tab === key ? "#fff" : "var(--c-muted)", fontWeight: tab === key ? 500 : 400 }}>{label}</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {tab === "input" && inputType === "event" && <>
              <span style={{ fontSize: 12, color: "var(--c-muted)" }}>{eventId ? "ID: " + eventId : "新規"}</span>
              <button onClick={() => setShowImport(true)} style={{ fontSize: 13, padding: "6px 14px", borderRadius: 8, background: "var(--c-surface)", border: "0.5px solid var(--c-border)", color: "var(--c-text)", cursor: "pointer" }}>JSON</button>
              <button onClick={handleEventNew} style={{ fontSize: 13, padding: "6px 14px", borderRadius: 8, background: "var(--c-surface)", border: "0.5px solid var(--c-border)", color: "var(--c-text)", cursor: "pointer" }}>新規</button>
              <button onClick={handleEventSave} disabled={saveStatus === "saving"} style={{ fontSize: 13, padding: "6px 14px", borderRadius: 8, background: saveColor, border: "none", color: "#fff", cursor: "pointer", fontWeight: 500 }}>{saveLabel}</button>
            </>}
          </div>
        </div>
        {tab === "input" && (
          <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
            {[["event", "対面"], ["web", "WEB"], ["consignment", "委託"]].map(([key, label]) => (
              <button key={key} onClick={() => { if (key !== inputType && eventDirty && inputType === "event" && !window.confirm("保存されていない変更があります。移動しますか？")) return; setInputType(key); }} style={{ fontSize: 12, padding: "4px 14px", borderRadius: 8, border: "0.5px solid var(--c-border)", cursor: "pointer", background: inputType === key ? "var(--c-surface)" : "transparent", color: inputType === key ? "var(--c-text)" : "var(--c-muted)", fontWeight: inputType === key ? 500 : 400 }}>{label}</button>
            ))}
          </div>
        )}
      </div>

      <div style={{ padding: "1.25rem 1rem" }}>
        {tab === "list" ? (
          <><SectionLabel>すべての記録</SectionLabel><EventList onSelect={handleSelectEvent} /></>
        ) : (
          <>
            {inputType === "web" && (
              <WebForm
                key={webFormKey}
                initData={webInitData}
                onNew={() => { setWebInitData(null); setWebFormKey(k => k + 1); }}
              />
            )}
            {inputType === "consignment" && (
              <ConsignmentForm
                key={consignmentFormKey}
                initData={consignmentInitData}
                onNew={() => { setConsignmentInitData(null); setConsignmentFormKey(k => k + 1); }}
              />
            )}
            {inputType === "event" && (
              <>
                <SectionLabel>イベント情報</SectionLabel>
                <Card>
                  {[["イベント名", eventName, onEventNameChange, "text", 210], ["開催地", location, e => setLocation(e.target.value), "text", 210]].map(([label, val, onChange, type, w]) => (
                    <div key={label} style={{ marginBottom: 10, display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 14, color: "var(--c-text)" }}>{label}</span>
                      <input type={type} value={val} onChange={onChange} style={{ width: w, textAlign: "left" }} />
                    </div>
                  ))}
                  <div style={{ marginBottom: 10, display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 14, color: "var(--c-text)" }}>開催期間</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <input type="date" value={dateStart} onChange={e => { setDateStart(e.target.value); setDateEnd(autoEndDate(e.target.value, dateEnd)); setEventDirty(true); }} style={{ width: 145 }} />
                      <span style={{ fontSize: 13, color: "var(--c-muted)" }}>〜</span>
                      <input type="date" value={dateEnd} min={sameMonthMin(dateStart)} onChange={e => setDateEnd(e.target.value)} style={{ width: 145 }} />
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 14, color: "var(--c-text)" }}>目標金額</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <input type="number" value={targetSales} min={0} step={1000} onChange={e => { setTargetSales(Number(e.target.value)); setEventDirty(true); }} style={{ width: 110, textAlign: "right" }} />
                      <span style={{ fontSize: 13, color: "var(--c-muted)" }}>円</span>
                    </div>
                  </div>
                  <Divider />
                  <div style={{ background: "var(--c-surface)", borderRadius: 10, padding: "14px 16px", marginBottom: 10 }}>
                    <p style={{ fontSize: 11, color: "var(--c-muted)", marginBottom: 4 }}>売上合計</p>
                    <p style={{ fontSize: 28, fontWeight: 600, color: "var(--c-text)" }}>{actualSales > 0 ? actualSales.toLocaleString("ja-JP") + " 円" : "― 円"}</p>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <MetricCard label="総コスト" value={fmt(totalCost)} />
                    <MetricCard label="必要売上" value={fmt(totalCost)} accent />
                    <MetricCard label="目安の販売点数" value={bepCount + " 点"} accent />
                    <MetricCard label="粗利（人件費除く）" value={grossPl !== null ? (grossPl >= 0 ? "+" : "") + fmt(grossPl) : "― 円"}>
                      {grossPl !== null && <p style={{ fontSize: 12, color: grossPl >= 0 ? "var(--c-success)" : "var(--c-danger)", marginTop: 2 }}>{grossPl >= 0 ? "黒字" : "赤字"}</p>}
                    </MetricCard>
                    <MetricCard label="最終利益（人件費込）" value={pl !== null ? (pl >= 0 ? "+" : "") + fmt(pl) : "― 円"}>
                      {pl !== null && <p style={{ fontSize: 12, color: pl >= 0 ? "var(--c-success)" : "var(--c-danger)", marginTop: 2 }}>{pl >= 0 ? "黒字" : "赤字"}</p>}
                    </MetricCard>
                    <div style={{ gridColumn: "1 / -1", background: "var(--c-surface)", borderRadius: 10, padding: "14px 16px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--c-muted)", marginBottom: 2 }}><span>コスト回収進捗</span><span>{actualSales > 0 ? recPct + "%" : "―"}</span></div>
                      <Bar pct={recPct} success={recPct >= 100} />
                      {actualSales > 0 && <p style={{ fontSize: 11, color: "var(--c-muted)", marginTop: 6 }}>{recPct >= 100 ? "損益分岐点を超えています" : "あと " + fmt(totalCost - actualSales) + " で回収"}</p>}
                    </div>
                    {targetSales > 0 && (
                      <div style={{ gridColumn: "1 / -1", background: "var(--c-surface)", borderRadius: 10, padding: "14px 16px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--c-muted)", marginBottom: 2 }}><span>目標達成率</span><span>{actualSales > 0 ? tPct + "%" : "―"}</span></div>
                        <Bar pct={tPct} success={tPct >= 100} />
                        {actualSales > 0 && <p style={{ fontSize: 11, color: "var(--c-muted)", marginTop: 6 }}>{tPct >= 100 ? "目標達成" : "あと " + fmt(targetSales - actualSales) + " で達成"}</p>}
                      </div>
                    )}
                  </div>
                </Card>

                <SectionLabel>コスト入力</SectionLabel>
                <Card>
                  <Section title="固定費" />
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <span style={{ fontSize: 14, color: "var(--c-text)" }}>出展料・ブース代</span>
                      <div style={{ display: "flex", background: "var(--c-surface)", borderRadius: 8, padding: 3, gap: 2 }}>
                        {[["fixed", "固定"], ["rate", "歩合"]].map(([type, label]) => (
                          <button key={type} onClick={() => setBoothType(type)} style={{ fontSize: 12, padding: "3px 10px", borderRadius: 6, border: "none", cursor: "pointer", background: boothType === type ? "var(--c-card)" : "transparent", color: boothType === type ? "var(--c-text)" : "var(--c-muted)", fontWeight: boothType === type ? 500 : 400 }}>{label}</button>
                        ))}
                      </div>
                    </div>
                    {boothType === "fixed" ? (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 8 }}>
                        <span /><div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <input type="number" value={booth} min={0} step={100} onChange={e => setBooth(Number(e.target.value))} style={{ width: 110, textAlign: "right" }} />
                          <span style={{ fontSize: 13, color: "var(--c-muted)" }}>円</span>
                        </div>
                      </div>
                    ) : (
                      <div style={{ padding: "10px 12px", background: "var(--c-surface)", borderRadius: 8 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", alignItems: "center", gap: 6, marginBottom: 6 }}>
                          <span style={{ fontSize: 12, color: "var(--c-muted)" }}>歩合率</span>
                          <input type="number" value={boothRate} min={0} max={100} step={1} onChange={e => setBoothRate(Number(e.target.value))} style={{ width: 70, fontSize: 13, textAlign: "right" }} />
                          <span style={{ fontSize: 12, color: "var(--c-muted)" }}>%</span>
                        </div>
                        <p style={{ fontSize: 12, color: "var(--c-muted)" }}>{actualSales > 0 ? `売上 ${fmtShort(actualSales)} × ${boothRate}% = ${fmt(boothCost)}` : "売上を入力すると自動計算されます"}</p>
                      </div>
                    )}
                  </div>
                  <Row label="交通費" value={transport} onChange={e => setTransport(Number(e.target.value))} />
                  <Row label="宿泊費" value={hotel} onChange={e => setHotel(Number(e.target.value))} />
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 14, color: "var(--c-text)" }}>搬送費</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <input type="number" value={shipping} readOnly style={{ width: 110, textAlign: "right", background: "transparent", border: "none", color: "var(--c-muted)", pointerEvents: "none" }} />
                        <span style={{ fontSize: 13, color: "var(--c-muted)" }}>円</span>
                      </div>
                    </div>
                    <div style={{ marginTop: 8, padding: "10px 12px", background: "var(--c-surface)", borderRadius: 8 }}>
                      {[["作品（往路）", shipOut, setShipOut], ["作品（復路）", shipIn, setShipIn], ["その他（スーツケース等）", shipOther, setShipOther]].map(([label, val, setter]) => (
                        <div key={label} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", alignItems: "center", gap: 6, marginBottom: 8 }}>
                          <span style={{ fontSize: 12, color: "var(--c-muted)" }}>{label}</span>
                          <input type="number" value={val} min={0} step={100} onChange={e => setter(Number(e.target.value))} style={{ width: 90, fontSize: 13, textAlign: "right" }} />
                          <span style={{ fontSize: 12, color: "var(--c-muted)" }}>円</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <Row label="レンタル備品" value={rental} onChange={e => setRental(Number(e.target.value))} />
                  <Row label="広告費" value={ad} onChange={e => setAd(Number(e.target.value))} />
                  <Row label="その他" value={other} onChange={e => setOther(Number(e.target.value))} />
                  <Divider />
                  <Section title="自分の人件費" />
                  <Row label="時給設定" value={hourlyRate} onChange={e => setHourlyRate(Number(e.target.value))} />
                  <Row label="稼働日数" value={workDays} onChange={e => setWorkDays(Number(e.target.value))} unit="日" note="移動日は0.5日として計算" />
                  <div style={{ fontSize: 13, color: "var(--c-muted)", padding: "8px 10px", background: "var(--c-surface)", borderRadius: 8, marginTop: 8 }}>
                    {totalDurH > 0 ? `合計 ${totalDurH.toFixed(1)} 時間 × ${hourlyRate.toLocaleString("ja-JP")} 円 = ${Math.round(laborCost).toLocaleString("ja-JP")} 円` : "開催時間を入力すると自動計算されます"}
                  </div>
                  <Divider />
                  <Section title="原価" />
                  <Row label="原価率" value={cogsRate} onChange={e => setCogsRate(Number(e.target.value))} unit="%" />
                  <div style={{ fontSize: 13, color: "var(--c-muted)", padding: "8px 10px", background: "var(--c-surface)", borderRadius: 8, marginTop: 8 }}>
                    {actualSales > 0 ? `${actualSales.toLocaleString("ja-JP")} 円 × ${cogsRate}% = ${Math.round(cogsCost).toLocaleString("ja-JP")} 円` : "売上を入力すると自動計算されます"}
                  </div>
                  <Divider />
                  <Section title="滞在費（食費・雑費）" />
                  <Row label="予算上限" value={stayBudget} onChange={e => setStayBudget(Number(e.target.value))} />
                  <Row label="使用済み" value={stayUsed} onChange={e => setStayUsed(Number(e.target.value))} />
                  {stayBudget > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginTop: 8, padding: "4px 0" }}>
                      <span style={{ color: "var(--c-muted)" }}>残り使える金額</span>
                      <span style={{ fontWeight: 500, color: stayRemaining >= 0 ? "var(--c-success)" : "var(--c-danger)" }}>
                        {stayRemaining >= 0 ? fmt(stayRemaining) : "予算オーバー " + fmt(Math.abs(stayRemaining))}
                      </span>
                    </div>
                  )}
                </Card>

                <SectionLabel>開催時間・売上</SectionLabel>
                <Card>
                  <Row label="平均単価" value={avgPrice} onChange={e => setAvgPrice(Number(e.target.value))} />
                  <Row label="合計売上" value={actualSales} readOnly />
                  <div style={{ marginTop: 12, padding: "10px 12px", background: "var(--c-surface)", borderRadius: 8 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "3rem 1fr 1fr", gap: 8, marginBottom: 8 }}>
                      <span style={{ fontSize: 11, color: "var(--c-muted)" }}></span>
                      <span style={{ fontSize: 11, color: "var(--c-muted)", textAlign: "center" }}>開催時間</span>
                      <span style={{ fontSize: 11, color: "var(--c-muted)", textAlign: "right" }}>売上</span>
                    </div>
                    {Array.from({ length: visibleDays }, (_, i) => i + 1).map((day, idx) => (
                      <div key={day} style={{ display: "grid", gridTemplateColumns: "3rem 1fr 1fr", gap: 8, alignItems: "center", marginBottom: idx < visibleDays - 1 ? 10 : 0 }}>
                        <span style={{ fontSize: 13, color: "var(--c-muted)" }}>{day}日目</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <TimeSelect value={dayTimes[day]?.start} onChange={v => setDayTimes(prev => ({ ...prev, [day]: { ...prev[day], start: v } }))} />
                          <span style={{ fontSize: 12, color: "var(--c-muted)" }}>〜</span>
                          <TimeSelect value={dayTimes[day]?.end} onChange={v => setDayTimes(prev => ({ ...prev, [day]: { ...prev[day], end: v } }))} />
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 4, justifyContent: "flex-end" }}>
                          <input type="number" value={salesDays[day] ?? 0} min={0} step={100}
                            onChange={e => { setSalesDays(prev => ({ ...prev, [day]: Number(e.target.value) })); setEventDirty(true); }}
                            style={{ width: 90, textAlign: "right", fontSize: 13 }} />
                          <span style={{ fontSize: 12, color: "var(--c-muted)" }}>円</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  {visibleDays < MAX_DAYS && (
                    <button onClick={addDay} style={{ marginTop: 10, fontSize: 13, padding: "6px 14px", borderRadius: 8, background: "var(--c-surface)", border: "0.5px solid var(--c-border)", color: "var(--c-muted)", cursor: "pointer", width: "100%" }}>
                      + {visibleDays + 1}日目を追加
                    </button>
                  )}
                </Card>

                <SectionLabel>コスト内訳</SectionLabel>
                <div style={{ fontSize: 12, color: "var(--c-muted)", marginBottom: "1rem", padding: "10px 12px", background: "var(--c-surface)", borderRadius: 10 }}>
                  {[
                    ["固定費合計", fmt(fixedCost)],
                    [boothType === "rate" ? `出展料（売上の${boothRate}%）` : "出展料", fmt(boothCost)],
                    ["自分の人件費", fmt(laborCost)],
                    ["原価（売上の" + cogsRate + "%）", cogsCost > 0 ? fmt(cogsCost) : "― 円"],
                  ].map(([label, val]) => (
                    <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
                      <span>{label}</span><span>{val}</span>
                    </div>
                  ))}
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0 3px", marginTop: 4, borderTop: "0.5px solid var(--c-border)", fontWeight: 500, fontSize: 13, color: "var(--c-text)" }}>
                    <span>総コスト</span><span>{fmt(totalCost)}</span>
                  </div>
                </div>

                <SectionLabel>メモ</SectionLabel>
                <Card>
                  <textarea value={memo} onChange={e => setMemo(e.target.value)} placeholder="出展の所感・次回への引き継ぎ事項など"
                    style={{ width: "100%", minHeight: 100, fontSize: 13, background: "var(--c-surface)", border: "none", color: "var(--c-text)", borderRadius: 8, padding: 10, resize: "vertical", boxSizing: "border-box" }} />
                </Card>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
