import { useState, useCallback, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_KEY
);

const fmt = (n) => Math.round(n).toLocaleString("ja-JP") + " 円";
const timeToMin = (t) => {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

function Bar({ pct, success }) {
  const fill = Math.min(pct, 100);
  return (
    <div style={{ background: "var(--c-border)", borderRadius: 4, height: 6, overflow: "hidden", marginTop: 8 }}>
      <div style={{
        height: "100%", borderRadius: 4, width: fill + "%",
        background: success ? "var(--c-success)" : "var(--c-accent)",
        transition: "width 0.4s ease"
      }} />
    </div>
  );
}

function MetricCard({ label, value, accent, children }) {
  return (
    <div style={{
      background: "var(--c-surface)", borderRadius: 10, padding: "14px 16px",
    }}>
      <p style={{ fontSize: 11, color: "var(--c-muted)", marginBottom: 4 }}>{label}</p>
      <p style={{ fontSize: 20, fontWeight: 500, color: accent ? "var(--c-accent)" : "var(--c-text)" }}>{value}</p>
      {children}
    </div>
  );
}

function Row({ label, id, value, onChange, unit = "円", readOnly = false, sub }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 14, color: "var(--c-text)" }}>{label}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <input
            type="number" id={id} value={value} min={0} step={100}
            onChange={onChange} readOnly={readOnly}
            style={{
              width: 110, textAlign: "right",
              background: readOnly ? "transparent" : undefined,
              border: readOnly ? "none" : undefined,
              color: readOnly ? "var(--c-muted)" : undefined,
              fontWeight: readOnly ? 400 : undefined,
              pointerEvents: readOnly ? "none" : undefined,
            }}
          />
          <span style={{ fontSize: 13, color: "var(--c-muted)" }}>{unit}</span>
        </div>
      </div>
      {sub}
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
  return (
    <div style={{
      background: "var(--c-card)", border: "0.5px solid var(--c-border)",
      borderRadius: 12, padding: "1.25rem", marginBottom: "1rem"
    }}>
      {children}
    </div>
  );
}

function SectionLabel({ children }) {
  return <p style={{ fontSize: 12, color: "var(--c-muted)", letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 12 }}>{children}</p>;
}

const LOCATION_HINTS = {
  "サッポロ": "北海道 札幌市", "札幌": "北海道 札幌市",
  "東京": "東京都", "渋谷": "東京都 渋谷区", "新宿": "東京都 新宿区",
  "大阪": "大阪府 大阪市", "京都": "京都府 京都市",
  "名古屋": "愛知県 名古屋市", "福岡": "福岡県 福岡市",
  "仙台": "宮城県 仙台市", "広島": "広島県 広島市",
  "神戸": "兵庫県 神戸市", "横浜": "神奈川県 横浜市",
};

