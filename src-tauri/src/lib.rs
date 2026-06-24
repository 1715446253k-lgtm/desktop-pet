use base64::{engine::general_purpose, Engine as _};
use serde::{Deserialize, Serialize};
use std::{
  fs::{self, File},
  io::Write,
  path::{Component, Path, PathBuf},
};
use tauri::{
  PhysicalPosition,
  menu::{Menu, MenuItem},
  tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
  AppHandle, Manager,
};
use zip::{write::SimpleFileOptions, CompressionMethod, ZipArchive, ZipWriter};

const MAX_PACKAGE_BYTES: u64 = 50 * 1024 * 1024;
const MAX_EXTRACTED_BYTES: u64 = 80 * 1024 * 1024;
const MAX_SPRITE_BYTES: u64 = 40 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES: usize = 16;
const REQUIRED_STATES: [(&str, u64); 7] = [
  ("idle", 0),
  ("runRight", 1),
  ("runLeft", 2),
  ("jump", 3),
  ("play", 4),
  ("sleep", 5),
  ("interact", 6),
];
const DEFAULT_WINDOW_X: i32 = 1200;
const DEFAULT_WINDOW_Y: i32 = 600;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PetManifest {
  schema_version: u32,
  id: String,
  display_name: String,
  cell_width: u32,
  cell_height: u32,
  sprite: String,
  default_state: String,
  states: serde_json::Map<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PetAnimationState {
  row: u64,
  frames: u64,
  fps: f64,
  r#loop: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct InstalledPet {
  id: String,
  display_name: String,
  manifest: PetManifest,
  sprite_data_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WindowConfig {
  x: i32,
  y: i32,
  scale: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AppConfig {
  active_pet_id: Option<String>,
  auto_start: bool,
  window: WindowConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PetLibraryResponse {
  config: AppConfig,
  pets: Vec<InstalledPet>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DiagnosticPet {
  id: String,
  display_name: String,
  cell_width: u32,
  cell_height: u32,
  state_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DiagnosticReport {
  app_version: String,
  app_data_dir: String,
  config: AppConfig,
  installed_pets: Vec<DiagnosticPet>,
}

fn default_config() -> AppConfig {
  AppConfig {
    active_pet_id: None,
    auto_start: false,
    window: WindowConfig {
      x: DEFAULT_WINDOW_X,
      y: DEFAULT_WINDOW_Y,
      scale: 1.0,
    },
  }
}

fn app_root(app: &AppHandle) -> Result<PathBuf, String> {
  app
    .path()
    .app_data_dir()
    .map_err(|error| format!("Cannot resolve app data directory: {error}"))
}

fn pets_root(app: &AppHandle) -> Result<PathBuf, String> {
  Ok(app_root(app)?.join("pets"))
}

fn logs_root(app: &AppHandle) -> Result<PathBuf, String> {
  Ok(app_root(app)?.join("logs"))
}

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
  Ok(app_root(app)?.join("config.json"))
}

fn ensure_dirs(app: &AppHandle) -> Result<(), String> {
  fs::create_dir_all(pets_root(app)?).map_err(|error| format!("Cannot create pets directory: {error}"))?;
  fs::create_dir_all(logs_root(app)?).map_err(|error| format!("Cannot create logs directory: {error}"))?;
  Ok(())
}

fn copy_dir_all(source: &Path, target: &Path) -> Result<(), String> {
  fs::create_dir_all(target).map_err(|error| format!("Cannot create directory {}: {error}", target.display()))?;
  for entry in fs::read_dir(source).map_err(|error| format!("Cannot read directory {}: {error}", source.display()))? {
    let entry = entry.map_err(|error| format!("Cannot inspect directory entry: {error}"))?;
    let file_type = entry.file_type().map_err(|error| format!("Cannot inspect file type: {error}"))?;
    let target_path = target.join(entry.file_name());
    if file_type.is_dir() {
      copy_dir_all(&entry.path(), &target_path)?;
    } else {
      fs::copy(entry.path(), &target_path)
        .map_err(|error| format!("Cannot copy bundled pet file {}: {error}", target_path.display()))?;
    }
  }
  Ok(())
}

fn install_bundled_default_pet(app: &AppHandle) -> Result<(), String> {
  ensure_dirs(app)?;
  let resource_dir = app
    .path()
    .resolve("default-pet", tauri::path::BaseDirectory::Resource)
    .map_err(|error| format!("Cannot resolve bundled default pet: {error}"))?;
  if !resource_dir.exists() {
    return Ok(());
  }

  let manifest = load_pet_manifest_from_dir(&resource_dir)?;
  let target_dir = pets_root(app)?.join(&manifest.id);
  if target_dir.exists() {
    return Ok(());
  }
  copy_dir_all(&resource_dir, &target_dir)?;

  let mut config = read_config(app)?;
  if config.active_pet_id.is_none() {
    config.active_pet_id = Some(manifest.id);
    write_config(app, &config)?;
  }
  Ok(())
}

fn read_config(app: &AppHandle) -> Result<AppConfig, String> {
  let path = config_path(app)?;
  if !path.exists() {
    return Ok(default_config());
  }
  let text = fs::read_to_string(path).map_err(|error| format!("Cannot read config: {error}"))?;
  serde_json::from_str(&text).map_err(|error| format!("Invalid config.json: {error}"))
}

fn write_config(app: &AppHandle, config: &AppConfig) -> Result<(), String> {
  ensure_dirs(app)?;
  let text = serde_json::to_string_pretty(config).map_err(|error| format!("Cannot serialize config: {error}"))?;
  fs::write(config_path(app)?, text).map_err(|error| format!("Cannot save config: {error}"))
}

fn reset_window_position_inner(app: &AppHandle) -> Result<AppConfig, String> {
  let mut config = read_config(app)?;
  config.window.x = DEFAULT_WINDOW_X;
  config.window.y = DEFAULT_WINDOW_Y;
  write_config(app, &config)?;
  if let Some(window) = app.get_webview_window("main") {
    window
      .set_position(PhysicalPosition::new(DEFAULT_WINDOW_X, DEFAULT_WINDOW_Y))
      .map_err(|error| format!("Cannot reset window position: {error}"))?;
    let _ = window.show();
    let _ = window.set_focus();
  }
  Ok(config)
}

fn validate_manifest(manifest: &PetManifest) -> Result<(), String> {
  if manifest.schema_version != 1 {
    return Err("Unsupported pet schemaVersion. Expected 1.".into());
  }
  if manifest.id.trim().is_empty() || !manifest.id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
    return Err("Pet id must use letters, numbers, hyphen, or underscore.".into());
  }
  if manifest.display_name.trim().is_empty() {
    return Err("displayName is required.".into());
  }
  if !(64..=512).contains(&manifest.cell_width) || !(64..=512).contains(&manifest.cell_height) {
    return Err("cellWidth and cellHeight must be between 64 and 512.".into());
  }
  if manifest.sprite.trim().is_empty() || manifest.sprite.contains("..") || manifest.sprite.contains('/') || manifest.sprite.contains('\\') {
    return Err("sprite must be a local file name.".into());
  }
  if !manifest.states.contains_key(&manifest.default_state) {
    return Err("defaultState must exist in states.".into());
  }
  for (state_name, expected_row) in REQUIRED_STATES {
    let Some(value) = manifest.states.get(state_name) else {
      return Err(format!("Missing required state: {state_name}"));
    };
    let state: PetAnimationState = serde_json::from_value(value.clone())
      .map_err(|error| format!("Invalid state {state_name}: {error}"))?;
    if state.row != expected_row {
      return Err(format!("State {state_name} must use row {expected_row}."));
    }
    if !(2..=32).contains(&state.frames) {
      return Err(format!("State {state_name} frames must be between 2 and 32."));
    }
    if state.fps <= 0.0 || state.fps > 60.0 {
      return Err(format!("State {state_name} fps must be between 0 and 60."));
    }
  }
  Ok(())
}

fn load_pet_from_dir(dir: &Path) -> Result<InstalledPet, String> {
  let manifest_path = dir.join("pet.json");
  let manifest_text = fs::read_to_string(&manifest_path)
    .map_err(|error| format!("Cannot read {}: {error}", manifest_path.display()))?;
  let manifest: PetManifest =
    serde_json::from_str(&manifest_text).map_err(|error| format!("Invalid pet.json: {error}"))?;
  validate_manifest(&manifest)?;

  let sprite_path = dir.join(&manifest.sprite);
  let sprite_metadata = fs::metadata(&sprite_path)
    .map_err(|error| format!("Cannot inspect sprite {}: {error}", sprite_path.display()))?;
  if sprite_metadata.len() > MAX_SPRITE_BYTES {
    return Err("Pet sprite is too large.".into());
  }
  let sprite_bytes = fs::read(&sprite_path)
    .map_err(|error| format!("Cannot read sprite {}: {error}", sprite_path.display()))?;
  let encoded = general_purpose::STANDARD.encode(sprite_bytes);
  Ok(InstalledPet {
    id: manifest.id.clone(),
    display_name: manifest.display_name.clone(),
    manifest,
    sprite_data_url: format!("data:image/webp;base64,{encoded}"),
  })
}

fn load_pet_manifest_from_dir(dir: &Path) -> Result<PetManifest, String> {
  let manifest_path = dir.join("pet.json");
  let manifest_text = fs::read_to_string(&manifest_path)
    .map_err(|error| format!("Cannot read {}: {error}", manifest_path.display()))?;
  let manifest: PetManifest =
    serde_json::from_str(&manifest_text).map_err(|error| format!("Invalid pet.json: {error}"))?;
  validate_manifest(&manifest)?;
  Ok(manifest)
}

fn safe_zip_path(name: &str) -> Result<PathBuf, String> {
  let path = Path::new(name);
  if path.is_absolute() {
    return Err(format!("Archive entry is absolute: {name}"));
  }
  let mut clean = PathBuf::new();
  for component in path.components() {
    match component {
      Component::Normal(part) => clean.push(part),
      Component::CurDir => {}
      _ => return Err(format!("Archive entry is unsafe: {name}")),
    }
  }
  Ok(clean)
}

fn extract_pet_package(package_path: &Path, target_dir: &Path) -> Result<(), String> {
  let package_bytes = fs::metadata(package_path)
    .map_err(|error| format!("Cannot inspect package: {error}"))?
    .len();
  if package_bytes > MAX_PACKAGE_BYTES {
    return Err("Selected package is too large.".into());
  }
  let file = File::open(package_path).map_err(|error| format!("Cannot open package: {error}"))?;
  let mut archive = ZipArchive::new(file).map_err(|error| format!("Invalid .petpkg archive: {error}"))?;
  if archive.len() > MAX_ARCHIVE_ENTRIES {
    return Err("Pet package contains too many files.".into());
  }
  let mut extracted_bytes = 0_u64;

  for index in 0..archive.len() {
    let mut file = archive.by_index(index).map_err(|error| format!("Cannot read archive entry: {error}"))?;
    let clean_path = safe_zip_path(file.name())?;
    let out_path = target_dir.join(clean_path);

    if file.is_dir() {
      fs::create_dir_all(&out_path).map_err(|error| format!("Cannot create archive directory: {error}"))?;
      continue;
    }
    extracted_bytes = extracted_bytes
      .checked_add(file.size())
      .ok_or_else(|| "Pet package extracted size is too large.".to_string())?;
    if extracted_bytes > MAX_EXTRACTED_BYTES {
      return Err("Pet package extracted size is too large.".into());
    }

    if let Some(parent) = out_path.parent() {
      fs::create_dir_all(parent).map_err(|error| format!("Cannot create archive parent directory: {error}"))?;
    }
    let mut outfile = File::create(&out_path).map_err(|error| format!("Cannot extract archive file: {error}"))?;
    std::io::copy(&mut file, &mut outfile).map_err(|error| format!("Cannot write archive file: {error}"))?;
    outfile.flush().map_err(|error| format!("Cannot flush archive file: {error}"))?;
  }

  Ok(())
}

fn build_diagnostic_report(app: &AppHandle) -> Result<DiagnosticReport, String> {
  ensure_dirs(app)?;
  let pets_dir = pets_root(app)?;
  let mut installed_pets = Vec::new();

  for entry in fs::read_dir(&pets_dir).map_err(|error| format!("Cannot read pets directory: {error}"))? {
    let entry = entry.map_err(|error| format!("Cannot inspect pet entry: {error}"))?;
    if entry.path().is_dir() {
      if let Ok(manifest) = load_pet_manifest_from_dir(&entry.path()) {
        installed_pets.push(DiagnosticPet {
          id: manifest.id,
          display_name: manifest.display_name,
          cell_width: manifest.cell_width,
          cell_height: manifest.cell_height,
          state_count: manifest.states.len(),
        });
      }
    }
  }

  Ok(DiagnosticReport {
    app_version: env!("CARGO_PKG_VERSION").to_string(),
    app_data_dir: app_root(app)?.to_string_lossy().to_string(),
    config: read_config(app)?,
    installed_pets,
  })
}

fn support_bundle_file_name() -> Result<String, String> {
  let seconds = std::time::SystemTime::now()
    .duration_since(std::time::UNIX_EPOCH)
    .map_err(|error| format!("System time error: {error}"))?
    .as_secs();
  Ok(format!("mirapet-support-{seconds}.zip"))
}

fn write_zip_text(zip: &mut ZipWriter<File>, name: &str, text: &str) -> Result<(), String> {
  let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
  zip
    .start_file(name, options)
    .map_err(|error| format!("Cannot add {name} to support bundle: {error}"))?;
  zip
    .write_all(text.as_bytes())
    .map_err(|error| format!("Cannot write {name} to support bundle: {error}"))
}

#[tauri::command]
fn load_pet_library(app: AppHandle) -> Result<PetLibraryResponse, String> {
  ensure_dirs(&app)?;
  let config = read_config(&app)?;
  let pets_dir = pets_root(&app)?;
  let mut pets = Vec::new();

  for entry in fs::read_dir(pets_dir).map_err(|error| format!("Cannot read pets directory: {error}"))? {
    let entry = entry.map_err(|error| format!("Cannot inspect pet entry: {error}"))?;
    if entry.path().is_dir() {
      if let Ok(pet) = load_pet_from_dir(&entry.path()) {
        pets.push(pet);
      }
    }
  }

  pets.sort_by(|a, b| a.display_name.to_lowercase().cmp(&b.display_name.to_lowercase()));
  Ok(PetLibraryResponse { config, pets })
}

#[tauri::command]
fn delete_pet(app: AppHandle, pet_id: String) -> Result<PetLibraryResponse, String> {
  ensure_dirs(&app)?;
  if pet_id.trim().is_empty() || !pet_id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
    return Err("Invalid pet id.".into());
  }

  let target_dir = pets_root(&app)?.join(&pet_id);
  if target_dir.exists() {
    fs::remove_dir_all(&target_dir).map_err(|error| format!("Cannot delete pet: {error}"))?;
  }

  let mut config = read_config(&app)?;
  if config.active_pet_id.as_deref() == Some(&pet_id) {
    config.active_pet_id = None;
  }
  write_config(&app, &config)?;
  load_pet_library(app)
}

#[tauri::command]
fn open_app_data_dir(app: AppHandle) -> Result<(), String> {
  ensure_dirs(&app)?;
  tauri_plugin_opener::open_path(app_root(&app)?.to_string_lossy().to_string(), None::<&str>)
    .map_err(|error| format!("Cannot open app data directory: {error}"))
}

#[tauri::command]
fn export_diagnostics(app: AppHandle) -> Result<String, String> {
  ensure_dirs(&app)?;
  let report = build_diagnostic_report(&app)?;
  let path = logs_root(&app)?.join("diagnostics.json");
  let text = serde_json::to_string_pretty(&report).map_err(|error| format!("Cannot serialize diagnostics: {error}"))?;
  fs::write(&path, text).map_err(|error| format!("Cannot write diagnostics: {error}"))?;
  Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn export_support_bundle(app: AppHandle) -> Result<String, String> {
  ensure_dirs(&app)?;
  let bundle_path = logs_root(&app)?.join(support_bundle_file_name()?);
  let bundle_file =
    File::create(&bundle_path).map_err(|error| format!("Cannot create support bundle: {error}"))?;
  let mut zip = ZipWriter::new(bundle_file);

  let diagnostics = build_diagnostic_report(&app)?;
  let diagnostics_text =
    serde_json::to_string_pretty(&diagnostics).map_err(|error| format!("Cannot serialize diagnostics: {error}"))?;
  write_zip_text(&mut zip, "diagnostics.json", &diagnostics_text)?;

  let config_text =
    serde_json::to_string_pretty(&read_config(&app)?).map_err(|error| format!("Cannot serialize config: {error}"))?;
  write_zip_text(&mut zip, "config.json", &config_text)?;

  let pets_dir = pets_root(&app)?;
  for entry in fs::read_dir(&pets_dir).map_err(|error| format!("Cannot read pets directory: {error}"))? {
    let entry = entry.map_err(|error| format!("Cannot inspect pet entry: {error}"))?;
    if entry.path().is_dir() {
      let manifest_path = entry.path().join("pet.json");
      if manifest_path.exists() {
        let manifest_text = fs::read_to_string(&manifest_path)
          .map_err(|error| format!("Cannot read pet manifest {}: {error}", manifest_path.display()))?;
        let entry_name = format!("pets/{}/pet.json", entry.file_name().to_string_lossy());
        write_zip_text(&mut zip, &entry_name, &manifest_text)?;
      }
    }
  }

  let manifest = serde_json::json!({
    "schemaVersion": 1,
    "appName": "MiraPet",
    "appVersion": env!("CARGO_PKG_VERSION"),
    "privacy": "This bundle excludes sprite images and original customer reference images.",
    "includedFiles": ["diagnostics.json", "config.json", "pets/*/pet.json", "README.txt"]
  });
  write_zip_text(
    &mut zip,
    "support-manifest.json",
    &serde_json::to_string_pretty(&manifest).map_err(|error| format!("Cannot serialize support manifest: {error}"))?,
  )?;
  write_zip_text(
    &mut zip,
    "README.txt",
    "MiraPet support bundle. It contains diagnostics, config, and pet manifests only. Sprite images and customer reference images are excluded.\n",
  )?;

  zip
    .finish()
    .map_err(|error| format!("Cannot finalize support bundle: {error}"))?;
  Ok(bundle_path.to_string_lossy().to_string())
}

#[tauri::command]
fn save_app_config(app: AppHandle, config: AppConfig) -> Result<(), String> {
  write_config(&app, &config)
}

#[tauri::command]
fn reset_window_position(app: AppHandle) -> Result<AppConfig, String> {
  reset_window_position_inner(&app)
}

#[tauri::command]
fn import_pet_package(app: AppHandle, package_path: String) -> Result<InstalledPet, String> {
  ensure_dirs(&app)?;
  let source = PathBuf::from(package_path);
  if !source.exists() {
    return Err("Selected package does not exist.".into());
  }

  let temp_dir = app_root(&app)?.join("imports").join(format!(
    "pet-import-{}",
    std::time::SystemTime::now()
      .duration_since(std::time::UNIX_EPOCH)
      .map_err(|error| format!("System time error: {error}"))?
      .as_millis()
  ));
  fs::create_dir_all(&temp_dir).map_err(|error| format!("Cannot create import directory: {error}"))?;

  let result = (|| {
    extract_pet_package(&source, &temp_dir)?;
    let imported = load_pet_from_dir(&temp_dir)?;
    let final_dir = pets_root(&app)?.join(&imported.id);
    if final_dir.exists() {
      fs::remove_dir_all(&final_dir).map_err(|error| format!("Cannot replace existing pet: {error}"))?;
    }
    fs::create_dir_all(&final_dir).map_err(|error| format!("Cannot create pet directory: {error}"))?;

    for file_name in ["pet.json", imported.manifest.sprite.as_str()] {
      fs::copy(temp_dir.join(file_name), final_dir.join(file_name))
        .map_err(|error| format!("Cannot install pet file {file_name}: {error}"))?;
    }

    let mut config = read_config(&app)?;
    config.active_pet_id = Some(imported.id.clone());
    write_config(&app, &config)?;
    load_pet_from_dir(&final_dir)
  })();

  let _ = fs::remove_dir_all(&temp_dir);
  result
}

fn show_main_window(app: &AppHandle) {
  if let Some(window) = app.get_webview_window("main") {
    let _ = window.show();
    let _ = window.set_focus();
  }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_autostart::init(
      tauri_plugin_autostart::MacosLauncher::LaunchAgent,
      None,
    ))
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_shell::init())
    .invoke_handler(tauri::generate_handler![
      delete_pet,
      export_diagnostics,
      export_support_bundle,
      import_pet_package,
      load_pet_library,
      open_app_data_dir,
      reset_window_position,
      save_app_config
    ])
    .setup(|app| {
      ensure_dirs(app.handle())?;
      install_bundled_default_pet(app.handle())?;

      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      let show = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
      let hide = MenuItem::with_id(app, "hide", "Hide", true, None::<&str>)?;
      let reset_position = MenuItem::with_id(app, "reset_position", "Reset Position", true, None::<&str>)?;
      let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
      let menu = Menu::with_items(app, &[&show, &hide, &reset_position, &quit])?;
      let _tray = TrayIconBuilder::new()
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
          "show" => show_main_window(app),
          "hide" => {
            if let Some(window) = app.get_webview_window("main") {
              let _ = window.hide();
            }
          }
          "reset_position" => {
            let _ = reset_window_position_inner(app);
          }
          "quit" => app.exit(0),
          _ => {}
        })
        .on_tray_icon_event(|tray, event| {
          if let TrayIconEvent::Click {
            button: MouseButton::Left,
            button_state: MouseButtonState::Up,
            ..
          } = event
          {
            show_main_window(tray.app_handle());
          }
        })
        .build(app)?;

      if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_always_on_top(true);
        let _ = window.set_decorations(false);
        let _ = window.set_resizable(false);
        if let Ok(config) = read_config(app.handle()) {
          let _ = window.set_position(PhysicalPosition::new(config.window.x, config.window.y));
        }
      }

      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::time::{SystemTime, UNIX_EPOCH};

  fn test_dir(name: &str) -> PathBuf {
    let millis = SystemTime::now()
      .duration_since(UNIX_EPOCH)
      .expect("system time")
      .as_millis();
    std::env::temp_dir().join(format!("mirapet-{name}-{millis}"))
  }

  fn valid_manifest() -> PetManifest {
    let states = REQUIRED_STATES
      .iter()
      .map(|(name, row)| {
        (
          (*name).to_string(),
          serde_json::json!({
            "row": row,
            "frames": 2,
            "fps": 8,
            "loop": true
          }),
        )
      })
      .collect();
    PetManifest {
      schema_version: 1,
      id: "test_pet".into(),
      display_name: "Test Pet".into(),
      cell_width: 192,
      cell_height: 208,
      sprite: "spritesheet.webp".into(),
      default_state: "idle".into(),
      states,
    }
  }

  fn write_zip(path: &Path, entries: &[(&str, &[u8])]) {
    let file = File::create(path).expect("create zip");
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);
    for (name, bytes) in entries {
      zip.start_file(*name, options).expect("start file");
      zip.write_all(bytes).expect("write file");
    }
    zip.finish().expect("finish zip");
  }

  #[test]
  fn validate_manifest_accepts_required_shape() {
    validate_manifest(&valid_manifest()).expect("manifest should be valid");
  }

  #[test]
  fn validate_manifest_rejects_missing_required_state() {
    let mut manifest = valid_manifest();
    manifest.states.remove("runLeft");
    let error = validate_manifest(&manifest).expect_err("manifest should fail");
    assert!(error.contains("Missing required state: runLeft"));
  }

  #[test]
  fn validate_manifest_rejects_wrong_state_row() {
    let mut manifest = valid_manifest();
    manifest.states.insert(
      "jump".into(),
      serde_json::json!({
        "row": 9,
        "frames": 2,
        "fps": 8,
        "loop": false
      }),
    );
    let error = validate_manifest(&manifest).expect_err("manifest should fail");
    assert!(error.contains("State jump must use row 3."));
  }

  #[test]
  fn safe_zip_path_rejects_traversal() {
    let error = safe_zip_path("../pet.json").expect_err("path should fail");
    assert!(error.contains("unsafe"));
  }

  #[test]
  fn extract_pet_package_rejects_too_many_entries() {
    let root = test_dir("too-many-entries");
    fs::create_dir_all(&root).expect("create root");
    let package = root.join("bad.petpkg");
    let target = root.join("out");
    let owned_entries: Vec<(String, Vec<u8>)> = (0..=MAX_ARCHIVE_ENTRIES)
      .map(|index| (format!("file-{index}.txt"), vec![b'x']))
      .collect();
    let entry_refs: Vec<(&str, &[u8])> = owned_entries
      .iter()
      .map(|(name, bytes)| (name.as_str(), bytes.as_slice()))
      .collect();
    write_zip(&package, &entry_refs);

    let error = extract_pet_package(&package, &target).expect_err("package should fail");
    assert!(error.contains("too many files"));
    let _ = fs::remove_dir_all(root);
  }

  #[test]
  fn extract_pet_package_rejects_unsafe_entry_path() {
    let root = test_dir("unsafe-entry");
    fs::create_dir_all(&root).expect("create root");
    let package = root.join("bad.petpkg");
    let target = root.join("out");
    write_zip(&package, &[("../pet.json", b"{}")]);

    let error = extract_pet_package(&package, &target).expect_err("package should fail");
    assert!(error.contains("unsafe"));
    let _ = fs::remove_dir_all(root);
  }

  #[test]
  fn extract_pet_package_accepts_small_safe_archive() {
    let root = test_dir("safe-entry");
    fs::create_dir_all(&root).expect("create root");
    let package = root.join("ok.petpkg");
    let target = root.join("out");
    write_zip(&package, &[("pet.json", b"{}"), ("spritesheet.webp", b"webp")]);

    extract_pet_package(&package, &target).expect("package should extract");
    assert!(target.join("pet.json").exists());
    assert!(target.join("spritesheet.webp").exists());
    let _ = fs::remove_dir_all(root);
  }
}
