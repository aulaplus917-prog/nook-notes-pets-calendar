// Contenido de estudio estructurado (mapa mental, resumen y apuntes asistidos).
// La IA genera el contenido cuando hay internet; sin conexión se arma un esquema local.
import { keyTerms, sentences } from "@/lib/tutor";

export type AiKind = "mindmap" | "summary" | "notes";
export type AiMindMap = { center: string; branches: { label: string; summary: string; points: string[] }[] };
export type AiStudio = {
  mindmap?: { key: string; data: AiMindMap };
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

export type StudyAiResult = { markdown?: string; map?: AiMindMap };

export async function requestStudyAi(kind: AiKind, notebook: string, notes: string): Promise<StudyAiResult> {
  const res = await fetch("/api/public/study-ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, notebook, notes }),
  });
  if (!res.ok) throw new Error(`study-ai ${res.status}`);
  const data = (await res.json()) as { markdown?: unknown; map?: unknown };
  if (kind === "mindmap") {
    const map = sanitizeMindMap(data.map, notebook);
    if (!map) throw new Error("mapa inválido");
    return { map };
  }
  if (typeof data.markdown !== "string" || data.markdown.trim().length < 40) throw new Error("respuesta vacía");
  return { markdown: data.markdown.trim() };
}
