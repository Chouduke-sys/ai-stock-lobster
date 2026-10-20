export type Candle = { date: string; open: number; high: number; low: number; close: number; volume: number };
export const numberValue = (input: unknown): number | null => {
  if (typeof input === "number") return Number.isFinite(input) ? input : null;
  if (typeof input !== "string") return null;
  const text = input.replace(/,/g, "").replace(/[＋+]/g, "").trim();
  if (!/^-?\d+(?:\\.\d+)?$/.test(text)) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
};
export function rocDate(input: string): string | null {
  const text = input.trim();
  const parts = text.match(/^(\d{2,4})[\/.-](\d{1,2})[\/.-](\d{1,2})$/);
  if (!parts) return null;
  const year = Number(parts[1]) + (parts[1].length <= 3 ? 1911 : 0);
  const month = Number(parts[2]), day = Number(parts[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
export function aggregate(candles: Candle[], period: "day" | "week" | "month"): Candle[] {
  if (period === "day") return candles;
  const groups = new Map<string, Candle>();
  for (const candle of candles) {
    const date = new Date(candle.date + "T12:00:00Z");
    const key = period === "month" ? candle.date.slice(0, 7) : (() => {
      const day = (date.getUTCDay() + 6) % 7;
      date.setUTCDate(date.getUTCDate() - day);
      return date.toISOString().slice(0, 10);
    })();
    const prev = groups.get(key);
    groups.set(key, prev ? { ...prev, date: candle.date, high: Math.max(prev.high, candle.high), low: Math.min(prev.low, candle.low), close: candle.close, volume: prev.volume + candle.volume } : { ...candle });
  }
  return Array.from(groups.values());
}
export function indicators(candles: Candle[]) {
  const closes = candles.map(c => c.close);
  const sma = (length: number) => closes.map((_, i) => i + 1 < length ? null : Math.round(closes.slice(i + 1 - length, i + 1).reduce((a,b) => a+b, 0) / length * 100) / 100);
  const ema = (length: number) => {
    const k = 2 / (length + 1);
    let value: number | null = null;
    return closes.map((price, i) => {
      if (i + 1 < length) return null;
      if (value === null) value = closes.slice(0, length).reduce((a,b)=>a+b,0) / length;
      else value = price * k + value * (1-k);
      return value;
    });
  };
  const fast = ema(12), slow = ema(26);
  const dif = closes.map((_,i) => fast[i] === null || slow[i] === null ? null : fast[i]! - slow[i]!);
  let signal: number | null = null;
  let signalCount = 0;
  const difSeed: number[] = [];
  const macd = dif.map(v => {
    if (v === null) return { dif: null, signal: null, histogram: null };
    signalCount++;
    if (signalCount <= 9) {
      difSeed.push(v);
      if (signalCount === 9) signal = difSeed.reduce((a,b)=>a+b,0)/9;
    } else signal = v * .2 + signal! * .8;
    return { dif: +v.toFixed(3), signal: signal === null ? null : +signal.toFixed(3), histogram: signal === null ? null : +(v - signal).toFixed(3) };
  });
  const rsi: (number | null)[] = closes.map(() => null);
  if (closes.length > 14) {
    let gains = 0, losses = 0;
    for (let i=1;i<=14;i++) { const delta=closes[i]-closes[i-1]; gains+=Math.max(delta,0); losses+=Math.max(-delta,0); }
    let avgGain=gains/14, avgLoss=losses/14;
    const score = () => avgLoss===0 ? (avgGain===0 ? 50 : 100) : 100-100/(1+avgGain/avgLoss);
    rsi[14]=+score().toFixed(2);
    for(let i=15;i<closes.length;i++){
      const delta=closes[i]-closes[i-1];
      avgGain=(avgGain*13+Math.max(delta,0))/14;
      avgLoss=(avgLoss*13+Math.max(-delta,0))/14;
      rsi[i]=+score().toFixed(2);
    }
  }
  return { ma5:sma(5), ma10:sma(10), ma20:sma(20), ma60:sma(60), rsi14:rsi, macd };
}
