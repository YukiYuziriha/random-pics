use rodio::{
    source::{SineWave, Source},
    OutputStreamBuilder, Sink,
};
use crate::img_loader::ImageLoader;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, OnceLock, RwLock};
use std::time::Duration;
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
pub struct FolderTreeNode {
    pub path: String,
    #[serde(rename = "parentPath")]
    pub parent_path: Option<String>,
    #[serde(rename = "imageCount")]
    pub image_count: i64,
    pub checked: bool,
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
    if raw.contains("No folders selected. Check at least one folder.") {
        return "No folders selected. Check at least one folder.".to_string();
    }
    // Pass through all other errors as-is
    raw.to_string()
}

#[tauri::command]
pub async fn get_folder_tree(
    state: State<'_, ImageLoaderState>,
) -> Result<Vec<FolderTreeNode>, CommandError> {
    let loader = get_loader(&state)?;
    let nodes = loader.get_folder_tree()?;
    Ok(nodes
        .into_iter()
        .map(|(path, parent_path, image_count, checked)| FolderTreeNode {
            path,
            parent_path,
            image_count,
            checked,
        })
        .collect())
}

#[tauri::command]
pub async fn set_folder_checked(
    path: String,
    checked: bool,
    state: State<'_, ImageLoaderState>,
) -> Result<(), CommandError> {
    let loader = get_loader(&state)?;
    loader.set_folder_checked(&path, checked)?;
    Ok(())
}

#[tauri::command]
pub async fn set_folder_exclusive(
    path: String,
    state: State<'_, ImageLoaderState>,
) -> Result<(), CommandError> {
    let loader = get_loader(&state)?;
    loader.set_folder_exclusive(&path)?;
    Ok(())
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
    let (data, auto_switched) = loader
        .get_current_image_or_first()
        .await
        .map_err(CommandError::from)?;
    let folder = loader
        .get_current_folder_id_and_path()
        .ok()
        .flatten()
        .map(|(id, path)| FolderInfo { id, path });
    Ok(ImageResponse {
        data,
        folder,
        auto_switched_folder: auto_switched,
    })
}

#[tauri::command]
pub async fn get_current_random_image(
    state: State<'_, ImageLoaderState>,
) -> Result<ImageResponse, CommandError> {
    let loader = get_loader(&state)?;
    let (data, auto_switched) = loader
        .get_current_random_image_or_last()
        .await
        .map_err(CommandError::from)?;
    let folder = loader
        .get_current_folder_id_and_path()
        .ok()
        .flatten()
        .map(|(id, path)| FolderInfo { id, path });
    Ok(ImageResponse {
        data,
        folder,
        auto_switched_folder: auto_switched,
    })
}

#[tauri::command]
pub async fn get_next_image(
    state: State<'_, ImageLoaderState>,
) -> Result<ImageResponse, CommandError> {
    let loader = get_loader(&state)?;
    let (data, auto_switched) = loader.get_next_image().await.map_err(CommandError::from)?;
    let folder = loader
        .get_current_folder_id_and_path()
        .ok()
        .flatten()
        .map(|(id, path)| FolderInfo { id, path });
    Ok(ImageResponse {
        data,
        folder,
        auto_switched_folder: auto_switched,
    })
}

#[tauri::command]
pub async fn get_prev_image(
    state: State<'_, ImageLoaderState>,
) -> Result<ImageResponse, CommandError> {
    let loader = get_loader(&state)?;
    let (data, auto_switched) = loader.get_prev_image().await.map_err(CommandError::from)?;
    let folder = loader
        .get_current_folder_id_and_path()
        .ok()
        .flatten()
        .map(|(id, path)| FolderInfo { id, path });
    Ok(ImageResponse {
        data,
        folder,
        auto_switched_folder: auto_switched,
    })
}

#[tauri::command]
pub async fn get_next_random_image(
    state: State<'_, ImageLoaderState>,
) -> Result<ImageResponse, CommandError> {
    let loader = get_loader(&state)?;
    let (data, auto_switched) = loader
        .get_next_random_image()
        .await
        .map_err(CommandError::from)?;
    let folder = loader
        .get_current_folder_id_and_path()
        .ok()
        .flatten()
        .map(|(id, path)| FolderInfo { id, path });
    Ok(ImageResponse {
        data,
        folder,
        auto_switched_folder: auto_switched,
    })
}

#[tauri::command]
pub async fn get_prev_random_image(
    state: State<'_, ImageLoaderState>,
) -> Result<ImageResponse, CommandError> {
    let loader = get_loader(&state)?;
    let (data, auto_switched) = loader
        .get_prev_random_image()
        .await
        .map_err(CommandError::from)?;
    let folder = loader
        .get_current_folder_id_and_path()
        .ok()
        .flatten()
        .map(|(id, path)| FolderInfo { id, path });
    Ok(ImageResponse {
        data,
        folder,
        auto_switched_folder: auto_switched,
    })
}

