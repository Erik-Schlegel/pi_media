import os
import subprocess
import threading
import re

subprocess.run([
    'chromium-browser',
    '--start-maximized',
    '--start-fullscreen',
    '--kiosk',
    '--allow-file-access-from-files',
    '--user-data-dir=/tmp/pi_media_data',
    'file:///home/media/eschware/pi_media/index.html'
])


def listen_to_cec():
    """Function to listen to CEC commands using cec-client."""
    process = subprocess.Popen(
        ['cec-client', '-t', 'p', '-d', '8'],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,  # Redirect stderr to /dev/null
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
    # print(f"CEC Output: {output}")

    match = re.search(r'>> \S+:44:(..)', output)
    if match:
        key_code = match.group(1)

        if key_code == '01':    # Up
            send_js_command("handleUpPress")
        elif key_code == '02':  # Down
            send_js_command("handleDownPress")
        elif key_code == '03':  # Left
            send_js_command("handleLeftPress")
        elif key_code == '04':  # Right
            send_js_command("handleRightPress")
        elif key_code == '00':  # Enter
            send_js_command("handleEnterPress")


def send_js_command(command):
    """Send a command to JavaScript running in Chromium."""
    print(f"Triggering JavaScript command: {command}")
    # Placeholder for communication with JavaScript, e.g., via WebSockets or local server


# Run CEC listener in a separate thread
cec_thread = threading.Thread(target=listen_to_cec, daemon=True)
cec_thread.start()

# Keep the main script running
try:
    while True:
        pass
except KeyboardInterrupt:
    print("Stopping CEC listener.")