/**
 * `<vfu-vote-card>` — URL state and share-copy for the native vote dialog.
 *
 * Open and close are native (`showModal` / `command="close"`). This element
 * keeps the address bar in sync and copies the share URL.
 */
export class VfuVoteCard extends HTMLElement {
  #dialog: HTMLDialogElement | null = null;

  /**
   * @returns Canonical share URL for this member×vote
   */
  get shareUrl(): string {
    return this.getAttribute('share-url') ?? '';
  }

  /**
   * @returns Page to show when the dialog closes (the roll, or the member bill)
   */
  get closeHref(): string {
    return this.getAttribute('close-href') ?? '';
  }

  /**
   * Bind native dialog close, share-copy, and member-context stepping.
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
   * Bill context: return to the roll. Member context: the parent owns the URL.
   */
  #onClose = () => {
    if (this.getAttribute('context') === 'member') {
      this.dispatchEvent(new CustomEvent('vfu-vote-close', { bubbles: true }));
      return;
    }
    const href = this.closeHref;
    if (href && href !== window.location.pathname) {
      window.history.pushState(null, '', href);
    }
  };

  /**
   * On the member path, prev/next stay on this document.
   *
   * @param event - Click inside the dialog
   */
  #onStep = (event: MouseEvent) => {
    if (this.getAttribute('context') !== 'member') return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey) return;
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
