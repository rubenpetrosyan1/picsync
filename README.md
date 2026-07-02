# 🚀 PicSync Pro - Advanced File Synchronization Manager

A powerful, browser-based file synchronization and management tool built with Go. Features include two-panel file explorer, sync jobs with pause/resume/stop, duplicate finder, file search, photo map, and automatic file sorting.

![PicSync Pro](https://img.shields.io/badge/version-1.0.0-blue.svg)
![Go Version](https://img.shields.io/badge/go-1.21+-00ADD8.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20Windows-lightgrey.svg)

## 📋 Table of Contents

- [Features](#-features)
- [Screenshots](#-screenshots)
- [Installation](#-installation)
- [Quick Start](#-quick-start)
- [Usage Guide](#-usage-guide)
- [API Endpoints](#-api-endpoints)
- [Configuration](#-configuration)
- [Project Structure](#-project-structure)
- [Technologies Used](#-technologies-used)
- [Contributing](#-contributing)
- [License](#-license)

## ✨ Features

### 📂 File Explorer
- **Two-panel interface** (Source/Destination) like Norton Commander
- **Drag and drop** files between panels
- **File operations**: Copy, Move, Delete, Create folders
- **File preview** for images, videos, and text files
- **Multi-file selection** with checkboxes
- **Smart file icons** based on file type

### 🔄 Sync Jobs
- **Create persistent sync jobs** with custom rules
- **Conflict resolution** options:
  - Skip existing files
  - Overwrite existing files
  - Keep newest file
  - Keep oldest file
- **File filtering** with include/exclude patterns
- **Pause/Resume/Stop** running jobs
- **Job recovery** after server crash/restart
- **Real-time progress tracking** with file count
- **Job history** with statistics

### 🔍 Duplicate Finder
- Find duplicates by **file hash** (SHA-256)
- Group duplicates by **file size** for efficiency
- **Select all/except one** options
- **Bulk actions**: Delete or move duplicates
- Full paths displayed for easy identification

### 🔎 Advanced File Search
- **Search by filename** (case-sensitive option)
- **Filter by file size** (min/max)
- **Filter by file extensions**
- **Filter by modification date** range
- **Click results to preview** files

### 📊 Files Sorting
- **Sort by date**: Organize files by Year/Month folders
- **Sort by location**: Organize by GPS coordinates
- **Extracts EXIF metadata** from images
- **Batch file moving** with progress tracking
- **Pause/Resume/Stop** sort jobs

### 🗺️ Photo Map
- **Visualize photos** with GPS data on OpenStreetMap
- **Interactive markers** with photo previews
- **Automatic map centering** based on photo locations
- **Photo grid** with location information
- **Click to preview** photos directly from map

### 📋 Job Logs
- **Detailed logging** for all operations
- **Job-specific log files** stored in `data/logs/`
- **Log levels**: INFO, WARNING, ERROR
- **View logs** for any job with source/destination paths
- **Clear logs** and history functionality

## 📸 Screenshots

### File Explorer
┌─────────────────────────────────────────────────────────┐
│ 📁 Source 📂 Destination │
│ ┌──────────────────────┐ ┌──────────────────────┐ │
│ │ 📁 Documents │ │ 📁 Backup │ │
│ │ 📁 Photos │ │ 📁 Archive │ │
│ │ 📄 file1.txt │ │ 📄 file2.txt │ │
│ │ 📄 image.jpg │ │ │ │
│ └──────────────────────┘ └──────────────────────┘ │
│ [📋 Copy →] [✂️ Move →] [🗑️ Delete] │
└─────────────────────────────────────────────────────────┘

text

### Sync Jobs
┌─────────────────────────────────────────────────────────┐
│ 📋 Sync Jobs │
│ ┌──────────────────────────────────────────────────┐ │
│ │ 📌 MyPhotoBackup │ │
│ │ Status: RUNNING │ │
│ │ 📁 Source: /Users/me/Photos │ │
│ │ 📂 Destination: /Volumes/Backup/Photos │ │
│ │ ████████████████████░░░░░░░ 75% │ │
│ │ (150/200 files) │ │
│ │ 📄 Processing: IMG_1234.jpg │ │
│ │ [▶️ Start] [⏸️ Pause] [⏹️ Stop] [📋 Logs] │ │
│ └──────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘

text

## 🚀 Installation

### Prerequisites
- Go 1.21 or higher
- Modern web browser (Chrome, Firefox, Safari, Edge)

### From Source

```bash
# Clone the repository
git clone https://github.com/yourusername/picsync-pro.git
cd picsync-pro

# Download dependencies
go mod tidy

# Build the application
go build -o picsync-pro main.go

# Run the application
./picsync-pro
Using Go Run
bash
# Clone the repository
git clone https://github.com/yourusername/picsync-pro.git
cd picsync-pro

# Run directly
go run main.go
Docker (Optional)
dockerfile
# Dockerfile
FROM golang:1.21-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN go build -o picsync-pro main.go

FROM alpine:latest
RUN apk --no-cache add ca-certificates
WORKDIR /root/
COPY --from=builder /app/picsync-pro .
COPY --from=builder /app/static ./static
EXPOSE 8080
CMD ["./picsync-pro"]
🏃 Quick Start
Start the server:

bash
go run main.go
Open your browser:

text
http://localhost:8080
Login:

Username: admin

Password: admin123

Start managing your files!

📖 Usage Guide
File Explorer
Navigate folders by clicking on directories

Select files using checkboxes

Drag and drop files between panels

Use action buttons to copy/move/delete

Creating a Sync Job
Go to Sync Jobs tab

Enter job name

Select source and destination folders

Choose conflict resolution rule

Add include/exclude patterns (optional)

Click Create Job

Click Start to begin syncing

Finding Duplicates
Go to Search & Duplicates tab

Enter folder path to scan

Click Scan for Duplicates

Select files using checkboxes

Choose bulk action: Delete or Move

Sorting Files
Go to Files Sorting tab

Enter job name

Select source folder

Choose sort method (Date or Location)

Click Start Sorting

Viewing Photos on Map
Go to Photo Map tab

Select folder containing photos

Click Load Photos on Map

Click markers to preview photos

Viewing Job Logs
Click 📋 Logs button on any job

View detailed logs with source/destination paths

Check errors and warnings

🔧 API Endpoints
Endpoint	Method	Description
/api/login	POST	User authentication
/api/logout	POST	Logout user
/api/browse	GET	Browse file system
/api/copy	POST	Copy files/directories
/api/move	POST	Move files/directories
/api/delete	POST	Delete files/directories
/api/create-folder	POST	Create new folder
/api/sync-jobs	GET/POST/DELETE	Manage sync jobs
/api/sync	POST	Start sync job
/api/sync/control	POST	Pause/Resume/Stop sync
/api/sync/logs	GET	Get job logs
/api/duplicates	GET	Find duplicates
/api/search	POST	Search files
/api/preview	GET	Preview file
/api/geo-photos	GET	Get photos with GPS
/api/sort-jobs	GET/POST/DELETE	Manage sort jobs
/api/sort/start	POST	Start sort job
/api/sort/control	POST	Pause/Resume/Stop sort
⚙️ Configuration
Environment Variables
bash
# Server port (default: 8080)
PORT=8080

# Data directory (default: ./data)
DATA_DIR=/path/to/data

# Static files directory (default: ./static)
STATIC_DIR=/path/to/static
Default Credentials
Username: admin

Password: admin123

⚠️ Security Note: Change the default password immediately in production!

📁 Project Structure
text
picsync-pro/
├── main.go              # Main application entry point
├── go.mod               # Go module file
├── go.sum               # Go dependencies checksums
├── .gitignore           # Git ignore file
├── README.md            # Project documentation
├── static/              # Static web files
│   ├── index.html       # Main UI HTML
│   ├── style.css        # CSS styles
│   └── script.js        # JavaScript logic
└── data/                # Application data (created at runtime)
    ├── logs/            # Job-specific log files
    ├── users.json       # User accounts
    ├── sync_jobs.json   # Persistent sync jobs
    ├── job_logs.json    # Global job logs
    └── job_history.json # Job execution history
🛠️ Technologies Used
Backend
Go 1.21 - Core application

UUID - Unique ID generation

BCrypt - Password hashing

EXIF Library - Image metadata extraction

Frontend
HTML5 - Structure

CSS3 - Styling with modern design

Vanilla JavaScript - No framework dependencies

Leaflet.js - Interactive maps (OpenStreetMap)

OpenStreetMap - Free map tiles

Storage
JSON - Persistent data storage

File System - Direct file operations

🤝 Contributing
Fork the repository

Create your feature branch (git checkout -b feature/AmazingFeature)

Commit your changes (git commit -m 'Add some AmazingFeature')

Push to the branch (git push origin feature/AmazingFeature)

Open a Pull Request

Development Guidelines
Follow Go best practices

Use meaningful variable names

Comment complex logic

Test before submitting

📝 License
This project is licensed under the MIT License - see the LICENSE file for details.

🙏 Acknowledgments
rwcarlsen/goexif - EXIF metadata extraction

Leaflet.js - Interactive maps

OpenStreetMap - Free map tiles

Font Awesome - Icons (used in UI)

🐛 Known Issues & Troubleshooting
Permission Issues
If you see permission errors when accessing files:

bash
# macOS/Linux
sudo chmod -R 755 /path/to/your/files

# Windows
# Run as Administrator or adjust file permissions
Map Not Loading
Make sure you have internet access to load OpenStreetMap tiles:

text
https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png
Large File Operations
For very large file operations, consider increasing the worker count:

go
// In main.go, adjust this value
workerCount = runtime.NumCPU() * 4  // Default: * 2
📞 Support
Issues: GitHub Issues

Email: rubenpetrosyan@hotmail.com

🌟 Star History
If you find this project useful, please give it a ⭐ on GitHub!

Made with ❤️ using Go and Open Source technologies
