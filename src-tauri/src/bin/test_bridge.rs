use app_lib::commands::{FolderHistory, FolderInfo, ImageHistory, ImageState};
use app_lib::db::Db;
use app_lib::img_loader::ImageLoader;
use std::io::Cursor;
use std::path::PathBuf;
use std::sync::Arc;
use tiny_http::{Header, Method, Request, Response, Server, StatusCode};

type ResponseType = Response<Cursor<Vec<u8>>>;

fn main() {
    let db_path = PathBuf::from("/tmp/random-pics-test/imgstate.sqlite");
    std::fs::create_dir_all(db_path.parent().unwrap()).expect("Failed to create test db directory");

    let db = Db::open(db_path).expect("Failed to open database");
    let loader = Arc::new(ImageLoader::new(db));

    let port = std::env::var("TEST_BRIDGE_PORT").unwrap_or_else(|_| "3000".to_string());
    let addr = format!("127.0.0.1:{}", port);
    let server = Server::http(&addr).expect("Failed to start server");

    println!("[TEST-BRIDGE] Listening on {}", addr);

    for mut request in server.incoming_requests() {
        let method = request.method().clone();
        let path = request.url().to_string();

        println!("[TEST-BRIDGE] {} {}", method, path);

        let response = handle_request(&loader, method, &path, &mut request);
        let _ = request.respond(response);
    }
}

