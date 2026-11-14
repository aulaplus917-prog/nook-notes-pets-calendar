import { describe, expect, it } from "vitest";
import { contentKey, localMindMap, sanitizeMindMap } from "@/lib/study-ai";

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
