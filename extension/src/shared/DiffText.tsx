import { readableDiff } from "@meritio/shared";

/** Renders `original` -> `proposed` as inline word diff. If identical, plain text. */
export function DiffText({ original, proposed }: { original: string; proposed: string }) {
  if (original === proposed) return <>{proposed}</>;
  const parts = readableDiff(original, proposed);
  return (
    <span className="diff">
      {parts.map((p, i) => {
        const t = p.text + " ";
        return p.kind === "same" ? <span key={i}>{t}</span>
          : p.kind === "del" ? <del key={i}>{t}</del>
          : <ins key={i}>{t}</ins>;
      })}
    </span>
  );
}
