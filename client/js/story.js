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

// ---------------------------------------------------------------------------
// OPENING — the cold open. The game does not begin in the Backrooms: it begins
// in the ordinary world, seconds before it stops being ordinary.
//
// Each phase owns a slice of time and a handful of typed lines. `world` is the
// environment the client renders (`opening.js`): street -> wrong -> crack ->
// fall -> land -> wake. Dialogue is internal monologue + a scrap of radio
// traffic, kept short so it plays like a cold open, not a cutscene.
// Each phase is one shot of the film: `card` is a location/chapter slate, each
// line carries `voice` — how the character says it — so voice.js can colour the
// delivery (or fall back to radio static / a whisper when speech synthesis is
// unavailable). `shot` names the camera move opening.js plays.
export const OPENING = {
  id: 'cold-open',
  phases: [
    {
      key: 'street', world: 'street', dur: 17, shot: 'walk',
      card: '05:51 PM — THE WAY HOME',
      sfx: ['streetAmb', 'steps'],
      lines: [
        { text: 'FIVE–FIFTY-ONE. THE SAME STREET HOME.', voice: 'calm' },
        { text: 'SAME LAMP. SAME CAR ON THE SAME CORNER. I STOPPED COUNTING THEM WEEKS AGO.', voice: 'tired' },
        { text: 'LONG DAY. HALF THE STREETLIGHTS ARE OUT. I JUST WANT MY DOOR.', voice: 'tired' },
      ],
    },
    {
      key: 'wrong', world: 'wrong', dur: 13, shot: 'unease',
      card: 'SOMETHING IS OFF',
      sfx: ['hum', 'stepsSlow'],
      lines: [
        { text: '...THE STREETLIGHTS. THEY ARE FARTHER APART THAN THEY WERE.', voice: 'uneasy' },
        { text: 'THE CAR HASN\'T MOVED. I DON\'T REMEMBER IT PARKED THERE. I DON\'T REMEMBER IT AT ALL.', voice: 'uneasy' },
        { text: 'THAT HUM. THE SUBSTATION IS A BLOCK BEHIND ME. THIS IS COMING FROM THE SIDEWALK.', voice: 'uneasy' },
      ],
    },
    {
      key: 'stare', world: 'wrong', dur: 9, shot: 'figure',
      card: 'THERE IS SOMEONE ELSE ON THE STREET',
      sfx: ['hum', 'whisper'],
      lines: [
        { text: 'SOMEONE IS STANDING UNDER THE NEXT LAMP. NOT MOVING. NOT WALKING A DOG. JUST... FACING ME.', voice: 'dread' },
        { text: 'HELLO? ... THEY DON\'T BLINK. THE LAMP DOESN\'T FLICKER ON THEM.', voice: 'dread' },
        { text: 'I DON\'T LOOK AWAY. I DON\'T THINK I CAN.', voice: 'dread' },
      ],
    },
    {
      key: 'crack', world: 'crack', dur: 8, shot: 'crack',
      card: 'THE GROUND',
      sfx: ['crack', 'subDrop'],
      lines: [
        { text: 'I LOOK DOWN.', voice: 'whisper' },
        { text: 'THE CONCRETE ISN\'T CONCRETE. IT\'S A PATTERN. AND THE PATTERN IS A DOORWAY.', voice: 'whisper' },
        { text: 'THE FLOOR GIVES WAY.', voice: 'dread' },
      ],
    },
    {
      key: 'tear', world: 'tear', dur: 6, shot: 'tear',
      card: null,
      sfx: ['tear', 'subDrop2'],
      lines: [
        { text: 'THE WORLD COMES APART LIKE TAPE.', voice: 'dread' },
      ],
    },
    {
      key: 'fall', world: 'fall', dur: 15, shot: 'fall',
      card: null,
      sfx: ['whoosh', 'subDrop2'],
      lines: [
        { text: 'I\'M FALLING. NOT DOWN — THROUGH.', voice: 'dread' },
        { text: 'PAST WALLS THAT WERE NEVER ROOMS. PAST LIT WINDOWS WITH NOBODY HOME. PAST EVERYONE.', voice: 'dread' },
        { text: 'THE FALLING HAS A RHYTHM. THE RHYTHM IS BEING PLAYED BACK.', voice: 'whisper' },
      ],
    },
    {
      key: 'land', world: 'land', dur: 13, shot: 'land',
      card: 'THE HUM',
      sfx: ['land', 'hum', 'fluores'],
      lines: [
        { text: 'THE HUM.', voice: 'dread' },
        { text: 'YELLOW. DAMP CARPET. FLUORESCENT LIGHT THAT DOES NOT FLICKER.', voice: 'dread' },
        { text: 'I KNOW THIS PLACE. I HAVE NEVER BEEN HERE.', voice: 'whisper' },
      ],
    },
    {
      key: 'wake', world: 'wake', dur: 10, shot: 'wake',
      card: null,
      sfx: ['hum'],
      lines: [
        { text: 'THE RED LIGHT IS STILL ON.', voice: 'dread' },
        { text: 'I\'M STILL RECORDING. SOMETHING WANTS THIS KEPT.', voice: 'whisper' },
        { text: 'MOVE.', voice: 'dread' },
      ],
    },
  ],
};

