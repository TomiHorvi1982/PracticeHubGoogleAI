export interface DrumKitOption {
  id: string;
  name: string;
  czName: string;
  icon: string;
  genre: string;
  description: string;
}

export const DRUM_KITS: DrumKitOption[] = [
  {
    id: 'drums',
    name: 'Classic Rock Kit',
    czName: 'Akustická rocková sada',
    icon: '🥁',
    genre: 'Rock',
    description: 'Klasický rockový Ludwig punch kopák, březový virbl a znělé činely',
  },
  {
    id: 'drums_heavy_rock',
    name: 'Heavy Rock & Studio Punch',
    czName: 'Heavy Rock / Studiový úder',
    icon: '⚡',
    genre: 'Hard Rock',
    description: 'Hluboký průrazný sub-kopák s transientem, plný dřevěný virbl a široké tomy',
  },
  {
    id: 'drums_metal',
    name: 'Heavy Metal & Thrash Double-Kick',
    czName: 'Heavy Metal / Thrash dvojšlapka',
    icon: '🤘',
    genre: 'Metal',
    description: 'Ostrý klikací attack kopáku pro rychlé blastbeaty, ocelový piccolo virbl a řezavé činely',
  },
  {
    id: 'drums_djent',
    name: 'Modern Metal / Djent Prog',
    czName: 'Moderní metal & Djent',
    icon: '🚀',
    genre: 'Prog Metal',
    description: 'Extrémně těsný sub-kopák s rychlým gejtem, třaskavý rimshot virbl a řezavý bell ride',
  },
  {
    id: 'drums_80s_arena',
    name: '80s Arena Rock (Gated Reverb)',
    czName: '80s Arena Rock (Gated Reverb)',
    icon: '🏟️',
    genre: '80s Rock',
    description: 'Monumentální stadionový virbl s gated reverbrem (Def Leppard / Phil Collins styl)',
  },
  {
    id: 'drums_punk',
    name: 'Punk Rock & Raw Garage',
    czName: 'Punk Rock & Garážová sada',
    icon: '🔥',
    genre: 'Punk',
    description: 'Rychlý, surový a energický garážový zvuk pro vysoká tempa',
  },
  {
    id: 'drums_funk',
    name: 'Vintage Funk & Soul Tight',
    czName: 'Vintage Funk & Soul',
    icon: '🎷',
    genre: 'Funk',
    description: 'Tlumený suchý kopák, práskavý funky virbl se struníkem a těsné hi-hatky',
  },
  {
    id: 'drums_jazz',
    name: 'Jazz & Brush (Metličky)',
    czName: 'Jazz & Metličky (Brush)',
    icon: '🎺',
    genre: 'Jazz',
    description: 'Jemný virbl s metličkami, teplý akustický kulatý kopák a bronzový sizzle ride',
  },
  {
    id: 'drums_808',
    name: 'Roland TR-808 Hip-Hop / Trap',
    czName: 'Roland TR-808 Hip-Hop / Trap',
    icon: '🎛️',
    genre: 'Electronic / Trap',
    description: 'Legendární hluboký analogový sub-boom, 808 virbl a tikající hi-hats',
  },
  {
    id: 'drums_electronic_909',
    name: 'Roland TR-909 Dance / Techno',
    czName: 'Roland TR-909 Dance / Techno',
    icon: '✨',
    genre: 'Electronic / Dance',
    description: 'Průrazný 909 kick, práskavý virbl a kovově otevřená hi-hatka',
  },
];
