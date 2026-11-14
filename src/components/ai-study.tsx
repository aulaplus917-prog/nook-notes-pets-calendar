// Vistas de contenido generado por IA: mapa mental, resumen y apuntes asistidos.
import { useEffect, useRef, useState } from "react";
import { Sparkles, RefreshCw, WifiOff, Plus, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { MessageResponse } from "@/components/ai-elements/message";
import { Shimmer } from "@/components/ai-elements/shimmer";
import type { Notebook } from "@/lib/aulaplus";
import {
  contentKey,
  localMindMap,
  localNotesMarkdown,
  localSummaryMarkdown,
  requestStudyAi,
  StudyAiError,
  type AiKind,
  type AiMindMap,
} from "@/lib/study-ai";

type Value<K extends AiKind> = K extends "mindmap" ? AiMindMap : string;

function useStudyAi<K extends AiKind>(n: Notebook, update: ((n: Notebook) => void) | undefined, kind: K, auto: boolean) {
  const latest = useRef(n);
  latest.current = n;
  const key = contentKey(n.name, n.notes);
  const cached = n.studio?.ai?.[kind];
  const fresh = cached?.key === key;
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const tried = useRef<string | null>(null);

  async function generate() {
    if (loading) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setFailed(true);
      toast.info("Sin conexión: te muestro un esquema local. Vuelve a intentarlo con internet.");
      return;
    }
    setLoading(true);
    setFailed(false);
    try {
      const r = await requestStudyAi(kind, n.name, n.notes);
      const cur = latest.current;
      const entry = kind === "mindmap" ? { key, data: r.map! } : { key, markdown: r.markdown! };
      update?.({ ...cur, studio: { ...cur.studio, ai: { ...cur.studio?.ai, [kind]: entry } } });
    } catch (error) {
      setFailed(true);
      const code = error instanceof StudyAiError ? error.code : "unavailable";
      if (code === "credits") toast.warning("La IA de AulaPlus se quedó sin créditos por ahora. Te muestro un esquema local con tus apuntes.", { id: "ai-credits" });
      else if (code === "rate_limit") toast.info("La IA está ocupada. Espera un momento y pulsa «Regenerar con IA».", { id: "ai-busy" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!auto || fresh || tried.current === key) return;
    tried.current = key;
    if (typeof navigator !== "undefined" && !navigator.onLine) { setFailed(true); return; }
    void generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, auto, fresh]);

  const aiValue = cached ? ("data" in cached ? cached.data : cached.markdown) : undefined;
  return { aiValue: aiValue as Value<K> | undefined, fresh, loading, failed, generate };
}

function AiStatus({ fromAi, fresh, loading, failed, onGenerate, label }: { fromAi: boolean; fresh: boolean; loading: boolean; failed: boolean; onGenerate: () => void; label: string }) {
  return (
    <div className="ai-status">
      {fromAi ? (
        <span className="pill lilac"><Sparkles size={12} />{fresh ? "Generado con IA" : "Generado con IA · tus apuntes cambiaron"}</span>
      ) : (
        <span className="pill peach">{failed ? <WifiOff size={12} /> : <Sparkles size={12} />}{failed ? "Esquema local (sin IA por ahora)" : "Esquema local"}</span>
      )}
      <Button size="sm" variant="outline" disabled={loading} onClick={onGenerate}>
        <RefreshCw className={loading ? "animate-spin" : ""} />
        {fromAi ? "Regenerar con IA" : label}
      </Button>
    </div>
  );
}

export function AiMindMapView({ notebook: n, update }: { notebook: Notebook; update?: ((n: Notebook) => void) | undefined }) {
  const ai = useStudyAi(n, update, "mindmap", true);
  const map = ai.aiValue ?? localMindMap(n.name, n.notes);
  const fromAi = Boolean(ai.aiValue);
  if (ai.loading && !fromAi) return <div className="ai-loading"><Shimmer>Milo está organizando tu mapa mental…</Shimmer></div>;
  if (!map.branches.length)
    return <div className="tools-empty"><h3>Primero agrega fuentes o apuntes</h3><p className="text-muted-foreground">Con internet, la IA puede crear el mapa a partir del tema. Pulsa el botón para intentarlo.</p><Button onClick={() => void ai.generate()}><Sparkles />Crear mapa mental con IA</Button></div>;
  return (
    <div className="mind-map">
      <AiStatus fromAi={fromAi} fresh={ai.fresh} loading={ai.loading} failed={ai.failed} onGenerate={() => void ai.generate()} label="Crear con IA" />
      <div className={`mind-center tone-${n.tone}`}>{map.center}</div>
      <div className="mind-branches">
        {map.branches.map((b, i) => (
          <div className="mind-branch ai" key={`${b.label}-${i}`}>
            <strong className="mind-branch-title"><span className="mind-num">{i + 1}</span>{b.label}</strong>
            {b.summary && <p>{b.summary}</p>}
            {b.points.length > 0 && <ul>{b.points.map((p) => <li key={p}>{p}</li>)}</ul>}
          </div>
        ))}
      </div>
    </div>
  );
}

export function AiSummaryView({ notebook: n, update }: { notebook: Notebook; update: (n: Notebook) => void }) {
  const ai = useStudyAi(n, update, "summary", true);
  const markdown = ai.aiValue ?? localSummaryMarkdown(n.name, n.notes);
  const fromAi = Boolean(ai.aiValue);
  if (ai.loading && !fromAi) return <div className="ai-loading"><Shimmer>Milo está preparando tu resumen…</Shimmer></div>;
  if (!markdown)
    return (
      <>
        <p className="subtitle">Añade apuntes a este cuaderno para reunir tus ideas más importantes.</p>
        <Button className="mt-4" onClick={() => void ai.generate()}><Sparkles />Crear resumen del tema con IA</Button>
      </>
    );
  return (
    <>
      <AiStatus fromAi={fromAi} fresh={ai.fresh} loading={ai.loading} failed={ai.failed} onGenerate={() => void ai.generate()} label="Crear con IA" />
      <div className="ai-doc"><MessageResponse>{markdown}</MessageResponse></div>
    </>
  );
}

export function AiNotesAssist({ notebook: n, update, onInsert }: { notebook: Notebook; update: (n: Notebook) => void; onInsert: (text: string) => void }) {
  const ai = useStudyAi(n, update, "notes", false);
  const markdown = ai.aiValue ?? (ai.failed && !ai.loading ? localNotesMarkdown(n.name, n.notes) : "");
  const fromAi = Boolean(ai.aiValue);
  return (
    <section className="ai-notes">
      <div className="section-heading">
        <div>
          <h3><Sparkles size={16} /> Apuntes asistidos por IA</h3>
          <p className="text-muted-foreground text-sm">Milo ordena tus apuntes guardados en un esquema claro con secciones, términos clave y preguntas.</p>
        </div>
        <Button size="sm" disabled={ai.loading} onClick={() => void ai.generate()}>
          <RefreshCw className={ai.loading ? "animate-spin" : ""} />
          {fromAi ? "Reorganizar con IA" : "Organizar con IA"}
        </Button>
      </div>
      {ai.loading && !fromAi && <Shimmer>Milo está organizando tus apuntes…</Shimmer>}
      {markdown && (
        <>
          {!fromAi && <span className="pill peach"><WifiOff size={12} />Esquema local (sin IA por ahora)</span>}
          {fromAi && !ai.fresh && <span className="pill lilac"><Sparkles size={12} />Tus apuntes cambiaron · puedes reorganizar</span>}
          <div className="ai-doc"><MessageResponse>{markdown}</MessageResponse></div>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" onClick={() => { onInsert(markdown); toast.success("Esquema añadido a tus apuntes"); }}><Plus />Añadir a mis apuntes</Button>
            <Button size="sm" variant="outline" onClick={() => { void navigator.clipboard?.writeText(markdown); toast.success("Copiado"); }}><Copy />Copiar</Button>
          </div>
        </>
      )}
    </section>
  );
}
