import clsx from "clsx";
import type { ReactNode } from "react";

/**
 * Tidy rendering for chat text. Understands only what the assistant is asked to write:
 * paragraphs (blank line), "- " bullet lines, "1. " numbered lines, "Label: value" list items and **bold**.
 * It builds React elements, never HTML strings, so buyer-typed text cannot inject markup.
 */

const BULLET = /^\s*(?:[-•*–]|\d+[.)])\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+/;
const LABEL = /^([^:：\n]{2,42})[:：]\s+(\S[\s\S]*)$/;

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? <strong key={i} className="font-medium">{part.slice(2, -2)}</strong> : <span key={i}>{part}</span>,
  );
}

type Block = { kind: "p"; lines: string[] } | { kind: "ul" | "ol"; items: string[] };

export function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  for (const chunk of text.replace(/\r/g, "").trim().split(/\n{2,}/)) {
    let current: Block | null = null;
    for (const line of chunk.split("\n")) {
      const m = line.match(BULLET);
      const kind: "ul" | "ol" | "p" = m ? (NUMBERED.test(line) ? "ol" : "ul") : "p";
      if (current && current.kind === kind) {
        if (current.kind === "p") current.lines.push(line.trim());
        else current.items.push(m![1].trim());
      } else {
        current = kind === "p" ? { kind: "p", lines: [line.trim()] } : { kind, items: [m![1].trim()] };
        blocks.push(current);
      }
    }
  }
  return blocks.filter((b) => (b.kind === "p" ? b.lines.some(Boolean) : b.items.length > 0));
}

export function FormattedText({ text, className }: { text: string; className?: string }) {
  const blocks = parseBlocks(text);
  return (
    <div className={clsx("space-y-3 [overflow-wrap:anywhere]", className)}>
      {blocks.map((b, i) => {
        if (b.kind === "p") {
          return <p key={i}>{b.lines.map((l, j) => <span key={j}>{j > 0 && <br />}{inline(l)}</span>)}</p>;
        }
        const List = b.kind === "ol" ? "ol" : "ul";
        return (
          <List key={i} className={clsx("space-y-1.5 pl-5 marker:text-stone", b.kind === "ol" ? "list-decimal" : "list-disc")}>
            {b.items.map((it, j) => {
              const m = it.match(LABEL);
              return <li key={j} className="pl-1">{m ? <><span className="font-medium">{m[1]}:</span> {inline(m[2])}</> : inline(it)}</li>;
            })}
          </List>
        );
      })}
    </div>
  );
}
