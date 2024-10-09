import webview
from pynput import keyboard

class Api:
    def say_hello(self):
        return "Hello from Python!"

api = Api()
print("Starting PyWebview...")

# Create a full-screen and frameless window
window = webview.create_window('My App', 'index.html', js_api=api, fullscreen=True, frameless=True)

# Function to close the window after ESC key
def on_press(key):
    try:
        if key == keyboard.Key.esc:
            print("Escape key pressed, closing window...")
            window.destroy()
    except Exception as e:
        print(f"Error: {e}")

# Start a listener thread for ESC key
listener = keyboard.Listener(on_press=on_press)
listener.start()

print("Window created, starting GUI...")
webview.start()