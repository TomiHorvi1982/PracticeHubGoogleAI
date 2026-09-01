import { ChordDefinition, ScaleDefinition, Song, TuningPreset } from '../types';

export const TUNING_PRESETS: TuningPreset[] = [
  {
    name: 'Standardní E (E A D G B E)',
    notes: ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'],
    frequencies: [82.41, 110.0, 146.83, 196.0, 246.94, 329.63],
  },
  {
    name: 'Drop D (D A D G B E)',
    notes: ['D2', 'A2', 'D3', 'G3', 'B3', 'E4'],
    frequencies: [73.42, 110.0, 146.83, 196.0, 246.94, 329.63],
  },
  {
    name: 'Půltón doleva / Half Step Down (Eb Ab Db Gb Bb Eb)',
    notes: ['Eb2', 'Ab2', 'Db3', 'Gb3', 'Bb3', 'Eb4'],
    frequencies: [77.78, 103.83, 138.59, 185.0, 233.08, 311.13],
  },
  {
    name: 'Celý tón dolů / Whole Step Down (D G C F A D)',
    notes: ['D2', 'G2', 'C3', 'F3', 'A3', 'D4'],
    frequencies: [73.42, 98.0, 130.81, 174.61, 220.0, 293.66],
  },
  {
    name: 'Drop C (C G C F A D)',
    notes: ['C2', 'G2', 'C3', 'F3', 'A3', 'D4'],
    frequencies: [65.41, 98.0, 130.81, 174.61, 220.0, 293.66],
  },
  {
    name: 'Drop B (B F# B E G# C#)',
    notes: ['B1', 'F#2', 'B2', 'E3', 'G#3', 'C#4'],
    frequencies: [61.74, 92.5, 123.47, 164.81, 207.65, 277.18],
  },
  {
    name: 'Open G (D G D G B D)',
    notes: ['D2', 'G2', 'D3', 'G3', 'B3', 'D4'],
    frequencies: [73.42, 98.0, 146.83, 196.0, 246.94, 293.66],
  },
  {
    name: 'Open D (D A D F# A D)',
    notes: ['D2', 'A2', 'D3', 'F#3', 'A3', 'D4'],
    frequencies: [73.42, 110.0, 146.83, 185.0, 220.0, 293.66],
  },
  {
    name: 'Open C (C G C G C E)',
    notes: ['C2', 'G2', 'C3', 'G3', 'C4', 'E4'],
    frequencies: [65.41, 98.0, 130.81, 196.0, 261.63, 329.63],
  },
  {
    name: 'DADGAD (D A D G A D)',
    notes: ['D2', 'A2', 'D3', 'G3', 'A3', 'D4'],
    frequencies: [73.42, 110.0, 146.83, 196.0, 220.0, 293.66],
  },
  {
    name: 'Ukulele Standardní (G C E A)',
    notes: ['G4', 'C4', 'E4', 'A4'],
    frequencies: [392.0, 261.63, 329.63, 440.0],
  },
];

