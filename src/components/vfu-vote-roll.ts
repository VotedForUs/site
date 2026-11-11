/**
 * `<vfu-vote-roll>` — sort, find-a-member, and the card, on the prerendered table.
 *
 * The server emits state-grouped rows. This element reorders them and hides
 * group headers for the other sorts. Filtering never removes a row from the
 * document: it only sets `hidden`.
 *
 * It also opens one member's card over the roll. A member's cast on a vote is
 * not a page — there are about 350,000 of them — so a name fills the single
 * dialog from its own row and the URL becomes `?member={bioguide}`. That URL
 * is this same document, so it reloads and shares on any static host.
 */
import { rowMatchesQuery } from '../utils/voteRollView.js';
import { applyVoteCard, rollVoteCardFields } from '../utils/memberVoteCard.js';
import { stateNameFromCode } from '../utils/stateNames.js';
import { parseVoteCardMember, voteCardPath } from '../utils/voteLinks.js';

type SortKey = 'state' | 'name' | 'party' | 'cast';

const ORDER_ATTR: Record<SortKey, string> = {
  state: 'orderState',
  name: 'orderName',
  party: 'orderParty',
  cast: 'orderVote',
};

export class VfuVoteRoll extends HTMLElement {
  #table!: HTMLTableElement;
  #filter!: HTMLInputElement | null;
  #card: HTMLElement | null = null;
  /** True while this element closes the dialog itself, so close is not a dismissal. */
  #silentCardClose = false;

  get voteId(): string { return this.getAttribute('vote-id') ?? ''; }
  get base(): string { return this.getAttribute('base') || '/'; }

  /** Wire sort buttons, the find field and the card, then open what the URL names. */
  connectedCallback() {
    const table = this.querySelector('table');
    if (!table) return;
    this.#table = table;
    this.#filter = this.querySelector('[data-filter]');
    this.#card = this.querySelector('vfu-vote-card');
    this.#table.addEventListener('click', this.#onSortClick);
    this.#table.addEventListener('click', this.#onNameClick);
    this.#filter?.addEventListener('input', this.#onFilter);
    this.#card?.addEventListener('vfu-vote-close', this.#onCardClose);
    this.#card?.addEventListener('vfu-vote-step', this.#onCardStep);
    window.addEventListener('popstate', this.#onPopState);

    // A shared link, or a story: open it without a click.
    const initial = this.getAttribute('selected') ?? parseVoteCardMember(window.location.search);
    if (initial) this.#showCard(initial, { push: false, reveal: true });
  }

  /** Drop listeners when the roll leaves the document. */
  disconnectedCallback() {
    this.#table?.removeEventListener('click', this.#onSortClick);
    this.#table?.removeEventListener('click', this.#onNameClick);
    this.#filter?.removeEventListener('input', this.#onFilter);
    this.#card?.removeEventListener('vfu-vote-close', this.#onCardClose);
    this.#card?.removeEventListener('vfu-vote-step', this.#onCardStep);
    window.removeEventListener('popstate', this.#onPopState);
  }

  #onNameClick = (event: MouseEvent) => {
    // Let the reader open it in a new tab, or use the keyboard modifiers.
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = (event.target as HTMLElement).closest<HTMLAnchorElement>('a.vote-roll-name[data-bioguide]');
    if (!link || !this.#card) return;
    event.preventDefault();
    this.#showCard(link.dataset.bioguide as string, { push: true });
  };

  /** The reader dismissed the card: the URL goes back to the roll. */
  #onCardClose = () => {
    this.#markCurrent(null);
    if (this.#silentCardClose) return;
    this.#pushUrl(window.location.pathname);
  };

  #onCardStep = (event: Event) => {
    const href = (event as CustomEvent<{ href?: string }>).detail?.href;
    const member = href ? parseVoteCardMember(href) : null;
    if (member) this.#showCard(member, { push: true });
  };

  #onPopState = () => {
    const member = parseVoteCardMember(window.location.search);
    if (member) this.#showCard(member, { push: false });
    else this.#hideCard();
  };

  /**
   * Fill the dialog from one member's row and open it.
   *
   * Prev and next are the rows either side in the order the reader is looking
   * at, skipping any the find field has hidden.
   *
   * @param bioguideId - Member whose cast to show
   * @param options.push - Whether to push the `?member=` URL
   * @param options.reveal - Scroll the row into view (a cold load of a shared link)
   */
  #showCard(bioguideId: string, { push, reveal = false }: { push: boolean; reveal?: boolean }) {
    if (!this.#card) return;
    const row = this.#table.querySelector<HTMLTableRowElement>(`[data-row][data-bioguide="${cssEscape(bioguideId)}"]`);
    if (!row) return; // not a member of this roll

    const visible = [...this.#table.querySelectorAll<HTMLTableRowElement>('[data-row]')]
      .filter((r) => !r.hidden || r === row);
    const index = visible.indexOf(row);
    const chamber = this.getAttribute('chamber') === 'sen' ? 'sen' : 'rep';
    const [state = '', seat = ''] = (row.dataset.stateDistrict ?? '').split('-');
    const district = chamber === 'rep' && /^\d+$/.test(seat) ? Number(seat) : undefined;

    applyVoteCard(this.#card, rollVoteCardFields({
      voteId: this.voteId,
      bioguideId,
      voteCast: row.dataset.vote ?? '',
      recordType: this.getAttribute('record-type') ?? undefined,
      voteTitle: this.getAttribute('vote-title') ?? '',
      billTitle: this.getAttribute('bill-title') ?? '',
      nameTitle: row.dataset.nameTitle ?? row.dataset.name ?? '',
      party: row.dataset.party ?? '',
      stateName: stateNameFromCode(state),
      chamber,
      state,
      district,
      imageUrl: row.dataset.image ?? null,
      prevBioguideId: visible[index - 1]?.dataset.bioguide ?? null,
      nextBioguideId: visible[index + 1]?.dataset.bioguide ?? null,
      shareOrigin: this.getAttribute('share-origin') ?? window.location.origin,
      shareStubScope: this.getAttribute('share-stub-scope') ?? '',
      base: this.base,
    }));

