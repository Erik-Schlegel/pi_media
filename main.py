import os
import subprocess

html_file = os.path.abspath('index.html')
# Launch Chromium in kiosk mode to display the HTML
# subprocess.run(['chromium-browser', '--kiosk', '--autoplay-policy=no-user-gesture-required', html_file])
# chromium-browser --disable-web-security --user-data-dir="/tmp/chrome_dev" /home/media/eschware/pi_media/index.html
# subprocess.run(['chromium-browser', '--disable-web-security', html_file])

subprocess.run([
    'chromium-browser',
    '--disable-web-security',
    '--kiosk',
    '--allow-file-access-from-files',
    '--user-data-dir="/tmp/chrome_dev"',
    'file:///home/media/eschware/pi_media/index.html'
])
