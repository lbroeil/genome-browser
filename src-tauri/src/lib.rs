use std::io::{Read, Seek, SeekFrom};
use tauri::ipc::Response;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::Emitter;

#[tauri::command]
fn read_file_bytes(path: String, offset: u64, length: u64) -> Result<Response, String> {
    let mut file = std::fs::File::open(&path).map_err(|e| format!("{}: {}", path, e))?;
    file.seek(SeekFrom::Start(offset)).map_err(|e| e.to_string())?;
    let mut buf = vec![0u8; length as usize];
    let n = file.read(&mut buf).map_err(|e| e.to_string())?;
    buf.truncate(n);
    Ok(Response::new(buf))
}

#[tauri::command]
fn read_file_all(path: String) -> Result<Response, String> {
    let bytes = std::fs::read(&path).map_err(|e| format!("{}: {}", path, e))?;
    Ok(Response::new(bytes))
}

#[tauri::command]
fn file_stat(path: String) -> Result<u64, String> {
    let meta = std::fs::metadata(&path).map_err(|e| format!("{}: {}", path, e))?;
    Ok(meta.len())
}

#[tauri::command]
fn file_exists(path: String) -> bool {
    std::path::Path::new(&path).exists()
}

#[tauri::command]
fn write_file(path: String, contents: String) -> Result<(), String> {
    std::fs::write(&path, &contents).map_err(|e| format!("{}: {}", path, e))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let app_menu = Submenu::with_items(
                app,
                "Genome Browser",
                true,
                &[
                    &PredefinedMenuItem::about(app, Some("About Genome Browser"), None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::hide(app, None)?,
                    &PredefinedMenuItem::hide_others(app, None)?,
                    &PredefinedMenuItem::show_all(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::quit(app, None)?,
                ],
            )?;

            let file_menu = Submenu::with_items(
                app,
                "File",
                true,
                &[
                    &MenuItem::with_id(app, "open_file", "Open File...", true, Some("CmdOrCtrl+O"))?,
                    &PredefinedMenuItem::separator(app)?,
                    &MenuItem::with_id(app, "save_session", "Save Session...", true, Some("CmdOrCtrl+S"))?,
                    &MenuItem::with_id(app, "load_session", "Load Session...", true, Some("CmdOrCtrl+Shift+O"))?,
                ],
            )?;

            let edit_menu = Submenu::with_items(
                app,
                "Edit",
                true,
                &[
                    &PredefinedMenuItem::undo(app, None)?,
                    &PredefinedMenuItem::redo(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::cut(app, None)?,
                    &PredefinedMenuItem::copy(app, None)?,
                    &PredefinedMenuItem::paste(app, None)?,
                    &PredefinedMenuItem::select_all(app, None)?,
                ],
            )?;

            let window_menu = Submenu::with_items(
                app,
                "Window",
                true,
                &[
                    &PredefinedMenuItem::minimize(app, None)?,
                    &PredefinedMenuItem::fullscreen(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::close_window(app, None)?,
                ],
            )?;

            let menu = Menu::with_items(app, &[&app_menu, &file_menu, &edit_menu, &window_menu])?;
            app.set_menu(menu)?;

            Ok(())
        })
        .on_menu_event(|app, event| {
            match event.id().as_ref() {
                "open_file" => { let _ = app.emit("menu-open-file", ()); }
                "save_session" => { let _ = app.emit("menu-save-session", ()); }
                "load_session" => { let _ = app.emit("menu-load-session", ()); }
                _ => {}
            }
        })
        .invoke_handler(tauri::generate_handler![
            read_file_bytes,
            read_file_all,
            file_stat,
            file_exists,
            write_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
