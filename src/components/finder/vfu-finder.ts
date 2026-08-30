/**
 * `<vfu-finder>` — behaviour for the markup `VfuFinder.astro` rendered: it
 * listens for `vfu:query`, matches, renders the rows and writes the URL. The
 * bar, the opening list of members, the panels and the row shapes are all in
 * the page already.
 *
 * Where the rows come from:
 *
 *   members — inline in the page, beside the rows rendered from them. No
 *             network, so narrowing works on the first keystroke and cannot
 *             fail.
 *   bills   — fetched, once, the first time a reader searches them. This is
 *             the only request the finder makes.
 *
 * The index is fetched on the reader's first interaction with the field, both
 * files in parallel, so it costs nothing to a reader who never searches. If
 * the fetch fails the field stays usable and the region carries a callout with
 * the two hub links — never a silent field.
 *
 * Rows are links to prerendered pages. Selecting a result is a navigation:
 * this element renders finder results and nothing else.
 *
 * A story or a test supplies either collection the same way the page supplies
 * members: `<script type="application/json" data-finder-index="bills">[…]</script>`.
 */
import {
  MATCH_KINDS,
  MEMBER_MATCH_KINDS,
  matchMembers,
  memberGroupOrder,
  searchBills,
  type BillRow,
  type MatchKind,
  type MemberRow,
} from '../../utils/finderMatch/index.js';
import {
  emptyFilters,
  stateChips,
  statusChips,
  GROUP_LABELS,
  MEMBER_GROUP_LABELS,
  STATUS_LABELS,
  billHref,
  billWhy,
  emptyState,
  emptyTypeReason,
  filterBills,
  filterMembers,
  footerLine,
  highlight,
  memberHref,
  memberMeta,
  typeChips,
  typeGroupLabel,
  allGroupLabel,
  type Chip,
  type Filters,
  type Mode,
} from './finderView.js';
import { VfuSearchBar, type QueryReason } from './vfu-search-bar.js';

/** A 404 that happens to parse as JSON is still a failed index. */
async function fetchRows<T>(url: string): Promise<T[]> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return response.json() as Promise<T[]>;
}
type FinderState = { mode: Mode; query: string; filters: Filters; reason?: QueryReason };
/** One labelled, counted result group. `kind` is the bill match kind. */
type Group<T> = { key: string; label: string; rows: T[]; kind?: MatchKind };

export class VfuFinder extends HTMLElement {
  #bar: VfuSearchBar | null = null;
  #results: HTMLElement | null = null;
  #memberRows: Promise<MemberRow[]> | null = null;
  #billRows: Promise<BillRow[]> | null = null;
  #state: FinderState = { mode: 'members', query: '', filters: emptyFilters() };

  get indexBase(): string { return this.getAttribute('index-base') || '/finder/'; }
  get base(): string { return this.getAttribute('base') || '/'; }
  get syncsUrl(): boolean { return this.hasAttribute('url-state'); }

