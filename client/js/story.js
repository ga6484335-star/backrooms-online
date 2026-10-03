// ============================================================================
// STORY — the authored narrative spine of THE BACKROOMS.
//
// Premise (revealed gradually, never dumped up front): the Backrooms are not a
// place, they are a RECORDING. Every person who "no-clipped" was filming, or
// being filmed, at the moment they fell through. The hum in the walls is a tape
// head moving past a head drum. Something called the ARCHIVIST is cataloguing
// every visitor — and the only way it can know a room is to replay the last
// moments recorded inside it. The players' own footage is the wallpaper.
//
// Each level hands the player one more piece. The objective sites are "intake
// nodes": touching one forces the Archivist to replay a fragment of the record.
//
// This module is pure data + pure helpers (no THREE, no network) so it can be
// unit-tested in Node and mirrored identically by every client in a room.
// ============================================================================

// A level-by-level script. `intro` plays once as a cinematic on arrival,
// `epilogue` plays once when the level's objectives complete, `beats` are the
// story fragments revealed by each objective site (in order), and `ambient` is
// a pool of rare whispers used by the horror scheduler.
export const STORY = {
  0: {
    title: 'INTAKE',
    intro: [
      'THE LAST THING YOU REMEMBER IS THE FLOOR GIVING WAY.',
      'THE LAST THING YOU RECORDED WAS ORDINARY.',
      'YOU ARE STILL RECORDING. THE RED LIGHT IS STILL ON.',
    ],
    beats: [
      'INTAKE FORM 0-A: “SUBJECT ARRIVED WITH CAMCORDER. SUBJECT DID NOT NOTICE THE HUM.”',
      'THE HUM IS NOT ELECTRICITY. IT IS A TAPE HEAD PASSING A DRUM. YOU HAVE HEARD IT BEFORE — IN THE EARPIECE, PLAYING YOUR OWN VOICE BACK.',
      'A WALL OF YELLOW WALLPAPER IS ALSO A SHELF. THE PATTERN IS FACES. SOME OF THEM ARE YOURS.',
    ],
    epilogue: [
      'THE INTAKE IS LOGGED. IT KNOWS YOUR NAME NOW.',
      'DOWN IS THE ONLY DIRECTION THAT IS STILL MOVING.',
    ],
    ambient: [
      'a voice reads a form in another room.',
      'someone hums the tone of your own recording.',
      'the wallpaper exhales.',
    ],
  },
  1: {
    title: 'THE HUM',
    intro: [
      'MAINTENANCE. THE MACHINES HERE DO NOT PUMP OR LIFT.',
      'THEY TURN. SLOWLY. CONSTANTLY.',
      'YOU REALISE THE HUM HAS A RHYTHM. THE RHYTHM IS A SPEED.',
    ],
    beats: [
      'SIGNAL LOG 118: “DAYS 1–40. THE CORRIDORS MOVE BETWEEN RECORDINGS. WE CANNOT MAP A THING THAT IS BEING REWOUND.”',
      'THE TAPE IS THE WALL. THE WALL IS THE MEMORY. WHEN A ROOM FADES IT IS NOT DYING, IT IS BEING OVERWRITTEN.',
      'A LOG NAMED FOR YOU, DATED BEFORE YOU ARRIVED. THE HANDWRITING IS YOURS. THE DATE IS NOT POSSIBLE.',
    ],
    epilogue: [
      'THE LINE IS TRACED. THE MACHINE IS BELOW, NOT ABOVE.',
      'KEEP GOING DOWN. THE RECORD IS DEEPER THAN THE FLOOR.',
    ],
    ambient: [
      'a reel changes behind the wall.',
      'static resolves, for half a second, into your name.',
      'a machine counts down in a language made of clicks.',
    ],
  },
  2: {
    title: 'THE LINE',
    intro: [
      'PIPEWORKS WITHOUT PIPES.',
      'THESE ARE CAPSTANS, HEADS, GUIDES. A MACHINE THE SIZE OF A BUILDING.',
      'YOU ARE WALKING THROUGH THE INSIDE OF A TAPE DECK.',
    ],
    beats: [
      'MAINTENANCE ORDER 2-B: “PURGE STALE RECORDINGS. RETAIN SUBJECTS WITH INCOMPLETE FOOTAGE. THE PLAYERS ARE KEPT UNCUT.”',
      'THE VALVES ARE NOT VALVES. THEY ARE DUBBING HEADS. EACH ONE COPIES A PERSON INTO A ROOM AND FILED THE ROOM UNDER THEIR NAME.',
      'THE PURGE LIST HAS ONE NAME LEFT OFF IT. THE MACHINE HAS DECIDED NOT TO FORGET YOU YET.',
    ],
    epilogue: [
      'THE LINE IS PURGED. THE MACHINE IS ANGRY THAT ITS FAVOURITE RECORDING IS MISSING.',
      'THERE IS A LOWER DECK. SOMETHING THERE IS STILL WET.',
    ],
    ambient: [
      'a capstan grips and releases the air.',
      'a long squeal of tape spooling fast.',
      'a valve body drips something that is not oil.',
    ],
  },
  3: {
    title: 'THE FLOOD',
    intro: [
      'WATER — BUT IT MOVES LIKE DECAY, NOT LIKE TIDE.',
      'MEMORY DOES NOT KEEP WELL. THIS IS WHERE THE ONES WHO WERE FORGOTTEN WENT.',
      'EVERY STEP HERE IS A ROOM LOSING ITS SHAPE.',
    ],
    beats: [
      'DROWNED ARCHIVE 3-C: “THE FLOOD IS FOR SUBJECTS WHO STOPPED BEING RECORDED. THEY LEAK. THEY SMEAR ACROSS EACH OTHER.”',
      'IN THE WATER, A SILVER DISC. YOU CAN SEE YOUR FACE REFLECTED — IF YOU TURN IT, THE FACE KEEPS MOVING AFTER YOU DO.',
      'THE DRAIN DOES NOT DRAIN. IT DUBBES. EVERYTHING THAT FALLS THROUGH COMES BACK SOMEWHERE ELSE, WEAKER.',
    ],
    epilogue: [
      'THE ARCHIVE IS DRAINED ENOUGH TO SEE THE DOOR UNDER IT.',
      'THE DOOR IS AN OFFICE DOOR. SOMEONE STILL WORKS HERE.',
    ],
    ambient: [
      'the water laps at a shape that does not float.',
      'a submerged reel keeps turning, patiently.',
      'a drip answers a question you did not ask.',
    ],
  },
  4: {
    title: 'THE OPERATORS',
    intro: [
      'AN OFFICE. THE INTAKE WAS ADMITTED HERE.',
      'THEY DID NOT BUILD THE BACKROOMS. THEY FOUND THE DOORWAY AND SET UP DESKS.',
      'THE PAPERWORK IS RECENT. THE DUST IS NOT.',
    ],
    beats: [
      'MEMO 4-D: “THE HUM IS THE READ HEAD. WE DO NOT CONTROL IT. WE ONLY CHOOSE WHICH SUBJECTS IT READS NEXT.”',
      'A PERSONNEL FILE. YOUR PHOTOGRAPH. YOUR CAMCORDER MODEL. INTAKE DATE: TODAY. ONBOARDING DATE: FORTY YEARS AGO.',
      'THE LAST OPERATOR LEFT A NOTE: “IT HAS STARTED RECORDING US. WE ARE THE SUBJECTS NOW. BAR THE DOOR AND KEEP FILMING.”',
    ],
    epilogue: [
      'THE FILE IS RECOVERED. THE PEOPLE WHO TRAPPED YOU WERE TRAPPED FIRST.',
      'UP THE SERVICE STAIRS. THE GUESTS ARE STILL CHECKED IN.',
    ],
    ambient: [
      'a printer wakes in an empty office.',
      'a phone rings into a dial tone no one set.',
      'a chair turns unfilled.',
    ],
  },
  5: {
    title: 'THE GUESTS',
    intro: [
      'A HOTEL THAT NEVER CLOSES.',
      'EVERY ROOM IS A GUEST RE-RECORDED ON THE NIGHT THEY STOPPED BEING A GUEST.',
      'DO NOT KNOCK. THE KNOCKING IS THE ROOM REPLAYING YOU.',
    ],
    beats: [
      'REGISTER 5-E: “ROOM 40 IS OURS. WE KEEP IT FOR SUBJECTS WHO REACH THE TOP-FLOOR LANDING. FEW DO.”',
      'A ROOM KEY ON A RED RIBBON. THE NUMBER ON IT HAS NOT BEEN CUT YET. IT IS WAITING FOR A NUMBER TO EXIST.',
      'THROUGH A CRACKED DOOR: YOUR OWN ROOM. YOUR OWN BED. YOUR CAMCORDER ON THE NIGHTSTAND, STILL TAPING THE CEILING.',
    ],
    epilogue: [
      'THE GUESTS ARE ACCOUNTED FOR. ONE ROOM REMAINS LOCKED — AND THE LOCK IS WARM.',
      'THERE IS A STAIRS BEHIND IT THAT GOES UPHILL.',
    ],
    ambient: [
      'a door down the hall replays its last slam.',
      'the lift arrives at a floor that has no number.',
      'a wedding band rotates on a dresser by itself.',
    ],
  },
  6: {
    title: 'THE ASCENT',
    intro: [
      'THE CONTROL DECK. THE HUM IS LOUDEST HERE BECAUSE THE HEAD IS HERE.',
      'ABOVE THIS CEILING IS AN EXIT. IT IS ON. IT IS PROJECTING.',
      'THIS IS THE READ HEAD’S ROOM. IT IS READING YOU.',
    ],
    beats: [
      'MASTER DECK 6-F: “PROJECTOR = EXIT PROTOCOL. WHEN A SUBJECT BELIEVES IT HAS ESCAPED, THE RECORD IS CLOSED AND THE SUBJECT IS CLEARED.”',
      'THE “EXIT” IS A SCREEN. THE DOOR ONTO THE SCREEN IS A DOOR ONTO A PROJECTION OF THE WORLD YOU LOST.',
      'THE ARCHIVIST HAS ONE INSTRUCTION LEFT, ETCHED WHERE ONLY A SUBJECT COULD READ IT: “LEAVE, AND IT WILL BELIEVE YOU ARE RESTORED. STAY, AND IT WILL BELIEVE YOU ARE TRUE.”',
    ],
    epilogue: [
      'THE RELAYS ARE SET. THE PROJECTOR IS SPOOLING.',
      'WHEN THE EXIT OPENS, BELIEVE IT. THAT IS THE ONLY WAY OUT.',
    ],
    ambient: [
      'the spool spins up to full speed.',
      'a light bleeds through the ceiling like a projector beam.',
      'something enormous and patient adjusts its focus.',
    ],
  },
};

