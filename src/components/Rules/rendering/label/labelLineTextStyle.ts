export type LineTextStyle = {
  className: string;
  fontSize: number;
  fontWeight: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
};

export function escapeHtml(s: string): string {
  return String(s ?? "").replace(
    /[&<>'"]/g,
    (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        ch
      ] ?? ch,
  );
}

export function parseStyleKey(styleKey: any): {
  key: string;
  color?: string;
  rotateDeg?: number;
} {
  if (styleKey && typeof styleKey === "object") {
    return {
      key: String(styleKey.key ?? ""),
      color: typeof styleKey.color === "string" ? styleKey.color : undefined,
      rotateDeg: Number.isFinite(Number(styleKey.rotateDeg))
        ? Number(styleKey.rotateDeg)
        : undefined,
    };
  }
  return { key: typeof styleKey === "string" ? styleKey : "" };
}

function sizeSuffix(key: string, prefix: string, fallback: number): number {
  if (!key.startsWith(prefix)) return fallback;
  const n = Number(key.slice(prefix.length));
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function lineTextStyleFromStyleKey(styleKey: any): LineTextStyle {
  const parsed = parseStyleKey(styleKey);
  const key = parsed.key;

  if (key.startsWith("gm-wtb-")) {
    const fontSize = sizeSuffix(key, "gm-wtb-", 15);
    return {
      className: "ria-line-textpath ria-line-textpath--water",
      fontSize,
      fontWeight: 700,
      fill: "#dbeafe",
      stroke: "#1d4ed8",
      strokeWidth: Math.max(2.2, Math.round(fontSize * 0.22 * 10) / 10),
    };
  }

  if (key.startsWith("rle-line-")) {
    const fontSize = sizeSuffix(key, "rle-line-", 13);
    return {
      className: "ria-line-textpath ria-line-textpath--rail",
      fontSize,
      fontWeight: 700,
      fill: parsed.color || "#2563eb",
      stroke: "#ffffff",
      strokeWidth: Math.max(2.2, Math.round(fontSize * 0.22 * 10) / 10),
    };
  }

  if (key.startsWith("gm-bw-")) {
    const fontSize = sizeSuffix(key, "gm-bw-", 15);
    return {
      className: "ria-line-textpath ria-line-textpath--network",
      fontSize,
      fontWeight: 700,
      fill: "#ffffff",
      stroke: "#000000",
      strokeWidth: Math.max(2.2, Math.round(fontSize * 0.22 * 10) / 10),
    };
  }

  if (key === "gm-outline" || key === "gm-outline-bold" || /^gm-outline-(?:bold-)?\d+(?:\.\d+)?$/.test(key)) {
    const match = key.match(/^gm-outline-(bold-)?(\d+(?:\.\d+)?)$/);
    const fontSize = match ? Number(match[2]) : 17;
    const bold = key === "gm-outline-bold" || Boolean(match?.[1]);
    return {
      className: "ria-line-textpath ria-line-textpath--network",
      fontSize,
      fontWeight: bold ? 800 : 700,
      fill: "#111827",
      stroke: "#ffffff",
      strokeWidth: Math.max(2.2, Math.round(fontSize * 0.22 * 10) / 10),
    };
  }

  return {
    className: "ria-line-textpath ria-line-textpath--network",
    fontSize: 12,
    fontWeight: 700,
    fill: "#ffffff",
    stroke: "#000000",
    strokeWidth: 2.6,
  };
}
