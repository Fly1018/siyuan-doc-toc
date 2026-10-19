import type { OutlineNode } from "./api";

export interface TocOptions {
    title: string;
    untitled: string;
    maxLevel: number;
}

export interface FlatHeading {
    id: string;
    name: string;
    depth: number;
}

const INDENT = "    ";

export function clampLevel(value: unknown, fallback = 6): number {
    const level = Math.round(Number(value));
    if (!Number.isFinite(level)) {
        return fallback;
    }
    return Math.min(6, Math.max(1, level));
}

export function clampSeconds(value: unknown, fallback = 2): number {
    const seconds = Math.round(Number(value));
    if (!Number.isFinite(seconds)) {
        return fallback;
    }
    return Math.min(10, Math.max(1, seconds));
}

export function headingDepth(node: OutlineNode, fallback: number): number {
    const fromSubType = Number(String(node.subType || "").replace(/^h/i, ""));
    if (Number.isFinite(fromSubType) && fromSubType >= 1 && fromSubType <= 6) {
        return fromSubType;
    }
    const depth = Number(node.depth);
    if (Number.isFinite(depth) && depth >= 1 && depth <= 6) {
        return depth;
    }
    return clampLevel(fallback);
}

const NAMED_ENTITIES: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: "\"",
    apos: "'",
    nbsp: " ",
    ensp: " ",
    emsp: " ",
    thinsp: " ",
    copy: "©",
    reg: "®",
    trade: "™",
    hellip: "…",
    mdash: "—",
    ndash: "–",
    lsquo: "‘",
    rsquo: "’",
    ldquo: "“",
    rdquo: "”",
};

/**
 * The outline API returns heading names as HTML (`nameIsHTML: true`) and
 * encodes spaces as `&nbsp;`. Decode them before using the name as a block
 * reference anchor, otherwise the TOC shows literal entity text.
 */
export function decodeHtmlEntities(text: string): string {
    return text.replace(/&(#x?[0-9a-f]+|[a-z][a-z0-9]+);/gi, (match, body: string) => {
        if (body[0] === "#") {
            const hex = body[1] === "x" || body[1] === "X";
            const code = Number.parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
            if (Number.isFinite(code) && code >= 0 && code <= 0x10ffff) {
                try {
                    return String.fromCodePoint(code);
                } catch (error) {
                    return match;
                }
            }
            return match;
        }
        const value = NAMED_ENTITIES[body.toLowerCase()];
        return value === undefined ? match : value;
    });
}

export function cleanInline(text: unknown, fallback: string): string {
    const source = String(text == null ? "" : text)
        .replace(/<\/?[a-zA-Z][^>]*>/g, " ");
    const cleaned = decodeHtmlEntities(source)
        .replace(/[\u0000-\u001f\u007f]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    return cleaned || fallback;
}

/** Escape the static anchor text of a SiYuan block reference. */
export function anchorText(text: unknown, fallback: string): string {
    return cleanInline(text, fallback)
        .replace(/"/g, "＂")
        .replace(/\)\)/g, ") )");
}

function buildList(
    nodes: OutlineNode[],
    indentLevel: number,
    fallbackDepth: number,
    options: TocOptions,
): string[] {
    const lines: string[] = [];
    for (const node of Array.isArray(nodes) ? nodes : []) {
        if (!node || !node.id) {
            continue;
        }
        const depth = headingDepth(node, fallbackDepth);
        if (depth > options.maxLevel) {
            continue;
        }
        const indent = INDENT.repeat(Math.min(indentLevel, 5));
        lines.push(`${indent}- ((${node.id} "${anchorText(node.name, options.untitled)}"))`);
        if (Array.isArray(node.children) && node.children.length > 0) {
            lines.push(...buildList(node.children, indentLevel + 1, depth + 1, options));
        }
    }
    return lines;
}

export function buildTocMarkdown(nodes: OutlineNode[], options: TocOptions): string {
    const title = cleanInline(options.title, "");
    const body = buildList(nodes, 0, 1, options).join("\n");
    return [title ? `- **${title}**` : "", body].filter(Boolean).join("\n");
}

export function flattenOutline(
    nodes: OutlineNode[],
    maxLevel = 6,
    fallbackDepth = 1,
): FlatHeading[] {
    const result: FlatHeading[] = [];
    const walk = (list: OutlineNode[], nextDepth: number) => {
        for (const node of Array.isArray(list) ? list : []) {
            if (!node || !node.id) {
                continue;
            }
            const depth = headingDepth(node, nextDepth);
            if (depth > maxLevel) {
                continue;
            }
            result.push({
                id: node.id,
                name: cleanInline(node.name, ""),
                depth,
            });
            walk(node.children || [], depth + 1);
        }
    };
    walk(nodes, fallbackDepth);
    return result;
}

export function signatureOf(nodes: OutlineNode[]): string {
    const parts: string[] = [];
    const walk = (list: OutlineNode[], nextDepth: number) => {
        for (const node of Array.isArray(list) ? list : []) {
            if (!node) {
                continue;
            }
            const depth = headingDepth(node, nextDepth);
            parts.push(`${depth}:${node.id || ""}:${node.name || ""}`);
            walk(node.children || [], depth + 1);
        }
    };
    walk(nodes, 1);
    return parts.join("\u0001");
}

export function signatureHash(input: string): string {
    let first = 0x811c9dc5;
    let second = 0x9e3779b9;
    for (let index = 0; index < input.length; index += 1) {
        const code = input.charCodeAt(index);
        first ^= code;
        first = Math.imul(first, 0x01000193);
        second ^= code + index;
        second = Math.imul(second, 0x85ebca6b);
    }
    return (first >>> 0).toString(16).padStart(8, "0") +
        (second >>> 0).toString(16).padStart(8, "0");
}

export function tocSignature(nodes: OutlineNode[], options: TocOptions): string {
    return signatureHash(`${signatureOf(nodes)}\u0002${options.title}\u0002${options.maxLevel}`);
}
