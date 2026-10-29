export interface AlertTime {
  /** Wall-clock time in Asia/Kolkata. Never a UTC string with a missing suffix. */
  occurredAt?: string;
  timeSource: "bank" | "payment" | "gmail" | "unknown";
  timeConfidence: "exact" | "fallback" | "unknown";
}

function clock(raw: string): string | undefined {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i.exec(raw.trim());
  if (!m) return;
  let hour = Number(m[1]); const minute = Number(m[2]), second = Number(m[3] ?? 0);
  if (minute > 59 || second > 59 || (m[4] ? hour < 1 || hour > 12 : hour > 23)) return;
  if (m[4]) hour = hour % 12 + (m[4].toUpperCase() === "PM" ? 12 : 0);
  return [hour, minute, second].map(n => String(n).padStart(2, "0")).join(":");
}

export function alertTime(body: string, rawDay: string, day: string, receivedAt?: string | number): AlertTime {
  // Anchor to the transaction's parsed date, not a footer or an available-balance timestamp.
  // A statement-style header can repeat the day before the actual labelled
  // transaction timestamp. Prefer that label rather than the first occurrence.
  const labelled = /Date\s*(?:&\s*)?Time:\s*/ig;
  let dateStart = body.indexOf(rawDay);
  let hasLabel=false;
  for (const match of body.matchAll(labelled)) {
    const start = match.index! + match[0].length;
    if (body.slice(start, start + rawDay.length) === rawDay) { dateStart = start; hasLabel=true; break; }
  }
  if(!hasLabel)for(const match of body.matchAll(/\bon\s+/ig)){
    const start=match.index!+match[0].length;
    if(body.slice(start,start+rawDay.length)===rawDay&&/^\s+at\s+\d{1,2}:\d{2}/i.test(body.slice(start+rawDay.length))){dateStart=start;break;}
  }
  const tail = body.slice(dateStart + rawDay.length);
  const raw = /^\s*(?:,?\s*(?:at|Time:)?\s*)(\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?)(?:\s*(IST|UTC|GMT|[+-]\d{2}:?\d{2}))?(?=[\s.,]|$)/i.exec(tail);
  const time = raw && clock(raw[1]!);
  if (time) {
    const zone = raw[2]?.toUpperCase();
    if (zone && zone !== "IST") {
      const offset = zone === "UTC" || zone === "GMT" ? "Z" : zone;
      const instant = Date.parse(`${day}T${time}${offset}`);
      if (Number.isFinite(instant)) return { occurredAt: new Date(instant + 330 * 60000).toISOString().slice(0, 19), timeSource: "bank", timeConfidence: "exact" };
    } else return { occurredAt: `${day}T${time}`, timeSource: "bank", timeConfidence: "exact" };
  }
  // Only a clearly labelled payment time may supply a second-choice clock.
  const payment = /\bPayment Time:\s*(\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?)(?:\s*(IST))?(?=[\s.,]|$)/i.exec(body);
  const paymentClock = payment && clock(payment[1]!);
  if (paymentClock) return { occurredAt: `${day}T${paymentClock}`, timeSource: "payment", timeConfidence: "exact" };
  const received = receivedAt === undefined ? NaN : typeof receivedAt === "number" ? receivedAt : Date.parse(receivedAt);
  if (Number.isFinite(received)) return { occurredAt: new Date(received + 330 * 60000).toISOString().slice(0, 19), timeSource: "gmail", timeConfidence: "fallback" };
  return { timeSource: "unknown", timeConfidence: "unknown" };
}

export function alertTimeLabel(alert: AlertTime): string {
  if (!alert.occurredAt) return "Transaction time unknown";
  return `${alert.occurredAt.replace("T", " ")} IST · ${alert.timeSource === "gmail" ? "email received time; transaction time unknown" : "transaction time"}`;
}