  connectedCallback() {
    this.#bar = this.querySelector('vfu-search-bar') as VfuSearchBar | null;
    this.#results = this.querySelector('.finder-results');
    if (!this.#bar || !this.#results) return; // no server-rendered markup

    // A prerendered page cannot see the query string at build time, so when
    // the URL is the state, the live URL wins over the baked-in attributes.
    const params = this.syncsUrl && typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search)
      : null;
    const mode = params?.get('type') ?? this.getAttribute('initial-mode');
    this.#state.mode = mode === 'bills' ? 'bills' : 'members';
    this.#state.query = params?.get('q') ?? this.getAttribute('initial-query') ?? '';
    this.#bar.setAttribute('mode', this.#state.mode);
    if (this.#state.query) this.#bar.query = this.#state.query;

    this.addEventListener('vfu:query', e => {
      this.#state = (e as CustomEvent).detail as FinderState;
      void this.#run();
    });
    window.addEventListener('popstate', this.#onPopState);

    // The opening view is in the page already. Only render if the URL asks for
    // something else — a seeded query, or the bills side.
    const prerendered = !!this.#results.querySelector('.result-row');
    if (!prerendered || this.#state.query.trim() || this.#state.mode !== 'members') void this.#run();
  }

  disconnectedCallback() {
    window.removeEventListener('popstate', this.#onPopState);
  }

  #onPopState = () => {
    const params = new URLSearchParams(window.location.search);
    this.#state = {
      mode: params.get('type') === 'bills' ? 'bills' : 'members',
      query: params.get('q') ?? '',
      filters: emptyFilters(),
    };
    this.#bar?.setAttribute('mode', this.#state.mode);
    this.#bar?.clearFilters();
    if (this.#bar) this.#bar.query = this.#state.query;
    void this.#run();
  };

  /** Inline in the page, so this never touches the network and never fails. */
  #members(): Promise<MemberRow[]> {
    return (this.#memberRows ??= Promise.resolve(this.#inline<MemberRow>('members') ?? this.#fetch<MemberRow>('members')));
  }

  /** The one request the finder makes, and only for a reader who searches bills. */
  #bills(): Promise<BillRow[]> {
    return (this.#billRows ??= Promise.resolve(this.#inline<BillRow>('bills') ?? this.#fetch<BillRow>('bills')));
  }

  #inline<T>(name: 'members' | 'bills'): T[] | null {
    const script = this.querySelector(`script[data-finder-index="${name}"]`);
    return script?.textContent ? (JSON.parse(script.textContent) as T[]) : null;
  }

  async #fetch<T>(name: 'members' | 'bills'): Promise<T[]> {
    const base = this.indexBase.endsWith('/') ? this.indexBase : `${this.indexBase}/`;
    this.#setBusy(true);
    try {
      return await fetchRows<T>(`${base}${name}.json`);
    } finally {
      this.#setBusy(false);
    }
  }

  async #run() {
    this.#writeUrl();
    try {
      if (this.#state.mode === 'members') await this.#renderMembers();
      else await this.#renderBills();
    } catch {
      // Only the bills request can fail; members are already in the page.
      this.#renderFailed();
    }
  }

  async #renderMembers() {
    const { query, filters } = this.#state;
    const all = await this.#members();
    // Nothing typed is not nothing to show: the whole membership is the
    // starting point, and every character taken off it.
    const matched = query.trim()
      ? matchMembers(all, query)
      : { name: all, state: [], district: [] };

    // The state row counts what matched, before its own chips are applied.
    this.#bar?.setChips('state', stateChips(MEMBER_MATCH_KINDS.flatMap(k => matched[k])));

    const groups = (query.trim() ? memberGroupOrder(query) : ['name' as const])
      .map(kind => ({
        key: `member-${kind}`,
        label: query.trim() ? MEMBER_GROUP_LABELS[kind] : allGroupLabel('members'),
        rows: filterMembers(matched[kind], filters),
      }))
      .filter(g => g.rows.length);

    if (!groups.length) {
      this.#renderEmpty('members', await this.#billsMatching(query));
      return;
    }
    this.#renderGroups(groups, 'members', row => this.#memberRow(row, query));
  }

  async #renderBills() {
    const { query, filters } = this.#state;
    const all = await this.#bills();
    // The type row is counted after the status chips and before its own, and
    // the status row the other way round.
    const { typeFilter, emptyTypes, buckets } = searchBills(filterBills(all, { ...filters, type: [] }), query);

    // A bare type is a facet over the whole corpus: the rows it stands for are
    // every bill of the candidate types, and a chip is how the reader asks for
    // them. Any other query narrows to what it matched.
    const matched = !query.trim()
      ? all
      : typeFilter.length
        ? all.filter(row => typeFilter.includes(row.y))
        : MATCH_KINDS.flatMap(kind => buckets[kind]);

    this.#bar?.setChips('type', typeChips(filterBills(matched, { ...filters, type: [] })));
    this.#bar?.setChips('status', statusChips(filterBills(matched, { ...filters, status: [] })));

    // Every candidate type is empty — say which, never render nothing.
    if (emptyTypes.length) return this.#note(emptyTypeReason(emptyTypes));

    // A bare type lists every type it could mean, with the chips above to pick
    // one. It still resolves to no single type, which is the rule; it just no
    // longer empties the region to say so.
    const groups = !query.trim() || typeFilter.length
      ? [{
          key: 'bill-all',
          label: typeFilter.length ? typeGroupLabel(typeFilter) : allGroupLabel('bills'),
          rows: filterBills(matched, filters),
        }]
      : MATCH_KINDS
          .map(kind => ({
            key: `bill-${kind}`,
            label: GROUP_LABELS[kind],
            rows: filterBills(buckets[kind], filters),
            kind,
          }))
          .filter(g => g.rows.length);

    if (!groups.some(g => g.rows.length)) {
      const members = matchMembers(await this.#members(), query);
      this.#renderEmpty('bills', Object.values(members).reduce((n, r) => n + r.length, 0));
      return;
    }
    this.#renderGroups(groups, 'bills', (row, group) => this.#billRow(row, group.kind ?? 'title-text', query));
  }

  /** Each group is labelled and counted, and renders every row it has. */
  #renderGroups<T>(groups: Array<Group<T>>, mode: Mode, render: (row: T, group: Group<T>) => HTMLElement) {
    const total = groups.reduce((n, g) => n + g.rows.length, 0);

    const sections = groups.map(group => {
      const node = this.#clone('group');
      node.querySelector('[data-label]')!.textContent = group.label;
      node.querySelector('[data-count]')!.textContent = String(group.rows.length);
      node.querySelector('[data-rows]')!.append(...group.rows.map(row => render(row, group)));
      return node;
    });