export default function App() {
  const [eventId, setEventId] = useState(null);
  const [saveStatus, setSaveStatus] = useState("idle"); // idle | saving | saved | error

  const [eventName, setEventName] = useState("サッポロモノヴィレッジ");
  const [location, setLocation] = useState("北海道 札幌市");
  const [dateStart, setDateStart] = useState("2026-05-02");
  const [dateEnd, setDateEnd] = useState("2026-05-03");
  const [timeStart, setTimeStart] = useState("10:00");
  const [timeEnd, setTimeEnd] = useState("17:00");
  const [targetSales, setTargetSales] = useState(0);

  const [booth, setBooth] = useState(21000);
  const [transport, setTransport] = useState(38840);
  const [hotel, setHotel] = useState(57476);
  const [shipOut, setShipOut] = useState(12516);
  const [shipIn, setShipIn] = useState(13000);
  const [shipOther, setShipOther] = useState(3000);
  const [rental, setRental] = useState(6160);
  const [ad, setAd] = useState(12818);
  const [other, setOther] = useState(0);

  const [hourlyRate, setHourlyRate] = useState(3000);
  const [workDays, setWorkDays] = useState(2);
  const [cogsRate, setCogsRate] = useState(30);

  const [stayBudget, setStayBudget] = useState(0);
  const [stayUsed, setStayUsed] = useState(40000);

  const [avgPrice, setAvgPrice] = useState(24000);
  const [salesD1, setSalesD1] = useState(244200);
  const [salesD2, setSalesD2] = useState(118600);

  const [memo, setMemo] = useState("");

  // 起動時に最新イベントを読み込む
  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error || !data) return;
      applyData(data);
    };
    load();
  }, []);

  const applyData = (d) => {
    setEventId(d.id);
    setEventName(d.name ?? "");
    setLocation(d.location ?? "");
    setDateStart(d.date_start ?? "");
    setDateEnd(d.date_end ?? "");
    setTimeStart(d.time_start ?? "");
    setTimeEnd(d.time_end ?? "");
    setTargetSales(d.target_sales ?? 0);
    setBooth(d.booth ?? 0);
    setTransport(d.transport ?? 0);
    setHotel(d.hotel ?? 0);
    setShipOut(d.ship_out ?? 0);
    setShipIn(d.ship_in ?? 0);
    setShipOther(d.ship_other ?? 0);
    setRental(d.rental ?? 0);
    setAd(d.ad ?? 0);
    setOther(d.other ?? 0);
    setHourlyRate(d.hourly_rate ?? 3000);
    setWorkDays(d.work_days ?? 1);
    setCogsRate(d.cogs_rate ?? 30);
    setStayBudget(d.stay_budget ?? 0);
    setStayUsed(d.stay_used ?? 0);
    setAvgPrice(d.avg_price ?? 24000);
    setSalesD1(d.sales_d1 ?? 0);
    setSalesD2(d.sales_d2 ?? 0);
    setMemo(d.memo ?? "");
  };

  const buildPayload = () => ({
    name: eventName,
    location,
    date_start: dateStart,
    date_end: dateEnd,
    time_start: timeStart,
    time_end: timeEnd,
    target_sales: targetSales,
    booth,
    transport,
    hotel,
    ship_out: shipOut,
    ship_in: shipIn,
    ship_other: shipOther,
    rental,
    ad,
    other,
    hourly_rate: hourlyRate,
    work_days: workDays,
    cogs_rate: cogsRate,
    stay_budget: stayBudget,
    stay_used: stayUsed,
    avg_price: avgPrice,
    sales_d1: salesD1,
    sales_d2: salesD2,
    memo,
  });

  const handleSave = async () => {
    setSaveStatus("saving");
    const payload = buildPayload();
    let error;
    if (eventId) {
      ({ error } = await supabase.from("events").update(payload).eq("id", eventId));
    } else {
      const { data, error: e } = await supabase.from("events").insert(payload).select().single();
      error = e;
      if (!error && data) setEventId(data.id);
    }
    if (error) {
      console.error(error);
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    } else {
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    }
  };

  const handleNew = () => {
    setEventId(null);
    setEventName("");
    setLocation("");
    setDateStart("");
    setDateEnd("");
    setTimeStart("10:00");
    setTimeEnd("17:00");
    setTargetSales(0);
    setBooth(0); setTransport(0); setHotel(0);
    setShipOut(0); setShipIn(0); setShipOther(0);
    setRental(0); setAd(0); setOther(0);
    setHourlyRate(3000); setWorkDays(1); setCogsRate(30);
    setStayBudget(0); setStayUsed(0);
    setAvgPrice(24000); setSalesD1(0); setSalesD2(0);
    setMemo("");
    setSaveStatus("idle");
  };

  const shipping = shipOut + shipIn + shipOther;
  const actualSales = salesD1 + salesD2;

  const startMin = timeToMin(timeStart);
  const endMin = timeToMin(timeEnd);
  const durH = (startMin !== null && endMin !== null && endMin > startMin) ? (endMin - startMin) / 60 : 0;
  const laborCost = durH * hourlyRate * workDays;

  const fixedCost = booth + transport + hotel + shipping + rental + ad + other;
  const cogsCost = actualSales > 0 ? actualSales * (cogsRate / 100) : 0;
  const totalCost = fixedCost + laborCost + cogsCost;
  const bepCount = avgPrice > 0 ? Math.ceil(totalCost / avgPrice) : 0;
  const pl = actualSales > 0 ? actualSales - totalCost : null;
  const recPct = totalCost > 0 && actualSales > 0 ? Math.round(actualSales / totalCost * 100) : 0;
  const tPct = targetSales > 0 && actualSales > 0 ? Math.round(actualSales / targetSales * 100) : 0;
  const stayRemaining = stayBudget - stayUsed;

  const onEventNameChange = useCallback((e) => {
    const v = e.target.value;
    setEventName(v);
    for (const [key, loc] of Object.entries(LOCATION_HINTS)) {
      if (v.includes(key)) { setLocation(loc); break; }
    }
  }, []);

  const saveLabel = saveStatus === "saving" ? "保存中..." : saveStatus === "saved" ? "✓ 保存済" : saveStatus === "error" ? "エラー" : "保存";
  const saveColor = saveStatus === "saved" ? "var(--c-success)" : saveStatus === "error" ? "var(--c-danger)" : "var(--c-accent)";

  return (
    <div style={{ padding: "1.5rem 1rem", maxWidth: 640, margin: "0 auto" }}>

      {/* ヘッダー：保存・新規ボタン */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <span style={{ fontSize: 13, color: "var(--c-muted)" }}>
          {eventId ? `ID: ${eventId}` : "新規イベント"}
        </span>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={handleNew} style={{
            fontSize: 13, padding: "6px 14px", borderRadius: 8,
            background: "var(--c-surface)", border: "0.5px solid var(--c-border)",
            color: "var(--c-text)", cursor: "pointer"
          }}>新規</button>
          <button onClick={handleSave} disabled={saveStatus === "saving"} style={{
            fontSize: 13, padding: "6px 14px", borderRadius: 8,
            background: saveColor, border: "none",
            color: "#fff", cursor: "pointer", fontWeight: 500
          }}>{saveLabel}</button>
        </div>
      </div>

      <SectionLabel>イベント情報</SectionLabel>
      <Card>
        <div style={{ marginBottom: 10, display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14, color: "var(--c-text)" }}>イベント名</span>
          <input type="text" value={eventName} onChange={onEventNameChange} style={{ width: 210, textAlign: "left" }} />
        </div>
        <div style={{ marginBottom: 10, display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14, color: "var(--c-text)" }}>開催地</span>
          <input type="text" value={location} onChange={e => setLocation(e.target.value)} style={{ width: 210, textAlign: "left" }} />
        </div>
        <div style={{ marginBottom: 10, display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14, color: "var(--c-text)" }}>開催期間</span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input type="date" value={dateStart} onChange={e => setDateStart(e.target.value)} style={{ width: 145 }} />
            <span style={{ fontSize: 13, color: "var(--c-muted)" }}>〜</span>
            <input type="date" value={dateEnd} onChange={e => setDateEnd(e.target.value)} style={{ width: 145 }} />
          </div>
        </div>
        <div style={{ marginBottom: 10, display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14, color: "var(--c-text)" }}>開催時間</span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input type="time" value={timeStart} onChange={e => setTimeStart(e.target.value)} style={{ width: 110 }} />
            <span style={{ fontSize: 13, color: "var(--c-muted)" }}>〜</span>
            <input type="time" value={timeEnd} onChange={e => setTimeEnd(e.target.value)} style={{ width: 110 }} />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14, color: "var(--c-text)" }}>目標金額</span>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <input type="number" value={targetSales} min={0} step={1000} onChange={e => setTargetSales(Number(e.target.value))} style={{ width: 110, textAlign: "right" }} />
            <span style={{ fontSize: 13, color: "var(--c-muted)" }}>円</span>
          </div>
        </div>

        <Divider />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <MetricCard label="総コスト" value={fmt(totalCost)} />
          <MetricCard label="必要売上" value={fmt(totalCost)} accent />
          <MetricCard label="目安の販売点数" value={bepCount + " 点"} accent />
          <MetricCard label="損益（実績）" value={pl !== null ? (pl >= 0 ? "+" : "") + fmt(pl) : "― 円"}>
            {pl !== null && <p style={{ fontSize: 12, color: pl >= 0 ? "var(--c-success)" : "var(--c-danger)", marginTop: 2 }}>{pl >= 0 ? "黒字" : "赤字"}</p>}
          </MetricCard>
          <div style={{ gridColumn: "1 / -1", background: "var(--c-surface)", borderRadius: 10, padding: "14px 16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--c-muted)", marginBottom: 2 }}>
              <span>回収進捗</span>
              <span>{actualSales > 0 ? recPct + "%" : "―"}</span>
            </div>
            <Bar pct={recPct} success={recPct >= 100} />
            {actualSales > 0 && (
              <p style={{ fontSize: 11, color: "var(--c-muted)", marginTop: 6 }}>
                {recPct >= 100 ? "損益分岐点を超えています" : "あと " + fmt(totalCost - actualSales) + " で回収"}
              </p>
            )}
          </div>
          {targetSales > 0 && (
            <div style={{ gridColumn: "1 / -1", background: "var(--c-surface)", borderRadius: 10, padding: "14px 16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--c-muted)", marginBottom: 2 }}>
                <span>目標達成率</span>
                <span>{actualSales > 0 ? tPct + "%" : "―"}</span>
              </div>
              <Bar pct={tPct} success={tPct >= 100} />
              {actualSales > 0 && (
                <p style={{ fontSize: 11, color: "var(--c-muted)", marginTop: 6 }}>
                  {tPct >= 100 ? "目標達成" : "あと " + fmt(targetSales - actualSales) + " で達成"}
                </p>
              )}
            </div>
          )}
        </div>
      </Card>

      <SectionLabel>コスト入力</SectionLabel>
      <Card>
        <Section title="固定費" />
        <Row label="出展料・ブース代" value={booth} onChange={e => setBooth(Number(e.target.value))} />
        <Row label="交通費" value={transport} onChange={e => setTransport(Number(e.target.value))} />
        <Row label="宿泊費" value={hotel} onChange={e => setHotel(Number(e.target.value))} />
        <Row label="搬送費" value={shipping} readOnly
          sub={
            <div style={{ marginTop: 8, padding: "10px 12px", background: "var(--c-surface)", borderRadius: 8 }}>
              {[
                ["作品（往路）", shipOut, setShipOut],
                ["作品（復路）", shipIn, setShipIn],
                ["その他（スーツケース等）", shipOther, setShipOther],
              ].map(([label, val, setter]) => (
                <div key={label} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", alignItems: "center", gap: 6, marginBottom: 8 }}>
                  <span style={{ fontSize: 12, color: "var(--c-muted)" }}>{label}</span>
                  <input type="number" value={val} min={0} step={100} onChange={e => setter(Number(e.target.value))} style={{ width: 90, fontSize: 13, textAlign: "right" }} />
                  <span style={{ fontSize: 12, color: "var(--c-muted)" }}>円</span>
                </div>
              ))}
            </div>
          }
        />
        <Row label="レンタル備品" value={rental} onChange={e => setRental(Number(e.target.value))} />
        <Row label="広告費" value={ad} onChange={e => setAd(Number(e.target.value))} />
        <Row label="その他" value={other} onChange={e => setOther(Number(e.target.value))} />

        <Divider />
        <Section title="自分の人件費" />
        <Row label="時給設定" value={hourlyRate} onChange={e => setHourlyRate(Number(e.target.value))} />
        <Row label="稼働日数" value={workDays} onChange={e => setWorkDays(Number(e.target.value))} unit="日" />
        <div style={{ fontSize: 13, color: "var(--c-muted)", padding: "8px 10px", background: "var(--c-surface)", borderRadius: 8, marginTop: 8 }}>
          {durH > 0
            ? `${durH.toFixed(1)} 時間 × ${hourlyRate.toLocaleString("ja-JP")} 円 × ${workDays} 日 = ${Math.round(laborCost).toLocaleString("ja-JP")} 円`
            : "開催時間を入力すると自動計算されます"}
        </div>

        <Divider />
        <Section title="原価" />
        <Row label="原価率" value={cogsRate} onChange={e => setCogsRate(Number(e.target.value))} unit="%" />
        <div style={{ fontSize: 13, color: "var(--c-muted)", padding: "8px 10px", background: "var(--c-surface)", borderRadius: 8, marginTop: 8 }}>
          {actualSales > 0
            ? `${actualSales.toLocaleString("ja-JP")} 円 × ${cogsRate}% = ${Math.round(cogsCost).toLocaleString("ja-JP")} 円`
            : "売上を入力すると自動計算されます"}
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

      <SectionLabel>売上</SectionLabel>
      <Card>
        <Row label="平均単価" value={avgPrice} onChange={e => setAvgPrice(Number(e.target.value))} />
        <Row label="合計売上" value={actualSales} readOnly />
        <div style={{ marginTop: 8, padding: "10px 12px", background: "var(--c-surface)", borderRadius: 8 }}>
          {[["1日目", salesD1, setSalesD1], ["2日目", salesD2, setSalesD2]].map(([label, val, setter], i) => (
            <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: i === 0 ? 8 : 0 }}>
              <span style={{ fontSize: 13, color: "var(--c-muted)" }}>{label}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <input type="number" value={val} min={0} step={100} onChange={e => setter(Number(e.target.value))} style={{ width: 110, textAlign: "right" }} />
                <span style={{ fontSize: 13, color: "var(--c-muted)" }}>円</span>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <SectionLabel>コスト内訳</SectionLabel>
      <div style={{ fontSize: 12, color: "var(--c-muted)", marginBottom: "1rem", padding: "10px 12px", background: "var(--c-surface)", borderRadius: 10 }}>
        {[
          ["固定費合計", fmt(fixedCost)],
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
        <textarea
          value={memo}
          onChange={e => setMemo(e.target.value)}
          placeholder="出展の所感・次回への引き継ぎ事項など"
          style={{
            width: "100%", minHeight: 100, fontSize: 13,
            background: "var(--c-surface)", border: "none",
            color: "var(--c-text)", borderRadius: 8, padding: 10,
            resize: "vertical", boxSizing: "border-box"
          }}
        />
      </Card>

    </div>
  );
}
