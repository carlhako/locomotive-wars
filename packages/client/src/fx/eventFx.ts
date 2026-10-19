import { wrapDist } from '@lw/shared';
import type { EnemyKind, SimEvent, WorldView } from '@lw/shared';
import type { SoundPlayer } from '../audio/sound.ts';
import type { BannerSink, ScreenFlashSink } from '../hud/banner.ts';
import type { KillFeedSink } from '../hud/killfeed.ts';
import { CARRIAGE_TYPES, HEAL_COLOR, HEART_COLORS } from '../render/palette.ts';
import type { DamageNumberSink } from './damageNumbers.ts';
import type { HitFlashSink } from './hitFlash.ts';
import { burst, muzzleSparks } from './particles.ts';
import type { ParticleSink, Rand } from './particles.ts';
import type { ShakeSink } from './shake.ts';
import type { TurretSink } from './turrets.ts';
import type { ZapSink } from './zaps.ts';

/** Everything a simulation event can turn into. Each member is a narrow interface for tests. */
export interface FxTargets {
  particles: ParticleSink;
  damageNumbers: DamageNumberSink;
  shake: ShakeSink;
  hitFlash: HitFlashSink;
  /** Red vignette over the whole screen. */
  screenFlash: ScreenFlashSink;
  /** Green vignette over the whole screen, for a full heal. */
  healFlash: ScreenFlashSink;
  killFeed: KillFeedSink;
  banner: BannerSink;
  sound: SoundPlayer;
  turrets: TurretSink;
  zaps: ZapSink;
}

/** Events farther than this from the local head make no sound. */
export const AUDIBLE_RANGE = 900;
/** A mine going off this close to the local head shakes the screen. */
export const MINE_SHAKE_RANGE = 300;

interface Known {
  name: string;
  color: string;
}

/**
 * Remembers train names and colours by id. A destroyed train may already be gone from the next
 * view, so events that name it are resolved against what was seen earlier.
 */
export class NameBook {
  private readonly known = new Map<number, Known>();

  observe(view: WorldView): void {
    for (const t of view.trains) this.known.set(t.id, { name: t.name, color: t.color });
  }

  /** Records a train known from outside the view, without overwriting what the view showed. */
  remember(id: number, name: string, color: string): void {
    if (!this.known.has(id)) this.known.set(id, { name, color });
  }

  name(id: number | null): string {
    return (id === null ? undefined : this.known.get(id)?.name) ?? 'Unknown';
  }

  color(id: number | null): string | undefined {
    return id === null ? undefined : this.known.get(id)?.color;
  }

  clear(): void {
    this.known.clear();
  }
}

export interface FxContext {
  /** The most recent view, used for the local player's id and position. */
  view: WorldView;
  names: NameBook;
  /** World side length, for wrapped distances. */
  size: number;
  rand?: Rand;
}

const BOSS_COLOR = '#ff88ff';
const ENEMY_COLOR = '#ff8844';

type TrainDestroyedEvent = Extract<SimEvent, { type: 'trainDestroyed' }>;

const ENEMY_LABELS: Record<EnemyKind, string> = {
  drone: 'Drone',
  hunter: 'Hunter',
  sentry: 'Sentry',
  boss: 'Boss',
};

/** What killed the train: a name and colour for the kill feed, or null when nobody is credited. */
function killerOf(
  e: TrainDestroyedEvent,
  view: WorldView,
  names: NameBook,
): { name: string; color: string | undefined; generic?: boolean } | null {
  if (e.killerTrainId !== undefined) {
    return { name: names.name(e.killerTrainId), color: names.color(e.killerTrainId) };
  }
  if (e.killerEnemyId !== undefined) {
    const enemy = view.enemies.find((en) => en.id === e.killerEnemyId);
    if (e.cause === 'boss') {
      return enemy?.name
        ? { name: enemy.name, color: BOSS_COLOR }
        : { name: 'The boss', color: BOSS_COLOR, generic: true };
    }
    return enemy
      ? { name: ENEMY_LABELS[enemy.kind], color: ENEMY_COLOR }
      : { name: 'An enemy', color: ENEMY_COLOR, generic: true };
  }
  return null;
}