    const foot = document.createElement('p');
    foot.className = 'result-foot';
    foot.textContent = footerLine(total, mode);
    this.#show(null);
    this.#results!.replaceChildren(...sections, foot);
  }

  #memberRow(row: MemberRow, query: string): HTMLElement {
    const node = this.#clone('member-row') as HTMLAnchorElement;
    node.href = memberHref(row, this.base);

    const headshot = node.querySelector('[data-headshot]') as HTMLImageElement;
    const blank = node.querySelector('[data-blank]')!;
    if (row.i) { headshot.src = `${this.base.replace(/\/$/, '')}/images/legislators/${row.b}.jpg`; blank.remove(); }
    else headshot.remove();

    this.#fill(node, row.n, query, memberMeta(row), `${row.v} ${row.v === 1 ? 'vote' : 'votes'}`);
    return node;
  }

  #billRow(row: BillRow, kind: MatchKind, query: string): HTMLElement {
    const node = this.#clone('bill-row') as HTMLAnchorElement;
    node.href = billHref(row, this.base);
    if (kind === 'exact-id') node.dataset.exact = 'true';
    node.querySelector('.row-id')!.textContent = row.t;

    this.#fill(node, row.h, query, billWhy(kind, row, query),
      `${STATUS_LABELS[row.s] ?? row.s} · ${row.v} ${row.v === 1 ? 'vote' : 'votes'}`);
    return node;
  }

  /**
   * The title, its match and the two supporting lines. The whole title stays
   * inside one grid item: a bare <mark> would paint across the row.
   */
  #fill(node: HTMLElement, title: string, query: string, meta: string, trailing: string) {
    const line = node.querySelector('.row-title')!;
    const { pre, hit, post } = highlight(title, query);
    line.textContent = pre;
    if (hit) {
      const mark = document.createElement('mark');
      mark.textContent = hit;
      line.append(mark, post);
    }
    node.querySelector('.row-meta')!.textContent = meta;
    node.querySelector('.row-trailing')!.textContent = trailing;
  }

  #clone(name: string): HTMLElement {
    const template = this.querySelector<HTMLTemplateElement>(`template[data-template="${name}"]`);
    return template!.content.firstElementChild!.cloneNode(true) as HTMLElement;
  }

  /**
   * How many bills a member query would have matched, for the offer in the
   * empty state. A reader who found nothing should not be handed a network
   * error as well, so an unavailable bill index simply makes no offer.
   */
  async #billsMatching(query: string): Promise<number> {
    try {
      const { buckets } = searchBills(await this.#bills(), query);
      return MATCH_KINDS.reduce((n, kind) => n + buckets[kind].length, 0);
    } catch {
      return 0;
    }
  }

  /** An empty state always offers an action — here, the other mode. */
  #renderEmpty(mode: Mode, otherCount: number) {
    const { title, body, otherLabel } = emptyState(mode, this.#state.query, otherCount);
    const box = this.#show('empty')!;
    box.querySelector('[data-empty-title]')!.textContent = title;
    box.querySelector('[data-empty-body]')!.textContent = body;

    const other = box.querySelector('[data-empty-other]') as HTMLButtonElement;
    other.hidden = !otherLabel;
    if (otherLabel) {
      other.textContent = otherLabel;
      other.onclick = () => {
        const swapped: Mode = this.#state.mode === 'members' ? 'bills' : 'members';
        this.#state = { ...this.#state, mode: swapped, reason: 'mode' };
        this.#bar?.setAttribute('mode', swapped);
        void this.#run();
      };
    }
    this.#results!.replaceChildren();
  }

  /** A type query that resolves to chips, or to a reason there are none. */
  #note(text: string) {
    this.#show('note')!.textContent = text;
    this.#results!.replaceChildren();
  }

  /** The callout is in the page already — a failed index reveals it. */
  #renderFailed() {
    this.#show('failed');
    this.#results!.replaceChildren();
  }

  #clear() {
    this.#show(null);
    this.#results?.replaceChildren();
  }

  /** One panel at a time: the empty state, a note, or the failure callout. */
  #show(panel: 'empty' | 'note' | 'failed' | null): HTMLElement | null {
    let shown: HTMLElement | null = null;
    for (const name of ['empty', 'note', 'failed'] as const) {
      const el = this.querySelector<HTMLElement>(`[data-finder-${name}]`);
      if (!el) continue;
      el.hidden = name !== panel;
      if (name === panel) shown = el;
    }
    return shown;
  }

  #setBusy(busy: boolean) {
    this.#bar?.querySelector('.finder-form')?.setAttribute('aria-busy', String(busy));
  }

  #writeUrl() {
    if (!this.syncsUrl || typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    const { query, mode, reason } = this.#state;
    if (query) url.searchParams.set('q', query); else url.searchParams.delete('q');
    url.searchParams.set('type', mode);
    if (url.href === window.location.href) return;
    if (reason && reason !== 'input') window.history.pushState(null, '', url);
    else window.history.replaceState(null, '', url);
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('vfu-finder')) {
  customElements.define('vfu-finder', VfuFinder);
}
