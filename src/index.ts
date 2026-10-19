import {
    Plugin,
    showMessage,
    getActiveEditor,
} from "siyuan";
import type { IProtyle } from "siyuan";

import TocDialog from "@/components/TocDialog.svelte";
import { SettingUtils } from "@/libs/setting-utils";
import { svelteDialog } from "@/libs/dialog";
import {
    ATTR_MARK,
    ATTR_SIGNATURE,
    ATTR_SOURCE,
    deleteBlock,
    findTocRows,
    getBlockAttrs,
    getBlockKramdown,
    getChildBlocks,
    getDocTitle,
    getOutline,
    prependBlock,
    setBlockAttrs,
    updateBlockMarkdown,
    type BlockRow,
} from "@/api";
import {
    buildTocMarkdown,
    clampLevel,
    clampSeconds,
    cleanInline,
    flattenOutline,
    tocSignature,
} from "@/toc";
import "./index.scss";

const STORAGE_NAME = "settings";
const LEGACY_DEBOUNCE_KEY = "debounceMs";
const WRITE_SUPPRESS_MS = 2500;
const RELEASE_SUPPRESS_MS = 1500;

interface TocOptions {
    title: string;
    untitled: string;
    maxLevel: number;
}

export default class DocTocPlugin extends Plugin {
    private settingUtils: SettingUtils;
    private alive = true;
    private busy = false;
    private timer: ReturnType<typeof setTimeout> | null = null;
    private suppressUntil = 0;
    private lastProtyle: IProtyle | null = null;
    private dialog: ReturnType<typeof svelteDialog> | undefined;
    private dialogToken = 0;

    private readonly onProtyle = (event: any) => {
        const protyle = event && event.detail ? event.detail.protyle : null;
        if (protyle && protyle.block) {
            this.lastProtyle = protyle;
        }
    };

    private readonly onDestroyProtyle = (event: any) => {
        const protyle = event && event.detail ? event.detail.protyle : null;
        if (protyle && this.lastProtyle === protyle) {
            this.lastProtyle = null;
        }
    };

    private readonly onWs = (event: any) => {
        if (!this.alive || !this.autoUpdate || Date.now() < this.suppressUntil) {
            return;
        }
        const detail = event && event.detail;
        if (!detail || detail.cmd !== "transactions") {
            return;
        }
        this.scheduleAutoRefresh();
    };

    async onload() {
        this.alive = true;
        this.settingUtils = new SettingUtils({
            plugin: this,
            name: STORAGE_NAME,
            callback: () => {
                this.onSettingsSaved();
            },
        });
        this.addSettingItems();

        let loaded: any = null;
        try {
            loaded = await this.settingUtils.load();
        } catch (error) {
            console.warn("[siyuan-doc-toc] load settings failed", error);
        }
        await this.migrateLegacySettings(loaded);

        this.eventBus.on("switch-protyle", this.onProtyle);
        this.eventBus.on("loaded-protyle-static", this.onProtyle);
        this.eventBus.on("destroy-protyle", this.onDestroyProtyle);
        this.eventBus.on("ws-main", this.onWs);

        this.addTopBar({
            icon: "iconList",
            title: this.text("topBarTip"),
            position: "right",
            callback: () => {
                void this.generate();
            },
        });
        this.addCommand({
            langKey: "openDialog",
            hotkey: "",
            callback: () => {
                void this.openDialog();
            },
        });
    }

    onunload() {
        this.alive = false;
        this.clearTimer();
        this.eventBus.off("switch-protyle", this.onProtyle);
        this.eventBus.off("loaded-protyle-static", this.onProtyle);
        this.eventBus.off("destroy-protyle", this.onDestroyProtyle);
        this.eventBus.off("ws-main", this.onWs);
        this.lastProtyle = null;
        this.dialogToken += 1;
        this.dialog?.close();
        this.dialog = undefined;
    }

