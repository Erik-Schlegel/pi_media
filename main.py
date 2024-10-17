import os
import subprocess

subprocess.run([
    'chromium-browser',
    '--start-maximized',
    '--start-fullscreen',
    '--kiosk',
    '--allow-file-access-from-files',
    '--user-data-dir=/tmp/pi_media_data',
    'file:///home/media/eschware/pi_media/index.html'
])