export const SCALES_DATABASE: ScaleDefinition[] = [
  {
    name: 'Major (Ionská)',
    czName: 'Durová stupnice',
    intervals: [0, 2, 4, 5, 7, 9, 11],
    description: 'Základní veselá a jasná durová stupnice. Vzorec: 1, 2, 3, 4, 5, 6, 7.',
  },
  {
    name: 'Natural Minor (Eolská)',
    czName: 'Molová přirozená',
    intervals: [0, 2, 3, 5, 7, 8, 10],
    description: 'Základní smutnější, melancholická molová stupnice. Vzorec: 1, 2, b3, 4, 5, b6, b7.',
  },
  {
    name: 'Minor Pentatonic',
    czName: 'Molová pentatonika',
    intervals: [0, 3, 5, 7, 10],
    description: 'Nejpoužívanější kytarová stupnice pro rock, blues a sólo kytaru. 5 tónů.',
  },
  {
    name: 'Major Pentatonic',
    czName: 'Durová pentatonika',
    intervals: [0, 2, 4, 7, 9],
    description: 'Příjemná melodická pětitónová stupnice hojně používaná v country, popu a rocku.',
  },
  {
    name: 'Blues Scale',
    czName: 'Bluesová stupnice',
    intervals: [0, 3, 5, 6, 7, 10],
    description: 'Molová pentatonika doplněná o b5 ("blue note") pro výrazný bluesový charakter.',
  },
  {
    name: 'Harmonic Minor',
    czName: 'Harmonická molová',
    intervals: [0, 2, 3, 5, 7, 8, 11],
    description: 'Epický, neoklasický či orientální zvuk díky zvýšené 7. stupni (vytváří citlivý tón).',
  },
  {
    name: 'Dorian Mode',
    czName: 'Dórský modus',
    intervals: [0, 2, 3, 5, 7, 9, 10],
    description: 'Molová stupnice se zvýšenou 6. stupní. Typická pro funk, jazz-rock a Santana styl.',
  },
  {
    name: 'Mixolydian Mode',
    czName: 'Mixolydský modus',
    intervals: [0, 2, 4, 5, 7, 9, 10],
    description: 'Durová stupnice s malou 7. stupní. Ideální pro dominantní akordy, classic rock a blues.',
  },
  // Zbylé církevní mody. Bez nich byla řada neúplná — z původních sedmi
  // tu byly čtyři, takže se nedalo projít modus po modu.
  {
    name: 'Phrygian Mode',
    czName: 'Frygický modus',
    intervals: [0, 1, 3, 5, 7, 8, 10],
    description: 'Molová s malou 2. stupní. Španělský a metalový nádech. Vzorec: 1, b2, b3, 4, 5, b6, b7.',
  },
  {
    name: 'Lydian Mode',
    czName: 'Lydický modus',
    intervals: [0, 2, 4, 6, 7, 9, 11],
    description: 'Durová se zvýšenou 4. stupní. Snivý, filmový zvuk. Vzorec: 1, 2, 3, #4, 5, 6, 7.',
  },
  {
    name: 'Locrian Mode',
    czName: 'Lokrický modus',
    intervals: [0, 1, 3, 5, 6, 8, 10],
    description: 'Jediný modus se zmenšenou kvintou. Nestabilní, používá se nad zmenšenými akordy. Vzorec: 1, b2, b3, 4, b5, b6, b7.',
  },
  {
    name: 'Melodic Minor',
    czName: 'Melodická moll',
    intervals: [0, 2, 3, 5, 7, 9, 11],
    description: 'Molová s velkou 6. a 7. stupní. Jazzová stupnice. Vzorec: 1, 2, b3, 4, 5, 6, 7.',
  },
];

