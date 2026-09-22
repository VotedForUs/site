/**
 * `<vfu-member-record>` — picking a bill on a member's page, in place.
 *
 * The member's identity and their bill list arrive as HTML. This element adds
 * the one thing the server cannot do cheaply: rendering their votes on a
 * chosen bill without another document. There are 606 members and 267,511
 * member×bill combinations, so the combinations are fetched, not built.
 *
 * What it fetches, once:
 *
 *   votes.json                  every vote's bill, chamber, roll, question,
 *                               result and date — 29 KB gzipped, shared
 *   members/{bioguide}.json     this member's casts as [index, cast] pairs
 *                               against that list — under 2 KB gzipped
 *
 * The selected bill row is *moved* out of the list rather than re-rendered, so
 * the bill's markup has exactly one definition and it is the server's.
 *
 * The URL is pushed on every selection, so a chosen bill is still a link. A
 * cold load of one of those links is served this same page by a rewrite, and
 * the `selected` attribute or the path tells the element what to open.
 */
import { applyMemberVoteCard, memberVoteCardFields } from '../utils/memberVoteCard.js';
import { castTag } from '../utils/legislatorVoteDisplay.js';
import {
  memberVotePath,
  parseMemberBillPath,
  parseMemberVotePath,
  parseVoteId,
} from '../utils/voteLinks.js';

/** One vote, as `votes.json` stores it. */
type VoteRow = {
  i: string;
  b: string;
  c: 'house' | 'senate';
  r?: number;
  q: string;
  x?: string;
  s?: string;
  d: string;
  k?: 'unanimous-consent' | 'voice';
};

type Casts = Array<[number, string]>;

export class VfuMemberRecord extends HTMLElement {
  #bills!: HTMLElement;
  #selection!: HTMLElement;
  #selectedBill!: HTMLElement;
  #votes!: HTMLElement;
  #data: Promise<{ votes: VoteRow[]; casts: Casts }> | null = null;
  /** The row lifted out of the list, so closing can put it back. */
  #liftedFrom: { row: HTMLElement; next: ChildNode | null } | null = null;
  #billVotes: Array<{ vote: VoteRow; cast: string }> = [];
  #card: HTMLElement | null = null;
  #silentCardClose = false;

  get bioguide(): string { return this.getAttribute('bioguide') ?? ''; }
  get base(): string { return this.getAttribute('base') || '/'; }
  get indexBase(): string { return this.getAttribute('index-base') || '/finder/'; }
  get memberName(): string { return this.getAttribute('member-name') ?? ''; }
  get nameTitle(): string { return this.getAttribute('name-title') ?? ''; }
  get party(): string { return this.getAttribute('party') ?? ''; }
  get stateName(): string { return this.getAttribute('state-name') ?? ''; }
  get chamber(): 'sen' | 'rep' { return this.getAttribute('chamber') === 'sen' ? 'sen' : 'rep'; }
  get state(): string { return this.getAttribute('state') ?? ''; }
  get district(): number | undefined {
    const raw = this.getAttribute('district');
    return raw == null || raw === '' ? undefined : Number(raw);
  }
  get shareOrigin(): string { return this.getAttribute('share-origin') ?? 'https://votedfor.us'; }

  connectedCallback() {
    const bills = this.querySelector<HTMLElement>('[data-bills]');
    const selection = this.querySelector<HTMLElement>('[data-selection]');
    if (!bills || !selection) return; // no server-rendered markup
    this.#bills = bills;
    this.#selection = selection;
    this.#selectedBill = selection.querySelector('[data-selected-bill]') as HTMLElement;
    this.#votes = selection.querySelector('[data-votes]') as HTMLElement;

    this.#bills.addEventListener('click', this.#onBillClick);
    this.#votes.addEventListener('click', this.#onVoteClick);
    this.#selection.querySelector<HTMLAnchorElement>('[data-back]')?.addEventListener('click', this.#onBack as EventListener);
    this.#card = this.querySelector('vfu-vote-card');
    this.#card?.addEventListener('vfu-vote-close', this.#onCardClose);
    this.#card?.addEventListener('vfu-vote-step', this.#onCardStep);
    window.addEventListener('popstate', this.#onPopState);

    // A shared link, or a story: open it without a click.
    const votePath = parseMemberVotePath(window.location.pathname);
    const billPath = parseMemberBillPath(window.location.pathname);
    const initial = this.getAttribute('selected') ?? votePath?.segment ?? billPath?.segment;
    const voteNumber = this.getAttribute('selected-vote') ?? votePath?.voteNumber;
    if (initial) void this.#open(initial, { push: false, openVoteNumber: voteNumber });
  }

  disconnectedCallback() {
    window.removeEventListener('popstate', this.#onPopState);
    this.#card?.removeEventListener('vfu-vote-close', this.#onCardClose);
    this.#card?.removeEventListener('vfu-vote-step', this.#onCardStep);
  }

  #onBillClick = (event: MouseEvent) => {
    // Let the reader open it in a new tab, or use the keyboard modifiers.
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const row = (event.target as HTMLElement).closest<HTMLElement>('.result-row[data-segment]');
    if (!row) return;
    event.preventDefault();
    void this.#open(row.dataset.segment as string, { push: true });
  };

  #onBack = (event: MouseEvent) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey) return;
    event.preventDefault();
    this.#close({ push: true });
  };