    private text(key: string): string {
        const value = (this.i18n as Record<string, unknown>)[key];
        return typeof value === "string" && value ? value : key;
    }

    private levelOptions(): Record<string, string> {
        const options: Record<string, string> = {};
        for (let level = 1; level <= 6; level += 1) {
            options[String(level)] = level === 1 ? "H1" : `H1–H${level}`;
        }
        return options;
    }

    private addSettingItems() {
        this.settingUtils.addItem({
            key: "autoUpdate",
            value: false,
            type: "checkbox",
            title: this.text("settingAutoUpdate"),
            description: this.text("settingAutoUpdateDesc"),
            action: {
                callback: () => {
                    void this.settingUtils.takeAndSave("autoUpdate");
                    if (!this.autoUpdate) {
                        this.clearTimer();
                    }
                },
            },
        });
        this.settingUtils.addItem({
            key: "debounceSeconds",
            value: 2,
            type: "number",
            title: this.text("settingDebounce"),
            description: this.text("settingDebounceDesc"),
            number: { min: 1, max: 10, step: 1 },
            action: {
                callback: () => {
                    void this.settingUtils.takeAndSave("debounceSeconds");
                },
            },
        });
        this.settingUtils.addItem({
            key: "tocTitle",
            value: "",
            type: "textinput",
            title: this.text("settingTitle"),
            description: this.text("settingTitleDesc"),
            placeholder: this.text("tocTitle"),
            action: {
                callback: () => {
                    void this.settingUtils.takeAndSave("tocTitle");
                },
            },
        });
        this.settingUtils.addItem({
            key: "maxLevel",
            value: "6",
            type: "select",
            title: this.text("settingMaxLevel"),
            description: this.text("settingMaxLevelDesc"),
            options: this.levelOptions(),
            action: {
                callback: () => {
                    void this.settingUtils.takeAndSave("maxLevel");
                },
            },
        });
    }

    private async migrateLegacySettings(loaded: any) {
        if (!loaded || typeof loaded !== "object") {
            return;
        }
        const legacy = Number(loaded[LEGACY_DEBOUNCE_KEY]);
        if (Number.isFinite(legacy) && legacy > 0 && loaded.debounceSeconds == null) {
            this.settingUtils.set("debounceSeconds", clampSeconds(legacy / 1000));
            try {
                await this.settingUtils.save();
            } catch (error) {
                console.warn("[siyuan-doc-toc] migrate settings failed", error);
            }
        }
    }

    private get autoUpdate(): boolean {
        return !!this.settingUtils?.get("autoUpdate");
    }

    private get debounceMs(): number {
        return clampSeconds(this.settingUtils?.get("debounceSeconds")) * 1000;
    }

    private get maxLevel(): number {
        return clampLevel(this.settingUtils?.get("maxLevel"));
    }

    private get configuredTitle(): string {
        return String(this.settingUtils?.get("tocTitle") || "").trim();
    }

    private get tocTitle(): string {
        return cleanInline(this.configuredTitle, this.text("tocTitle"));
    }

    private tocOptions(): TocOptions {
        return {
            title: this.tocTitle,
            untitled: this.text("untitled"),
            maxLevel: this.maxLevel,
        };
    }

    private currentProtyle(): IProtyle | null {
        try {
            const editor = getActiveEditor();
            if (editor && editor.protyle && editor.protyle.block) {
                return editor.protyle;
            }
        } catch (error) {
            // Fall back to the last editor event below.
        }
        return this.lastProtyle;
    }

    private currentRootID(): string {
        const protyle = this.currentProtyle();
        return protyle && protyle.block ? protyle.block.rootID || "" : "";
    }

    private scheduleAutoRefresh() {
        if (!this.alive) {
            return;
        }
        this.clearTimer();
        this.timer = setTimeout(() => {
            this.timer = null;
            void this.autoRefresh();
        }, this.debounceMs);
    }

    private clearTimer() {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }

