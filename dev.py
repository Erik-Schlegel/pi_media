import os
import sys
import time
from subprocess import Popen
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

class RestartHandler(FileSystemEventHandler):
    def __init__(self):
        self.process = None
        self.last_restart_time = 0
        self.cooldown_period = 2  # Cooldown period in seconds

    def on_modified(self, event):
        if event.is_directory or event.src_path.startswith('./venv') or any(excluded in event.src_path for excluded in ['__pycache__', '.git']):
            return

        current_time = time.time()
        if current_time - self.last_restart_time < self.cooldown_period:
            return

        self.last_restart_time = current_time

        if self.process:
            print(f"Detected change in {event.src_path}. Restarting script...")
            self.process.terminate()
            self.process.wait()
        self.start_script()

    def start_script(self):
        print("Starting app.py...")
        self.process = Popen([sys.executable, 'main.py'])

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
