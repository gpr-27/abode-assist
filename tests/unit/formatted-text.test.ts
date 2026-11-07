import { describe, expect, it } from "vitest";
import { parseBlocks } from "@/components/formatted-text";

describe("parseBlocks", () => {
  it("turns hyphen lines into one list and keeps the intro and the question as paragraphs", () => {
    const text = "Project 1 has these 3 BHK details:\n\n- Carpet area: approx. 1,010 sq ft\n- Possession: December 2027\n\nWould you like to visit?";
    const blocks = parseBlocks(text);
    expect(blocks.map((b) => b.kind)).toEqual(["p", "ul", "p"]);
    expect(blocks[1]).toEqual({ kind: "ul", items: ["Carpet area: approx. 1,010 sq ft", "Possession: December 2027"] });
  });

  it("handles a list that directly follows a sentence without a blank line", () => {
    const blocks = parseBlocks("Here are the facts:\n- One\n- Two");
    expect(blocks.map((b) => b.kind)).toEqual(["p", "ul"]);
  });

  it("recognises numbered lists and other bullet characters", () => {
    expect(parseBlocks("1. First\n2. Second")[0]).toEqual({ kind: "ol", items: ["First", "Second"] });
    expect(parseBlocks("• A\n• B")[0]).toEqual({ kind: "ul", items: ["A", "B"] });
  });

  it("keeps single line breaks inside a paragraph and ignores extra blank lines", () => {
    const blocks = parseBlocks("\n\nLine one\nLine two\n\n\n\nNext");
    expect(blocks).toEqual([{ kind: "p", lines: ["Line one", "Line two"] }, { kind: "p", lines: ["Next"] }]);
  });

  it("does not treat times or prices as list markers", () => {
    expect(parseBlocks("Sun, 8 Nov, 3:00 pm works.")[0].kind).toBe("p");
    expect(parseBlocks("2 BHK from ₹68 lakh")[0].kind).toBe("p");
  });

  it("leaves markup in buyer text as plain text (rendered by React, never as HTML)", () => {
    const blocks = parseBlocks("<img src=x onerror=alert(1)>");
    expect(blocks).toEqual([{ kind: "p", lines: ["<img src=x onerror=alert(1)>"] }]);
  });

  it("returns nothing for empty text", () => {
    expect(parseBlocks("  \n\n ")).toEqual([]);
  });
});
