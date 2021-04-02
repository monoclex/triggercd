use std::{
    borrow::Cow,
    io::Error,
    net::{Ipv4Addr, SocketAddr, SocketAddrV4},
    process::Stdio,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::Duration,
};

use clap::Clap;
use env_logger::Env;
use futures_util::{lock::Mutex, stream::SplitSink, SinkExt, StreamExt};
use log::{error, info, warn};
use tokio::{
    io::{AsyncRead, AsyncReadExt},
    net::{TcpListener, TcpStream},
    process::Command,
    time::timeout,
};
use tokio_tungstenite::{
    tungstenite::{
        protocol::{frame::coding::CloseCode, CloseFrame},
        Message,
    },
    WebSocketStream,
};

/// TriggerCD arguments.
#[derive(Clap)]
#[clap(version = "0.1.0", author = "SirJosh3917")]
struct Args {
    /// The port to listen on
    #[clap(short, long, default_value = "4500")]
    port: u16,

    /// A piece of text that the client must send before the process gets run.
    /// Useful so that if the endpoint is exposed, it doesn't cause undue
    /// stress on your servers. Referred to as `password` in documentation.
    #[clap(short, long)]
    key: Option<String>,

    /// The command to run on a request
    #[clap(short, long)]
    command: Vec<String>,

    /// Try run the command passed via args
    #[clap(short, long)]
    r#try: bool,
}

#[tokio::main]
async fn main() -> Result<(), Error> {
    init_logger();

    let args = Args::parse();

    if args.command.len() == 0 {
        error!("expected command");
        return Ok(());
    }

    let command = Box::leak(Box::new(args.command));
    let password = Box::leak(Box::new(args.key));

    if args.r#try {
        Command::new(command.get(0).unwrap())
            .args(command.iter().skip(1))
            .stdout(Stdio::inherit())
            .stderr(Stdio::inherit())
            .spawn()
            .expect("expected to spawn process")
            .wait()
            .await
            .expect("expected successful exit");

        return Ok(());
    }

    let addr = SocketAddrV4::new(Ipv4Addr::new(0, 0, 0, 0), args.port);
    let try_socket = TcpListener::bind(addr).await;
    let listener = try_socket.expect("Failed to bind");
    info!("Listening on: {}", addr);

    while let Ok((stream, _)) = listener.accept().await {
        tokio::spawn(accept_connection(stream, command, password.as_ref()));
    }

    Ok(())
}

pub const STDOUT_CHUNK_PREFIX: u8 = 0;
pub const STDERR_CHUNK_PREFIX: u8 = 1;

async fn accept_connection(stream: TcpStream, command: &Vec<String>, password: Option<&String>) {
    let addr = stream
        .peer_addr()
        .expect("connected streams should have a peer address");

    let ws_stream = tokio_tungstenite::accept_async(stream)
        .await
        .expect("Error during the websocket handshake occurred");

    info!("{}: New WebSocket connection", addr);

    let (mut write, mut read) = ws_stream.split();

    // verify that the password is sent before invoking the process
    if let Some(password) = password {
        if check_password(&mut read, &mut write, password, &addr).await {
            return;
        }
    }

    // invoke the process and send stdout/stderr
    debug_assert!(command.len() >= 1);

    let command = Command::new(command.get(0).unwrap())
        .args(command.iter().skip(1))
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn();

    let mut command = match command {
        Ok(child) => child,
        Err(error) => {
            error!("{}: could not execute process: {}", addr, error);
            let _ = write
                .send(Message::Close(Some(CloseFrame {
                    code: CloseCode::Error,
                    reason: Cow::Borrowed("command not found"),
                })))
                .await;
            let _ = write.close().await;
            return;
        }
    };

    let stdout = command.stdout.take().unwrap();
    let stderr = command.stderr.take().unwrap();

    let wait_future = command.wait();
    let die_flag = Arc::new(AtomicBool::new(false));

    let write = Arc::new(Mutex::new(write));

    let task_write = write.clone();
    let task_die_flag = die_flag.clone();
    let send_stdout = tokio::spawn(async move {
        info!("{}: reading stdout...", addr);

        if let Err(error) =
            buffered_send(STDOUT_CHUNK_PREFIX, stdout, task_write, task_die_flag).await
        {
            warn!("{}: error writing stdout chunks: {}", addr, error);
        }

        info!("{}: done reading stdout", addr);
    });

    let task_write = write.clone();
    let task_die_flag = die_flag.clone();
    let send_stderr = tokio::spawn(async move {
        info!("{}: reading stderr...", addr);

        if let Err(error) =
            buffered_send(STDERR_CHUNK_PREFIX, stderr, task_write, task_die_flag).await
        {
            warn!("{}: error writing stderr chunks: {}", addr, error);
        }

        info!("{}: done reading stderr", addr);
    });

    let _ = wait_future.await;
    die_flag.store(true, Ordering::Relaxed);

    if let Err(error) = send_stdout.await {
        warn!("{}: error writing stdout chunks: {}", addr, error);
    }

    if let Err(error) = send_stderr.await {
        warn!("{}: error writing stderr chunks: {}", addr, error);
    }

    match write.lock().await.close().await {
        Ok(_) => {}
        Err(error) => {
            warn!("{}: error closing {}", addr, error);
        }
    };
}

