use crate::img_loader::ImageLoader;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, RwLock};
use tauri::{AppHandle, Emitter, State};

const SAFE_ERROR_MESSAGES: &[&str] = &[
    "ImageLoader not initialized",
    "internal error",
    "no folder selected",
    "no current folder set",
    "no images available",
    "no images found in folder",
    "image not found",
    "invalid folder path",
    "folder path is not a directory",
    "folder path is unreadable",
    "invalid timer flow mode",
];

pub type ImageLoaderState = Arc<RwLock<Option<Arc<ImageLoader>>>>;

#[derive(Debug, Serialize, Deserialize)]
pub struct FolderInfo {
    pub id: i64,
    pub path: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ImageHistory {
    pub history: Vec<String>,
    #[serde(rename = "currentIndex")]
    pub current_index: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FolderHistoryItem {
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
    if SAFE_ERROR_MESSAGES.contains(&raw) {
        raw.to_string()
    } else {
        "internal error".to_string()
    }
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
        .map(|(_, path, _, image_count)| FolderHistoryItem { path, image_count })
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
) -> Result<Vec<u8>, CommandError> {
    let loader = get_loader(&state)?;
    loader.get_current_image_or_first().await.map_err(Into::into)
}

#[tauri::command]
pub async fn get_next_image(state: State<'_, ImageLoaderState>) -> Result<Vec<u8>, CommandError> {
    let loader = get_loader(&state)?;
    loader.get_next_image().await.map_err(Into::into)
}

#[tauri::command]
pub async fn get_prev_image(state: State<'_, ImageLoaderState>) -> Result<Vec<u8>, CommandError> {
    let loader = get_loader(&state)?;
    loader.get_prev_image().await.map_err(Into::into)
}

#[tauri::command]
pub async fn get_next_random_image(
    state: State<'_, ImageLoaderState>,
) -> Result<Vec<u8>, CommandError> {
    let loader = get_loader(&state)?;
    loader.get_next_random_image().await.map_err(Into::into)
}

#[tauri::command]
pub async fn get_prev_random_image(
    state: State<'_, ImageLoaderState>,
) -> Result<Vec<u8>, CommandError> {
    let loader = get_loader(&state)?;
    loader.get_prev_random_image().await.map_err(Into::into)
}

#[tauri::command]
pub async fn get_force_random_image(
    state: State<'_, ImageLoaderState>,
) -> Result<Vec<u8>, CommandError> {
    let loader = get_loader(&state)?;
    loader.get_force_random_image(true).await.map_err(Into::into)
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
