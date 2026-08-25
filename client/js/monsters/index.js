// Psychological horror event scheduler. Subtle, rare, unpredictable.
// Some events are host-authored and broadcast; some are personal hallucinations.
import { rngFrom, hashStr } from '../rng.js';

export class HorrorEvents {
  constructor(world, worldMgr, audio, renderer, network) {
    this.world = world;
    this.worldMgr = worldMgr;
    this.audio = audio;
    this.renderer = renderer;
    this.network = network;
    this.timer = 18 + Math.random() * 20;
    this.personalTimer = 30 + Math.random() * 40;
    this.time = 0;
    this.isHostFn = () => false;
    this.onMessage = null;
    this.lightMgr = null;
  }

  setHostFn(fn) { this.isHostFn = fn; }
  setLightMgr(lm) { this.lightMgr = lm; }

  update(dt, player) {
    this.time += dt;
    this.timer -= dt;
    this.personalTimer -= dt;

    if (this.timer <= 0) {
      this.timer = 40 + Math.random() * 60;
      if (this.isHostFn()) {
        const kinds = ['distantmetal', 'lightflicker', 'creak', 'breath', 'scream', 'footsteps', 'lightdie'];
        const kind = kinds[(Math.random() * kinds.length) | 0];
        this.network.sendEvent(kind, { x: player.pos.x, z: player.pos.z });
        this.fire(kind, player);
      }
    }
    if (this.personalTimer <= 0) {
      this.personalTimer = 60 + Math.random() * 80;
      const roll = Math.random();
      if (roll < 0.35) this.fire('behindyou', player);
      else if (roll < 0.55) this.fire('glitch', player);
      else if (roll < 0.75) this.fire('whisper', player);
      else if (roll < 0.85) this.fire('footsteps', player);
      // else: nothing. silence is part of the horror.
    }
  }

  fire(kind, player, data) {
    const a = this.audio;
    switch (kind) {
      case 'distantmetal': a.distantMetal(0.8 + Math.random() * 0.6); break;
      case 'creak': a.creak(); break;
      case 'scream': {
        a.distantScream(0.7 + Math.random() * 0.5);
        if (this.onMessage && Math.random() < 0.5) this.onMessage('A DISTANT SCREAM.');
        break;
      }
      case 'footsteps': {
        a.distantFootsteps(3 + (Math.random() * 4 | 0));
        break;
      }
      case 'lightdie': {
        // nearest fixture goes out for good + the hum drops
        if (this.lightMgr && player) {
          const key = this.lightMgr.killNearest(player.pos.x, player.pos.z, 12);
          if (key) {
            a.buzz(player.pos.x, player.pos.z, 0.6);
            this.renderer.bumpGlitch(0.8);
            if (this.onMessage && Math.random() < 0.4) this.onMessage('A LIGHT DIED NEARBY.');
          }
        }
        break;
      }
      case 'lightflicker': {
        this.renderer.bumpGlitch(0.5);
        a.buzz(player.pos.x + 2, player.pos.z, 1.2);
        break;
      }
      case 'breath': {
        a.behindYou();
        if (this.onMessage) this.onMessage('YOU HEAR BREATHING.');
        break;
      }
      case 'behindyou': {
        a.behindYou();
        if (this.onMessage) this.onMessage('SOMETHING MOVED BEHIND YOU.');
        break;
      }
      case 'glitch': this.renderer.bumpGlitch(1.2); break;
      case 'whisper': {
        a.monsterVoice('shadow', player.pos.x + (Math.random() - 0.5) * 6, 1.5, player.pos.z + (Math.random() - 0.5) * 6, 0.25);
        break;
      }
      case 'dooropen': {
        a.doorCreak(player.pos.x + 3, player.pos.z);
        this.renderer.bumpGlitch(0.4);
        break;
      }
      case 'heartbeat': a.heartbeat(1); break;
    }
  }
}