// Total opening length (seconds), derived so the client never desyncs from the
// script. The sequence ends the moment control returns.
export const OPENING_DURATION = OPENING.phases.reduce((n, p) => n + p.dur, 0);

// Opening lines may be plain strings or `{ text, voice }` objects. The reader
// (opening.js) wants text + voice uniformly, so normalize once here.
export function openingLine(raw) {
  if (!raw) return { text: '', voice: 'default' };
  if (typeof raw === 'string') return { text: raw, voice: 'default' };
  return { text: raw.text || '', voice: raw.voice || 'default' };
}
export function openingLines(phase) {
  return (phase.lines || []).map(openingLine);
}

// ---------------------------------------------------------------------------
// PREROLL — how each level begins. Deliberately different per level so entering
// a new chapter never feels like the same loading screen twice. `kind` selects
// the client's transition module; `lines` are typed out underneath.
export const PREROLL = {
  0: {
    kind: 'fall', title: 'INTAKE', card: 'YOU FALL INTO THE YELLOW.',
    lines: [
      { text: 'THE HUM.', voice: 'whisper' },
      { text: 'YELLOW. DAMP CARPET. THE LIGHT DOES NOT FLICKER.', voice: 'dread' },
      { text: 'IT KNOWS YOU LANDED.', voice: 'whisper' },
    ],
  },
  1: {
    kind: 'door', title: 'THE HUM', card: 'A DOOR THAT WAS NOT THERE.',
    lines: [
      { text: 'A SERVICE DOOR, OPEN, WARM WITH THE SOUND OF MACHINES.', voice: 'uneasy' },
      { text: 'YOU STEP THROUGH BECAUSE NOTHING ELSE STEPPED THROUGH YOU.', voice: 'uneasy' },
      { text: 'IT CLOSES INTO SOLID WALL BEHIND YOU.', voice: 'dread' },
    ],
  },
  2: {
    kind: 'lurch', title: 'THE LINE', card: 'THE FLOOR MOVES LIKE A MACHINE.',
    lines: [
      { text: 'THE GROUND SHUDDERS AND CARRIES YOU — A BELT, NOT A FLOOR.', voice: 'dread' },
      { text: 'PIPEWORKS WITHOUT PIPES. YOUR STOMACH DROPS A DECADE.', voice: 'dread' },
      { text: 'THE MACHINE HAS FED YOU INTO ITSELF.', voice: 'whisper' },
    ],
  },
  3: {
    kind: 'flood', title: 'THE FLOOD', card: 'YOU COME UP SOMEWHERE COLD.',
    lines: [
      { text: 'WATER. NOT RISING — REACHING.', voice: 'dread' },
      { text: 'YOU SURFACE IN A ROOM THAT HAS FORGOTTEN ITS FLOOR.', voice: 'dread' },
      { text: 'EVERY STEP HERE SWALLOWS SOMETHING THAT WAS YOU.', voice: 'whisper' },
    ],
  },
  4: {
    kind: 'wake', title: 'THE OPERATORS', card: 'YOU WAKE AT A DESK THAT IS NOT YOURS.',
    lines: [
      { text: 'A MONITOR. A MUG, STILL WARM. A CHAIR STILL SPINNING.', voice: 'uneasy' },
      { text: 'SOMEONE WAS SITTING HERE A SECOND BEFORE YOU EXISTED.', voice: 'dread' },
      { text: 'THE PAPERWORK IS RECENT. THE DUST IS NOT.', voice: 'whisper' },
    ],
  },
  5: {
    kind: 'elevator', title: 'THE GUESTS', card: 'THE LIFT OPENS ON A FLOOR THAT HAS NO NUMBER.',
    lines: [
      { text: 'AN ELEVATOR YOU DO NOT REMEMBER ENTERING.', voice: 'uneasy' },
      { text: 'IT OPENS ON CARPET THE COLOUR OF DRIED BLOOD.', voice: 'dread' },
      { text: 'THE ROOMS HERE ARE GUESTS. DO NOT KNOCK.', voice: 'whisper' },
    ],
  },
  6: {
    kind: 'ascent', title: 'THE ASCENT', card: 'SOMETHING PULLS YOU UP THROUGH THE CEILING.',
    lines: [
      { text: 'THE HUM IS LOUDEST HERE BECAUSE THE HEAD IS HERE.', voice: 'dread' },
      { text: 'ABOVE THIS CEILING IS AN EXIT. IT IS ON. IT IS PROJECTING.', voice: 'dread' },
      { text: 'IT IS READING YOU.', voice: 'whisper' },
    ],
  },
};

