use std::io::{Read, Seek, SeekFrom};
use tauri::ipc::Response;

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
