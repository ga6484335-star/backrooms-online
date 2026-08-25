// Level definitions: each Backrooms level has its own architecture rules,
// palette, lighting, fog and ambience. Generation rules feed worldgen.js.

export const LEVELS = [
  {
    id: 0, name: 'LEVEL 0 — THE LOBBY',
    wallProb: 0.34, doorProb: 0.5, pillarProb: 0.10, openHall: 0.05,
    baseCeil: 2.74, ceilJitter: 0.25,
    floorMat: 'carpet', wallMat: 'wallpaper', ceilMat: 'ceilingTile',
    palette: {
      floor: [126, 116, 82], wall: [181, 160, 92], ceil: [186, 181, 166],
      fog: 0x191408, fogDensity: 0.055, ambient: 0x33301f, ambientI: 0.55,
      lightColor: 0xffe9b0, lightI: 14, lightDist: 11,
    },
    lightSpacing: 2, lightChance: 0.72,
    props: ['papers', 'chair', 'desk', 'cabinet', 'plantpot'],
    hum: 120, ambience: 'office',
    specialBias: 1.0,
    districts: [
      { name: 'core',      w: 0.34 }, // plain yellow maze
      { name: 'open',      w: 0.16, pillarProb: 0.3, lightBonus: 0.1, propBoost: 0.4, pillarShape: 1 },
      { name: 'decayed',   w: 0.18, tint: 0.72, damage: 0.55, lightKeep: 0.45, propBoost: 0.6, lightStyle: 'bulb' },
      { name: 'cramped',   w: 0.14, narrow: 0.5, ceilAdd: -0.35, lightKeep: 0.7, propBoost: 1.6 },
      { name: 'furnished', w: 0.18, propBoost: 2.6, pillarProb: 0.02 },
    ],
  },
  {
    id: 1, name: 'LEVEL 1 — MAINTENANCE',
    wallProb: 0.52, doorProb: 0.42, pillarProb: 0.16, openHall: 0.10,
    baseCeil: 3.6, ceilJitter: 0.9,
    floorMat: 'concrete', wallMat: 'concrete', ceilMat: 'concrete',
    palette: {
      floor: [96, 94, 90], wall: [108, 106, 100], ceil: [92, 90, 86],
      fog: 0x0a0a0b, fogDensity: 0.075, ambient: 0x1d2024, ambientI: 0.5,
      lightColor: 0xd8e6ff, lightI: 10, lightDist: 9,
    },
    lightSpacing: 3, lightChance: 0.5,
    props: ['pipe', 'barrel', 'crate', 'locker', 'valve'],
    hum: 100, ambience: 'industrial',
    specialBias: 1.15,
    districts: [
      { name: 'core',       w: 0.3 },
      { name: 'pipes',      w: 0.22, propBoost: 2.0, pillarShape: 1, lightKeep: 0.7 },
      { name: 'tunnels',    w: 0.2,  narrow: 0.62, ceilAdd: -0.9, ceilDrop: 0.35, lightStyle: 'bulb', tint: 0.8 },
      { name: 'halls',      w: 0.14, ceilAdd: 1.6, pillarProb: 0.34, propBoost: 0.7 },
      { name: 'rustzone',   w: 0.14, tint: 0.7, damage: 0.6, lightKeep: 0.4 },
    ],
  },
  {
    id: 2, name: 'LEVEL 2 — PIPEWORKS',
    wallProb: 0.62, doorProb: 0.35, pillarProb: 0.05, openHall: 0.03,
    baseCeil: 2.3, ceilJitter: 0.15,
    floorMat: 'metal', wallMat: 'metal', ceilMat: 'metal',
    palette: {
      floor: [70, 72, 78], wall: [84, 88, 94], ceil: [64, 66, 72],
      fog: 0x050507, fogDensity: 0.1, ambient: 0x14161c, ambientI: 0.42,
      lightColor: 0xffd9a0, lightI: 8, lightDist: 7,
    },
    lightSpacing: 4, lightChance: 0.38,
    props: ['pipe', 'valve', 'crate', 'cabletray', 'wires'],
    hum: 90, ambience: 'mechanical',
    specialBias: 1.2,
    districts: [
      { name: 'core',     w: 0.3, narrow: 0.3 },
      { name: 'crawl',    w: 0.22, narrow: 0.75, ceilAdd: -0.35, lightKeep: 0.35, lightStyle: 'bulb' },
      { name: 'boiler',   w: 0.2,  propBoost: 2.4, ceilAdd: 1.2, lightStyle: 'bulb', tint: 0.85 },
      { name: 'blackout', w: 0.16, lightKeep: 0.12, damage: 0.5, tint: 0.6 },
      { name: 'vents',    w: 0.12, ceilDrop: 0.5, narrow: 0.4, propBoost: 1.6 },
    ],
  },
  {
    id: 3, name: 'LEVEL 3 — THE FLOOD',
    wallProb: 0.44, doorProb: 0.5, pillarProb: 0.12, openHall: 0.08,
    baseCeil: 3.2, ceilJitter: 0.4,
    floorMat: 'tile', wallMat: 'tile', ceilMat: 'concrete',
    palette: {
      floor: [102, 108, 100], wall: [122, 126, 118], ceil: [92, 92, 88],
      fog: 0x0a1414, fogDensity: 0.08, ambient: 0x1a2424, ambientI: 0.5,
      lightColor: 0xcfe8e0, lightI: 9, lightDist: 9,
    },
    lightSpacing: 3, lightChance: 0.5,
    props: ['barrel', 'debris', 'pipe', 'chair'],
    hum: 110, ambience: 'flooded',
    water: true,
    specialBias: 1.1,
    districts: [
      { name: 'core',      w: 0.3 },
      { name: 'deepwater', w: 0.2,  tint: 0.6, lightKeep: 0.35, propBoost: 0.5 },
      { name: 'dryhalls',  w: 0.18, propBoost: 1.8, lightBonus: 0.2 },
      { name: 'ruined',    w: 0.18, damage: 0.65, tint: 0.75, ceilDrop: 0.3 },
      { name: 'drainage',  w: 0.14, narrow: 0.5, ceilAdd: -0.7, lightStyle: 'bulb' },
    ],
  },
  {
    id: 4, name: 'LEVEL 4 — OFFICE',
    wallProb: 0.42, doorProb: 0.55, pillarProb: 0.06, openHall: 0.12,
    baseCeil: 2.8, ceilJitter: 0.1,
    floorMat: 'officeCarpet', wallMat: 'officeWall', ceilMat: 'ceilingTile',
    palette: {
      floor: [94, 96, 100], wall: [168, 166, 158], ceil: [178, 176, 168],
      fog: 0x0c0c0e, fogDensity: 0.05, ambient: 0x232326, ambientI: 0.5,
      lightColor: 0xf2f4ff, lightI: 11, lightDist: 10,
    },
    lightSpacing: 2, lightChance: 0.6,
    props: ['cubicle', 'chair', 'desk', 'cabinet', 'papers', 'watercooler', 'monitorstack', 'shelf'],
    hum: 120, ambience: 'office',
    specialBias: 1.0,
    districts: [
      { name: 'core',       w: 0.28 },
      { name: 'bullpen',    w: 0.22, propBoost: 2.6, pillarProb: 0.0 },
      { name: 'archives',   w: 0.18, propBoost: 1.9, tint: 0.85, lightKeep: 0.55, lightStyle: 'bulb' },
      { name: 'executive',  w: 0.14, ceilAdd: 0.5, propBoost: 1.3, lightBonus: 0.15 },
      { name: 'abandoned',  w: 0.18, damage: 0.6, lightKeep: 0.3, tint: 0.7, propBoost: 0.7 },
    ],
  },
  {
    id: 5, name: 'LEVEL 5 — HOTEL',
    wallProb: 0.55, doorProb: 0.62, pillarProb: 0.03, openHall: 0.06,
    baseCeil: 3.1, ceilJitter: 0.2,
    floorMat: 'hotelCarpet', wallMat: 'hotelWall', ceilMat: 'ceilingTile',
    palette: {
      floor: [110, 40, 38], wall: [148, 128, 96], ceil: [172, 168, 156],
      fog: 0x100a08, fogDensity: 0.06, ambient: 0x2a2018, ambientI: 0.5,
      lightColor: 0xffd9a8, lightI: 10, lightDist: 9,
    },
    lightSpacing: 3, lightChance: 0.6,
    props: ['dresser', 'cart', 'plantpot', 'cabinet', 'lamp', 'sofa', 'wallclock'],
    hum: 115, ambience: 'hotel',
    specialBias: 1.25,
    districts: [
      { name: 'core',      w: 0.3 },
      { name: 'corridors', w: 0.24, narrow: 0.45, lightStyle: 'bulb', propBoost: 1.4 },
      { name: 'ballroom',  w: 0.14, ceilAdd: 1.8, pillarProb: 0.3, propBoost: 0.5, lightBonus: 0.2 },
      { name: 'decayed',   w: 0.18, tint: 0.7, damage: 0.6, lightKeep: 0.35 },
      { name: 'service',   w: 0.14, ceilAdd: -0.6, narrow: 0.3, propBoost: 1.8, tint: 0.85, lightStyle: 'tube' },
    ],
  },
];

export function getLevel(i) {
  if (i < 0 || i >= LEVELS.length) i = 0;
  return LEVELS[i];
}

// rare inter-level doors choose a destination
export function nextLevelFrom(rng, current) {
  const others = LEVELS.filter((l) => l.id !== current);
  return others[(rng() * others.length) | 0].id;
}
