import type { DrawEnv } from '../render/canvas.ts';
import { screenX, screenY } from '../render/canvas.ts';

export interface DamageNumber {
  x: number;
  y: number;
  text: string;
  color: string;
  age: number;
  life: number;
  vy: number;
  critical: boolean;
}

/** Most numbers alive at once (reference line 1052). */
export const MAX_DAMAGE_NUMBERS = 60;

export interface DamageNumberSink {
  add(x: number, y: number, amount: number, color?: string): void;
}

/** Floating damage numbers that rise, slow, and fade (reference lines 1046-1053, 1462-1468). */
export class DamageNumbers implements DamageNumberSink {
  readonly numbers: DamageNumber[] = [];

  add(x: number, y: number, amount: number, color = '#ffeb3b'): void {
    this.numbers.push({
      x,
      y,
      text: Math.max(1, Math.round(amount)).toString(),
      color,
      age: 0,
      life: 1.0,
      vy: -50,
      critical: amount >= 20,
    });
    if (this.numbers.length > MAX_DAMAGE_NUMBERS) this.numbers.shift();
  }

  clear(): void {
    this.numbers.length = 0;
  }

  update(dt: number): void {
    const list = this.numbers;
    let w = 0;
    for (let r = 0; r < list.length; r++) {
      const n = list[r] as DamageNumber;
      n.age += dt;
      n.y += n.vy * dt;
      n.vy += 30 * dt;
      if (n.age < n.life) list[w++] = n;
    }
    list.length = w;
  }

  draw(env: DrawEnv): void {
    const { ctx } = env;
    for (const n of this.numbers) {
      const px = screenX(env, n.x);
      const py = screenY(env, n.y);
      ctx.globalAlpha = Math.max(0, 1 - n.age / n.life);
      ctx.fillStyle = n.color;
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.lineWidth = n.critical ? 4 : 3;
      ctx.font = n.critical ? 'bold 22px monospace' : 'bold 16px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.strokeText(n.text, px, py);
      ctx.fillText(n.text, px, py);
    }
    ctx.globalAlpha = 1;
  }
}
