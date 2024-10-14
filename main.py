import webview
import os

class Api:
    def say_hello(self):
        return "Hello from Python!"

api = Api()
print("Starting PyWebview...")

# Use absolute path for the HTML file
html_file = os.path.abspath('index.html')

# Create the window without trying to do anything before it exists
window = webview.create_window('My App', html_file, js_api=api, fullscreen=True, frameless=True)

# Define a function to run once the window has finished loading
def on_loaded():
    try:
        print("Content loaded, attempting to refresh window...")
        # Force a refresh by resizing or simulating a resize event
        window.evaluate_js("window.dispatchEvent(new Event('resize'));")
    except webview.WebViewException as e:
        print(f"WebViewException occurred: {e}")

print("Window created, starting GUI...")
# Start the webview GUI, specifying the on_loaded callback
webview.start(on_loaded)
