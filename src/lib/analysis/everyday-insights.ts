import type { EverydayInsight, Signal } from "@/src/lib/types";

const ATTENTION_BELOW = 5.5;
const GOOD_ABOVE = 6.5;
const DEFAULT_FALLBACK_SCORE = 5;

function findSignal(signals: Signal[], key: string) {
  return signals.find((item) => item.key === key && item.availability !== "unavailable");
}

function scoreOf(signals: Signal[], key: string) {
  return findSignal(signals, key)?.score;
}

/** Attention is driven by noise alone; a green score alone can lift the tone to "good". */
function streetTone(noise: number | undefined, green: number | undefined): EverydayInsight["tone"] {
  if ((noise ?? DEFAULT_FALLBACK_SCORE) < ATTENTION_BELOW) return "attention";
  if ((green ?? DEFAULT_FALLBACK_SCORE) >= GOOD_ABOVE) return "good";
  return "neutral";
}

/** Both comfort scores must be above the bar for "good"; either one below warns. */
function combinedTone(...scores: (number | undefined)[]): EverydayInsight["tone"] {
  const effective = scores.map((score) => score ?? DEFAULT_FALLBACK_SCORE);
  if (effective.some((score) => score < ATTENTION_BELOW)) return "attention";
  if (effective.every((score) => score >= GOOD_ABOVE)) return "good";
  return "neutral";
}

export function everydayInsights(signals: Signal[]): EverydayInsight[] {
  const insights: EverydayInsight[] = [];

  const noise = scoreOf(signals, "noise");
  const green = scoreOf(signals, "green");
  if (noise != null || green != null) {
    const tone = streetTone(noise, green);
    insights.push({
      title: "Hoe voelt de straat waarschijnlijk?",
      summary: tone === "attention"
        ? "De directe wegcontext vraagt om een extra luistermoment. Plan je bezichtiging op een druk én rustig tijdstip; het aanwezige groen verandert dat niet automatisch."
        : tone === "good"
          ? "De combinatie van lokale groenstructuur en wegcontext wijst op een prettiger straatbeeld. Check tijdens de bezichtiging nog wel geluid met open ramen."
          : "De openbare data geven geen uitgesproken straatbeeld. Kijk bij de bezichtiging bewust naar geluid, schaduw en de ruimte rondom de woning.",
      tone,
      signalKeys: ["noise", "green"].filter((key) => Boolean(findSignal(signals, key))),
    });
  }

  const energy = scoreOf(signals, "energy");
  const heat = scoreOf(signals, "heat");
  if (energy != null || heat != null) {
    const tone = combinedTone(energy, heat);
    insights.push({
      title: "Comfort en energierekening",
      summary: (energy ?? DEFAULT_FALLBACK_SCORE) < ATTENTION_BELOW
        ? "De energiedata verdienen extra aandacht. Vraag naar verbruik, isolatie, ventilatie en wat al is verbeterd—dat zegt meer over je maandlasten dan een label alleen."
        : (heat ?? DEFAULT_FALLBACK_SCORE) < ATTENTION_BELOW
          ? "De woning kan prima presteren in de winter, maar de omgevingsindicatie vraagt aandacht voor warmte in de zomer. Vraag naar zonwering en ventilatie."
          : "Energie- en omgevingssignalen geven geen directe rode vlag. Vraag alsnog om recente energiekosten en test ventilatie tijdens de bezichtiging.",
      tone,
      signalKeys: ["energy", "heat"].filter((key) => Boolean(findSignal(signals, key))),
    });
  }

  const sun = scoreOf(signals, "sun");
  if (sun != null || heat != null) {
    const tone = combinedTone(sun, heat);
    insights.push({
      title: "Licht en schaduw rond de woning",
      summary: tone === "attention"
        ? "De georiëntatie- of omgevingssignalen wijzen op minder licht of meer warmte. Loop bij de bezichtiging bewust langs tuin, woonkamer en slaapkamerramen op een ochtend- én avondmoment."
        : tone === "good"
          ? "Gevelrichting en omgeving wijken niet af van wat je in een prettige woning wilt zien. Check alsnog zelf hoe diep de zon 's winters in de kamers staat."
          : "De geometrie geeft geen uitgesproken lichtbeeld. Bepaal de zonnestand tijdens een bezichtiging: vóór 12u en na 17u zegt het meest.",
      tone,
      signalKeys: ["sun", "heat"].filter((key) => Boolean(findSignal(signals, key))),
    });
  }

  const transit = scoreOf(signals, "transit");
  const access = scoreOf(signals, "access");
  if (transit != null || access != null) {
    // Access carries no numeric score by design; both default to 5 here.
    const lowestScore = Math.min(transit ?? DEFAULT_FALLBACK_SCORE, access ?? DEFAULT_FALLBACK_SCORE);
    const tone: EverydayInsight["tone"] = lowestScore >= GOOD_ABOVE ? "good" : lowestScore < ATTENTION_BELOW ? "attention" : "neutral";
    insights.push({
      title: "Je dagelijkse route",
      summary: tone === "good"
        ? "De bereikbaarheidssignalen zijn gunstig voor dagelijkse verplaatsingen. Probeer je eigen woon-werkroute wel rond jouw vertrektijd."
        : "De route naar voorzieningen of vervoer is niet eenduidig gunstig. Check je eigen fiets-, auto- en ov-route voordat je beslist.",
      tone,
      signalKeys: ["transit", "access"].filter((key) => Boolean(findSignal(signals, key))),
    });
  }

  if (findSignal(signals, "schools") || findSignal(signals, "children")) {
    const school = scoreOf(signals, "schools");
    const tone: EverydayInsight["tone"] = school != null && school < ATTENTION_BELOW
      ? "attention"
      : school != null && school >= GOOD_ABOVE
        ? "good"
        : "neutral";
    insights.push({
      title: "Gezin en school",
      summary: tone === "good"
        ? "Basisschool en opvang liggen volgens CBS-buurtgemiddelden dichtbij. Loop de route op een schooldag na; de cijfers zijn buurtgemiddelden, geen loopafstand vanaf de voordeur."
        : tone === "attention"
          ? "Scholen of opvang liggen volgens de buurtstatistiek verder weg. Check de echte fiets- of looproute en of er plek is op de school van je voorkeur."
          : "De buurtcijfers over kinderen en scholen geven geen uitgesproken beeld. Gebruik ze als startpunt en check zelf de scholen in de wijk.",
      tone,
      signalKeys: ["schools", "children"].filter((key) => Boolean(findSignal(signals, key))),
    });
  }

  return insights;
}
