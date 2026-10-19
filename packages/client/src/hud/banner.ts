export interface BannerSink {
  /** The large centre banner: title text with an optional subtitle. */
  show(text: string, sub: string, color: string): void;
  /** The smaller popup higher on screen, used for kills. */
  popup(text: string, color: string): void;
}

/** Seconds the kill popup stays visible (reference line 1022). */
const POPUP_SECONDS = 1.2;

/** Restarts a CSS animation by removing and re-adding its class. */
function replay(el: HTMLElement, className: string): void {
  el.classList.remove(className);
  void el.offsetWidth;
  el.classList.add(className);
}

/** The `#banner` and `#combo` elements (reference showBanner and showCombo, lines 1016-1089). */
export class Banner implements BannerSink {
  private popupLeft = 0;

  constructor(
    private readonly bannerEl: HTMLElement,
    private readonly popupEl: HTMLElement,
  ) {}

  show(text: string, sub: string, color: string): void {
    const el = this.bannerEl;
    el.replaceChildren(document.createTextNode(text));
    if (sub) {
      const subEl = document.createElement('span');
      subEl.className = 'sub';
      subEl.textContent = sub;
      subEl.style.color = color;
      subEl.style.textShadow = `0 0 14px ${color}`;
      el.append(subEl);
    }
    el.style.color = color;
    el.style.textShadow = `0 0 30px ${color}, 0 0 60px ${color}`;
    replay(el, 'show');
  }

  popup(text: string, color: string): void {
    this.popupEl.textContent = text;
    this.popupEl.style.color = color;
    this.popupEl.classList.add('show');
    this.popupLeft = POPUP_SECONDS;
  }

  update(dt: number): void {
    if (this.popupLeft <= 0) return;
    this.popupLeft -= dt;
    if (this.popupLeft <= 0) this.popupEl.classList.remove('show');
  }
}

/**
 * Seconds before the vignette may flash again. Under sustained fire a hit lands every few ticks;
 * pulsing at this rate keeps each flash distinct instead of leaving the screen permanently red.
 */
const FLASH_COOLDOWN = 0.4;

/**
 * A full-screen vignette flashed on an element: red when the local train is hit (reference lines
 * 1011-1015), green when it collects a full heart.
 */
export class DamageFlash {
  private left = 0;
  private cooldown = 0;

  constructor(private readonly el: HTMLElement) {}

  show(): void {
    if (this.cooldown > 0) return;
    this.left = 0.22;
    this.cooldown = FLASH_COOLDOWN;
    this.el.classList.add('show');
  }

  update(dt: number): void {
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.left <= 0) return;
    this.left -= dt;
    if (this.left <= 0) this.el.classList.remove('show');
  }
}

export interface ScreenFlashSink {
  show(): void;
}
