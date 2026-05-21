mod ipc;
mod buffer;
mod commands;
mod shared;

use buffer::BufferManager;
use clap::Parser;
use std::path::PathBuf;

#[derive(Parser, Debug)]
#[command(name = "radiusd-core")]
#[command(about = "Radius daemon (Rust implementation)", long_about = None)]
struct Args {
    /// Execute command and exit (instead of starting daemon)
    #[arg(long)]
    exec: Option<String>,

    /// Additional arguments in JSON format
    #[arg(long)]
    args: Option<String>,

    /// Socket path for daemon mode
    #[arg(long, default_value = "/tmp/radiusd.sock")]
    socket: PathBuf,

    /// Remaining args
    #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
    trailing: Vec<String>,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let args = Args::parse();

    if let Some(command) = args.exec {
        // Parse args
        let args_value: serde_json::Value = if let Some(json_args) = args.args {
            serde_json::from_str(&json_args).unwrap_or(serde_json::json!({}))
        } else {
            // Build args from trailing
            let mut map = serde_json::Map::new();
            map.insert("_".to_string(), serde_json::json!(args.trailing));

            // Parse trailing args for --key value pairs
            let mut i = 0;
            while i < args.trailing.len() {
                if args.trailing[i].starts_with("--") {
                    let key = args.trailing[i].trim_start_matches("--");
                    if i + 1 < args.trailing.len() && !args.trailing[i + 1].starts_with("--") {
                        map.insert(key.to_string(), serde_json::json!(args.trailing[i + 1]));
                        i += 2;
                    } else {
                        map.insert(key.to_string(), serde_json::json!(true));
                        i += 1;
                    }
                } else {
                    i += 1;
                }
            }

            serde_json::Value::Object(map)
        };

        // Execute command
        let mut buffer_manager = BufferManager::new();

        let response = match command.as_str() {
            "ping" => ipc::IpcResponse::success("pong".to_string()),
            "view" => commands::handle_view(&args_value, &mut buffer_manager).await,
            "create" => commands::handle_create(&args_value).await,
            "str-replace" => commands::handle_str_replace(&args_value).await,
            "grep" => commands::handle_grep(&args_value).await,
            "insert" => commands::handle_insert(&args_value).await,
            "replace" => commands::handle_replace(&args_value).await,
            "undo" => commands::handle_undo(&args_value).await,
            "redo" => commands::handle_redo(&args_value).await,
            "diff" => commands::handle_diff(&args_value).await,
            "outline" => commands::handle_outline(&args_value).await,
            "format" => commands::handle_format(&args_value).await,
            "hover" => commands::handle_hover(&args_value).await,
            "problems" => commands::handle_problems(&args_value).await,
            "read-var" => commands::handle_read_var(&args_value).await,
            "modify-var" => commands::handle_modify_var(&args_value).await,
            "fix" => commands::handle_fix(&args_value).await,
            "typehierarchy" => commands::handle_typehierarchy(&args_value).await,
            "codelens" => commands::handle_codelens(&args_value).await,
            "tokens" => commands::handle_tokens(&args_value).await,
            "comment" => commands::handle_comment(&args_value).await,
            "snippet" => commands::handle_snippet(&args_value).await,
            "solve-conflict" => commands::handle_solve_conflict(&args_value).await,
            "accept-change" => commands::handle_accept_change(&args_value).await,
            "challenge-change" => commands::handle_challenge_change(&args_value).await,
            "list-notifications" => commands::handle_list_notifications(&args_value).await,
            "ext" => commands::handle_ext(&args_value).await,
            "graph" => commands::handle_graph(&args_value).await,
            "task" => commands::handle_task(&args_value).await,
            _ => ipc::IpcResponse::error(format!("Unknown command: {}", command)),
        };

        let json = serde_json::to_string(&response)?;
        println!("{}", json);
        Ok(())
    } else {
        // Start daemon
        ipc::start_server(args.socket).await
    }
}
