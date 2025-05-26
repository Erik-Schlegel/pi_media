# Pi Media


## Setup - Linux Mint

```sh
sudo apt install wmctrl

flatpak install flathub org.chromium.Chromium
flatpak run org.chromium.Chromium

sudo ln -s "$(which chromium)" /usr/local/bin/chromium-browser
```