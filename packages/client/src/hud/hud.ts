import type { WorldView } from '@lw/shared';
import type { RoundStatus } from '../source.ts';

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
  /** Live score: carriages behind the locomotive. */
  length: number;
  /** The longest the train has been this round. */
  roundBest: number;
  /** True while the local train is alive and crossing its own trail. */
  bridge: boolean;
  /** Active healing doses on the local train; the heart indicator shows while above 0. */
  doses: number;
  /** The living boss, if any. */
  boss: { name: string; pct: number } | null;
  /** The round clock while playing: `m:ss`, `urgent` in the final 10 seconds. */
  timer: { text: string; urgent: boolean } | null;
}

/** Final seconds of a round during which the timer is highlighted. */
const URGENT_SECONDS = 10;

/** Whole seconds shown as `m:ss`, rounding up so `0:00` only appears at the very end. */
export function formatTimer(secondsLeft: number): string {
  const total = Math.max(0, Math.ceil(secondsLeft));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function timerModel(round: RoundStatus | null | undefined): HudModel['timer'] {
  if (!round || round.phase !== 'playing') return null;
  return {
    text: formatTimer(round.secondsLeft),
    urgent: Math.ceil(round.secondsLeft) <= URGENT_SECONDS,
  };
}

export function hudModel(view: WorldView, round?: RoundStatus | null): HudModel {
  const boss = view.enemies.find((e) => e.kind === 'boss');
  const bossInfo = boss
    ? {
        name: boss.name ?? 'BOSS',
        pct: clamp((boss.hp / boss.maxHp) * 100, 0, 100),
      }
    : null;
  const local = view.trains.find((t) => t.id === view.localId);
  const timer = timerModel(round);
  if (!local) {
    return {
      hasLocal: false,
      hullPct: 0,
      fuelPct: 0,
      length: 0,
      roundBest: 0,
      bridge: false,
      doses: 0,
      boss: bossInfo,
      timer,
    };
  }
  const length = Math.max(0, local.carriages.length - 1);
  return {
    hasLocal: true,
    hullPct: clamp((local.hp / local.maxHp) * 100, 0, 100),
    fuelPct: clamp((local.fuel / local.fuelMax) * 100, 0, 100),
    length,
    // The server's figure can trail the live length by a snapshot.
    roundBest: Math.max(local.roundBest, length),
    bridge: local.alive && local.bridge,
    doses: local.alive ? view.localDoses : 0,
    boss: bossInfo,
    timer,
  };
}

/** The banner shown while an inactivity kick is coming. */
export function idleWarningText(secondsLeft: number): string {
  return `Still there? Move or you will be kicked in ${Math.max(0, secondsLeft)}s`;
}

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id} in index.html`);
  return el;
}

/** Writes a `HudModel` into the stats panel, round timer, boss bar, and bridge indicator. */
export class Hud {
  private readonly length = byId('length');
  private readonly roundBest = byId('round-best');
  private readonly timer = byId('round-timer');
  private readonly idle = byId('idle-warning');
  private readonly hpBar = byId('hp');
  private readonly hpVal = byId('hp-val');
  private readonly fuelBar = byId('fuel');
  private readonly fuelVal = byId('boost-val');
  private readonly bossHud = byId('boss-hud');
  private readonly bossName = byId('boss-name');
  private readonly bossHp = byId('boss-hp');
  private readonly bridge = byId('bridge-indicator');
  private readonly doses = byId('heal-doses');
  private readonly dosesN = byId('heal-doses-n');

  update(view: WorldView, round?: RoundStatus | null, idleSeconds?: number | null): void {
    const m = hudModel(view, round);
    this.timer.classList.toggle('show', m.timer !== null);
    this.timer.classList.toggle('urgent', m.timer?.urgent ?? false);
    if (m.timer) this.timer.textContent = m.timer.text;
    this.idle.classList.toggle('show', idleSeconds != null);
    if (idleSeconds != null) this.idle.textContent = idleWarningText(idleSeconds);
    if (m.hasLocal) {
      this.length.textContent = String(m.length);
      this.roundBest.textContent = String(m.roundBest);
      this.hpBar.style.width = `${m.hullPct}%`;
      this.hpVal.textContent = `${Math.floor(m.hullPct)}%`;
      this.fuelBar.style.width = `${m.fuelPct}%`;
      this.fuelVal.textContent = `${Math.floor(m.fuelPct)}%`;
    }
    this.bridge.classList.toggle('show', m.bridge);
    this.doses.classList.toggle('show', m.doses > 0);
    if (m.doses > 0) this.dosesN.textContent = String(m.doses);
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