export const CHORDS_DATABASE: ChordDefinition[] = [
  // C
  { name: 'C', root: 'C', type: 'Major', frets: [-1, 3, 2, 0, 1, 0], fingers: [0, 3, 2, 0, 1, 0], pianoKeys: [0, 4, 7] },
  { name: 'C7', root: 'C', type: 'Dom 7', frets: [-1, 3, 2, 3, 1, 0], fingers: [0, 3, 2, 4, 1, 0], pianoKeys: [0, 4, 7, 10] },
  { name: 'Cmaj7', root: 'C', type: 'Maj 7', frets: [-1, 3, 2, 0, 0, 0], fingers: [0, 3, 2, 0, 0, 0], pianoKeys: [0, 4, 7, 11] },
  { name: 'Cm', root: 'C', type: 'Minor', frets: [-1, 3, 5, 5, 4, 3], fingers: [0, 1, 3, 4, 2, 1], barreFret: 3, pianoKeys: [0, 3, 7] },
  { name: 'Csus4', root: 'C', type: 'Sus4', frets: [-1, 3, 3, 0, 1, 1], fingers: [0, 3, 4, 0, 1, 1], pianoKeys: [0, 5, 7] },
  { name: 'C5', root: 'C', type: 'Power', frets: [-1, 3, 5, 5, -1, -1], fingers: [0, 1, 3, 4, 0, 0], pianoKeys: [0, 7] },

  // D
  { name: 'D', root: 'D', type: 'Major', frets: [-1, -1, 0, 2, 3, 2], fingers: [0, 0, 0, 1, 3, 2], pianoKeys: [2, 6, 9] },
  { name: 'Dm', root: 'D', type: 'Minor', frets: [-1, -1, 0, 2, 3, 1], fingers: [0, 0, 0, 2, 3, 1], pianoKeys: [2, 5, 9] },
  { name: 'D7', root: 'D', type: 'Dom 7', frets: [-1, -1, 0, 2, 1, 2], fingers: [0, 0, 0, 2, 1, 3], pianoKeys: [2, 6, 9, 0] },
  { name: 'Dsus2', root: 'D', type: 'Sus2', frets: [-1, -1, 0, 2, 3, 0], fingers: [0, 0, 0, 1, 3, 0], pianoKeys: [2, 4, 9] },
  { name: 'Dsus4', root: 'D', type: 'Sus4', frets: [-1, -1, 0, 2, 3, 3], fingers: [0, 0, 0, 1, 2, 4], pianoKeys: [2, 7, 9] },
  { name: 'D5', root: 'D', type: 'Power', frets: [-1, -1, 0, 2, 3, -1], fingers: [0, 0, 0, 1, 2, 0], pianoKeys: [2, 9] },

  // E
  { name: 'E', root: 'E', type: 'Major', frets: [0, 2, 2, 1, 0, 0], fingers: [0, 2, 3, 1, 0, 0], pianoKeys: [4, 8, 11] },
  { name: 'Em', root: 'E', type: 'Minor', frets: [0, 2, 2, 0, 0, 0], fingers: [0, 2, 3, 0, 0, 0], pianoKeys: [4, 7, 11] },
  { name: 'E7', root: 'E', type: 'Dom 7', frets: [0, 2, 0, 1, 0, 0], fingers: [0, 2, 0, 1, 0, 0], pianoKeys: [4, 8, 11, 2] },
  { name: 'Em7', root: 'E', type: 'Min 7', frets: [0, 2, 0, 0, 0, 0], fingers: [0, 2, 0, 0, 0, 0], pianoKeys: [4, 7, 11, 2] },
  { name: 'E5', root: 'E', type: 'Power', frets: [0, 2, 2, -1, -1, -1], fingers: [0, 1, 2, 0, 0, 0], pianoKeys: [4, 11] },

  // F
  { name: 'F', root: 'F', type: 'Major', frets: [1, 3, 3, 2, 1, 1], fingers: [1, 3, 4, 2, 1, 1], barreFret: 1, pianoKeys: [5, 9, 0] },
  { name: 'Fm', root: 'F', type: 'Minor', frets: [1, 3, 3, 1, 1, 1], fingers: [1, 3, 4, 1, 1, 1], barreFret: 1, pianoKeys: [5, 8, 0] },
  { name: 'Fmaj7', root: 'F', type: 'Maj 7', frets: [-1, -1, 3, 2, 1, 0], fingers: [0, 0, 3, 2, 1, 0], pianoKeys: [5, 9, 0, 4] },

  // G
  { name: 'G', root: 'G', type: 'Major', frets: [3, 2, 0, 0, 0, 3], fingers: [3, 2, 0, 0, 0, 4], pianoKeys: [7, 11, 2] },
  { name: 'G7', root: 'G', type: 'Dom 7', frets: [3, 2, 0, 0, 0, 1], fingers: [3, 2, 0, 0, 0, 1], pianoKeys: [7, 11, 2, 5] },
  { name: 'Gm', root: 'G', type: 'Minor', frets: [3, 5, 5, 3, 3, 3], fingers: [1, 3, 4, 1, 1, 1], barreFret: 3, pianoKeys: [7, 10, 2] },
  { name: 'G5', root: 'G', type: 'Power', frets: [3, 5, 5, -1, -1, -1], fingers: [1, 3, 4, 0, 0, 0], pianoKeys: [7, 2] },

  // A
  { name: 'A', root: 'A', type: 'Major', frets: [-1, 0, 2, 2, 2, 0], fingers: [0, 0, 1, 2, 3, 0], pianoKeys: [9, 1, 4] },
  { name: 'Am', root: 'A', type: 'Minor', frets: [-1, 0, 2, 2, 1, 0], fingers: [0, 0, 2, 3, 1, 0], pianoKeys: [9, 0, 4] },
  { name: 'A7', root: 'A', type: 'Dom 7', frets: [-1, 0, 2, 0, 2, 0], fingers: [0, 0, 2, 0, 3, 0], pianoKeys: [9, 1, 4, 7] },
  { name: 'Am7', root: 'A', type: 'Min 7', frets: [-1, 0, 2, 0, 1, 0], fingers: [0, 0, 2, 0, 1, 0], pianoKeys: [9, 0, 4, 7] },
  { name: 'Asus2', root: 'A', type: 'Sus2', frets: [-1, 0, 2, 2, 0, 0], fingers: [0, 0, 2, 3, 0, 0], pianoKeys: [9, 11, 4] },

  // B
  { name: 'B', root: 'B', type: 'Major', frets: [-1, 2, 4, 4, 4, 2], fingers: [0, 1, 2, 3, 4, 1], barreFret: 2, pianoKeys: [11, 3, 6] },
  { name: 'Bm', root: 'B', type: 'Minor', frets: [-1, 2, 4, 4, 3, 2], fingers: [0, 1, 3, 4, 2, 1], barreFret: 2, pianoKeys: [11, 2, 6] },
  { name: 'B7', root: 'B', type: 'Dom 7', frets: [-1, 2, 1, 2, 0, 2], fingers: [0, 2, 1, 3, 0, 4], pianoKeys: [11, 3, 6, 9] },
];

