/**
 * `<vfu-search-bar>` — behaviour for the markup `VfuSearchBar.astro` rendered.
 *
 * The element builds nothing: the field, the toggle and the chip rows are
 * already in the page. It swaps the mode-dependent copy, fills the type row
 * per query, and reports what the reader typed:
 *
 *     vfu:query  { mode, query, filters, reason }   bubbles, composed
 *
 * `reason` separates a keystroke from a decision — typing replaces the URL,
 * switching mode, pressing Search or picking a chip pushes a history entry.
 */
import { MODE_COPY, type Chip, type Filters, type Mode } from './finderView.js';

/** What produced the query — a keystroke, or a decision worth a history entry. */
export type QueryReason = 'input' | 'submit' | 'mode' | 'filter';

type Row = 'state' | 'type' | 'status';

/** Which rows belong to which mode. The others are hidden, never removed. */
const ROW_MODES: Record<Row, Mode> = { state: 'members', type: 'bills', status: 'bills' };

export class VfuSearchBar extends HTMLElement {
  static observedAttributes = ['mode'];

  #input!: HTMLInputElement;
  #frame = 0;

  get mode(): Mode {
    return this.getAttribute('mode') === 'bills' ? 'bills' : 'members';
  }
  set mode(value: Mode) { this.setAttribute('mode', value); }

  get query(): string { return this.#input?.value ?? ''; }
  set query(value: string) { if (this.#input) this.#input.value = value; }

  /** Read off the pressed chips rather than mirrored in a field of its own. */
  get filters(): Filters {
    const of = (row: Row) => [...this.querySelectorAll<HTMLButtonElement>(
      `[data-row="${row}"] .finder-chip[aria-pressed="true"]`)].map(chip => chip.value);
    return { state: of('state'), type: of('type'), status: of('status') };
  }

  connectedCallback() {
    this.#input = this.querySelector('.field-input') as HTMLInputElement;
    if (!this.#input) return; // no server-rendered markup, nothing to drive

    this.addEventListener('input', () => {
      // One animation frame of coalescing, no debounce beyond it: every
      // keystroke narrows, and a delay reads as the field having stopped.
      cancelAnimationFrame(this.#frame);
      this.#frame = requestAnimationFrame(() => this.#emit('input'));
    });
    this.addEventListener('submit', e => { e.preventDefault(); this.#emit('submit'); });
    this.addEventListener('change', e => {
      const target = e.target as HTMLInputElement;
      if (target.name !== 'mode') return;
      this.mode = target.value as Mode;
      this.#emit('mode');
    });
    this.addEventListener('click', e => {
      const chip = (e.target as HTMLElement).closest<HTMLButtonElement>('.finder-chip');
      if (!chip) return;
      chip.setAttribute('aria-pressed', String(chip.getAttribute('aria-pressed') !== 'true'));
      this.#emit('filter');
    });
    if (this.hasAttribute('autofocus')) this.#input.focus();
  }

  attributeChangedCallback() {
    if (this.#input) this.#update();
  }

  /**
   * Replace one narrow-by row with the chips for the current result set. A
   * chip that is still there keeps its pressed state, so a row recounting
   * under the reader never drops the filter they just set.
   */
  setChips(kind: Row, chips: Chip[]) {
    const row = this.querySelector<HTMLElement>(`[data-row="${kind}"]`);
    if (!row) return;
    const pressed = new Set(this.filters[kind]);
    row.querySelector('.chips')!.replaceChildren(...chips.map(chip => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'finder-chip';
      button.value = chip.value;
      button.textContent = chip.label;
      button.setAttribute('aria-pressed', String(pressed.has(chip.value)));
      return button;
    }));
    row.hidden = !chips.length || ROW_MODES[kind] !== this.mode;
  }

  /** Drop every active chip — the URL does not carry them, so a history entry
   *  that restores a query must not leave chips looking applied. */
  clearFilters() {
    for (const chip of this.querySelectorAll('.finder-chip')) chip.setAttribute('aria-pressed', 'false');
  }

  #update() {
    const copy = MODE_COPY[this.mode];
    this.#input.placeholder = copy.placeholder;
    this.querySelector('.field-submit')!.textContent = copy.button;
    this.querySelector('.mode-hint')!.textContent = copy.hint;

    const radio = this.querySelector<HTMLInputElement>(`input[name="mode"][value="${this.mode}"]`);
    if (radio) radio.checked = true;

    for (const [row, mode] of Object.entries(ROW_MODES) as Array<[Row, Mode]>) {
      const el = this.querySelector<HTMLElement>(`[data-row="${row}"]`);
      if (el) el.hidden = mode !== this.mode || !el.querySelector('.finder-chip');
    }
  }

  #emit(reason: QueryReason) {
    this.dispatchEvent(new CustomEvent('vfu:query', {
      bubbles: true,
      composed: true,
      detail: { mode: this.mode, query: this.query, filters: this.filters, reason },
    }));
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('vfu-search-bar')) {
  customElements.define('vfu-search-bar', VfuSearchBar);
}
