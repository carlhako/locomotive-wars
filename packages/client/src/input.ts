import type { TrainInput } from '@lw/shared';

/**
 * Keyboard and mouse capture, converted to the shared `TrainInput`. The aim angle is the
 * bearing from the local head's screen position to the mouse, so it is correct however the
 * camera is offset by smoothing or the map seam.
 */

export type KeyAction = 'left' | 'right' | 'brake' | 'boost' | 'forward';

/**
 * Maps a `KeyboardEvent.key` to a game action. W and Up are recognised so the page never
 * scrolls on them, even though the train needs no throttle.
 */
export function actionForKey(key: string): KeyAction | null {
  switch (key.length === 1 ? key.toLowerCase() : key) {
    case 'a':
    case 'ArrowLeft':
      return 'left';
    case 'd':
    case 'ArrowRight':
      return 'right';
    case 's':
    case 'ArrowDown':
      return 'brake';
    case ' ':
      return 'boost';
    case 'w':
    case 'ArrowUp':
      return 'forward';
    default:
      return null;
  }
}

/** True when keys typed at `target` belong to a text field, not to the game. */
export function isTypingTarget(
  target: { tagName?: string; isContentEditable?: boolean } | null,
): boolean {
  if (!target) return false;
  const tag = target.tagName?.toUpperCase();
  return (
    tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable === true
  );
}

/** World-space aim angle for a mouse at (mouseX, mouseY) with the head at (headX, headY). */
export function aimAngle(mouseX: number, mouseY: number, headX: number, headY: number): number {
  return Math.atan2(mouseY - headY, mouseX - headX);
}

export class InputState {
  private left = false;
  private right = false;
  private brake = false;
  private boost = false;
  private fire = false;
  /** Last known mouse position in CSS pixels, or null before the mouse first moves. */
  mouse: { x: number; y: number } | null = null;

  /** Records a key press. Returns true when the key is a game key (the caller should prevent scrolling). */
  keyDown(key: string): boolean {
    return this.set(key, true);
  }

  keyUp(key: string): boolean {
    return this.set(key, false);
  }

  private set(key: string, down: boolean): boolean {
    const action = actionForKey(key);
    switch (action) {
      case 'left':
        this.left = down;
        break;
      case 'right':
        this.right = down;
        break;
      case 'brake':
        this.brake = down;
        break;
      case 'boost':
        this.boost = down;
        break;
      default:
        break;
    }
    return action !== null;
  }

  mouseMove(x: number, y: number): void {
    this.mouse = { x, y };
  }

  /** The fire button went down over the playfield. */
  fireDown(): void {
    this.fire = true;
  }

  /** The fire button was released, wherever the pointer is. */
  fireUp(): void {
    this.fire = false;
  }

  /** Releases every held key and the fire button, for when the window loses focus. */
  releaseAll(): void {
    this.left = this.right = this.brake = this.boost = this.fire = false;
  }

  get boosting(): boolean {
    return this.boost;
  }

  get firing(): boolean {
    return this.fire;
  }

  /** -1 left, +1 right, 0 when neither or both are held. */
  get turn(): number {
    return (this.right ? 1 : 0) - (this.left ? 1 : 0);
  }

  /**
   * The input for the next tick. `head` is the local head's screen position; `fallbackAim` is
   * used until the mouse has moved.
   */
  toTrainInput(head: { x: number; y: number }, fallbackAim: number): TrainInput {
    return {
      turn: this.turn,
      boost: this.boost,
      brake: this.brake,
      fire: this.fire,
      aim: this.mouse ? aimAngle(this.mouse.x, this.mouse.y, head.x, head.y) : fallbackAim,
    };
  }

  /**
   * Wires the window's keyboard and mouse events. Fire starts only from a left-button press on
   * `fireSurface` (the game canvas), so clicks on buttons and overlays never fire; it stops on a
   * release anywhere in the window or when the window loses focus. Returns a function that
   * removes the listeners.
   */
  attach(target: Window, onGesture?: () => void, fireSurface?: EventTarget): () => void {
    const onKeyDown = (e: KeyboardEvent): void => {
      // A name box (the high score entry) gets its keys: A, D, S, and Space must type.
      if (isTypingTarget(e.target as Element | null)) return;
      if (this.keyDown(e.key)) e.preventDefault();
      onGesture?.();
    };
    const onKeyUp = (e: KeyboardEvent): void => {
      this.keyUp(e.key);
    };
    const onMouseMove = (e: MouseEvent): void => {
      this.mouseMove(e.clientX, e.clientY);
      // A release outside the window may never reach us; a move with no button down ends fire.
      if ((e.buttons & 1) === 0) this.fireUp();
    };
    const onMouseDown = (): void => onGesture?.();
    const onFireDown = (e: Event): void => {
      if ((e as PointerEvent).button === 0) this.fireDown();
    };
    const onFireUp = (e: Event): void => {
      if ((e as PointerEvent).button === 0) this.fireUp();
    };
    const onContextMenu = (e: Event): void => e.preventDefault();
    const onBlur = (): void => this.releaseAll();
    // Capture phase so the page's own handlers cannot swallow game keys before we see them.
    target.addEventListener('keydown', onKeyDown, { capture: true });
    target.addEventListener('keyup', onKeyUp);
    target.addEventListener('mousemove', onMouseMove);
    target.addEventListener('mousedown', onMouseDown);
    target.addEventListener('pointerup', onFireUp);
    fireSurface?.addEventListener('pointerdown', onFireDown);
    target.addEventListener('contextmenu', onContextMenu);
    target.addEventListener('blur', onBlur);
    return () => {
      target.removeEventListener('keydown', onKeyDown, { capture: true });
      target.removeEventListener('keyup', onKeyUp);
      target.removeEventListener('mousemove', onMouseMove);
      target.removeEventListener('mousedown', onMouseDown);
      target.removeEventListener('pointerup', onFireUp);
      fireSurface?.removeEventListener('pointerdown', onFireDown);
      target.removeEventListener('contextmenu', onContextMenu);
      target.removeEventListener('blur', onBlur);
    };
  }
}
