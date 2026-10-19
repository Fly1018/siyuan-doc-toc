import { fetchSyncPost } from "siyuan";

export interface OutlineNode {
    id: string;
    name: string;
    depth?: number;
    subType?: string;
    children?: OutlineNode[];
}

export interface BlockRow {
    id: string;
    type?: string;
    ial?: string;
    content?: string;
}

interface KernelResponse<T> {
    code: number;
    msg?: string;
    data?: T;
}

export interface InsertedBlock {
    id: string;
    type?: string;
}

export const ATTR_MARK = "custom-toc-generator";
export const ATTR_SOURCE = "custom-toc-source";
export const ATTR_SIGNATURE = "custom-toc-signature";

export async function api<T>(url: string, payload: Record<string, unknown> = {}): Promise<T> {
    const response = (await fetchSyncPost(url, payload)) as KernelResponse<T>;
    if (!response || typeof response.code !== "number") {
        throw new Error(`Invalid response from ${url}`);
    }
    if (response.code !== 0) {
        throw new Error(`${response.msg || "Kernel error"} (${url})`);
    }
    return response.data as T;
}

/** Block and document IDs are only used inside SQL strings, so keep them strictly alphanumeric. */
export function safeRootID(rootID: string): string {
    if (!rootID || !/^[0-9a-z-]{1,64}$/i.test(rootID)) {
        throw new Error("Invalid document ID");
    }
    return rootID;
}

export async function getOutline(rootID: string): Promise<OutlineNode[]> {
    const data = await api<OutlineNode[]>("/api/outline/getDocOutline", { id: safeRootID(rootID) });
    return Array.isArray(data) ? data : [];
}

export async function getDocTitle(rootID: string): Promise<string> {
    const rows = await api<BlockRow[]>("/api/query/sql", {
        stmt: `SELECT content FROM blocks WHERE id = '${safeRootID(rootID)}' AND type = 'd' LIMIT 1`,
    });
    return rows && rows[0] ? String(rows[0].content || "") : "";
}

export async function findTocRows(rootID: string): Promise<BlockRow[]> {
    const stmt = `SELECT id, type, ial FROM blocks WHERE root_id = '${safeRootID(rootID)}' ` +
        `AND ial LIKE '%${ATTR_MARK}=%' ORDER BY sort ASC LIMIT 20`;
    const rows = await api<BlockRow[]>("/api/query/sql", { stmt });
    const result = Array.isArray(rows) ? rows.filter((row) => row && row.id) : [];
    if (result.some((row) => row.type === "l")) {
        return result;
    }

    // The SQL index can lag right after a write. Our TOC is prepended, so
    // check the first few top-level list blocks directly as a fallback.
    const children = await getChildBlocks(rootID);
    for (const child of children.slice(0, 10)) {
        if (!child || child.type !== "l") {
            continue;
        }
        const attrs = await getBlockAttrs(child.id);
        if (attrs[ATTR_MARK] === "true") {
            result.push({ id: child.id, type: "l" });
            break;
        }
    }
    return result;
}

export async function getChildBlocks(id: string): Promise<InsertedBlock[]> {
    const data = await api<InsertedBlock[]>("/api/block/getChildBlocks", { id });
    return Array.isArray(data) ? data : [];
}

export async function getBlockKramdown(id: string): Promise<string> {
    const data = await api<{ kramdown?: string }>("/api/block/getBlockKramdown", { id });
    return data && typeof data.kramdown === "string" ? data.kramdown : "";
}

export async function updateBlockMarkdown(id: string, markdown: string): Promise<void> {
    await api("/api/block/updateBlock", {
        id,
        dataType: "markdown",
        data: markdown,
    });
}

export async function deleteBlock(id: string): Promise<void> {
    await api("/api/block/deleteBlock", { id });
}

export async function prependBlock(rootID: string, markdown: string): Promise<void> {
    await api("/api/block/prependBlock", {
        parentID: safeRootID(rootID),
        dataType: "markdown",
        data: markdown,
    });
}

export async function setBlockAttrs(id: string, attrs: Record<string, string>): Promise<void> {
    await api("/api/attr/setBlockAttrs", { id, attrs });
}

export async function getBlockAttrs(id: string): Promise<Record<string, string>> {
    const data = await api<Record<string, string>>("/api/attr/getBlockAttrs", { id });
    return data && typeof data === "object" ? data : {};
}
