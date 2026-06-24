# Windows Acceptance Checklist

Run this on a clean Windows user account before paid delivery.

Create a report template before testing:

```powershell
npm run acceptance:new -- --tester "Name" --machine "Clean Windows 11 VM"
```

Fill the generated file in `acceptance-reports/` while testing.

## Install

- Install `release/MiraPet_0.1.0_x64-setup.exe`.
- Confirm Windows does not block install unexpectedly.
- Confirm Start Menu entry launches the app.
- Confirm the app opens with the bundled starter pet before importing anything.

## Runtime

- Drag the pet and confirm the window follows the cursor.
- Double-click the pet and confirm an interaction animation plays.
- Use state buttons to test `idle`, `runRight`, `runLeft`, `jump`, `play`, `sleep`, and `interact`.
- Hide from the control panel, then restore from the tray icon.
- Move the window, click `Reset`, and confirm the pet returns to the default position.
- Move the window, use tray `Reset Position`, and confirm the pet returns to the default position.
- Quit from the tray menu.

## Pet Package

- Import `release/starter.petpkg`.
- Confirm the active pet switches without restarting.
- Delete the active pet and confirm the app remains stable.
- Import the same `.petpkg` again and confirm replacement works.

## Startup And Persistence

- Enable auto start.
- Restart Windows.
- Confirm MiraPet starts automatically.
- Confirm selected pet, window position, and scale persist.
- Disable auto start and confirm the setting persists.

## Support

- Click `Diagnose`.
- Click `Support`.
- Click `Data`.
- Confirm `logs/diagnostics.json` exists.
- Confirm `logs/mirapet-support-*.zip` exists.
- Confirm diagnostics and support bundles do not include customer image bytes.

## Uninstall

- Uninstall MiraPet from Windows Apps.
- Confirm the app executable is removed.
- Record whether `%APPDATA%` data remains; keep or remove by product policy.

