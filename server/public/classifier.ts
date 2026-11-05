// The "Check classifier" dialog (openClassifier) and the CFMRes download (downloadCFMRes), shared by the pages.
(() => {
    const css = `
.clf { width: min(720px, calc(100vw - 32px)); max-height: calc(100vh - 48px); padding: 0; border: 0;
    border-radius: 22px; background: var(--sheet); color: var(--ink); box-shadow: 0 30px 80px rgba(0, 0, 0, .35); }
.clf::backdrop { background: rgba(0, 0, 0, .35); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); }
.clf-inner { padding: 28px; display: grid; gap: 20px; }
.clf-head { display: flex; justify-content: space-between; align-items: start; gap: 16px; }
.clf-head h2 { margin: 0; font: 700 24px/1.15 var(--display); letter-spacing: -0.02em; }
.clf-head p { margin: 4px 0 0; color: var(--muted); font-size: 14px; word-break: break-word; }
.clf-close { font-size: 18px; line-height: 1; width: 30px; height: 30px; border: 0; border-radius: 50%;
    background: var(--fill); color: var(--muted); cursor: pointer; flex: none; }
.clf-close:hover { color: var(--ink); }
.clf form { display: grid; gap: 10px; }
.clf textarea { font: 14px/1.5 var(--mono); color: var(--ink); background: var(--paper);
    border: 1px solid transparent; border-radius: 14px; padding: 12px 14px; resize: vertical; min-height: 92px; width: 100%; }
.clf-actions { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.clf-actions span { font-size: 13px; color: var(--muted); }
.clf-actions button { font-weight: 500; border: 0; border-radius: 980px; padding: 10px 22px;
    background: var(--ledger); color: #fff; cursor: pointer; }
.clf-actions button:hover:not(:disabled) { background: var(--ledger-hover); }
.clf-actions button:disabled { opacity: .5; cursor: wait; }
.clf-actions label { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--muted); }
.clf-actions input { width: 68px; font-size: 14px; color: var(--ink); background: var(--paper); border: 1px solid transparent;
    border-radius: 10px; padding: 7px 10px; text-align: right; }
.clf-result { border-top: 1px solid var(--rule); padding-top: 20px; display: grid; gap: 20px; }
.clf-result:empty { display: none; }
.clf-verdict { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
.clf-labels { display: flex; flex-wrap: wrap; gap: 8px; flex: 1; }
.clf-labels span { background: var(--ledger); color: #fff; padding: 6px 16px; border-radius: 980px; font-weight: 500; }
.clf-labels .clf-none { background: none; color: var(--stamp); padding: 0; font-weight: 600; }
.clf-score { font: 700 40px/1 var(--display); letter-spacing: -0.03em; font-variant-numeric: tabular-nums; }
.clf-score small { font-size: 15px; font-weight: 400; letter-spacing: 0; color: var(--muted); margin-left: 4px; }
.clf h3 { margin: 0 0 10px; font: 600 12px/1 var(--font); text-transform: uppercase; letter-spacing: .04em; color: var(--muted); }
.clf-tiers { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
.clf-tiers div { background: var(--paper); border-radius: 14px; padding: 12px 14px; font-size: 13px; color: var(--muted); }
.clf-tiers b { display: block; font: 600 22px/1.2 var(--display); color: var(--ink); font-variant-numeric: tabular-nums; }
.clf-tiers .used { background: var(--ledger-soft); box-shadow: inset 0 0 0 2px var(--ledger); }
.clf-matches { list-style: none; margin: 0; padding: 0 16px; background: var(--paper); border-radius: 14px; }
.clf-matches li { display: grid; grid-template-columns: 64px 1fr; gap: 4px 12px; padding: 12px 0; border-bottom: 1px solid var(--rule); font-size: 13px; }
.clf-matches li:last-child { border-bottom: 0; }
.clf-matches .s { font-weight: 700; font-size: 16px; font-variant-numeric: tabular-nums; }
.clf-matches .l { font-weight: 600; color: var(--ledger); }
.clf-matches .p { grid-column: 2; color: var(--muted); font: 12px/1.5 var(--mono); word-break: break-word; }
.clf-pattern { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; padding: 0; list-style: none; }
.clf-pattern li { font: 500 13px/1.2 var(--mono); padding: 7px 11px; background: var(--paper); border-radius: 10px; }
.clf-pattern .none { font-family: var(--font); color: var(--muted); }
.clf table { width: 100%; border-collapse: collapse; font-size: 14px; }
.clf td { padding: 9px 0; border-bottom: 1px solid var(--rule); vertical-align: top; }
.clf tr:last-child td { border-bottom: 0; }
.clf td:first-child { color: var(--muted); width: 40%; padding-right: 12px; }
.clf td:last-child { font-family: var(--mono); word-break: break-all; }
.clf-error { color: var(--stamp); font-size: 14px; margin: 0; }
@media (max-width: 520px) { .clf-inner { padding: 20px 18px; } .clf-tiers { grid-template-columns: 1fr; } .clf { border-radius: 18px; } }`;

    const escape = (s: unknown) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
    const slot = (p: string) => p.replace(/[<>]/g, '').toLowerCase().replace(/_/g, ' ');
    let dialog: HTMLDialogElement, projectId: string;
    const el = <T extends HTMLElement>(selector: string) => dialog.querySelector(selector) as T;

    function build() {
        const style = document.createElement('style');
        style.textContent = css;
        document.head.appendChild(style);
        dialog = document.createElement('dialog');
        dialog.className = 'clf';
        dialog.setAttribute('aria-labelledby', 'clfTitle');
        dialog.innerHTML = `<div class="clf-inner">
            <div class="clf-head"><div><h2 id="clfTitle">Check classifier</h2><p id="clfProject"></p></div>
                <button class="clf-close" type="button" aria-label="Close">×</button></div>
            <form id="clfForm">
                <textarea id="clfMessage" placeholder="Paste a sample message" aria-label="Sample message" required></textarea>
                <div class="clf-actions"><label>Threshold <input id="clfThreshold" type="number" min="0" max="100" step="1" placeholder="70" aria-label="Threshold in percent"> %</label>
                    <span>Ctrl + Enter checks it</span><button type="submit" id="clfRun">Check message</button></div>
            </form>
            <div class="clf-result" id="clfResult" aria-live="polite"></div>
        </div>`;
        document.body.appendChild(dialog);
        el<HTMLElement>('.clf-close').addEventListener('click', () => dialog.close());
        dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
        el<HTMLFormElement>('#clfForm').addEventListener('submit', e => { e.preventDefault(); check(); });
        el<HTMLTextAreaElement>('#clfMessage').addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); check(); }
        });
    }

    // The typed threshold, or none so the server uses its default (config.ts CLASSIFY).
    const threshold = () => {
        const value = el<HTMLInputElement>('#clfThreshold').value;
        return value === '' ? {} : { threshold: Number(value) };
    };

    async function check() {
        const message = el<HTMLTextAreaElement>('#clfMessage').value.trim();
        const out = el<HTMLElement>('#clfResult');
        if (!message) return;
        const run = el<HTMLButtonElement>('#clfRun');
        run.disabled = true;
        try {
            const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/classify`, { method: 'POST', body: JSON.stringify({ message, ...threshold() }) });
            const body = await res.json();
            if (!res.ok) throw new Error(body.error);
            out.innerHTML = render(body);
        } catch (err) {
            out.innerHTML = `<p class="clf-error">Could not check this message: ${escape((err as Error).message)}.</p>`;
        } finally {
            run.disabled = false;
        }
    }

    function render(r: ClassifyResult): string {
        const chips = (labels: string[]) => labels.map(x => `<span>${escape(x)}</span>`).join('');
        const verdict = r.matched
            ? `<div class="clf-labels">${chips(r.labels)}</div>`
            : `<div class="clf-labels"><span class="clf-none">No pattern matched at ${r.threshold}% or more</span></div>`;
        const tier = (name: string, n: number | null, used: boolean) => `<div class="${used ? 'used' : ''}">${name}<b>${n === null ? 'not checked' : `${n} ${n === 1 ? 'pattern' : 'patterns'}`}</b></div>`;
        const pattern = (list: string[]) => list.length ? list.map(p => escape(slot(p))).join(' · ') : 'no values, only words';
        return `<div class="clf-verdict">${verdict}<div class="clf-score">${r.score}%<small>${r.matched ? 'best match' : 'best seen'}</small></div></div>
            <div class="clf-tiers">
                ${tier('100% match', r.counts.exact, r.tier === 'exact')}
                ${tier(`${r.threshold}% or more`, r.counts.exact ? null : r.counts.range, r.tier === 'range')}
            </div>
            ${r.matches.length ? `<div><h3>Matched patterns${r.matches.length < (r.counts.exact || r.counts.range) ? `, best ${r.matches.length}` : ''}</h3>
                <ul class="clf-matches">${r.matches.map(m => `<li><span class="s">${m.score}%</span><span class="l">${escape(m.labels.join(', '))}</span>
                    <span class="p">${pattern(m.pattern)}</span></li>`).join('')}</ul></div>`
            : r.pattern && r.score ? `<div><h3>Closest pattern, ${r.score}%</h3><ol class="clf-pattern">${r.pattern.map(p => `<li>${escape(slot(p))}</li>`).join('')}</ol></div>` : ''}
            <div><h3>Values found</h3>${r.placeholders.length
                ? `<table><tbody>${r.placeholders.map(p => `<tr><td>${escape(slot(p.placeholder))}</td><td>${escape(p.value)}</td></tr>`).join('')}</tbody></table>`
                : '<p class="clf-error" style="color:var(--muted)">This message has no values (numbers, dates, ids).</p>'}</div>`;
    }

    // Downloads patterns.json, labels.dat and placeholder.dat; all are fetched first, so callers can await it before seeding again.
    window.downloadCFMRes = async (id: string) => {
        const files = await Promise.all(['patterns.json', 'labels.dat', 'placeholder.dat'].map(async file => {
            const res = await fetch(`/api/projects/${encodeURIComponent(id)}/${file}`);
            if (!res.ok) throw new Error(`${file}: ${(await res.json()).error}`);
            const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') || '')?.[1] || file;
            return { name, blob: await res.blob() };
        }));
        for (const { name, blob } of files) {
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = name;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        }
    };

    window.openClassifier = (id: string, name?: string) => {
        if (!dialog) build();
        if (id !== projectId) el<HTMLElement>('#clfResult').innerHTML = '';
        projectId = id;
        el<HTMLElement>('#clfProject').textContent = name || '';
        dialog.showModal();
        el<HTMLTextAreaElement>('#clfMessage').focus();
    };
})();
