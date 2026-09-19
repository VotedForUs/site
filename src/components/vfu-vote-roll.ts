/**
 * `<vfu-vote-roll>` — sort and find-a-member on the prerendered table.
 *
 * The server emits state-grouped rows. This element reorders them and hides
 * group headers for the other sorts. Filtering never removes a row from the
 * document: it only sets `hidden`.
 */
import { rowMatchesQuery } from '../utils/voteRollView.js';

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

  /** Wire sort buttons and the find field. */
  connectedCallback() {
    const table = this.querySelector('table');
    if (!table) return;
    this.#table = table;
    this.#filter = this.querySelector('[data-filter]');
    this.#table.addEventListener('click', this.#onSortClick);
    this.#filter?.addEventListener('input', this.#onFilter);
  }

  /** Drop listeners when the roll leaves the document. */
  disconnectedCallback() {
    this.#table?.removeEventListener('click', this.#onSortClick);
    this.#filter?.removeEventListener('input', this.#onFilter);
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
