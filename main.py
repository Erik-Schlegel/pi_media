import os
import subprocess
import re
import json
import asyncio
import websockets
import signal
import sys
import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path

command_queue = asyncio.Queue()
chromium_process = None


def build_logger():
    """Create a logger that writes both to stdout and a rotating file."""
    logger = logging.getLogger("pi_media")
    if logger.handlers:
        return logger

    logger.setLevel(logging.INFO)
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
    try:
        process = subprocess.Popen(
            ['cec-client', '-t', 'p', '-d', '8'],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            universal_newlines=True
        )

        for output in process.stdout:
            if output:
                handle_cec_output(output.strip(), loop)

        process.stdout.close()
    except Exception as e:
        logger.exception("Exception in listen_to_cec: %s", e)


def handle_cec_output(output, loop):
    """Handle output received from cec-client."""
    match = re.search(r'>> \S+:44:(..)', output)
    if match:
        key_code = match.group(1)
        command = ''

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

        if command:
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


def signal_handler(sig, frame):
    logger.info("Signal %s received. Shutting down...", sig)
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
    logger.info("WebSocket server started.")

    try:
        loop.run_forever()
    except KeyboardInterrupt:
        logger.info("KeyboardInterrupt received. Exiting...")
    finally:
        terminate_chromium()
        loop.close()

if __name__ == "__main__":
    main()