    this.#markCurrent(row);
    if (reveal) row.scrollIntoView({ block: 'center', behavior: 'auto' });
    const dialog = this.#card.querySelector('dialog');
    if (dialog && !dialog.open) dialog.showModal();
    if (push) this.#pushUrl(voteCardPath(this.voteId, bioguideId, this.base));
  }

  /** Close the dialog without treating it as the reader dismissing it. */
  #hideCard() {
    const dialog = this.#card?.querySelector('dialog');
    if (!dialog?.open) return;
    this.#silentCardClose = true;
    dialog.close();
    this.#silentCardClose = false;
  }

  /** Mark the row the card is open on, and only that row. */
  #markCurrent(row: HTMLTableRowElement | null) {
    for (const current of this.#table.querySelectorAll('[data-row][aria-current]')) {
      if (current !== row) current.removeAttribute('aria-current');
    }
    row?.setAttribute('aria-current', 'true');
  }

  #pushUrl(href: string) {
    if (href && href !== window.location.pathname + window.location.search) {
      window.history.pushState(null, '', href);
    }
  }

  #onSortClick = (event: MouseEvent) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('th button[data-sort]');
    if (!button || !this.#table.contains(button)) return;
    this.#sort(button.dataset.sort as SortKey);
  };

  #onFilter = () => {
    this.#applyFilter();
  };

  /**
   * Reorders member rows and shows group headers only for the state sort.
   *
   * @param key - Column to sort by
   */
  #sort(key: SortKey) {
    const attr = ORDER_ATTR[key];
    if (!attr) return;

    for (const th of this.#table.querySelectorAll('thead th')) {
      const button = th.querySelector<HTMLButtonElement>('button[data-sort]');
      if (!button) {
        th.removeAttribute('aria-sort');
        continue;
      }
      th.setAttribute('aria-sort', button.dataset.sort === key ? 'ascending' : 'none');
    }

    const body = this.#table.tBodies[0];
    const groups = [...body.querySelectorAll<HTMLTableRowElement>('[data-group]')];
    const rows = [...body.querySelectorAll<HTMLTableRowElement>('[data-row]')];
    rows.sort((a, b) => Number(a.dataset[attr] ?? 0) - Number(b.dataset[attr] ?? 0));

    if (key === 'state') {
      for (const group of groups) group.hidden = false;
      for (const group of groups) {
        body.append(group);
        const keyName = group.dataset.group ?? '';
        for (const row of rows.filter((r) => r.dataset.stateGroup === keyName)) {
          body.append(row);
        }
      }
    } else {
      for (const group of groups) group.hidden = true;
      for (const row of rows) body.append(row);
    }

    this.#applyFilter();
  }

  /**
   * Hides rows that do not match the find field, and hides a group with no
   * visible members.
   */
  #applyFilter() {
    const query = this.#filter?.value ?? '';
    const rows = this.#table.querySelectorAll<HTMLTableRowElement>('[data-row]');
    for (const row of rows) {
      const match = rowMatchesQuery({
        bioguideId: row.dataset.bioguide ?? '',
        stateDistrict: row.dataset.stateDistrict ?? '',
        name: row.dataset.name ?? '',
        lastName: row.dataset.lastName ?? '',
        party: row.dataset.party ?? '',
        vote: row.dataset.vote ?? '',
      }, query);
      row.hidden = !match;
    }

    for (const group of this.#table.querySelectorAll<HTMLTableRowElement>('[data-group]')) {
      if (group.hidden && this.#currentSort() !== 'state') continue;
      const key = group.dataset.group ?? '';
      const visible = [...this.#table.querySelectorAll<HTMLTableRowElement>(`[data-row][data-state-group="${cssEscape(key)}"]`)]
        .some((row) => !row.hidden);
      if (this.#currentSort() === 'state') group.hidden = !visible;
    }
  }

  /**
   * @returns The column currently marked ascending
   */
  #currentSort(): SortKey {
    const active = this.#table.querySelector<HTMLElement>('thead th[aria-sort="ascending"] button[data-sort]');
    return (active?.dataset.sort as SortKey) ?? 'state';
  }
}

/**
 * Escape a value for use in a CSS attribute selector.
 *
 * @param value - Raw attribute value
 * @returns Escaped value
 */
function cssEscape(value: string): string {
  return value.replace(/["\\]/g, '\\$&');
}

if (typeof customElements !== 'undefined' && !customElements.get('vfu-vote-roll')) {
  customElements.define('vfu-vote-roll', VfuVoteRoll);
}
