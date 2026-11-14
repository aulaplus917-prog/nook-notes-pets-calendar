import { createOpenAI } from "@ai-sdk/openai";
import { generateText, Output } from "ai";
import { z } from "zod";
import { cleanImportedText } from "@/lib/clean-text";
import { studyAiFailure } from "@/lib/study-ai";
import {
  createLovableAiGatewayRunIdFetch,
  getLovableAiGatewayRunId,
  withLovableAiGatewayRunIdHeader,
} from "./run-id";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1";
const MODEL = "openai/gpt-6-astra";

export type StudyAiKind = "mindmap" | "summary" | "notes";
export type StudyAiRequestBody = { kind: StudyAiKind; notebook: string; notes: string };

const BASE = `Eres un docente experto y diseñador pedagógico de AulaPlus para estudiantes de secundaria y universidad.
Tu trabajo es TRANSFORMAR el material en contenido de estudio estructurado y profesional, adaptado a la asignatura y al tema concreto.

Reglas obligatorias:
- NUNCA copies ni repitas frases del material tal cual. Reformula, sintetiza, jerarquiza y conecta las ideas.
- Organiza con lógica: de lo general a lo particular, causas → consecuencias, etapas de un proceso, clasificaciones o comparaciones, según lo que pida el tema.
- Usa el vocabulario propio de la asignatura y corrige con tacto cualquier error del material.
- Si el material es escaso o no existe, construye el contenido a partir del tema del cuaderno con tu conocimiento experto.
- Ignora textos de navegación, botones, redes sociales o publicidad que se hayan colado en el material.
- Escribe siempre en español claro.`;

const PROMPTS: Record<StudyAiKind, string> = {
  mindmap: `${BASE}

Tarea: crea un MAPA MENTAL.
- "center": el concepto central (máximo 6 palabras).
- "branches": entre 4 y 6 ramas principales que cubran el tema de forma ordenada y sin solaparse.
  - "label": nombre de la rama (2 a 4 palabras).
  - "summary": una frase propia (máximo 25 palabras) que explique la rama.
  - "points": de 2 a 4 subideas concretas (máximo 14 palabras cada una): definiciones, ejemplos, datos o relaciones.`,
  summary: `${BASE}

Tarea: crea un RESUMEN DE ESTUDIO en Markdown con exactamente estas secciones:
## Idea central
(2–3 frases propias que expliquen de qué trata el tema y por qué importa)
## Conceptos clave
(4–6 viñetas con el formato "- **Concepto:** explicación breve y precisa")
## Esquema lógico
(lista numerada que muestre la estructura del tema: proceso, causas y consecuencias, clasificación o comparación; usa subviñetas cuando ayuden)
## Ejemplo práctico
(un ejemplo concreto adaptado a un estudiante)
## Para recordar
(3 viñetas muy cortas tipo repaso rápido)
## Pregunta de repaso
(una pregunta que obligue a pensar, no a memorizar)
No añadas texto fuera de estas secciones.`,
  notes: `${BASE}

Tarea: convierte el material en APUNTES ASISTIDOS bien organizados en Markdown:
# (título del tema)
## 1. … (secciones numeradas en orden lógico, 3 a 6 secciones)
- viñetas con ideas propias; usa subviñetas para detalles y **negritas** para términos clave
- incluye definiciones con el formato "**Término:** definición" cuando corresponda
## Palabras clave
(términos clave separados por " · ")
## Resumen en 3 líneas
## Preguntas de autoestudio
(3 preguntas numeradas)
No añadas texto fuera de esta estructura.`,
};

const mindMapSchema = z.object({
  center: z.string().describe("Concepto central, máximo 6 palabras"),
  branches: z
    .array(
      z.object({
        label: z.string().describe("Nombre de la rama, 2 a 4 palabras"),
        summary: z.string().describe("Frase propia que explica la rama"),
        points: z.array(z.string()).describe("2 a 4 subideas concretas"),
      }),
    )
    .describe("4 a 6 ramas principales"),
});

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

export async function handleStudyAiRequest(request: Request, body: StudyAiRequestBody) {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) return json({ error: "La IA no está configurada todavía." }, 500);

  const notes = cleanImportedText(body.notes).slice(0, 14000);
  const topic = body.notebook.trim().slice(0, 120) || "Tema de estudio";
  const prompt = notes
    ? `Cuaderno / asignatura: "${topic}".\n\nMATERIAL DEL ESTUDIANTE (base principal):\n"""\n${notes}\n"""`
    : `Cuaderno / asignatura: "${topic}". El estudiante aún no tiene apuntes: crea el contenido a partir del tema.`;

  const runIdFetch = createLovableAiGatewayRunIdFetch(getLovableAiGatewayRunId(request));
  const provider = createOpenAI({
    baseURL: GATEWAY_URL,
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: runIdFetch.fetch,
  });
  const providerOptions = { openai: { store: false } } as const;

  try {
    if (body.kind === "mindmap") {
      const result = await generateText({
        model: provider.responses(MODEL),
        instructions: PROMPTS.mindmap,
        prompt,
        output: Output.object({ schema: mindMapSchema }),
        abortSignal: request.signal,
        providerOptions,
      });
      return withLovableAiGatewayRunIdHeader(json({ map: result.output }), runIdFetch);
    }
    const result = await generateText({
      model: provider.responses(MODEL),
      instructions: PROMPTS[body.kind],
      prompt,
      abortSignal: request.signal,
      providerOptions,
    });
    return withLovableAiGatewayRunIdHeader(json({ markdown: result.text }), runIdFetch);
  } catch (error) {
    const failure = studyAiFailure(upstreamStatus(error), request.signal.aborted);
    console.error(`study-ai error (${failure.code})`, error);
    return json({ error: failure.message, code: failure.code }, failure.status);
  }
}

/** Status HTTP del Gateway, incluso cuando el SDK lo envuelve en un error de reintentos. */
function upstreamStatus(error: unknown): number | undefined {
  let e: unknown = error;
  for (let i = 0; i < 4 && e && typeof e === "object"; i++) {
    const x = e as { statusCode?: unknown; lastError?: unknown; cause?: unknown };
    if (typeof x.statusCode === "number") return x.statusCode;
    e = x.lastError ?? x.cause;
  }
  return undefined;
}
