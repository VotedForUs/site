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

  connectedCallback() {
    const dialog = this.querySelector('dialog');
    if (!dialog) return;
    this.#dialog = dialog;
    dialog.addEventListener('close', this.#onClose);
    this.querySelector('[data-copy]')?.addEventListener('click', this.#onCopy);
    if (this.hasAttribute('open') && !dialog.open) {
      dialog.showModal();
    }
  }

  disconnectedCallback() {
    this.#dialog?.removeEventListener('close', this.#onClose);
    this.querySelector('[data-copy]')?.removeEventListener('click', this.#onCopy);
  }

  #onClose = () => {
    const href = this.closeHref;
    if (href && href !== window.location.pathname) {
      window.history.pushState(null, '', href);
    }
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
