# The PIXELLE website!

## URLs

### Local server (unused)
Jekyll local server:    http://127.0.0.1:4000/pixelle02/

### Docker services
Grist server:           http://localhost:8484/
Jekyll Docker server:   http://0.0.0.0:4000/pixelle/

### Remote services
Github:                 https://github.com/PierreBx/pixelle
Pixelle site:           https://pierrebx.github.io/pixelle/

## Raspberry pi

# Installation
Linux server 

# Hostname
hostname:               raspberrypixel-server.local   

# Users
username:               pierre // pixelle.rasp

# Initial update 
```bash
sudo apt update
sudo apt full-upgrade -y
sudo reboot
```

Activate ssh, firwall and security
```bash
sudo ufw allow OpenSSH
sudo ufw enable
sudo systemctl enable ssh
```

Install git
```bash
sudo apt update
sudo apt install git -y
```


