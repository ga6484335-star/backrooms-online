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
    this.director = { distance: 0 }; // fed from the main loop
    // story flavour: a per-level pool of unsettling one-liners. When set, the
    // scheduler occasionally surfaces one instead of a generic scare message.
    this.ambientLine = null;         // fn() -> string
    this.radioLine = null;           // fn() -> string (other people's traffic)
  }

  setHostFn(fn) { this.isHostFn = fn; }
  setLightMgr(lm) { this.lightMgr = lm; }

  update(dt, player) {
    this.time += dt;
    this.timer -= dt;
    this.personalTimer -= dt;

    // director: deeper exploration quickens the world's pulse
    const dist = this.director ? this.director.distance : 0;
    const depth = dist < 120 ? 0 : dist < 400 ? 0.15 : Math.min(0.35, (dist - 400) / 1500);

    if (this.timer <= 0) {
      this.timer = (40 + Math.random() * 60) * (1 - depth * 0.5);
      if (this.isHostFn()) {
        const kinds = ['distantmetal', 'lightflicker', 'creak', 'breath', 'scream', 'footsteps', 'lightdie',
          'doorslam', 'objectfall', 'waterdrip', 'lighton'];
        const kind = kinds[(Math.random() * kinds.length) | 0];
        this.network.sendEvent(kind, { x: player.pos.x, z: player.pos.z });
        this.fire(kind, player);
      }
    }
    if (this.personalTimer <= 0) {
      this.personalTimer = (60 + Math.random() * 80) * (1 - depth * 0.4);
      // sometimes the room itself speaks — an environmental story fragment
      // delivered as a found-footage subtitle rather than a scare. Occasionally
      // it is a scrap of someone else's radio traffic instead.
      if (this.ambientLine && Math.random() < 0.32) {
        this.fire('storyline', player);
        return;
      }
      const roll = Math.random();
      if (roll < 0.26) this.fire('behindyou', player);
      else if (roll < 0.4) this.fire('glitch', player);
      else if (roll < 0.56) this.fire('whisper', player);
      else if (roll < 0.68) this.fire('footsteps', player);
      else if (roll < 0.77) this.fire('waterdrip', player);
      else if (roll < 0.83) this.fire('heartbeat', player);
      else if (roll < 0.9) this.fire('radio', player);
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
      case 'storyline': {
        // the whisper answers in words. Faint voice, unsettling caption, and
        // a barely-there glitch so it reads as a recording, not a subtitle.
        if (this.onMessage) {
          const line = this.ambientLine ? this.ambientLine() : null;
          if (line) {
            this.onMessage(line);
            a.monsterVoice('shadow', player.pos.x + (Math.random() - 0.5) * 8, 1.4, player.pos.z + (Math.random() - 0.5) * 8, 0.22);
            this.renderer.bumpGlitch(0.5);
          }
        }
        break;
      }
      case 'whisper': {
        a.monsterVoice('shadow', player.pos.x + (Math.random() - 0.5) * 6, 1.5, player.pos.z + (Math.random() - 0.5) * 6, 0.25);
        break;
      }
      case 'radio': {
        // a scrap of someone else's recording bleeding through the tape
        const line = this.radioLine ? this.radioLine() : null;
        if (line) {
          this.onMessage && this.onMessage(line);
          a.buzz(player.pos.x + (Math.random() - 0.5) * 4, player.pos.z + (Math.random() - 0.5) * 4, 0.5);
          this.renderer.bumpGlitch(0.7);
        }
        break;
      }
      case 'dooropen': {
        a.doorCreak(player.pos.x + 3, player.pos.z);
        this.renderer.bumpGlitch(0.4);
        break;
      }
      case 'doorslam': {
        // a heavy door closing somewhere — directional, close enough to worry
        const ang = Math.random() * Math.PI * 2;
        const d = 8 + Math.random() * 14;
        a.doorSlam(player.pos.x + Math.cos(ang) * d, player.pos.z + Math.sin(ang) * d);
        if (this.onMessage && Math.random() < 0.4) this.onMessage('A DOOR SLAMMED SOMEWHERE.');
        break;
      }
      case 'objectfall': {
        // something fell off something, off in the maze
        const ang = Math.random() * Math.PI * 2;
        const d = 10 + Math.random() * 18;
        a.metalClatter(player.pos.x + Math.cos(ang) * d, player.pos.z + Math.sin(ang) * d);
        break;
      }
      case 'waterdrip': {
        // a sudden cluster of drips, close by
        const ang = Math.random() * Math.PI * 2;
        const d = 3 + Math.random() * 6;
        for (let i = 0; i < 4 + ((Math.random() * 3) | 0); i++) {
          setTimeout(() => a.drip(player.pos.x + Math.cos(ang) * d, player.pos.z + Math.sin(ang) * d), i * (300 + Math.random() * 500));
        }
        break;
      }
      case 'lighton': {
        // a dead fixture buzzes back to life — which is somehow worse
        if (this.lightMgr) {
          const revived = this.lightMgr.reviveNearest
            ? this.lightMgr.reviveNearest(player.pos.x, player.pos.z, 16)
            : false;
          if (revived) a.buzz(player.pos.x, player.pos.z, 1.0);
        }
        break;
      }
      case 'heartbeat': a.heartbeat(1); break;
    }
  }
}