/// This will read something that implements AsyncRead into a buffer. If the
/// buffer gets full, OR a second has passed without sending anything, this
/// will send whatever is in the buffer - if anything.
async fn buffered_send(
    prefix: u8,
    mut read: impl AsyncRead + Unpin,
    write: Arc<Mutex<SplitSink<WebSocketStream<TcpStream>, Message>>>,
    die_flag: Arc<AtomicBool>,
) -> Result<(), Box<dyn std::error::Error>> {
    let mut buffer = Vec::from([0u8; 4096 * 4 + 1]);
    buffer[0] = prefix;

    loop {
        // read from the pipe
        let bytes_read = read.read(&mut buffer[1..]).await?;

        // if we read nothing & we're instructed to die, then die
        if bytes_read == 0 && die_flag.load(Ordering::Relaxed) == true {
            return Ok(());
        }

        // send what we read, if anything
        if bytes_read > 0 {
            let mut write = write.lock().await;
            write
                .send(Message::Binary(buffer[..bytes_read].to_owned()))
                .await?;
            buffer[1..bytes_read].fill(0);
        }
    }
}

async fn check_password(
    read: &mut futures_util::stream::SplitStream<tokio_tungstenite::WebSocketStream<TcpStream>>,
    write: &mut futures_util::stream::SplitSink<
        tokio_tungstenite::WebSocketStream<TcpStream>,
        Message,
    >,
    password: &String,
    addr: &SocketAddr,
) -> bool {
    let timeout = timeout(Duration::from_secs(30), read.next()).await;

    let message = match timeout {
        Ok(message) => message,
        Err(elapsed) => {
            warn!("{}: password check timed out after {}", addr, elapsed);
            let _ = write
                .send(Message::Text(format!(
                    "password check timed out after {}",
                    elapsed
                )))
                .await;
            return false;
        }
    };

    let message = match message {
        Some(message) => message,
        None => {
            warn!("{}: next() returned None", addr);
            let _ = write
                .send(Message::Text("next() had nothing".to_string()))
                .await;
            return true;
        }
    };
    let message = match message {
        Ok(message) => message,
        Err(error) => {
            warn!("{}: next() returned Some(Err()): {}", addr, error);
            let _ = write
                .send(Message::Text("next() had error".to_string()))
                .await;
            return true;
        }
    };
    let message = match message.to_text() {
        Ok(message) => message,
        Err(error) => {
            warn!("{}: to_text() failed: {}", addr, error);
            let _ = write
                .send(Message::Text("to_text() had error".to_string()))
                .await;
            return true;
        }
    };
    if password != message {
        warn!(
            "{}: password check failed - got '{}', expected '{}'",
            addr, message, password
        );

        let _ = write
            .send(Message::Text("password check failed".to_string()))
            .await;
        return true;
    }
    false
}

#[cfg(debug_assertions)]
fn init_logger() {
    let env = Env::new().filter_or("RUST_LOG", "debug");
    env_logger::try_init_from_env(env).expect("expected logger to initialize");
}

#[cfg(not(debug_assertions))]
fn init_logger() {
    let env = Env::new().filter_or("RUST_LOG", "info");
    env_logger::try_init_from_env(env).expect("expected logger to initialize");
}

/*
var ws = new WebSocket("ws://localhost:4500");

ws.onmessage = (e) => {
    if (typeof e.data === "string") {
        console.log(e.data);
    }
    else if (e.data instanceof ArrayBuffer) {
        let buffer = e.data;
        console.log(new TextDecoder("utf-8").decode(buffer));
    }
};
ws.onopen = console.log.bind(null, "onopen");
ws.onerror = console.log.bind(null, "onerror");
ws.onclose = console.log.bind(null, "onclose");
*/