fn handle_request(
    loader: &Arc<ImageLoader>,
    method: Method,
    path: &str,
    request: &mut Request,
) -> ResponseType {
    let route = path.trim_start_matches("/api/");

    match (&method, route) {
        // Folder operations
        (Method::Post, "pick_folder") => {
            let body = read_body(request);
            let req: serde_json::Value = serde_json::from_slice(&body).unwrap_or_default();
            let path_str = req["path"].as_str().unwrap_or("");

            match tokio::runtime::Runtime::new()
                .unwrap()
                .block_on(loader.set_current_folder_and_index(path_str))
            {
                Ok((id, path)) => {
                    let info = FolderInfo { id, path };
                    json_response(&info, StatusCode(200))
                }
                Err(e) => error_response(&e.to_string(), StatusCode(500)),
            }
        }

        (Method::Get, "next_folder") => match loader.get_next_folder() {
            Ok(Some((id, path))) => {
                let info = FolderInfo { id, path };
                json_response(&info, StatusCode(200))
            }
            Ok(None) => not_found_response(),
            Err(e) => error_response(&e.to_string(), StatusCode(500)),
        },

        (Method::Get, "prev_folder") => match loader.get_prev_folder() {
            Ok(Some((id, path))) => {
                let info = FolderInfo { id, path };
                json_response(&info, StatusCode(200))
            }
            Ok(None) => not_found_response(),
            Err(e) => error_response(&e.to_string(), StatusCode(500)),
        },

        (Method::Get, "folder_history") => match loader.get_folder_history() {
            Ok(history) => {
                let current_id_opt = loader.get_current_folder_id().ok().and_then(|id| id);
                let current_index: i64 = if history.is_empty() {
                    -1
                } else {
                    current_id_opt
                        .and_then(|id| history.iter().position(|(fid, _, _)| *fid == id))
                        .unwrap_or(usize::MAX) as i64
                };
                let paths: Vec<String> = history.into_iter().map(|(_, p, _)| p).collect();
                let history = FolderHistory {
                    history: paths,
                    current_index,
                };
                json_response(&history, StatusCode(200))
            }
            Err(e) => error_response(&e.to_string(), StatusCode(500)),
        },

        (Method::Post, "reindex_current_folder") => {
            match tokio::runtime::Runtime::new()
                .unwrap()
                .block_on(loader.reindex_current_folder())
            {
                Ok((id, path)) => {
                    let info = FolderInfo { id, path };
                    json_response(&info, StatusCode(200))
                }
                Err(e) => error_response(&e.to_string(), StatusCode(500)),
            }
        }

        // Image traversal
        (Method::Get, "current_image") => {
            match tokio::runtime::Runtime::new()
                .unwrap()
                .block_on(loader.get_current_image_or_first())
            {
                Ok(bytes) => image_response(bytes),
                Err(e) => error_response(&e.to_string(), StatusCode(500)),
            }
        }

        (Method::Get, "next") => {
            match tokio::runtime::Runtime::new()
                .unwrap()
                .block_on(loader.get_next_image())
            {
                Ok(bytes) => image_response(bytes),
                Err(e) => error_response(&e.to_string(), StatusCode(500)),
            }
        }

        (Method::Get, "prev") => {
            match tokio::runtime::Runtime::new()
                .unwrap()
                .block_on(loader.get_prev_image())
            {
                Ok(bytes) => image_response(bytes),
                Err(e) => error_response(&e.to_string(), StatusCode(500)),
            }
        }

        (Method::Get, "next_random") => {
            match tokio::runtime::Runtime::new()
                .unwrap()
                .block_on(loader.get_next_random_image())
            {
                Ok(bytes) => image_response(bytes),
                Err(e) => error_response(&e.to_string(), StatusCode(500)),
            }
        }

        (Method::Get, "prev_random") => {
            match tokio::runtime::Runtime::new()
                .unwrap()
                .block_on(loader.get_prev_random_image())
            {
                Ok(bytes) => image_response(bytes),
                Err(e) => error_response(&e.to_string(), StatusCode(500)),
            }
        }

        (Method::Get, "force_random") => {
            match tokio::runtime::Runtime::new()
                .unwrap()
                .block_on(loader.get_force_random_image(true))
            {
                Ok(bytes) => image_response(bytes),
                Err(e) => error_response(&e.to_string(), StatusCode(500)),
            }
        }

        // History
        (Method::Get, "normal_history") => match loader.get_normal_history() {
            Ok((history, current_index)) => {
                let hist = ImageHistory {
                    history,
                    current_index,
                };
                json_response(&hist, StatusCode(200))
            }
            Err(e) => error_response(&e.to_string(), StatusCode(500)),
        },

        (Method::Get, "random_history") => match loader.get_random_history() {
            Ok((history, current_index)) => {
                let hist = ImageHistory {
                    history,
                    current_index,
                };
                json_response(&hist, StatusCode(200))
            }
            Err(e) => error_response(&e.to_string(), StatusCode(500)),
        },

        (Method::Post, "reset_normal_history") => match loader.reset_normal_history() {
            Ok(()) => json_empty_response(StatusCode(200)),
            Err(e) => error_response(&e.to_string(), StatusCode(500)),
        },

        (Method::Post, "reset_random_history") => match loader.reset_random_history() {
            Ok(()) => json_empty_response(StatusCode(200)),
            Err(e) => error_response(&e.to_string(), StatusCode(500)),
        },

        // State
        (Method::Get, "state") => match loader.get_image_state() {
            Ok(state) => json_response(&state, StatusCode(200)),
            Err(e) => error_response(&e.to_string(), StatusCode(500)),
        },

        (Method::Post, "state") => {
            let body = read_body(request);
            let state: ImageState = serde_json::from_slice(&body).unwrap();
            match loader.set_image_state(&state) {
                Ok(()) => json_empty_response(StatusCode(200)),
                Err(e) => error_response(&e.to_string(), StatusCode(500)),
            }
        }

        // Destructive
        (Method::Post, "full_wipe") => {
            println!("[TEST-BRIDGE] full_wipe called");
            match loader.full_wipe() {
                Ok(()) => {
                    println!("[TEST-BRIDGE] full_wipe ok");
                    json_empty_response(StatusCode(200))
                }
                Err(e) => {
                    println!("[TEST-BRIDGE] full_wipe error: {}", e);
                    error_response(&e.to_string(), StatusCode(500))
                }
            }
        }

        _ => not_found_response(),
    }
}

fn read_body(request: &mut Request) -> Vec<u8> {
    let mut buf = Vec::new();
    let _ = request.as_reader().read_to_end(&mut buf);
    buf
}

fn json_response<T: serde::Serialize>(data: &T, status: StatusCode) -> ResponseType {
    let json = serde_json::to_vec(data).unwrap();
    Response::from_data(json)
        .with_status_code(status)
        .with_header(Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..]).unwrap())
}

fn json_empty_response(status: StatusCode) -> ResponseType {
    Response::from_data(Vec::new())
        .with_status_code(status)
        .with_header(Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..]).unwrap())
}

fn image_response(bytes: Vec<u8>) -> ResponseType {
    Response::from_data(bytes)
        .with_status_code(StatusCode(200))
        .with_header(Header::from_bytes(&b"Content-Type"[..], &b"image/jpeg"[..]).unwrap())
}

fn error_response(message: &str, status: StatusCode) -> ResponseType {
    let json = serde_json::json!({ "error": message });
    let bytes = serde_json::to_vec(&json).unwrap();
    Response::from_data(bytes)
        .with_status_code(status)
        .with_header(Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..]).unwrap())
}

fn not_found_response() -> ResponseType {
    Response::from_data(b"Not found".to_vec()).with_status_code(StatusCode(404))
}
