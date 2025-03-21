import os
import sys
import time
import subprocess
import pychrome
from subprocess import Popen
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

class RestartHandler(FileSystemEventHandler):

    def __init__(self):
        self.process = None
        self.last_restart_time = 0
        self.cooldown_period = 2


    def on_modified(self, event):
        if event.is_directory or event.src_path.startswith('./venv') or any(excluded in event.src_path for excluded in ['__pycache__', '.git']):
            return

        current_time = time.time()
        if current_time - self.last_restart_time < self.cooldown_period:
            return

        self.last_restart_time = current_time
        self.reload_page()


    def start_script(self):
        if not self.process:
            self.process = subprocess.Popen([
                'chromium-browser',
                '--allow-file-access-from-files',
                '--user-data-dir=/tmp/pi_media_data',
                '--remote-debugging-port=9222',
                'file:///home/esch/eschware/pi_media/dev_index.html'

            ])
            time.sleep(2)


    def reload_page(self):
        try:
            browser = pychrome.Browser(url="http://127.0.0.1:9222")
            tabs = browser.list_tab()
            if tabs:
                tab = tabs[0]
                tab.start()
                tab.Page.reload(ignoreCache=True)
                tab.stop()
            else:
                print("No tabs available to reload.")
        except Exception as e:
            print(f"Error reloading page: {e}")


if __name__ == "__main__":
    event_handler = RestartHandler()
    observer = Observer()
    observer.schedule(event_handler, path='.', recursive=True)
    observer.start()

    try:
        event_handler.start_script()
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        observer.stop()
        if event_handler.process:
            event_handler.process.terminate()
    observer.join()
