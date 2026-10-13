import type { WorldView } from '@lw/shared';

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/** What the HUD shows for one frame, derived from the view alone. */
export interface HudModel {
  /** False before the local train exists in the view. */
  hasLocal: boolean;
  /** 0 to 100. */
  hullPct: number;
  /** 0 to 100. */
  fuelPct: number;
  carriages: number;
  /** True while the local train is alive and crossing its own trail. */
  bridge: boolean;
  /** The living boss, if any. */
  boss: { name: string; pct: number } | null;
}

export function hudModel(view: WorldView): HudModel {
  const boss = view.enemies.find((e) => e.kind === 'boss');
  const bossInfo = boss
    ? {
        name: boss.name ?? 'BOSS',
        pct: clamp((boss.hp / boss.maxHp) * 100, 0, 100),
      }
    : null;
  const local = view.trains.find((t) => t.id === view.localId);
  if (!local) {
    return { hasLocal: false, hullPct: 0, fuelPct: 0, carriages: 0, bridge: false, boss: bossInfo };
  }
  return {
    hasLocal: true,
    hullPct: clamp((local.hp / local.maxHp) * 100, 0, 100),
    fuelPct: clamp((local.fuel / local.fuelMax) * 100, 0, 100),
    carriages: local.carriages.length,
    bridge: local.alive && local.bridge,
    boss: bossInfo,
  };
}

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id} in index.html`);
  return el;
}

/** Writes a `HudModel` into the stats panel, boss bar, and bridge indicator. */
export class Hud {
  private readonly carriages = byId('carriages');
  private readonly hpBar = byId('hp');
  private readonly hpVal = byId('hp-val');
  private readonly fuelBar = byId('fuel');
  private readonly fuelVal = byId('boost-val');
  private readonly bossHud = byId('boss-hud');
  private readonly bossName = byId('boss-name');
  private readonly bossHp = byId('boss-hp');
  private readonly bridge = byId('bridge-indicator');

  update(view: WorldView): void {
    const m = hudModel(view);
    if (m.hasLocal) {
      this.carriages.textContent = String(m.carriages);
      this.hpBar.style.width = `${m.hullPct}%`;
      this.hpVal.textContent = `${Math.floor(m.hullPct)}%`;
      this.fuelBar.style.width = `${m.fuelPct}%`;
      this.fuelVal.textContent = `${Math.floor(m.fuelPct)}%`;
    }
    this.bridge.classList.toggle('show', m.bridge);
    if (m.boss) {
      this.bossHud.classList.add('show');
      this.bossHp.style.width = `${m.boss.pct}%`;
      this.bossName.textContent = `⚠ ${m.boss.name} ⚠`;
    } else {
      this.bossHud.classList.remove('show');
    }
  }
}

/** The mute button: label reflects state, a click calls `onToggle` with the new value. */
export function bindMuteButton(
  muted: boolean,
  onToggle: (muted: boolean) => void,
): { setMuted(muted: boolean): void } {
  const button = byId('mute-btn');
  const label = (m: boolean): string => (m ? '🔇 Sound: Off' : '🔊 Sound: On');
  let current = muted;
  button.textContent = label(current);
  button.addEventListener('click', () => {
    current = !current;
    button.textContent = label(current);
    onToggle(current);
    // Return focus to the page so Space does not "click" the button again.
    button.blur();
  });
  return {
    setMuted(m: boolean) {
      current = m;
      button.textContent = label(m);
    },
  };
}
