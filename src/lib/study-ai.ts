// Contenido de estudio estructurado (mapa mental, resumen y apuntes asistidos).
// La IA genera el contenido cuando hay internet; sin conexión se arma un esquema local.
import { keyTerms, sentences } from "@/lib/tutor";

export type AiKind = "mindmap" | "summary" | "notes" | "flashcards";
export type AiMindMap = { center: string; branches: { label: string; summary: string; points: string[] }[] };
export const FLASHCARD_TYPES = ["concepto", "causa", "proceso", "comparacion", "aplicacion", "completar", "verdadero_falso"] as const;
export type FlashcardType = (typeof FLASHCARD_TYPES)[number];
export type AiFlashcard = { type: FlashcardType; question: string; answer: string; hint?: string };
export const FLASHCARD_LABELS: Record<FlashcardType, string> = {
  concepto: "Concepto",
  causa: "Causa y efecto",
  proceso: "Proceso",
  comparacion: "Comparación",
  aplicacion: "Aplicación",
  completar: "Completa",
  verdadero_falso: "¿Verdadero o falso?",
};
export type AiStudio = {
  mindmap?: { key: string; data: AiMindMap };
  flashcards?: { key: string; data: AiFlashcard[] };
  summary?: { key: string; markdown: string };
  notes?: { key: string; markdown: string };
};

/** Huella del contenido: si cambian los apuntes o el nombre, el contenido se regenera. */
export function contentKey(name: string, notes: string) {
  const s = `${name.trim().toLowerCase()}\n${notes.trim()}`;
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `${s.length}-${(h >>> 0).toString(36)}`;
}

const clip = (s: string, max: number) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1).replace(/\s+\S*$/, "")}…` : t;
};
const cap = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

/** Valida y limpia el mapa mental que devuelve la IA. */
export function sanitizeMindMap(raw: unknown, topic: string): AiMindMap | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { center?: unknown; branches?: unknown };
  if (!Array.isArray(r.branches)) return null;
  const branches = r.branches
    .map((b) => {
      const x = (b ?? {}) as { label?: unknown; summary?: unknown; points?: unknown };
      const label = typeof x.label === "string" ? clip(x.label, 48) : "";
      const summary = typeof x.summary === "string" ? clip(x.summary, 220) : "";
      const points = Array.isArray(x.points)
        ? x.points.filter((p): p is string => typeof p === "string" && p.trim().length > 0).map((p) => clip(p, 160)).slice(0, 5)
        : [];
      return { label, summary, points };
    })
    .filter((b) => b.label && (b.summary || b.points.length))
    .slice(0, 7);
  if (branches.length < 2) return null;
  const center = typeof r.center === "string" && r.center.trim() ? clip(r.center, 60) : topic;
  return { center, branches };
}

/** Esquema local sin internet: agrupa ideas por concepto clave en lugar de copiar el texto. */
export function localMindMap(topic: string, text: string): AiMindMap {
  const all = sentences(text);
  const used = new Set<string>();
  const branches = keyTerms(text, 6).map((t) => {
    const related = all.filter((s) => s.toLowerCase().includes(t) && !used.has(s));
    related.forEach((s) => used.add(s));
    return {
      label: cap(t),
      summary: clip(related[0] ?? "", 140),
      points: related.slice(1, 4).map((s) => clip(s, 110)),
    };
  }).filter((b) => b.summary);
  return { center: topic, branches };
}

export function localSummaryMarkdown(topic: string, text: string) {
  const all = sentences(text);
  const terms = keyTerms(text, 6);
  if (!all.length) return "";
  const central = all.slice(0, 2).map((s) => clip(s, 200)).join(" ");
  const concepts = terms
    .map((t) => ({ t, s: all.find((x) => x.toLowerCase().includes(t)) }))
    .filter((c) => c.s)
    .map((c) => `- **${cap(c.t)}:** ${clip(c.s!, 150)}`);
  return [
    `## Idea central`,
    central,
    `## Conceptos clave`,
    ...concepts,
    `## Para repasar`,
    `- ¿Cómo se relacionan **${cap(terms[0] ?? topic)}** y **${cap(terms[1] ?? topic)}**?`,
    `- Explica con tus palabras qué es lo más importante de ${topic}.`,
  ].join("\n");
}

export function localNotesMarkdown(topic: string, text: string) {
  const map = localMindMap(topic, text);
  if (!map.branches.length) return "";
  return [
    `# ${topic}`,
    ...map.branches.flatMap((b, i) => [`## ${i + 1}. ${b.label}`, `- ${b.summary}`, ...b.points.map((p) => `  - ${p}`)]),
    `## Palabras clave`,
    map.branches.map((b) => `**${b.label}**`).join(" · "),
  ].join("\n");
}

