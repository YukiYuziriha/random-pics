use crate::img_loader::ImageLoader;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, RwLock};
use tauri::{AppHandle, Emitter, State};

pub type ImageLoaderState = Arc<RwLock<Option<Arc<ImageLoader>>>>;

#[derive(Debug, Serialize, Deserialize)]
pub struct FolderInfo {
    pub id: i64,
    pub path: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ImageHistory {
    pub history: Vec<ImageHistoryItem>,
    #[serde(rename = "currentIndex")]
    pub current_index: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ImageHistoryItem {
    #[serde(rename = "imageId")]
    pub image_id: i64,
    #[serde(rename = "orderIndex")]
    pub order_index: i64,
    pub path: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FolderHistoryItem {
    pub id: i64,
    pub path: String,
    #[serde(rename = "imageCount")]
    pub image_count: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FolderHistory {
    pub history: Vec<FolderHistoryItem>,
    #[serde(rename = "currentIndex")]
    pub current_index: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ImageState {
    #[serde(rename = "verticalMirror")]
    pub vertical_mirror: bool,
    #[serde(rename = "horizontalMirror")]
    pub horizontal_mirror: bool,
    pub greyscale: bool,
    #[serde(rename = "timerFlowMode")]
    pub timer_flow_mode: String,
    #[serde(rename = "showFolderHistoryPanel")]
    pub show_folder_history_panel: bool,
    #[serde(rename = "showTopControls")]
    pub show_top_controls: bool,
    #[serde(rename = "showImageHistoryPanel")]
    pub show_image_history_panel: bool,
    #[serde(rename = "showBottomControls")]
    pub show_bottom_controls: bool,
    #[serde(rename = "isFullscreenImage")]
    pub is_fullscreen_image: bool,
    #[serde(rename = "shortcutHintsVisible")]
    pub shortcut_hints_visible: bool,
    #[serde(rename = "shortcutHintSide")]
    pub shortcut_hint_side: String,
}

#[derive(Debug, Serialize)]
pub struct ImageResponse {
    pub data: Vec<u8>,
    pub folder: Option<FolderInfo>,
    pub auto_switched_folder: bool,
}

#[derive(Debug, Serialize)]
pub struct CommandError {
    pub message: String,
}

impl From<Box<dyn std::error::Error>> for CommandError {
    fn from(err: Box<dyn std::error::Error>) -> Self {
        let raw = err.to_string();
        Self {
            message: sanitize_error_message(&raw),
        }
    }
}

impl From<rusqlite::Error> for CommandError {
    fn from(err: rusqlite::Error) -> Self {
        let raw = err.to_string();
        Self {
            message: sanitize_error_message(&raw),
        }
    }
}

impl CommandError {
    fn internal() -> Self {
        Self {
            message: "internal error".to_string(),
        }
    }

    fn invalid(message: &str) -> Self {
        Self {
            message: message.to_string(),
        }
    }
}

fn sanitize_error_message(raw: &str) -> String {
    // Explicit error mapping for known issues
    if raw.contains("FOREIGN KEY constraint failed") {
        return "database constraint failed - try resetting history or reindexing".to_string();
    }
    if raw.contains("query returned no rows") {
        return "no data found - folder or image may have been deleted".to_string();
    }
    if raw.contains("all images for this folder are hidden") {
        return "all images are hidden for this folder and mode - reindex to clear hidden images"
            .to_string();
    }
    // Pass through all other errors as-is
    raw.to_string()
}

fn get_loader(state: &State<ImageLoaderState>) -> Result<Arc<ImageLoader>, CommandError> {
    state
        .read()
        .map_err(|_| CommandError::internal())?
        .as_ref()
        .map(Arc::clone)
        .ok_or_else(|| CommandError {
            message: "ImageLoader not initialized".to_string(),
        })
}

fn resolve_dual_i64_arg(
    snake_case: Option<i64>,
    camel_case: Option<i64>,
    snake_name: &str,
    camel_name: &str,
) -> Result<i64, CommandError> {
    snake_case.or(camel_case).ok_or_else(|| CommandError {
        message: format!("missing {camel_name}/{snake_name}"),
    })
}

#[tauri::command]
pub async fn pick_folder(
    path: String,
    app: AppHandle,
    state: State<'_, ImageLoaderState>,
) -> Result<FolderInfo, CommandError> {
    let loader = get_loader(&state)?;
    let _ = app.emit("indexing-log", format!("folder:{}", path));
    let (id, folder_path) = loader
        .set_current_folder_and_index_with_progress(&path, |line| {
            let _ = app.emit("indexing-log", line);
        })
        .await?;
    Ok(FolderInfo {
        id,
        path: folder_path,
    })
}

#[tauri::command]
pub async fn next_folder(
    state: State<'_, ImageLoaderState>,
) -> Result<Option<FolderInfo>, CommandError> {
    let loader = get_loader(&state)?;
    match loader.get_next_folder()? {
        Some((id, path)) => Ok(Some(FolderInfo { id, path })),
        None => Ok(None),
    }
}

#[tauri::command]
pub async fn prev_folder(
    state: State<'_, ImageLoaderState>,
) -> Result<Option<FolderInfo>, CommandError> {
    let loader = get_loader(&state)?;
    match loader.get_prev_folder()? {
        Some((id, path)) => Ok(Some(FolderInfo { id, path })),
        None => Ok(None),
    }
}

#[tauri::command]
pub async fn get_folder_history(
    state: State<'_, ImageLoaderState>,
) -> Result<FolderHistory, CommandError> {
    let loader = get_loader(&state)?;
    let history = loader.get_folder_history()?;

    let current_index = if history.is_empty() {
        -1
    } else {
        let current_id = loader.get_current_folder_id()?;

        match current_id {
            Some(id) => history
                .iter()
                .position(|(fid, _, _, _)| *fid == id)
                .map(|index| index as i64)
                .unwrap_or(-1),
            None => -1,
        }
    };

    let items: Vec<FolderHistoryItem> = history
        .into_iter()
        .map(|(id, path, _, image_count)| FolderHistoryItem {
            id,
            path,
            image_count,
        })
        .collect();

    Ok(FolderHistory {
        history: items,
        current_index,
    })
}

#[tauri::command]
pub async fn reindex_current_folder(
    app: AppHandle,
    state: State<'_, ImageLoaderState>,
) -> Result<FolderInfo, CommandError> {
    let loader = get_loader(&state)?;
    let _ = app.emit("indexing-log", "reindex:start".to_string());
    let (id, path) = loader
        .reindex_current_folder_with_progress(|line| {
            let _ = app.emit("indexing-log", line);
        })
        .await?;
    Ok(FolderInfo { id, path })
}

#[tauri::command]
pub async fn get_current_image(
    state: State<'_, ImageLoaderState>,
) -> Result<ImageResponse, CommandError> {
    let loader = get_loader(&state)?;
    let (data, auto_switched) = loader.get_current_image_or_first().await.map_err(CommandError::from)?;
    let folder = loader.get_current_folder_id_and_path()
        .ok()
        .flatten()
        .map(|(id, path)| FolderInfo { id, path });
    Ok(ImageResponse { data, folder, auto_switched_folder: auto_switched })
}

#[tauri::command]
pub async fn get_current_random_image(
    state: State<'_, ImageLoaderState>,
) -> Result<ImageResponse, CommandError> {
    let loader = get_loader(&state)?;
    let (data, auto_switched) = loader.get_current_random_image_or_last().await.map_err(CommandError::from)?;
    let folder = loader.get_current_folder_id_and_path()
        .ok()
        .flatten()
        .map(|(id, path)| FolderInfo { id, path });
    Ok(ImageResponse { data, folder, auto_switched_folder: auto_switched })
}

#[tauri::command]
pub async fn get_next_image(state: State<'_, ImageLoaderState>) -> Result<ImageResponse, CommandError> {
    let loader = get_loader(&state)?;
    let (data, auto_switched) = loader.get_next_image().await.map_err(CommandError::from)?;
    let folder = loader.get_current_folder_id_and_path()
        .ok()
        .flatten()
        .map(|(id, path)| FolderInfo { id, path });
    Ok(ImageResponse { data, folder, auto_switched_folder: auto_switched })
}

#[tauri::command]
pub async fn get_prev_image(state: State<'_, ImageLoaderState>) -> Result<ImageResponse, CommandError> {
    let loader = get_loader(&state)?;
    let (data, auto_switched) = loader.get_prev_image().await.map_err(CommandError::from)?;
    let folder = loader.get_current_folder_id_and_path()
        .ok()
        .flatten()
        .map(|(id, path)| FolderInfo { id, path });
    Ok(ImageResponse { data, folder, auto_switched_folder: auto_switched })
}

#[tauri::command]
pub async fn get_next_random_image(
    state: State<'_, ImageLoaderState>,
) -> Result<ImageResponse, CommandError> {
    let loader = get_loader(&state)?;
    let (data, auto_switched) = loader.get_next_random_image().await.map_err(CommandError::from)?;
    let folder = loader.get_current_folder_id_and_path()
        .ok()
        .flatten()
        .map(|(id, path)| FolderInfo { id, path });
    Ok(ImageResponse { data, folder, auto_switched_folder: auto_switched })
}

#[tauri::command]
pub async fn get_prev_random_image(
    state: State<'_, ImageLoaderState>,
) -> Result<ImageResponse, CommandError> {
    let loader = get_loader(&state)?;
    let (data, auto_switched) = loader.get_prev_random_image().await.map_err(CommandError::from)?;
    let folder = loader.get_current_folder_id_and_path()
        .ok()
        .flatten()
        .map(|(id, path)| FolderInfo { id, path });
    Ok(ImageResponse { data, folder, auto_switched_folder: auto_switched })
}

#[tauri::command]
pub async fn get_force_random_image(
    state: State<'_, ImageLoaderState>,
) -> Result<ImageResponse, CommandError> {
    let loader = get_loader(&state)?;
    let (data, auto_switched) = loader.get_force_random_image(true).await.map_err(CommandError::from)?;
    let folder = loader.get_current_folder_id_and_path()
        .ok()
        .flatten()
        .map(|(id, path)| FolderInfo { id, path });
    Ok(ImageResponse { data, folder, auto_switched_folder: auto_switched })
}

#[tauri::command]
pub async fn get_normal_history(
    state: State<'_, ImageLoaderState>,
) -> Result<ImageHistory, CommandError> {
    let loader = get_loader(&state)?;
    let (history, current_index) = loader.get_normal_history()?;
    Ok(ImageHistory {
        history,
        current_index,
    })
}

#[tauri::command]
pub async fn get_random_history(
    state: State<'_, ImageLoaderState>,
) -> Result<ImageHistory, CommandError> {
    let loader = get_loader(&state)?;
    let (history, current_index) = loader.get_random_history()?;
    Ok(ImageHistory {
        history,
        current_index,
    })
}

#[tauri::command]
pub async fn hide_normal_history_image(
    image_id: Option<i64>,
    #[allow(non_snake_case)] imageId: Option<i64>,
    state: State<'_, ImageLoaderState>,
) -> Result<(), CommandError> {
    let image_id = resolve_dual_i64_arg(image_id, imageId, "image_id", "imageId")?;
    let loader = get_loader(&state)?;
    loader.hide_normal_history_image(image_id)?;
    Ok(())
}

#[tauri::command]
pub async fn hide_random_history_image(
    image_id: Option<i64>,
    #[allow(non_snake_case)] imageId: Option<i64>,
    state: State<'_, ImageLoaderState>,
) -> Result<(), CommandError> {
    let image_id = resolve_dual_i64_arg(image_id, imageId, "image_id", "imageId")?;
    let loader = get_loader(&state)?;
    loader.hide_random_history_image(image_id)?;
    Ok(())
}

#[tauri::command]
pub async fn reset_normal_history(state: State<'_, ImageLoaderState>) -> Result<(), CommandError> {
    let loader = get_loader(&state)?;
    loader.reset_normal_history()?;
    Ok(())
}

#[tauri::command]
pub async fn reset_random_history(state: State<'_, ImageLoaderState>) -> Result<(), CommandError> {
    let loader = get_loader(&state)?;
    loader.reset_random_history()?;
    Ok(())
}

#[tauri::command]
pub async fn get_image_state(
    state: State<'_, ImageLoaderState>,
) -> Result<ImageState, CommandError> {
    let loader = get_loader(&state)?;
    loader.get_image_state().map_err(Into::into)
}

#[tauri::command]
pub async fn set_image_state(
    state: ImageState,
    loader_state: State<'_, ImageLoaderState>,
) -> Result<(), CommandError> {
    let loader = get_loader(&loader_state)?;
    if state.timer_flow_mode != "normal" && state.timer_flow_mode != "random" {
        return Err(CommandError::invalid("invalid timer flow mode"));
    }
    loader.set_image_state(&state)?;
    Ok(())
}

#[tauri::command]
pub async fn full_wipe(state: State<'_, ImageLoaderState>) -> Result<(), CommandError> {
    let loader = get_loader(&state)?;
    loader.full_wipe()?;
    Ok(())
}

#[tauri::command]
pub async fn is_healthy(state: State<'_, ImageLoaderState>) -> Result<bool, CommandError> {
    let loader = get_loader(&state)?;
    let _ = loader.get_image_state()?;
    Ok(true)
}

#[tauri::command]
pub async fn set_folder_by_index(
    index: i64,
    state: State<'_, ImageLoaderState>,
) -> Result<FolderInfo, CommandError> {
    let loader = get_loader(&state)?;
    let (id, path) = loader.set_folder_by_index(index)?;
    Ok(FolderInfo { id, path })
}

#[tauri::command]
pub async fn set_normal_image_by_index(
    index: i64,
    state: State<'_, ImageLoaderState>,
) -> Result<ImageResponse, CommandError> {
    let loader = get_loader(&state)?;
    let (data, auto_switched) = loader.set_normal_image_by_index(index).await.map_err(CommandError::from)?;
    let folder = loader.get_current_folder_id_and_path()
        .ok()
        .flatten()
        .map(|(id, path)| FolderInfo { id, path });
    Ok(ImageResponse { data, folder, auto_switched_folder: auto_switched })
}

#[tauri::command]
pub async fn set_random_image_by_index(
    index: i64,
    state: State<'_, ImageLoaderState>,
) -> Result<ImageResponse, CommandError> {
    let loader = get_loader(&state)?;
    let (data, auto_switched) = loader.set_random_image_by_index(index).await.map_err(CommandError::from)?;
    let folder = loader.get_current_folder_id_and_path()
        .ok()
        .flatten()
        .map(|(id, path)| FolderInfo { id, path });
    Ok(ImageResponse { data, folder, auto_switched_folder: auto_switched })
}

#[tauri::command]
pub async fn get_current_folder(
    state: State<'_, ImageLoaderState>,
) -> Result<Option<FolderInfo>, CommandError> {
    let loader = get_loader(&state)?;
    match loader.get_current_folder_id_and_path()? {
        Some((id, path)) => Ok(Some(FolderInfo { id, path })),
        None => Ok(None),
    }
}

#[tauri::command]
pub async fn delete_folder(
    folder_id: Option<i64>,
    #[allow(non_snake_case)] folderId: Option<i64>,
    state: State<'_, ImageLoaderState>,
) -> Result<(), CommandError> {
    let folder_id = resolve_dual_i64_arg(folder_id, folderId, "folder_id", "folderId")?;
    let loader = get_loader(&state)?;
    loader.delete_folder_by_id(folder_id)?;
    Ok(())
}

#[tauri::command]
pub async fn cleanup_stale_folders(
    state: State<'_, ImageLoaderState>,
) -> Result<Vec<String>, CommandError> {
    let loader = get_loader(&state)?;
    let history = loader.get_folder_history()?;
    let mut removed_paths = Vec::new();
    
    for (folder_id, path, _, _) in history {
        if !std::path::Path::new(&path).exists() {
            loader.delete_folder_by_id(folder_id)?;
            removed_paths.push(path);
        }
    }
    
    Ok(removed_paths)
}

#[cfg(test)]
mod tests {
    use super::resolve_dual_i64_arg;

    #[test]
    fn resolve_dual_i64_arg_accepts_camel_case() {
        let value = resolve_dual_i64_arg(None, Some(2), "image_id", "imageId").unwrap();
        assert_eq!(value, 2);
    }

    #[test]
    fn resolve_dual_i64_arg_accepts_snake_case() {
        let value = resolve_dual_i64_arg(Some(1), None, "folder_id", "folderId").unwrap();
        assert_eq!(value, 1);
    }
}
