export type PetStateName =
  | "idle"
  | "runRight"
  | "runLeft"
  | "jump"
  | "play"
  | "sleep"
  | "interact";

export interface PetAnimationState {
  row: number;
  frames: number;
  fps: number;
  loop: boolean;
}

export interface PetManifest {
  schemaVersion: 1;
  id: string;
  displayName: string;
  cellWidth: number;
  cellHeight: number;
  sprite: string;
  defaultState: PetStateName;
  states: Record<string, PetAnimationState>;
}

export interface InstalledPet {
  id: string;
  displayName: string;
  manifest: PetManifest;
  spriteDataUrl: string;
}

export interface AppConfig {
  activePetId: string | null;
  autoStart: boolean;
  window: {
    x: number;
    y: number;
    scale: number;
  };
}

export interface PetLibraryResponse {
  config: AppConfig;
  pets: InstalledPet[];
}