  #onVoteClick = (event: MouseEvent) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const row = (event.target as HTMLElement).closest<HTMLElement>('[data-vote-id]');
    if (!row?.dataset.voteId) return;
    event.preventDefault();
    this.#showCard(row.dataset.voteId, { push: true });
  };

  #onCardClose = () => {
    if (this.#silentCardClose) return;
    const href = this.#card?.getAttribute('close-href');
    if (href) this.#pushUrl(href);
  };

  #onCardStep = (event: Event) => {
    const href = (event as CustomEvent<{ href?: string }>).detail?.href;
    const parsed = href ? parseMemberVotePath(href) : null;
    if (!parsed) return;
    const match = this.#billVotes.find((entry) => parseVoteId(entry.vote.i)?.voteNumber === parsed.voteNumber);
    if (match) this.#showCard(match.vote.i, { push: true });
  };

  #onPopState = () => {
    const votePath = parseMemberVotePath(window.location.pathname);
    if (votePath) {
      void this.#open(votePath.segment, { push: false, openVoteNumber: votePath.voteNumber });
      return;
    }
    const segment = parseMemberBillPath(window.location.pathname)?.segment;
    if (segment) void this.#open(segment, { push: false });
    else this.#close({ push: false });
  };

  /** votes.json and this member's casts, in parallel, once. */
  #load(): Promise<{ votes: VoteRow[]; casts: Casts }> {
    if (this.#data) return this.#data;
    const inlineVotes = this.#inline<VoteRow>('votes');
    const inlineCasts = this.#inline<[number, string]>('casts');
    if (inlineVotes && inlineCasts) {
      this.#data = Promise.resolve({ votes: inlineVotes, casts: inlineCasts });
      return this.#data;
    }

    const base = this.indexBase.endsWith('/') ? this.indexBase : `${this.indexBase}/`;
    this.#data = Promise.all([
      fetchJson<VoteRow[]>(`${base}votes.json`),
      fetchJson<Casts>(`${base}members/${this.bioguide}.json`),
    ]).then(([votes, casts]) => ({ votes, casts }));
    return this.#data;
  }

  #inline<T>(name: 'votes' | 'casts'): T[] | null {
    const script = this.querySelector(`script[data-member-index="${name}"]`);
    return script?.textContent ? (JSON.parse(script.textContent) as T[]) : null;
  }

  /**
   * Fold the bill list to `segment` and optionally open that bill's card.
   *
   * @param segment - `hr-2616` style bill id
   * @param options.push - Whether to push the member×bill URL
   * @param options.openVoteNumber - Trailing vote number to open in place
   */
  async #open(segment: string, { push, openVoteNumber }: { push: boolean; openVoteNumber?: string | null }) {
    const row = this.#bills.querySelector<HTMLElement>(`.result-row[data-segment="${cssEscape(segment)}"]`);
    if (!row) return; // not a bill this member voted on

    let data: { votes: VoteRow[]; casts: Casts };
    try {
      data = await this.#load();
    } catch {
      window.location.assign(row.getAttribute('href') ?? '');
      return;
    }

    const billId = row.dataset.bill as string;
    const href = row.getAttribute('href') ?? row.dataset.href ?? '';
    const rows = data.casts
      .map(([index, cast]) => ({ vote: data.votes[index], cast }))
      .filter(entry => entry.vote?.b === billId)
      // Newest first, and a bill's votes on one day are ordered by vote number:
      // the later number is the later vote.
      .sort((a, b) => (a.vote.d === b.vote.d ? voteNumber(b.vote.i) - voteNumber(a.vote.i) : (a.vote.d < b.vote.d ? 1 : -1)));

    this.#billVotes = rows;
    this.#lift(row, href);
    this.#votes.replaceChildren(this.#group(rows));
    this.#bills.hidden = true;
    this.#selection.hidden = false;

    if (push) this.#pushUrl(href);
    this.#focusSelection();

    if (openVoteNumber) {
      const match = rows.find((entry) => parseVoteId(entry.vote.i)?.voteNumber === openVoteNumber);
      if (match) this.#showCard(match.vote.i, { push: false });
      else this.#hideCard();
    } else {
      this.#hideCard();
    }
  }

  #close({ push }: { push: boolean }) {
    this.#hideCard();
    this.#billVotes = [];
    this.#restore();
    this.#votes.replaceChildren();
    this.#selection.hidden = true;
    this.#bills.hidden = false;
    if (push) this.#pushUrl(`${this.base.replace(/\/$/, '')}/members/${this.bioguide}`);
  }

  /**
   * Fill and open the in-place card for one of this member's votes on the selected bill.
   *
   * @param voteId - Recorded vote id
   * @param options.push - Whether to push the member-context card URL
   */
  #showCard(voteId: string, { push }: { push: boolean }) {
    const index = this.#billVotes.findIndex((entry) => entry.vote.i === voteId);
    if (index < 0 || !this.#card) return;
    const { vote, cast } = this.#billVotes[index];
    const billTitle = this.#selectedBill.querySelector('.row-title')?.textContent?.trim() ?? '';
    const fields = memberVoteCardFields({
      voteId,
      bioguideId: this.bioguide,
      voteCast: cast,
      recordType: vote.k,
      voteTitle: vote.q,
      billTitle,
      nameTitle: this.nameTitle,
      party: this.party,
      stateName: this.stateName,
      chamber: this.chamber,
      state: this.state,
      district: this.district,
      prevVoteId: this.#billVotes[index - 1]?.vote.i ?? null,
      nextVoteId: this.#billVotes[index + 1]?.vote.i ?? null,
      shareOrigin: this.shareOrigin,
      base: this.base,
    });
    applyMemberVoteCard(this.#card, fields);
    const dialog = this.#card.querySelector('dialog');
    if (dialog && !dialog.open) dialog.showModal();
    if (push) this.#pushUrl(memberVotePath(voteId, this.bioguide, this.base));
  }

  /** Close the dialog without treating it as a user dismiss. */
  #hideCard() {
    const dialog = this.#card?.querySelector('dialog');
    if (!dialog?.open) return;
    this.#silentCardClose = true;
    dialog.close();
    this.#silentCardClose = false;
  }

  /**
   * Move the chosen row into the selection, remembering where it sat and what
   * it linked to. Moving rather than re-rendering keeps the bill row's markup
   * defined once, on the server.
   */
  #lift(row: HTMLElement, href: string) {
    if (this.#liftedFrom?.row === row) return;
    this.#restore();
    this.#liftedFrom = { row, next: row.nextSibling };
    row.dataset.href = href;
    row.setAttribute('aria-current', 'page');
    row.removeAttribute('href');
    this.#selectedBill.replaceChildren(row);
  }

  #restore() {
    if (!this.#liftedFrom) return;
    const { row, next } = this.#liftedFrom;
    row.removeAttribute('aria-current');
    if (row.dataset.href) row.setAttribute('href', row.dataset.href);
    next?.parentNode?.insertBefore(row, next);
    this.#liftedFrom = null;
  }

  #group(rows: Array<{ vote: VoteRow; cast: string }>): HTMLElement {
    const group = this.#clone('group');
    group.querySelector('[data-label]')!.textContent = `how ${this.memberName} voted`;
    group.querySelector('[data-count]')!.textContent = String(rows.length);
    group.querySelector('[data-rows]')!.append(...rows.map(row => this.#voteRow(row.vote, row.cast)));
    return group;
  }

  #voteRow(vote: VoteRow, cast: string): HTMLElement {
    const node = this.#clone('vote-row') as HTMLAnchorElement;
    node.href = memberVotePath(vote.i, this.bioguide, this.base);
    node.dataset.voteId = vote.i;

    node.querySelector('.vote-chamber')!.textContent = vote.c === 'senate' ? 'Senate' : 'House';
    const roll = node.querySelector('.vote-roll') as HTMLElement;
    // A vote with no roll call has no roll number to name.
    if (vote.r) { roll.textContent = `roll ${vote.r}`; roll.hidden = false; }

    node.querySelector('.row-title')!.textContent = vote.q;
    node.querySelector('.row-meta')!.textContent = [vote.x, vote.d].filter(Boolean).join(' · ');

    // A vote with no roll call reads as a Yea by consent, with the kind named
    // beside it — the same rule, and the same function, as the server uses.
    const tag = castTag(cast, vote.k);
    const castEl = node.querySelector('.cast-tag') as HTMLElement;
    castEl.textContent = tag.label;
    castEl.dataset.cast = tag.label.toLowerCase();
    const kind = node.querySelector('.kind-chip') as HTMLElement;
    if (tag.kind) { kind.textContent = tag.kind; kind.hidden = false; }
    return node;
  }

  #clone(name: string): HTMLElement {
    const template = this.querySelector<HTMLTemplateElement>(`template[data-template="${name}"]`);
    return template!.content.firstElementChild!.cloneNode(true) as HTMLElement;
  }

  #pushUrl(href: string) {
    if (href && href !== window.location.pathname) window.history.pushState(null, '', href);
  }

  /** Moving the reader down the page is the navigation they asked for. */
  #focusSelection() {
    const heading = this.#selection.querySelector<HTMLElement>('.group-label');
    heading?.scrollIntoView({ block: 'nearest', behavior: 'auto' });
  }
}

/** The trailing number of a vote id, for ordering a single day's votes. */
function voteNumber(voteId: string): number {
  return Number(parseVoteId(voteId)?.voteNumber ?? 0);
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return response.json() as Promise<T>;
}

/** Attribute selectors need escaping; `CSS.escape` is not everywhere yet. */
function cssEscape(value: string): string {
  return value.replace(/["\\]/g, '\\$&');
}

if (typeof customElements !== 'undefined' && !customElements.get('vfu-member-record')) {
  customElements.define('vfu-member-record', VfuMemberRecord);
}