/** The notice shown to a player whose train was just destroyed. */
export function destroyedNotice(e: TrainDestroyedEvent, view: WorldView, names: NameBook): string {
  const killer = killerOf(e, view, names);
  if (!killer) return 'Wrecked';
  // Generic fallbacks read as a phrase ("an enemy"); named killers keep their case.
  return `Destroyed by ${killer.generic ? killer.name.toLowerCase() : killer.name}`;
}

const CAUSE_VERBS: Record<TrainDestroyedEvent['cause'], string> = {
  ram: 'rammed',
  weapon: 'shot',
  enemy: 'destroyed',
  boss: 'destroyed',
};

/**
 * Turns a tick's simulation events into presentation: particles, damage numbers, shake, flashes,
 * kill feed lines, banners, and sound. "The player" is whichever train `view.localId` names, so
 * the same code serves offline play and a networked client.
 */
export function applyEvents(events: readonly SimEvent[], ctx: FxContext, fx: FxTargets): void {
  const { view, names } = ctx;
  const rand = ctx.rand ?? Math.random;
  const localId = view.localId;
  const local = view.trains.find((t) => t.id === localId);

  const audible = (x: number, y: number): boolean => {
    if (!local) return false;
    return wrapDist(x, y, local.x, local.y, ctx.size) < AUDIBLE_RANGE;
  };

  for (const e of events) {
    switch (e.type) {
      case 'fired': {
        if (e.ownerKind !== 'train') break;
        if (e.carriage !== undefined) fx.turrets.aim(e.ownerId, e.carriage, e.angle);
        muzzleSparks(
          fx.particles,
          e.x,
          e.y,
          e.angle,
          e.weapon === 'missile' ? '#ffaa44' : '#ffff88',
          rand,
        );
        if (e.ownerId === localId || audible(e.x, e.y)) fx.sound.shoot(e.weapon);
        break;
      }

      case 'hit': {
        if (e.victimKind === 'enemy') {
          const boss = view.enemies.find((en) => en.id === e.victimId)?.kind === 'boss';
          fx.damageNumbers.add(e.x, e.y, e.amount, boss ? BOSS_COLOR : '#ffaa44');
          burst(
            fx.particles,
            e.x,
            e.y,
            {
              count: 5,
              speed: [50, 150],
              life: 0.3,
              color: '#ffaa44',
              size: [2, 4],
              type: 'spark',
            },
            rand,
          );
          fx.hitFlash.add(e.victimId, 0.15);
          if (audible(e.x, e.y)) fx.sound.hit();
          break;
        }
        const isLocal = e.victimId === localId;
        fx.hitFlash.add(e.victimId, 0.2);
        if (isLocal) {
          fx.damageNumbers.add(e.x, e.y, e.amount, '#ff8800');
          burst(
            fx.particles,
            e.x,
            e.y,
            {
              count: 5,
              speed: [50, 150],
              life: 0.4,
              color: '#ff8800',
              size: [2, 4],
              type: 'spark',
            },
            rand,
          );
          fx.screenFlash.show();
          fx.sound.damage();
        } else {
          fx.damageNumbers.add(e.x, e.y, e.amount, '#ff4444');
          if (audible(e.x, e.y)) fx.sound.hit();
        }
        break;
      }

      case 'enemyDestroyed': {
        burst(
          fx.particles,
          e.x,
          e.y,
          {
            count: 18,
            speed: [50, 220],
            life: [0.9, 1.9],
            color: e.enemyKind === 'sentry' ? '#ffaa00' : '#ff4444',
            size: [2, 6],
            type: 'smoke',
          },
          rand,
        );
        if (audible(e.x, e.y)) fx.sound.explosion(false);
        break;
      }

      case 'trainDestroyed': {
        const color = names.color(e.victimId) ?? '#ff4444';
        burst(
          fx.particles,
          e.x,
          e.y,
          {
            count: 60,
            speed: [80, 280],
            life: [1.5, 2],
            color: ['#ffaa44', '#ff4422', '#ffeb3b', color],
            size: [2, 7],
            type: 'smoke',
            jitter: 10,
          },
          rand,
        );
        const victimIsLocal = e.victimId === localId;
        if (victimIsLocal || audible(e.x, e.y)) fx.sound.explosion(true);

        const victim = names.name(e.victimId);
        const killer = killerOf(e, view, names);
        if (killer) {
          fx.killFeed.add({
            killer: killer.name,
            killerColor: killer.color,
            victim,
            victimColor: color,
            weapon: CAUSE_VERBS[e.cause],
            style: 'normal',
          });
        } else {
          fx.killFeed.add({
            victim,
            victimColor: color,
            weapon: 'was destroyed',
            style: 'system',
          });
        }

        if (victimIsLocal) {
          fx.shake.add(25, 1.0);
          fx.screenFlash.show();
          fx.sound.death();
          fx.banner.show(destroyedNotice(e, view, names), '', '#ff4444');
        } else if (e.killerTrainId === localId) {
          fx.banner.popup(`KILL  ${victim}`, '#ffeb3b');
        }
        break;
      }

      case 'pickup': {
        const color = CARRIAGE_TYPES[e.carriage].color;
        burst(
          fx.particles,
          e.x,
          e.y,
          {
            count: e.source === 'trailer' ? 10 : 8,
            speed: [50, 180],
            life: e.source === 'trailer' ? 0.5 : 0.4,
            color,
            size: [2, 4],
            type: 'spark',
          },
          rand,
        );
        if (e.trainId === localId) fx.sound.pickup();
        break;
      }

      case 'heart': {
        const full = e.kind === 'full';
        burst(
          fx.particles,
          e.x,
          e.y,
          {
            count: full ? 16 : 8,
            speed: [40, 140],
            life: [0.6, 1.0],
            color: [HEART_COLORS[e.kind], HEAL_COLOR],
            size: full ? [4, 6] : [3, 4],
            type: 'heart',
          },
          rand,
        );
        // A full heart at full hull restores nothing, so there is no number to show.
        if (e.amount > 0) fx.damageNumbers.add(e.x, e.y, e.amount, HEAL_COLOR, '+');
        if (e.trainId === localId) {
          if (full) {
            fx.healFlash.show();
            fx.sound.fullHeal();
          } else {
            fx.sound.slowHeal();
          }
        }
        break;
      }

      case 'bridgeOn':
        if (e.trainId === localId) fx.sound.bridgeOn();
        break;

      case 'bridgeOff':
        if (e.trainId === localId) fx.sound.bridgeOff();
        break;

      case 'zap': {
        fx.zaps.add(e.points);
        if (e.ownerId === localId || audible(e.x, e.y)) fx.sound.zap();
        break;
      }

      case 'mineExploded': {
        burst(
          fx.particles,
          e.x,
          e.y,
          {
            count: 24,
            speed: [50, 180],
            life: [0.5, 1.1],
            color: ['#ffaa44', '#ff4422', '#ffeb3b'],
            size: [2, 5],
            type: 'smoke',
          },
          rand,
        );
        if (e.ownerId === localId || audible(e.x, e.y)) fx.sound.mine();
        if (local && wrapDist(e.x, e.y, local.x, local.y, ctx.size) < MINE_SHAKE_RANGE) {
          fx.shake.add(8, 0.35);
        }
        break;
      }

      case 'bossSpawn': {
        fx.sound.bossSpawn();
        fx.banner.show(`⚠ ${e.name} ⚠`, 'WARNING: BOSS APPROACHING', BOSS_COLOR);
        fx.shake.add(15, 1.5);
        fx.killFeed.add({
          killer: 'SYSTEM',
          killerColor: BOSS_COLOR,
          victim: e.name,
          victimColor: '#ff00ff',
          weapon: 'incoming',
          style: 'system',
        });
        break;
      }

      case 'bossDown': {
        burst(
          fx.particles,
          e.x,
          e.y,
          {
            count: 80,
            speed: [50, 220],
            life: [0.9, 1.9],
            color: BOSS_COLOR,
            size: [2, 6],
            type: 'smoke',
          },
          rand,
        );
        if (audible(e.x, e.y) || e.sourceId === localId) fx.sound.explosion(true);
        if (e.sourceId !== null) {
          fx.killFeed.add({
            killer: names.name(e.sourceId),
            killerColor: names.color(e.sourceId),
            victim: e.name,
            victimColor: '#ff00ff',
            weapon: 'defeated',
            style: 'boss',
          });
        }
        if (e.sourceId === localId) {
          fx.shake.add(20, 0.8);
          fx.banner.show('BOSS DOWN!', '', BOSS_COLOR);
        }
        break;
      }
    }
  }
}
