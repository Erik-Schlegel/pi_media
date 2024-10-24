import os
import subprocess
import re
import json
import asyncio
import websockets
import signal
import sys

command_queue = asyncio.Queue()
chromium_process = None


async def handle_browser_connection(websocket, path):
    print("Browser connected via WebSocket.")
    try:
        while True:
            message = await websocket.recv()
            data = json.loads(message)
            if data.get('type') == 'pageReady':
                print("Received 'pageReady' signal from browser.")
                break

        loop = asyncio.get_event_loop()
        loop.run_in_executor(None, listen_to_cec, loop)

        await process_command_queue(websocket)
    except websockets.exceptions.ConnectionClosed:
        print("WebSocket connection closed by the browser.")
    except Exception as e:
        print(f"Exception in handle_browser_connection: {e}")


async def process_command_queue(websocket):
    """Coroutine that reads commands from the queue and sends them over the WebSocket."""
    try:
        while True:
            command = await command_queue.get()
            try:
                await websocket.send(json.dumps({'type': 'command', 'command': command}))
                print(f"Sent command to browser: {command}")
            except websockets.exceptions.ConnectionClosed:
                print("WebSocket connection closed while sending command.")
                break
            except Exception as e:
                print(f"Error sending command to browser: {e}")
                break
            finally:
                command_queue.task_done()
    except Exception as e:
        print(f"Exception in process_command_queue: {e}")


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
        print(f"Exception in listen_to_cec: {e}")


def handle_cec_output(output, loop):
    """Handle output received from cec-client."""
    match = re.search(r'>> \S+:44:(..)', output)
    if match:
        key_code = match.group(1)
        command = ''

        if key_code == '01':
            print('Up button pressed')
            command = 'handleUpPress'
        elif key_code == '03':
            print('Left button pressed')
            command = 'handleLeftPress'
        elif key_code == '04':
            print('Right button pressed')
            command = 'handleRightPress'
        elif key_code == '00':
            print('Enter button pressed')
            command = 'handleEnterPress'

        if command:
            future = asyncio.run_coroutine_threadsafe(
                command_queue.put(command),
                loop
            )
            try:
                future.result()
            except Exception as e:
                print(f"Error adding command to queue: {e}")


def launch_chromium():
    """Launch Chromium browser with specified options."""
    global chromium_process
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
        'file:///home/media/eschware/pi_media/index.html'
    ])
    print("Chromium launched.")


def terminate_chromium():
    """Terminate the Chromium process if it's running."""
    global chromium_process
    if chromium_process and chromium_process.poll() is None:
        print("Terminating Chromium...")
        chromium_process.terminate()
        chromium_process.wait()
        print("Chromium terminated.")


def signal_handler(sig, frame):
    print(f"Signal {sig} received. Shutting down...")
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
    print("WebSocket server started.")

    try:
        loop.run_forever()
    except KeyboardInterrupt:
        print("KeyboardInterrupt received. Exiting...")
    finally:
        terminate_chromium()
        loop.close()

if __name__ == "__main__":
    main()
