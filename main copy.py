import os
import subprocess
import threading
import re
import requests
import json
import time
import websocket

subprocess.Popen([
    'chromium-browser',
    '--start-maximized',
    '--start-fullscreen',
    '--kiosk',
    '--remote-allow-origins=*',
    '--allow-file-access-from-files',
    '--remote-debugging-port=9222',
    '--user-data-dir=/tmp/pi_media_data',
    '--autoplay-policy=no-user-gesture-required',
    'file:///home/media/eschware/pi_media/index.html'
])

def listen_to_cec():
    """Function to listen to CEC commands using cec-client."""
    process = subprocess.Popen(
        ['cec-client', '-t', 'p', '-d', '8'],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        universal_newlines=True
    )

    # Process the output from cec-client line by line
    while True:
        output = process.stdout.readline()
        if output == '' and process.poll() is not None:
            break
        if output:
            handle_cec_output(output.strip())

    process.stdout.close()

def handle_cec_output(output):
    """Handle output received from cec-client."""
    match = re.search(r'>> \S+:44:(..)', output)
    if match:
        key_code = match.group(1)

        if key_code == '01':
            send_js_command("handleUpPress()")
        elif key_code == '03':
            send_js_command("handleLeftPress()")
        elif key_code == '04':
            send_js_command("handleRightPress()")
        elif key_code == '00':
            send_js_command("handleEnterPress()")

def send_js_command(js_command):
    """Send a JavaScript command to Chromium via remote debugging using WebSocket."""
    try:
        # Get the list of open tabs
        response = requests.get('http://localhost:9222/json')
        response.raise_for_status()
        tabs = response.json()

        if tabs:
            tab = tabs[0]
            websocket_url = tab['webSocketDebuggerUrl']
            ws = websocket.create_connection(websocket_url)
            payload = {
                "id": 1,
                "method": "Runtime.evaluate",
                "params": {
                    "expression": js_command
                }
            }

            ws.send(json.dumps(payload))
            response = ws.recv()
            ws.close()
        else:
            print("No tabs found in Chromium.")
    except requests.exceptions.RequestException as e:
        print(f"Failed to connect to Chromium debugger: {e}")
    except websocket.WebSocketException as e:
        print(f"WebSocket error: {e}")
    except Exception as e:
        print(f"Error sending JavaScript command: {e}")

# Run CEC listener in a separate thread
cec_thread = threading.Thread(target=listen_to_cec, daemon=True)
cec_thread.start()

# Keep the main script running
try:
    while True:
        time.sleep(1)
except KeyboardInterrupt:
    print("Stopping CEC listener.")
