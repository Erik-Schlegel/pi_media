import os
import subprocess

subprocess.run([
    'chromium-browser',
    # '--start-maximized',
    # '--start-fullscreen',
    # '--kiosk',
    '--allow-file-access-from-files',
    '--user-data-dir=/tmp/another_chrome_dev',
    'file:///home/media/eschware/pi_media/index.html'
])
