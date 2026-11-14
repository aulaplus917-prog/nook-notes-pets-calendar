import { describe, expect, it } from "vitest";
import { contentKey, localMindMap, sanitizeMindMap, studyAiFailure } from "@/lib/study-ai";

describe("contenido de estudio con IA", () => {
  it("cambia la huella cuando cambian los apuntes, para regenerar el contenido", () => {
    expect(contentKey("Biología", "La célula")).toBe(contentKey("Biología", "La célula"));
    expect(contentKey("Biología", "La célula")).not.toBe(contentKey("Biología", "La célula vegetal"));
  });

  it("rechaza un mapa mental con menos de dos ramas válidas", () => {
    expect(sanitizeMindMap({ center: "X", branches: [{ label: "A", summary: "a", points: [] }] }, "X")).toBeNull();
    expect(sanitizeMindMap("texto plano", "X")).toBeNull();
  });

  it("limita el mapa mental a 7 ramas y 5 subideas por rama", () => {
    const branches = Array.from({ length: 10 }, (_, i) => ({ label: `Rama ${i}`, summary: "Resumen", points: ["1", "2", "3", "4", "5", "6"] }));
    const map = sanitizeMindMap({ center: "Tema", branches }, "Tema")!;
    expect(map.branches).toHaveLength(7);
    expect(map.branches[0]!.points).toHaveLength(5);
  });

  it("el esquema local no repite la misma frase en dos ramas", () => {
    const text = "La fotosíntesis ocurre en los cloroplastos de las plantas verdes. La clorofila captura la energía de la luz solar. Los cloroplastos contienen clorofila y producen glucosa. La glucosa es energía para la planta y libera oxígeno al ambiente.";
    const map = localMindMap("Biología", text);
    const all = map.branches.flatMap((b) => [b.summary, ...b.points]);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe("fallos de la IA de estudio", () => {
  it("sin créditos (402) responde 402 con código credits, no 502", () => {
    expect(studyAiFailure(402, false)).toMatchObject({ status: 402, code: "credits" });
  });
  it("demasiadas peticiones (429) responde 429", () => {
    expect(studyAiFailure(429, false)).toMatchObject({ status: 429, code: "rate_limit" });
  });
  it("una petición cancelada por el usuario no se trata como error del servidor", () => {
    expect(studyAiFailure(undefined, true)).toMatchObject({ status: 408, code: "aborted" });
  });
  it("cualquier otro fallo nunca devuelve un status 5xx", () => {
    expect(studyAiFailure(500, false).status).toBeLessThan(500);
    expect(studyAiFailure(undefined, false).status).toBeLessThan(500);
  });
});
