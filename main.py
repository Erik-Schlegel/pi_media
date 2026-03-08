import os
import subprocess
import re
import json
import asyncio
import websockets
import signal
import sys
import logging
import threading
from logging.handlers import RotatingFileHandler
from pathlib import Path

command_queue = asyncio.Queue()
chromium_process = None
cec_process = None
cec_lock = threading.Lock()


def build_logger():
    """Create a logger that writes both to stdout and a rotating file."""
    logger = logging.getLogger("pi_media")
    logger.setLevel(logging.INFO)
    # Prevent root logger handlers from duplicating records from this logger.
    logger.propagate = False

    # Rebuild handlers so repeated initialization never stacks duplicates.
    if logger.handlers:
        for handler in list(logger.handlers):
            logger.removeHandler(handler)
            handler.close()

    formatter = logging.Formatter("%(asctime)s %(levelname)s %(message)s")

    stream_handler = logging.StreamHandler(sys.stdout)
    stream_handler.setFormatter(formatter)
    logger.addHandler(stream_handler)

    base_dir = os.path.dirname(os.path.abspath(__file__))
    log_path = os.path.join(base_dir, "pi_media.log")
    file_handler = RotatingFileHandler(log_path, maxBytes=5 * 1024 * 1024, backupCount=3)
    file_handler.setFormatter(formatter)
    logger.addHandler(file_handler)

    return logger


logger = build_logger()


async def handle_browser_connection(websocket, path):
    logger.info("Browser connected via WebSocket.")
    try:
        ready_received = False
        while True:
            message = await websocket.recv()
            data = json.loads(message)

            if data.get('type') == 'clientLog':
                handle_client_log(data)
                continue

            if data.get('type') == 'pageReady':
                logger.info("Received 'pageReady' signal from browser.")
                ready_received = True
                break

        if not ready_received:
            return

        loop = asyncio.get_event_loop()
        loop.run_in_executor(None, listen_to_cec, loop)

        await asyncio.gather(
            process_command_queue(websocket),
            receive_browser_messages(websocket),
        )
    except websockets.exceptions.ConnectionClosed:
        logger.warning("WebSocket connection closed by the browser.")
    except Exception as e:
        logger.exception("Exception in handle_browser_connection: %s", e)


def handle_client_log(data):
    """Persist browser-side logs to Python logs for remote diagnostics."""
    level_raw = str(data.get('level', 'info')).lower()
    message = data.get('message', '')
    stack = data.get('stack')
    extra = data.get('extra')

    details = {
        'source': 'browser',
        'message': message,
        'stack': stack,
        'extra': extra,
    }
    details_json = json.dumps(details, ensure_ascii=True)

    if level_raw == 'error':
        logger.error(details_json)
    elif level_raw == 'warning':
        logger.warning(details_json)
    else:
        logger.info(details_json)


async def receive_browser_messages(websocket):
    """Receive browser-originated logs/messages after the page is ready."""
    try:
        while not websocket.closed:
            message = await websocket.recv()
            data = json.loads(message)
            if data.get('type') == 'clientLog':
                handle_client_log(data)
    except websockets.exceptions.ConnectionClosed:
        logger.warning("Browser message receiver closed.")
    except Exception as e:
        logger.exception("Exception in receive_browser_messages: %s", e)


async def process_command_queue(websocket):
    """Coroutine that reads commands from the queue and sends them over the WebSocket."""
    try:
        while not websocket.closed:
            try:
                command = await asyncio.wait_for(command_queue.get(), timeout=1)
            except asyncio.TimeoutError:
                continue

            try:
                await websocket.send(json.dumps({'type': 'command', 'command': command}))
                logger.info("Sent command to browser: %s", command)
            except websockets.exceptions.ConnectionClosed:
                logger.warning("WebSocket connection closed while sending command.")
                break
            except Exception as e:
                logger.exception("Error sending command to browser: %s", e)
                break
            finally:
                command_queue.task_done()
    except Exception as e:
        logger.exception("Exception in process_command_queue: %s", e)