/** Valida y limpia el mazo que devuelve la IA: sin vacías, sin preguntas repetidas, máximo 20. */
export function sanitizeFlashcards(raw: unknown): AiFlashcard[] | null {
  const list = Array.isArray(raw) ? raw : raw && typeof raw === "object" && Array.isArray((raw as { cards?: unknown }).cards) ? (raw as { cards: unknown[] }).cards : null;
  if (!list) return null;
  const seen = new Set<string>();
  const cards: AiFlashcard[] = [];
  for (const item of list) {
    const x = (item ?? {}) as { type?: unknown; question?: unknown; answer?: unknown; hint?: unknown };
    if (typeof x.question !== "string" || typeof x.answer !== "string") continue;
    const question = clip(x.question, 240);
    const answer = clip(x.answer, 420);
    if (question.length < 6 || !answer) continue;
    const id = question.toLowerCase();
    if (seen.has(id)) continue;
    seen.add(id);
    const type = (FLASHCARD_TYPES as readonly string[]).includes(x.type as string) ? (x.type as FlashcardType) : "concepto";
    const hint = typeof x.hint === "string" && x.hint.trim() ? clip(x.hint, 160) : undefined;
    cards.push(hint ? { type, question, answer, hint } : { type, question, answer });
    if (cards.length >= 20) break;
  }
  return cards.length >= 3 ? cards : null;
}

/** Mazo local sin internet: mezcla tipos de tarjeta (concepto, completar, relación) a partir de los términos clave. */
export function localFlashcards(topic: string, text: string): AiFlashcard[] {
  const all = sentences(text);
  const terms = keyTerms(text, 8);
  const used = new Set<string>();
  const concepts: AiFlashcard[] = [];
  const blanks: AiFlashcard[] = [];
  terms.forEach((t, i) => {
    const s = all.find((x) => x.toLowerCase().includes(t) && !used.has(x));
    if (!s) return;
    used.add(s);
    const other = terms[(i + 1) % terms.length];
    if (i % 2 === 0) {
      concepts.push({ type: "concepto", question: `¿Qué es o qué papel cumple «${cap(t)}» en ${topic}?`, answer: clip(s, 260), hint: other && other !== t ? `Relaciónalo con «${cap(other)}».` : undefined } as AiFlashcard);
    } else {
      blanks.push({ type: "completar", question: `Completa la idea: ${clip(s.replace(new RegExp(t, "i"), "_____"), 240)}`, answer: cap(t), hint: `Empieza por «${t[0]!.toUpperCase()}» y tiene ${t.length} letras.` });
    }
  });
  const relations: AiFlashcard[] = [];
  for (let i = 0; i + 1 < Math.min(terms.length, 6); i += 2) {
    const a = terms[i]!, b = terms[i + 1]!;
    const both = all.find((s) => s.toLowerCase().includes(a) && s.toLowerCase().includes(b));
    if (both) relations.push({ type: "comparacion", question: `¿Qué relación hay entre «${cap(a)}» y «${cap(b)}»?`, answer: clip(both, 260) });
  }
  const mixed: AiFlashcard[] = [];
  for (let i = 0; i < Math.max(concepts.length, blanks.length, relations.length); i++) {
    for (const group of [concepts, blanks, relations]) if (group[i]) mixed.push(group[i]!);
  }
  return mixed.map((c) => (c.hint ? c : { type: c.type, question: c.question, answer: c.answer })).slice(0, 14);
}

export type StudyAiResult = { markdown?: string; map?: AiMindMap; cards?: AiFlashcard[] };

export type StudyAiFailureCode = "credits" | "rate_limit" | "aborted" | "unavailable";

/**
 * Traduce un fallo del Gateway de IA a una respuesta clara. Nunca devuelve 5xx:
 * el fallo es esperado (créditos, límite, cancelación) y la app sigue con el esquema local.
 */
export function studyAiFailure(upstreamStatus: number | undefined, aborted: boolean): { status: number; code: StudyAiFailureCode; message: string } {
  if (aborted) return { status: 408, code: "aborted", message: "La petición se canceló." };
  if (upstreamStatus === 402)
    return { status: 402, code: "credits", message: "La IA se quedó sin créditos por ahora." };
  if (upstreamStatus === 429)
    return { status: 429, code: "rate_limit", message: "La IA está recibiendo muchas peticiones. Inténtalo en un momento." };
  return { status: 424, code: "unavailable", message: "La IA no respondió ahora." };
}

export class StudyAiError extends Error {
  constructor(public code: StudyAiFailureCode | "invalid", message: string) {
    super(message);
  }
}

export async function requestStudyAi(kind: AiKind, notebook: string, notes: string): Promise<StudyAiResult> {
  const res = await fetch("/api/public/study-ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, notebook, notes }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { code?: StudyAiFailureCode; error?: string };
    throw new StudyAiError(err.code ?? "unavailable", err.error ?? `study-ai ${res.status}`);
  }
  const data = (await res.json()) as { markdown?: unknown; map?: unknown; cards?: unknown };
  if (kind === "flashcards") {
    const cards = sanitizeFlashcards(data.cards);
    if (!cards) throw new StudyAiError("invalid", "mazo inválido");
    return { cards };
  }
  if (kind === "mindmap") {
    const map = sanitizeMindMap(data.map, notebook);
    if (!map) throw new StudyAiError("invalid", "mapa inválido");
    return { map };
  }
  if (typeof data.markdown !== "string" || data.markdown.trim().length < 40) throw new StudyAiError("invalid", "respuesta vacía");
  return { markdown: data.markdown.trim() };
}
