<script lang="ts">
    interface Heading {
        id: string;
        name: string;
        depth: number;
    }

    interface Props {
        labels: Record<string, string>;
        docTitle?: string;
        headings?: Heading[];
        hasToc?: boolean;
        onGenerate?: () => void | Promise<void>;
        onClose?: () => void;
    }

    let {
        labels,
        docTitle = "",
        headings = [],
        hasToc = false,
        onGenerate,
        onClose,
    }: Props = $props();

    let generating = $state(false);

    const visible = $derived(headings.slice(0, 12));
    const minDepth = $derived(headings.length > 0 ? Math.min(...headings.map((item) => item.depth || 1)) : 1);
    const countLabel = $derived(labels.headingCount.replace("{count}", String(headings.length)));

    async function generate() {
        generating = true;
        try {
            await onGenerate?.();
        } finally {
            generating = false;
        }
    }
</script>

<div class="doc-toc-dialog">
    <div class="doc-toc-dialog__document">
        <span class="doc-toc-dialog__label">{labels.document}</span>
        <span class="doc-toc-dialog__title" title={docTitle}>{docTitle || labels.untitledDoc}</span>
    </div>

    {#if headings.length === 0}
        <div class="doc-toc-dialog__empty">{labels.noHeadings}</div>
    {:else}
        <div class="doc-toc-dialog__count">{countLabel}</div>
        <ul class="doc-toc-dialog__list">
            {#each visible as heading (heading.id)}
                <li
                    class="doc-toc-dialog__item"
                    style={`padding-left: ${Math.max(0, (heading.depth || 1) - minDepth) * 14}px`}
                >
                    <span class="doc-toc-dialog__level">H{heading.depth || 1}</span>
                    <span class="doc-toc-dialog__name">{heading.name}</span>
                </li>
            {/each}
        </ul>
        {#if headings.length > visible.length}
            <div class="doc-toc-dialog__more">
                {labels.more.replace("{count}", String(headings.length - visible.length))}
            </div>
        {/if}
    {/if}

    <div class="doc-toc-dialog__hint">{labels.hint}</div>

    <div class="doc-toc-dialog__actions">
        <button
            class="b3-button b3-button--text"
            type="button"
            onclick={generate}
            disabled={generating || headings.length === 0}
        >
            {generating ? labels.working : hasToc ? labels.refresh : labels.create}
        </button>
        <button class="b3-button" type="button" onclick={() => onClose?.()}>
            {labels.close}
        </button>
    </div>
</div>

<style>
    .doc-toc-dialog {
        display: flex;
        flex-direction: column;
        gap: 12px;
        height: 100%;
        min-height: 0;
        box-sizing: border-box;
        padding: 16px;
        color: var(--b3-theme-on-background);
    }

    .doc-toc-dialog__document {
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding-bottom: 10px;
        border-bottom: 1px solid var(--b3-border-color);
    }

    .doc-toc-dialog__label {
        color: var(--b3-theme-on-surface);
        font-size: 12px;
    }

    .doc-toc-dialog__title {
        overflow: hidden;
        font-size: 15px;
        font-weight: 600;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .doc-toc-dialog__count {
        color: var(--b3-theme-on-surface);
        font-size: 12px;
    }

    .doc-toc-dialog__list {
        flex: 1;
        min-height: 0;
        margin: 0;
        padding: 0;
        overflow: auto;
        list-style: none;
    }

    .doc-toc-dialog__item {
        display: flex;
        align-items: baseline;
        gap: 8px;
        padding-top: 5px;
        padding-bottom: 5px;
        border-bottom: 1px dashed var(--b3-border-color);
        line-height: 1.5;
    }

    .doc-toc-dialog__item:last-child {
        border-bottom: 0;
    }

    .doc-toc-dialog__level {
        flex: none;
        min-width: 22px;
        color: var(--b3-theme-primary);
        font-size: 11px;
        font-weight: 600;
    }

    .doc-toc-dialog__name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .doc-toc-dialog__more,
    .doc-toc-dialog__empty {
        color: var(--b3-theme-on-surface);
        font-size: 12px;
    }

    .doc-toc-dialog__empty {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 1px dashed var(--b3-border-color);
        border-radius: 6px;
        padding: 24px;
        text-align: center;
    }

    .doc-toc-dialog__hint {
        padding: 8px 10px;
        border-radius: 6px;
        background: var(--b3-theme-surface);
        color: var(--b3-theme-on-surface);
        font-size: 12px;
        line-height: 1.6;
    }

    .doc-toc-dialog__actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
    }
</style>
