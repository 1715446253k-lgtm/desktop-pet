import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { open } from "@tauri-apps/plugin-dialog";
import {
  EyeOff,
  FolderInput,
  MapPin,
  Maximize2,
  Minimize2,
  Moon,
  MousePointer2,
  PackageX,
  Play,
  Power,
  RotateCcw,
  Stethoscope,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { BRAND } from "./brand";
import { PetCanvas } from "./PetCanvas";
import type { AppConfig, InstalledPet, PetLibraryResponse, PetStateName } from "./types";

const STATES: PetStateName[] = [
  "idle",
  "runRight",
  "runLeft",
  "jump",
  "play",
  "sleep",
  "interact",
];

const DEFAULT_CONFIG: AppConfig = {
  activePetId: null,
  autoStart: false,
  window: { x: 1200, y: 600, scale: 1 },
};

function App() {
  const [pets, setPets] = useState<InstalledPet[]>([]);
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [stateName, setStateName] = useState<PetStateName>("idle");
  const [panelOpen, setPanelOpen] = useState(true);
  const [message, setMessage] = useState("Ready");
  const [dragging, setDragging] = useState(false);
  const configRef = useRef<AppConfig>(DEFAULT_CONFIG);
  const lastPointerX = useRef<number | null>(null);

  const activePet = useMemo(() => {
    return pets.find((pet) => pet.id === config.activePetId) ?? pets[0] ?? null;
  }, [config.activePetId, pets]);

  const scale = Math.max(0.5, Math.min(2.5, config.window.scale || 1));

  const loadLibrary = useCallback(async () => {
    const response = await invoke<PetLibraryResponse>("load_pet_library");
    setPets(response.pets);
    configRef.current = response.config;
    setConfig(response.config);
    const nextPet = response.pets.find((pet) => pet.id === response.config.activePetId) ?? response.pets[0];
    if (nextPet) setStateName(nextPet.manifest.defaultState);
    setMessage(response.pets.length ? "Pet library loaded" : "Import a .petpkg to begin");
  }, []);

  const saveConfig = useCallback(async (nextConfig: AppConfig) => {
    configRef.current = nextConfig;
    setConfig(nextConfig);
    await invoke("save_app_config", { config: nextConfig });
  }, []);

  useEffect(() => {
    // Loading native app state is the initial synchronization point for the UI.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadLibrary().catch((error) => setMessage(String(error)));
  }, [loadLibrary]);

  useEffect(() => {
    isEnabled()
      .then((enabled) =>
        setConfig((current) => {
          const nextConfig = { ...current, autoStart: enabled };
          configRef.current = nextConfig;
          return nextConfig;
        }),
      )
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!activePet) return;
    const timer = window.setInterval(() => {
      if (stateName !== "idle" && stateName !== "sleep") return;
      const next = Math.random() > 0.62 ? "play" : Math.random() > 0.5 ? "sleep" : "idle";
      setStateName(next);
    }, 6500);
    return () => window.clearInterval(timer);
  }, [activePet, stateName]);

  const importPet = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: "MiraPet Package", extensions: ["petpkg", "zip"] }],
      });
      if (!selected || Array.isArray(selected)) return;
      setMessage("Importing pet...");
      const imported = await invoke<InstalledPet>("import_pet_package", { packagePath: selected });
      const nextConfig = { ...config, activePetId: imported.id };
      await saveConfig(nextConfig);
      await loadLibrary();
      setStateName(imported.manifest.defaultState);
      setMessage(`${imported.displayName} imported`);
    } catch (error) {
      setMessage(`Import failed: ${String(error)}`);
    }
  };

  const choosePet = async (petId: string) => {
    const nextConfig = { ...config, activePetId: petId };
    await saveConfig(nextConfig);
    const pet = pets.find((item) => item.id === petId);
    if (pet) setStateName(pet.manifest.defaultState);
  };

  const toggleAutoStart = async () => {
    const enabled = await isEnabled();
    if (enabled) {
      await disable();
    } else {
      await enable();
    }
    const nextEnabled = await isEnabled();
    const nextConfig = { ...config, autoStart: nextEnabled };
    await saveConfig(nextConfig);
    setMessage(nextEnabled ? "Auto start enabled" : "Auto start disabled");
  };

  const deleteActivePet = async () => {
    if (!activePet) return;
    const response = await invoke<PetLibraryResponse>("delete_pet", { petId: activePet.id });
    setPets(response.pets);
    const nextPet = response.pets[0] ?? null;
    const nextConfig = { ...response.config, activePetId: nextPet?.id ?? null };
    await saveConfig(nextConfig);
    setStateName(nextPet?.manifest.defaultState ?? "idle");
    setMessage(`${activePet.displayName} deleted`);
  };

  const openDataDir = async () => {
    await invoke("open_app_data_dir");
    setMessage("Opened app data directory");
  };

  const exportDiagnostics = async () => {
    const path = await invoke<string>("export_diagnostics");
    setMessage(`Diagnostics exported: ${path}`);
  };

  const exportSupportBundle = async () => {
    const path = await invoke<string>("export_support_bundle");
    setMessage(`Support bundle exported: ${path}`);
  };

  const resetWindowPosition = async () => {
    const nextConfig = await invoke<AppConfig>("reset_window_position");
    configRef.current = nextConfig;
    setConfig(nextConfig);
    setMessage("Window position reset");
  };

  const setScale = async (nextScale: number) => {
    const nextConfig = {
      ...config,
      window: { ...config.window, scale: Number(nextScale.toFixed(2)) },
    };
    await saveConfig(nextConfig);
  };

  const onPointerDown = async () => {
    setDragging(true);
    lastPointerX.current = null;
    await getCurrentWindow().startDragging();
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (!dragging) return;
    if (lastPointerX.current !== null) {
      const delta = event.clientX - lastPointerX.current;
      if (Math.abs(delta) > 8) setStateName(delta > 0 ? "runRight" : "runLeft");
    }
    lastPointerX.current = event.clientX;
  };

  const saveWindowPosition = async () => {
    const position = await getCurrentWindow().outerPosition();
    const nextConfig = {
      ...configRef.current,
      window: {
        ...configRef.current.window,
        x: position.x,
        y: position.y,
      },
    };
    await saveConfig(nextConfig);
  };

  const onPointerUp = () => {
    setDragging(false);
    lastPointerX.current = null;
    setStateName("idle");
    saveWindowPosition().catch((error) => setMessage(`Position save failed: ${String(error)}`));
  };

  const onPetClick = () => {
    setStateName(Math.random() > 0.5 ? "interact" : "jump");
  };

  const hideWindow = () => getCurrentWindow().hide();

  return (
    <main className="app-shell">
      <section
        className="pet-stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={onPetClick}
      >
        {activePet ? (
          <PetCanvas
            manifest={activePet.manifest}
            spriteDataUrl={activePet.spriteDataUrl}
            stateName={stateName}
            scale={scale}
            onLoopEnd={() => setStateName(activePet.manifest.defaultState)}
          />
        ) : (
          <div className="empty-pet" aria-label="No pet installed">
            <FolderInput size={36} />
          </div>
        )}
      </section>

      {panelOpen ? (
        <aside className="control-panel" aria-label="Desktop pet controls">
          <header>
            <div>
              <p>{BRAND.studioName}</p>
              <h1>{activePet?.displayName ?? "No pet installed"}</h1>
            </div>
            <button className="icon-button" onClick={() => setPanelOpen(false)} aria-label="Collapse panel">
              <Minimize2 size={18} />
            </button>
          </header>

          <div className="toolbar">
            <button onClick={importPet}>
              <FolderInput size={17} />
              Import
            </button>
            <button onClick={toggleAutoStart}>
              <Power size={17} />
              {config.autoStart ? "Auto on" : "Auto off"}
            </button>
            <button onClick={hideWindow}>
              <EyeOff size={17} />
              Hide
            </button>
          </div>

          <div className="toolbar secondary">
            <button onClick={openDataDir}>
              <FolderInput size={17} />
              Data
            </button>
            <button onClick={exportDiagnostics}>
              <Stethoscope size={17} />
              Diagnose
            </button>
            <button onClick={exportSupportBundle}>
              <Stethoscope size={17} />
              Support
            </button>
            <button onClick={resetWindowPosition}>
              <MapPin size={17} />
              Reset
            </button>
            <button onClick={deleteActivePet} disabled={!activePet}>
              <PackageX size={17} />
              Delete
            </button>
          </div>

          <label className="field">
            <span>Active pet</span>
            <select value={activePet?.id ?? ""} onChange={(event) => choosePet(event.target.value)}>
              {pets.length === 0 ? <option value="">Import a package</option> : null}
              {pets.map((pet) => (
                <option key={pet.id} value={pet.id}>
                  {pet.displayName}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Scale</span>
            <input
              type="range"
              min="0.5"
              max="2.5"
              step="0.05"
              value={scale}
              onChange={(event) => setScale(Number(event.target.value))}
            />
          </label>

          <div className="state-grid" aria-label="Animation states">
            {STATES.map((state) => (
              <button
                key={state}
                className={stateName === state ? "active" : ""}
                disabled={!activePet || !activePet.manifest.states[state]}
                onClick={() => setStateName(state)}
              >
                {state === "sleep" ? <Moon size={15} /> : state === "idle" ? <RotateCcw size={15} /> : <Play size={15} />}
                {state}
              </button>
            ))}
          </div>

          <footer>
            <MousePointer2 size={15} />
            <span>{message}</span>
          </footer>
        </aside>
      ) : (
        <button className="panel-tab" onClick={() => setPanelOpen(true)} aria-label="Expand panel">
          <Maximize2 size={18} />
        </button>
      )}
    </main>
  );
}

export default App;