    private onSettingsSaved() {
        this.clearTimer();
        const rootID = this.currentRootID();
        if (!rootID || this.busy) {
            return;
        }
        setTimeout(() => {
            if (!this.alive || this.busy) {
                return;
            }
            this.busy = true;
            this.refresh(rootID, true)
                .catch((error) => console.warn("[siyuan-doc-toc] refresh after settings failed", error))
                .finally(() => {
                    this.busy = false;
                });
        }, 50);
    }

    private async autoRefresh() {
        if (!this.alive || this.busy || !this.autoUpdate || Date.now() < this.suppressUntil) {
            return;
        }
        if (typeof document !== "undefined" && typeof document.hasFocus === "function" && !document.hasFocus()) {
            return;
        }
        const rootID = this.currentRootID();
        if (!rootID) {
            return;
        }
        this.busy = true;
        try {
            await this.refresh(rootID, true);
        } catch (error) {
            console.warn("[siyuan-doc-toc] auto refresh failed", error);
        } finally {
            this.busy = false;
        }
    }

    async generate() {
        if (this.busy) {
            showMessage(this.text("busy"), 2000, "info");
            return;
        }
        const rootID = this.currentRootID();
        if (!rootID) {
            showMessage(this.text("noDocument"), 4000, "error");
            return;
        }
        this.busy = true;
        try {
            await this.refresh(rootID, false);
        } catch (error) {
            console.error("[siyuan-doc-toc]", error);
            const message = error && error.message ? error.message : String(error);
            showMessage(`${this.text("failed")}: ${message}`, 6000, "error");
        } finally {
            this.busy = false;
        }
    }

    private async refresh(rootID: string, silent: boolean) {
        const outline = await getOutline(rootID);
        if (!this.alive) {
            return;
        }
        if (outline.length === 0) {
            if (!silent) {
                showMessage(this.text("noHeadings"), 4000, "info");
            }
            return;
        }

        const options = this.tocOptions();
        const markdown = buildTocMarkdown(outline, options);
        const signature = tocSignature(outline, options);
        const rows = await findTocRows(rootID);
        if (!this.alive) {
            return;
        }
        const kept = rows.find((row) => row.type === "l");

        if (silent) {
            if (!kept) {
                return;
            }
            const attrs = await getBlockAttrs(kept.id);
            if (attrs[ATTR_SIGNATURE] === signature) {
                return;
            }
            if (this.cursorInside(kept.id)) {
                return;
            }
        }

        this.suppressUntil = Date.now() + WRITE_SUPPRESS_MS;

        if (kept) {
            try {
                await updateBlockMarkdown(kept.id, markdown);
                if (!this.alive) {
                    return;
                }
                await this.removeDuplicates(rows, kept.id);
                if (!this.alive) {
                    return;
                }
                await this.markToc(kept.id, rootID, signature);
                this.suppressUntil = Date.now() + RELEASE_SUPPRESS_MS;
                if (!silent) {
                    showMessage(this.text("done"), 3000, "info");
                }
                return;
            } catch (error) {
                console.warn("[siyuan-doc-toc] in-place update failed, recreating", error);
            }
        }

        await this.removeDuplicates(rows, "", true);
        if (!this.alive) {
            return;
        }
        const newID = await this.insertToc(rootID, markdown);
        if (!this.alive) {
            return;
        }
        try {
            await this.markToc(newID, rootID, signature);
        } catch (error) {
            await deleteBlock(newID).catch(() => undefined);
            throw error;
        }
        this.suppressUntil = Date.now() + RELEASE_SUPPRESS_MS;
        if (!silent) {
            showMessage(this.text("done"), 3000, "info");
        }
    }

    private async removeDuplicates(rows: BlockRow[], keepID: string, strict = false) {
        for (const row of rows) {
            if (row.id === keepID) {
                continue;
            }
            try {
                await deleteBlock(row.id);
            } catch (error) {
                if (strict) {
                    throw error;
                }
                console.warn("[siyuan-doc-toc] remove duplicate TOC failed", row.id, error);
            }
            if (!this.alive) {
                return;
            }
        }
    }