def listen_to_cec(loop):
    """Function to listen to CEC commands using cec-client."""
    global cec_process
    try:
        with cec_lock:
            if cec_process and cec_process.poll() is None:
                logger.info("CEC listener already running; skipping duplicate start.")
                return

            cec_process = subprocess.Popen(
                ['cec-client', '-t', 'p', '-d', '8'],
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                universal_newlines=True
            )

        for output in cec_process.stdout:
            if output:
                handle_cec_output(output.strip(), loop)

        cec_process.stdout.close()
    except Exception as e:
        logger.exception("Exception in listen_to_cec: %s", e)
    finally:
        with cec_lock:
            cec_process = None


def handle_cec_output(output, loop):
    """Handle output received from cec-client."""
    command = ''

    # User Control Pressed: <src><dst>:44:<key>
    key_match = re.search(r'>>\s*\S+:44:(..)', output, re.IGNORECASE)
    if key_match:
        key_code = key_match.group(1).lower()

        if key_code == '01':
            logger.info('Up button pressed')
            command = 'handleUpPress'
        elif key_code == '03':
            logger.info('Left button pressed')
            command = 'handleLeftPress'
        elif key_code == '04':
            logger.info('Right button pressed')
            command = 'handleRightPress'
        elif key_code == '00':
            logger.info('Enter button pressed')
            command = 'handleEnterPress'

    # Standby broadcast (e.g. "0f:36") should trigger the same action as Up.
    elif re.search(r'>>\s*0f:36\b', output, re.IGNORECASE):
        logger.info('Standby event received (0f:36)')
        command = 'handleUpPress'

    if not command:
        return

    future = asyncio.run_coroutine_threadsafe(
        command_queue.put(command),
        loop
    )
    try:
        future.result()
    except Exception as e:
        logger.exception("Error adding command to queue: %s", e)


def launch_chromium():
    """Launch Chromium browser with specified options."""
    global chromium_process
    index_uri = (Path(__file__).resolve().parent / 'index.html').as_uri()
    chromium_process = subprocess.Popen([
        'chromium-browser',
        '--start-maximized',
        '--start-fullscreen',
        '--kiosk',
        '--remote-allow-origins=*',
        '--allow-file-access-from-files',
        '--noerrdialogs',
        '--disable-infobars',
        '--disable-session-crashed-bubble',
        '--user-data-dir=/tmp/pi_media_data',
        '--autoplay-policy=no-user-gesture-required',
        index_uri
    ])
    logger.info("Chromium launched: %s", index_uri)


def terminate_chromium():
    """Terminate the Chromium process if it's running."""
    global chromium_process
    if chromium_process and chromium_process.poll() is None:
        logger.info("Terminating Chromium...")
        chromium_process.terminate()
        chromium_process.wait()
        logger.info("Chromium terminated.")


def terminate_cec():
    """Terminate cec-client process if it's running."""
    global cec_process
    with cec_lock:
        if cec_process and cec_process.poll() is None:
            logger.info("Terminating cec-client...")
            cec_process.terminate()
            cec_process.wait(timeout=5)
            logger.info("cec-client terminated.")
        cec_process = None


async def monitor_chromium_exit(loop):
    """Stop the app if Chromium exits to avoid headless background state."""
    global chromium_process
    while True:
        await asyncio.sleep(1)
        if not chromium_process:
            continue
        if chromium_process.poll() is None:
            continue

        logger.warning("Chromium process exited; stopping app.")
        terminate_cec()
        loop.stop()
        return


def signal_handler(sig, frame):
    logger.info("Signal %s received. Shutting down...", sig)
    terminate_cec()
    terminate_chromium()
    loop = asyncio.get_event_loop()
    loop.stop()
    sys.exit(0)


def main():
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    launch_chromium()

    start_server = websockets.serve(handle_browser_connection, 'localhost', 8765)
    loop = asyncio.get_event_loop()
    loop.run_until_complete(start_server)
    loop.create_task(monitor_chromium_exit(loop))
    logger.info("WebSocket server started.")

    try:
        loop.run_forever()
    except KeyboardInterrupt:
        logger.info("KeyboardInterrupt received. Exiting...")
    finally:
        terminate_cec()
        terminate_chromium()
        loop.close()

if __name__ == "__main__":
    main()
