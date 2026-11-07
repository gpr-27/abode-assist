import clsx from "clsx";

/**
 * A WhatsApp/SMS body laid out the way a person reads it: the message first, address and map as
 * labelled rows, and the legal footer (RERA number, stop link) small and quiet underneath.
 */

const URL_RE = /(https?:\/\/\S+)/;

export function MessageBody({ body, className }: { body: string; className?: string }) {
  const lines = body.split("\n").map((l) => l.trim()).filter(Boolean);
  const footerAt = lines.findIndex((l) => /RERA/.test(l) && /·/.test(l));
  const main = footerAt >= 0 ? lines.slice(0, footerAt) : lines;
  const footer = footerAt >= 0 ? lines.slice(footerAt) : [];

  return (
    <div className={clsx("space-y-2 text-sm leading-relaxed [overflow-wrap:anywhere]", className)}>
      {main.map((l, i) => {
        const row = l.match(/^(Address|Location|पता|लोकेशन|સરનામું|લોકેશન):\s*(.+)$/);
        if (!row) return <p key={i}>{l}</p>;
        const [, label, value] = row;
        return (
          <p key={i} className="grid grid-cols-[5rem_1fr] gap-2">
            <span className="text-stone">{label}</span>
            {URL_RE.test(value) ? <a href={value} target="_blank" rel="noopener noreferrer" className="text-indigo underline underline-offset-2">{/[\u0900-\u097F]/.test(label) ? "मैप खोलें" : /[\u0A80-\u0AFF]/.test(label) ? "મેપ ખોલો" : "Open map pin"}</a> : <span>{value}</span>}
          </p>
        );
      })}
      {footer.length > 0 && (
        <div className="space-y-0.5 border-t border-line pt-2 text-xs text-stone">
          {footer.map((l, i) => {
            const m = l.match(URL_RE);
            if (!m) return <p key={i}>{l}</p>;
            return <p key={i}>{l.slice(0, m.index)}<a href={m[1]} className="underline underline-offset-2">{/[\u0900-\u097F]/.test(l) ? "यहाँ" : /[\u0A80-\u0AFF]/.test(l) ? "અહીં" : "this link"}</a>{l.slice(m.index! + m[1].length)}</p>;
          })}
        </div>
      )}
    </div>
  );
}
