import { describe, expect, it } from 'vitest';
import { actionForKey, aimAngle, InputState, isTypingTarget } from './input.ts';

describe('key mapping', () => {
  it('maps A/D and the left/right arrows to turning', () => {
    expect(actionForKey('a')).toBe('left');
    expect(actionForKey('A')).toBe('left');
    expect(actionForKey('ArrowLeft')).toBe('left');
    expect(actionForKey('d')).toBe('right');
    expect(actionForKey('D')).toBe('right');
    expect(actionForKey('ArrowRight')).toBe('right');
  });

  it('maps Space to boost and S/Down to brake', () => {
    expect(actionForKey(' ')).toBe('boost');
    expect(actionForKey('s')).toBe('brake');
    expect(actionForKey('S')).toBe('brake');
    expect(actionForKey('ArrowDown')).toBe('brake');
  });

  it('ignores other keys', () => {
    expect(actionForKey('Enter')).toBeNull();
    expect(actionForKey('m')).toBeNull();
    expect(actionForKey('Tab')).toBeNull();
  });
});

describe('InputState', () => {
  it('reports game keys so the page can be kept from scrolling', () => {
    const input = new InputState();
    expect(input.keyDown(' ')).toBe(true);
    expect(input.keyDown('ArrowUp')).toBe(true);
    expect(input.keyDown('ArrowDown')).toBe(true);
    expect(input.keyDown('F5')).toBe(false);
  });

  it('turns left, right, and cancels when both are held', () => {
    const input = new InputState();
    expect(input.turn).toBe(0);
    input.keyDown('a');
    expect(input.turn).toBe(-1);
    input.keyDown('ArrowRight');
    expect(input.turn).toBe(0);
    input.keyUp('a');
    expect(input.turn).toBe(1);
    input.keyUp('ArrowRight');
    expect(input.turn).toBe(0);
  });

  it('produces boost and brake while held', () => {
    const input = new InputState();
    const head = { x: 400, y: 300 };
    input.keyDown(' ');
    input.keyDown('s');
    expect(input.toTrainInput(head, 0)).toMatchObject({ boost: true, brake: true });
    input.keyUp(' ');
    input.keyUp('s');
    expect(input.toTrainInput(head, 0)).toMatchObject({ boost: false, brake: false });
  });

  it('aims at -π/2 with the mouse directly above the head', () => {
    const input = new InputState();
    input.mouseMove(400, 100);
    expect(input.toTrainInput({ x: 400, y: 300 }, 1.23).aim).toBeCloseTo(-Math.PI / 2);
  });

  it('measures aim from the head, not the screen centre', () => {
    const input = new InputState();
    input.mouseMove(500, 300);
    // Head sits left of the mouse: aim is straight right. Head below-left: aim points up-right.
    expect(input.toTrainInput({ x: 400, y: 300 }, 0).aim).toBeCloseTo(0);
    expect(input.toTrainInput({ x: 400, y: 400 }, 0).aim).toBeCloseTo(-Math.PI / 4);
  });

  it('falls back to the given aim until the mouse moves', () => {
    const input = new InputState();
    expect(input.toTrainInput({ x: 0, y: 0 }, 2.5).aim).toBe(2.5);
  });

  it('releases held keys', () => {
    const input = new InputState();
    input.keyDown('d');
    input.keyDown(' ');
    input.releaseAll();
    expect(input.turn).toBe(0);
    expect(input.boosting).toBe(false);
  });
});

describe('fire capture', () => {
  const head = { x: 400, y: 300 };

  function pointer(type: string, button = 0): Event {
    return Object.assign(new Event(type), { button });
  }

  function attached() {
    const input = new InputState();
    const win = new EventTarget();
    const canvas = new EventTarget();
    input.attach(win as unknown as Window, undefined, canvas);
    return { input, win, canvas };
  }

  it('fires while the left button is held on the canvas', () => {
    const { input, win, canvas } = attached();
    expect(input.toTrainInput(head, 0).fire).toBe(false);
    canvas.dispatchEvent(pointer('pointerdown'));
    expect(input.toTrainInput(head, 0).fire).toBe(true);
    expect(input.firing).toBe(true);
    win.dispatchEvent(pointer('pointerup'));
    expect(input.toTrainInput(head, 0).fire).toBe(false);
  });

  it('ignores other mouse buttons', () => {
    const { input, canvas } = attached();
    canvas.dispatchEvent(pointer('pointerdown', 2));
    expect(input.toTrainInput(head, 0).fire).toBe(false);
  });

  it('stops firing when the window loses focus', () => {
    const { input, win, canvas } = attached();
    canvas.dispatchEvent(pointer('pointerdown'));
    win.dispatchEvent(new Event('blur'));
    expect(input.toTrainInput(head, 0).fire).toBe(false);
  });

  it('does not fire from a click outside the canvas', () => {
    const { input, win } = attached();
    win.dispatchEvent(pointer('pointerdown'));
    win.dispatchEvent(pointer('mousedown'));
    expect(input.toTrainInput(head, 0).fire).toBe(false);
  });

  it('stops firing on a mouse move with the button up (a release outside the window)', () => {
    const { input, win, canvas } = attached();
    canvas.dispatchEvent(pointer('pointerdown'));
    win.dispatchEvent(
      Object.assign(new Event('mousemove'), { clientX: 1, clientY: 1, buttons: 1 }),
    );
    expect(input.firing).toBe(true);
    win.dispatchEvent(
      Object.assign(new Event('mousemove'), { clientX: 1, clientY: 1, buttons: 0 }),
    );
    expect(input.firing).toBe(false);
  });

  it('is released by releaseAll', () => {
    const input = new InputState();
    input.fireDown();
    input.releaseAll();
    expect(input.firing).toBe(false);
  });
});

describe('aimAngle', () => {
  it('points right, down, left, and up', () => {
    expect(aimAngle(10, 0, 0, 0)).toBeCloseTo(0);
    expect(aimAngle(0, 10, 0, 0)).toBeCloseTo(Math.PI / 2);
    expect(aimAngle(-10, 0, 0, 0)).toBeCloseTo(Math.PI);
    expect(aimAngle(0, -10, 0, 0)).toBeCloseTo(-Math.PI / 2);
  });
});

describe('isTypingTarget', () => {
  it('treats text fields as typing, so game keys are left to them', () => {
    expect(isTypingTarget({ tagName: 'INPUT' })).toBe(true);
    expect(isTypingTarget({ tagName: 'textarea' })).toBe(true);
    expect(isTypingTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true);
  });

  it('does not treat the page or canvas as typing', () => {
    expect(isTypingTarget({ tagName: 'CANVAS' })).toBe(false);
    expect(isTypingTarget({ tagName: 'BODY' })).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