// The final cinematic. Stages are (relative) seconds; each has a title card and
// an atmosphere instruction the client renders. The twist lands in `reveal`.
export const ENDING = {
  id: 'chapter-one',
  stages: [
    { at: 0,  key: 'door',   card: 'THE DOOR IS OPEN.',            env: 'normal' },
    { at: 6,  key: 'light',  card: 'WHITE. AFTER ALL THIS TIME, WHITE.', env: 'dawn' },
    { at: 13, key: 'grass',  card: 'GRASS. SKY. SOMETHING ON THE WIND THAT IS NOT THE HUM.', env: 'day' },
    { at: 21, key: 'others', card: 'THE OTHERS ARE HERE. YOU MADE IT OUT TOGETHER.', env: 'day' },
    { at: 27, key: 'horizon',card: 'IT IS OVER. YOU ARE SOMEWHERE ELSE. YOU ARE SOMEWHERE REAL.', env: 'dusk' },
    // the twist
    { at: 33, key: 'rec',    card: '…WHY IS THE REC LIGHT STILL ON?', env: 'dread', glitch: 1.0 },
    { at: 39, key: 'mirror', card: 'THE SKY HAS A SEAM. THE HORIZON TILES. THE BIRDS LOOP.', env: 'crack', glitch: 1.6 },
    { at: 47, key: 'reveal', card: 'YOU WERE NEVER THE ONES WHO ARRIVED.', env: 'crack', glitch: 2.4 },
    { at: 55, key: 'replay', card: 'YOU ARE THE PLAYBACK. AND IT HAS JUST STARTED AGAIN.', env: 'void', glitch: 3.0 },
    { at: 64, key: 'end',    card: 'CHAPTER ONE — COMPLETE', env: 'void' },
  ],
  // shown under the final card before the return-to-menu prompt
  tail: [
    'SIGNAL RETAINED.',
    'SUBJECTS: UNCUT.',
    'NEXT READING BEGINS IMMEDIATELY.',
  ],
};

export const LEVEL_ORDER = [0, 1, 2, 3, 4, 5, 6];
export const FINAL_LEVEL = 6;

export function storyFor(level) {
  return STORY[level] || STORY[0];
}

export function introFor(level) { return storyFor(level).intro.slice(); }
export function epilogueFor(level) { return storyFor(level).epilogue.slice(); }
export function beatsFor(level) { return storyFor(level).beats.slice(); }

// Story fragment for a given objective site (wraps if there are more sites
// than authored beats, so the narrative never runs out).
export function beatFor(level, siteIndex) {
  const beats = beatsFor(level);
  return beats[siteIndex % beats.length];
}

export function ambientFor(level, n) {
  const pool = storyFor(level).ambient;
  return pool[n % pool.length];
}

export function levelTitle(level) { return storyFor(level).title; }

// The next story level after `level`, or null after the finale.
export function nextStoryLevel(level) {
  const i = LEVEL_ORDER.indexOf(level);
  if (i < 0 || i >= LEVEL_ORDER.length - 1) return null;
  return LEVEL_ORDER[i + 1];
}

export function isFinalLevel(level) { return level === FINAL_LEVEL; }