export function prerollFor(level) {
  return PREROLL[level] || PREROLL[0];
}

// ---------------------------------------------------------------------------
// RADIO — sparse fragments of other people's recordings, played through the
// horror scheduler. Not lore dumps: half-heard traffic that implies someone was
// here before you and is being replayed too.
export const RADIO = {
  0: ['…anyone on this channel… yellow…', '…do not trust the doors that open…', '…recording… still recording…'],
  1: ['…flood the shafts, it hears the pumps…', '…the machines are not lifting anything…', '…we have been turning for forty days…'],
  2: ['…capstan seven is eating the tapes…', '…do not let it dub you…', '…this is not pipework, this is a deck…'],
  3: ['…the water is other people…', '…forget me, forget me, forget…', '…it drains and gives back less…'],
  4: ['…intake date is today, onboarding is years ago…', '…we are the subjects now, keep filming…', '…it has started recording us…'],
  5: ['…room forty is ours, do not knock…', '…the guests check out but never leave…', '…your room is here, your bed is here…'],
  6: ['…believe the exit, that is the only way…', '…the read head wants a clean ending…', '…it believes we are true…'],
};

export function radioFor(level, n) {
  const pool = RADIO[level] || RADIO[0];
  return pool[n % pool.length];
}

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

// ---------------------------------------------------------------------------
// CASE FILE — the player's journal. Every story fragment the party encounters
// (level intros, intake-node beats, hidden-cache archives, rare whispers and
// radio scraps) is written here as it is heard, so the narrative is not lost
// the moment a one-shot cinematic ends. It is purely local and deterministic:
// it never touches the network, so it cannot desync the shared world.
//
// `recordJournal` mutates a plain record (created by `newJournalRecord`). The
// record is `{ [level]: { [kind:key]: { kind, key, level, title, text } } }`,
// insertion-ordered per level and de-duplicated by kind:key.
export function newJournalRecord() { return {}; }

// Cap ambient/radio so a long session cannot grow the file without bound. The
// authored intros, beats and cache archives are always kept.
export const JOURNAL_LIMITS = { ambient: 8, radio: 6 };

// Build the stable de-dup key for a fragment. Exported so tests can assert the
// exact identity a record will use.
export function journalKey(level, kind, key) { return `${level}:${kind}:${key}`; }

// Returns true if the fragment was newly recorded (false if already present or
// dropped by a cap). Mutates `rec` in place.
export function recordJournal(rec, level, kind, text, key = null) {
  if (!rec || !text) return false;
  const lv = (rec[level] = rec[level] || {});
  const k = key == null ? String(text).slice(0, 48) : String(key);
  const id = journalKey(level, kind, k);
  if (lv[id]) return false;
  const cap = JOURNAL_LIMITS[kind];
  if (cap != null) {
    let n = 0;
    for (const other of Object.keys(lv)) if (other.split(':')[1] === kind) n++;
    if (n >= cap) return false;
  }
  lv[id] = { kind, key: k, level, text: String(text) };
  return true;
}

// The journal as an ordered, render-ready list. Levels ascend, and within a
// level the authored narrative reads in story order: intro, then the intake
// beats, then the archives the party recovered, then atmosphere. This is a
// pure function of the record — the HUD simply renders what it returns.
const JOURNAL_KIND_ORDER = ['intro', 'beat', 'cache', 'ambient', 'radio'];
export function journalEntriesFor(rec) {
  if (!rec) return [];
  const levels = Object.keys(rec).map(Number).sort((a, b) => a - b);
  const out = [];
  for (const lv of levels) {
    const items = Object.values(rec[lv] || {});
    items.sort((a, b) => {
      const ka = JOURNAL_KIND_ORDER.indexOf(a.kind), kb = JOURNAL_KIND_ORDER.indexOf(b.kind);
      if (ka !== kb) return ka - kb;
      return 0; // insertion order within a kind is preserved by Object.values
    });
    for (const it of items) out.push(it);
  }
  return out;
}