#[tauri::command]
pub async fn get_force_random_image(
    state: State<'_, ImageLoaderState>,
) -> Result<ImageResponse, CommandError> {
    let loader = get_loader(&state)?;
    let (data, auto_switched) = loader
        .get_force_random_image(true)
        .await
        .map_err(CommandError::from)?;
    let folder = loader
        .get_current_folder_id_and_path()
        .ok()
        .flatten()
        .map(|(id, path)| FolderInfo { id, path });
    Ok(ImageResponse {
        data,
        folder,
        auto_switched_folder: auto_switched,
    })
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
    let (data, auto_switched) = loader
        .set_normal_image_by_index(index)
        .await
        .map_err(CommandError::from)?;
    let folder = loader
        .get_current_folder_id_and_path()
        .ok()
        .flatten()
        .map(|(id, path)| FolderInfo { id, path });
    Ok(ImageResponse {
        data,
        folder,
        auto_switched_folder: auto_switched,
    })
}

#[tauri::command]
pub async fn set_random_image_by_index(
    index: i64,
    state: State<'_, ImageLoaderState>,
) -> Result<ImageResponse, CommandError> {
    let loader = get_loader(&state)?;
    let (data, auto_switched) = loader
        .set_random_image_by_index(index)
        .await
        .map_err(CommandError::from)?;
    let folder = loader
        .get_current_folder_id_and_path()
        .ok()
        .flatten()
        .map(|(id, path)| FolderInfo { id, path });
    Ok(ImageResponse {
        data,
        folder,
        auto_switched_folder: auto_switched,
    })
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

static TIMER_AUDIO_STREAM: OnceLock<rodio::OutputStream> = OnceLock::new();

fn get_timer_audio_stream() -> Result<&'static rodio::OutputStream, String> {
    if let Some(stream) = TIMER_AUDIO_STREAM.get() {
        return Ok(stream);
    }

    let stream = OutputStreamBuilder::open_default_stream()
        .map_err(|err| format!("failed to start audio device: {err}"))?;
    let _ = TIMER_AUDIO_STREAM.set(stream);
    TIMER_AUDIO_STREAM
        .get()
        .ok_or_else(|| "failed to initialize audio stream".to_string())
}

fn play_native_timer_tone(frequency_hz: f32, gain: f32) -> Result<(), String> {
    let stream = get_timer_audio_stream()?;
    let sink = Sink::connect_new(stream.mixer());

    let tone = SineWave::new(frequency_hz)
        .take_duration(Duration::from_millis(140))
        .fade_in(Duration::from_millis(8))
        .fade_out(Duration::from_millis(18))
        .amplify(gain);

    sink.append(tone);
    sink.detach();
    Ok(())
}

#[tauri::command]
pub async fn play_timer_tone(
    tone: String,
    #[allow(non_snake_case)] volumeStep: Option<u8>,
    volume_step: Option<u8>,
) -> Result<(), CommandError> {
    let (frequency_hz, tone_gain_multiplier) = match tone.as_str() {
        "low" => (440.0, 1.2_f32),
        "mid" => (660.0, 1.0_f32),
        "high" => (880.0, 1.08_f32),
        _ => return Err(CommandError::invalid("invalid timer tone")),
    };

    let clamped_step = volume_step.or(volumeStep).unwrap_or(10).clamp(1, 10);
    let master_gain = (clamped_step as f32 / 10.0) * 0.25;
    let gain = (master_gain * tone_gain_multiplier).clamp(0.01, 0.98);

    if let Err(err) = play_native_timer_tone(frequency_hz, gain) {
        eprintln!("[RUST] Timer tone playback failed: {err}");
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{resolve_dual_i64_arg, sanitize_error_message};

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

    #[test]
    fn resolve_dual_i64_arg_prefers_snake_case_when_both_are_present() {
        let value = resolve_dual_i64_arg(Some(7), Some(3), "image_id", "imageId").unwrap();
        assert_eq!(value, 7);
    }

    #[test]
    fn resolve_dual_i64_arg_reports_missing_dual_name() {
        let err = resolve_dual_i64_arg(None, None, "image_id", "imageId").unwrap_err();
        assert_eq!(err.message, "missing imageId/image_id");
    }

    #[test]
    fn sanitize_error_message_maps_foreign_key_constraint() {
        let msg = sanitize_error_message("FOREIGN KEY constraint failed");
        assert_eq!(
            msg,
            "database constraint failed - try resetting history or reindexing"
        );
    }

    #[test]
    fn sanitize_error_message_maps_no_rows_error() {
        let msg = sanitize_error_message("query returned no rows");
        assert_eq!(msg, "no data found - folder or image may have been deleted");
    }

    #[test]
    fn sanitize_error_message_maps_hidden_images_error() {
        let msg = sanitize_error_message("all images for this folder are hidden in random mode");
        assert_eq!(
            msg,
            "all images are hidden for this folder and mode - reindex to clear hidden images"
        );
    }

    #[test]
    fn sanitize_error_message_passthrough_for_unknown_errors() {
        let raw = "custom backend failure details";
        let msg = sanitize_error_message(raw);
        assert_eq!(msg, raw);
    }
}