export const INITIAL_SONGS: Song[] = [
  {
    id: 's1',
    title: 'Stánky',
    artist: 'Jan a František Nedvědové',
    key: 'G',
    tuning: 'Standard (EADGBe)',
    bpm: 85,
    capo: 0,
    chordsUsed: ['G', 'C', 'Em', 'D', 'D7'],
    notes: 'Česká kytarová klasika k táboráku i do zkušebny.',
    content: `[G]U stánků na levnou [C]krásu
[G]postávají a [Em]smějí se [D]času,
[G]s cigaretou a s [C]holkou, co nemá [G]kam [D]jít.[G]

[G]Vrací se domů [C]ráno,
[G]se zlou se potká [Em]všude, kde je [D]psáno,
[G]že láska bez pe[C]něz k nicomnosti [G]je.[D][G]

Refrén:
A [C]stánky na levnou [D7]krásu
[G]stále tu [Em]budou stoj[Am]et,
však [D7]lidé se mění a [G]mizejí v dál.`,
    createdAt: Date.now() - 3600000 * 24,
    updatedAt: Date.now() - 3600000 * 24,
    author: 'Kytarista Tom',
    youtubeVideos: [
      {
        id: '2m-fJb_S3O0',
        title: 'Nedvědi - Stánky (Oficiální videoklip)',
        url: 'https://www.youtube.com/watch?v=2m-fJb_S3O0',
        type: 'official',
      },
      {
        id: '3N3U7x2y4Zk',
        title: 'Brontosauři - Stánky (Akordy a text pro kytaru)',
        url: 'https://www.youtube.com/watch?v=3N3U7x2y4Zk',
        type: 'backingtrack',
      },
    ],
  },
  {
    id: 's2',
    title: 'Pohoda',
    artist: 'Kabát',
    key: 'D',
    tuning: 'Standard (EADGBe)',
    bpm: 128,
    capo: 0,
    chordsUsed: ['D', 'G', 'A', 'Em', 'C'],
    notes: 'Energický kapelový rockový nářez.',
    content: `Intro: [D] [G] [D] [A]

[D]Když se u nás chlapi poperou, tak [G]jenom nožem a nebo sekerou,
[D]vždycky jenom poctivě, [A]žádná zákeřnost!
[D]A až se všichni pozabíjí, [G]víno a pivo si nalijí,
[D]bude u nás pohoda, [A]máme toho dost!

Refrén:
Vezmi [G]láhev a [A]pojď sem k [D]nám,
[G]já ti zprávu [A]dobrou [D]dám!
Bude [G]pohoda [A]u nás v [D]pivovaru,
[Em]všechny starosti [C]pustíme z hlavy [A]ven!`,
    createdAt: Date.now() - 3600000 * 12,
    updatedAt: Date.now() - 3600000 * 12,
    author: 'Kapela Rockers',
    youtubeVideos: [
      {
        id: 'cZ5w4dM_c0c',
        title: 'Kabát - Pohoda (Oficiální klip)',
        url: 'https://www.youtube.com/watch?v=cZ5w4dM_c0c',
        type: 'official',
      },
      {
        id: 'gR9Y40kLw00',
        title: 'Kabát - Pohoda (Backing track s textem a akordy)',
        url: 'https://www.youtube.com/watch?v=gR9Y40kLw00',
        type: 'backingtrack',
      },
    ],
  },
  {
    id: 's3',
    title: 'Wonderwall',
    artist: 'Oasis',
    key: 'Em',
    tuning: 'Standard (EADGBe)',
    bpm: 88,
    capo: 2,
    chordsUsed: ['Em', 'G', 'D', 'C', 'A'],
    notes: 'Hrajte s kapodastrem na 2. pražci.',
    content: `Intro: [Em] [G] [D] [C] (4x)

[Em]Today is [G]gonna be the day that they're [D]gonna throw it back to [C]you
[Em]By now you [G]should've somehow [D]realized what you gotta [C]do
[Em]I don't believe that [G]anybody [D]feels the way I [C]do about you [Em]now [G] [D] [C]

[C]And all the roads that [D]lead you there were [Em]winding
[C]And all the lights that [D]light the way are [Em]blinding
[C]There are many [D]things that I would [G]like to [D]say to [Em]you but I don't know [A]how

Refrén:
Because [C]maybe[Em] [G]
You're [Em]gonna be the one that [C]saves me[Em] [G]
And [Em]after all[C] [Em] [G]
You're my [Em]wonderwall[C] [Em] [G]`,
    createdAt: Date.now() - 3600000 * 5,
    updatedAt: Date.now() - 3600000 * 5,
    author: 'Dave',
    youtubeVideos: [
      {
        id: '6hzrDeceEKc',
        title: 'Oasis - Wonderwall (Official Music Video)',
        url: 'https://www.youtube.com/watch?v=6hzrDeceEKc',
        type: 'official',
      },
      {
        id: 'm8_2t9R2y00',
        title: 'Oasis - Wonderwall (Acoustic Backing Track with Chords)',
        url: 'https://www.youtube.com/watch?v=m8_2t9R2y00',
        type: 'backingtrack',
      },
    ],
  },
];