    private async insertToc(rootID: string, markdown: string): Promise<string> {
        await prependBlock(rootID, markdown);
        const children = await getChildBlocks(rootID);
        const first = children[0];
        if (!first || first.type !== "l") {
            throw new Error(this.text("markFailed"));
        }
        const kramdown = await getBlockKramdown(first.id);
        if (!kramdown.includes(this.tocTitle)) {
            throw new Error(this.text("markFailed"));
        }
        return first.id;
    }

    private async markToc(id: string, rootID: string, signature: string) {
        const attrs = {
            [ATTR_MARK]: "true",
            [ATTR_SOURCE]: rootID,
            [ATTR_SIGNATURE]: signature,
        };
        // A freshly inserted or updated block may still have a pending
        // transaction; verify the write and retry instead of assuming success.
        for (let attempt = 0; attempt < 3; attempt += 1) {
            await setBlockAttrs(id, attrs);
            const current = await getBlockAttrs(id);
            if (current[ATTR_MARK] === "true" &&
                current[ATTR_SOURCE] === rootID &&
                current[ATTR_SIGNATURE] === signature) {
                return;
            }
            await new Promise((resolve) => setTimeout(resolve, 120 * (attempt + 1)));
        }
        throw new Error(this.text("markFailed"));
    }

    private cursorInside(blockID: string): boolean {
        try {
            const selection = window.getSelection();
            if (!selection || selection.rangeCount === 0 || !selection.anchorNode) {
                return false;
            }
            let node: Node | null = selection.anchorNode;
            if (node.nodeType === Node.TEXT_NODE) {
                node = node.parentElement;
            }
            if (!node || !(node as Element).closest) {
                return false;
            }
            return !!(node as Element).closest(`[data-node-id="${blockID}"]`);
        } catch (error) {
            return false;
        }
    }

    private async openDialog() {
        const rootID = this.currentRootID();
        if (!rootID) {
            showMessage(this.text("noDocument"), 4000, "error");
            return;
        }
        try {
            const [outline, rows, docTitle] = await Promise.all([
                getOutline(rootID),
                findTocRows(rootID),
                getDocTitle(rootID),
            ]);
            if (!this.alive) {
                return;
            }
            const token = ++this.dialogToken;
            const previous = this.dialog;
            this.dialog = undefined;
            previous?.close();

            let handle: ReturnType<typeof svelteDialog>;
            handle = svelteDialog({
                title: this.text("panelTitle"),
                component: TocDialog,
                width: "560px",
                height: "540px",
                props: {
                    labels: {
                        document: this.text("dialogDocument"),
                        headingCount: this.text("dialogHeadingCount"),
                        noHeadings: this.text("dialogNoHeadings"),
                        create: this.text("dialogCreate"),
                        refresh: this.text("dialogRefresh"),
                        working: this.text("dialogWorking"),
                        close: this.text("dialogClose"),
                        more: this.text("dialogMore"),
                        hint: this.text("dialogHint"),
                        untitledDoc: this.text("untitledDoc"),
                    },
                    docTitle,
                    headings: flattenOutline(outline, 6),
                    hasToc: rows.some((row) => row.type === "l"),
                    onGenerate: async () => {
                        await this.generate();
                    },
                    onClose: () => {
                        handle.close();
                    },
                },
                callback: () => {
                    if (this.dialogToken === token && this.dialog === handle) {
                        this.dialog = undefined;
                    }
                },
            });
            this.dialog = handle;
        } catch (error) {
            console.error("[siyuan-doc-toc]", error);
            const message = error && error.message ? error.message : String(error);
            showMessage(`${this.text("failed")}: ${message}`, 6000, "error");
        }
    }
}
