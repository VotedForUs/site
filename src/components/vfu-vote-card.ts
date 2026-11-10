/**
 * `<vfu-vote-card>` — the native vote dialog, and its share-copy.
 *
 * Open and close are native (`showModal` / `command="close"`). The element
 * that opened it — `vfu-member-record` or `vfu-vote-roll` — fills the card and
 * owns the address bar; this one reports close and prev/next as events.
 */
export class VfuVoteCard extends HTMLElement {
  #dialog: HTMLDialogElement | null = null;

  /**
   * @returns Share URL for this member×vote
   */
  get shareUrl(): string {
    return this.getAttribute('share-url') ?? '';
  }

  /**
   * @returns URL the opener returns to when the dialog closes
   */
  get closeHref(): string {
    return this.getAttribute('close-href') ?? '';
  }

  /**
   * Bind native dialog close, share-copy, and stepping.
   */
  connectedCallback() {
    const dialog = this.querySelector('dialog');
    if (!dialog) return;
    this.#dialog = dialog;
    dialog.addEventListener('close', this.#onClose);
    this.querySelector('[data-copy]')?.addEventListener('click', this.#onCopy);
    this.addEventListener('click', this.#onStep);
    if (this.hasAttribute('open') && !dialog.open) {
      dialog.showModal();
    }
  }

  disconnectedCallback() {
    this.#dialog?.removeEventListener('close', this.#onClose);
    this.querySelector('[data-copy]')?.removeEventListener('click', this.#onCopy);
    this.removeEventListener('click', this.#onStep);
  }

  /**
   * The dialog closed. Whoever opened it owns the URL — the member record or
   * the roll — so this only says so.
   */
  #onClose = () => {
    this.dispatchEvent(new CustomEvent('vfu-vote-close', { bubbles: true }));
  };

  /**
   * Prev and next stay on this document: the parent refills the card.
   *
   * @param event - Click inside the dialog
   */
  #onStep = (event: MouseEvent) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = (event.target as Element | null)?.closest?.('[data-prev], [data-next]');
    if (!(link instanceof HTMLAnchorElement) || !link.getAttribute('href')) return;
    event.preventDefault();
    this.dispatchEvent(new CustomEvent('vfu-vote-step', {
      bubbles: true,
      detail: { href: link.getAttribute('href') },
    }));
  };

  #onCopy = async () => {
    const input = this.querySelector<HTMLInputElement>('[data-share]');
    const url = input?.value || this.shareUrl;
    if (!url) return;
    try {
      await navigator.clipboard.writeText(new URL(url, window.location.origin).href);
    } catch {
      input?.select();
    }
  };
}

if (typeof customElements !== 'undefined' && !customElements.get('vfu-vote-card')) {
  customElements.define('vfu-vote-card', VfuVoteCard);
}
