# PicSync Pro - Advanced File Synchronization Manager

A powerful, browser-based file synchronization and management tool built with Go. Features include photo map with GPS visualization, sync jobs with pause/resume/stop, duplicate finder, file search, timeline-based filtering, Google Maps timeline import/export, automatic file sorting, multi-language support, user profiles with personalization, and dark/light mode.

![PicSync Pro](https://img.shields.io/badge/version-2.0.0-blue.svg)
![Go Version](https://img.shields.io/badge/go-1.21+-00ADD8.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20Windows-lightgrey.svg)

## Table of Contents

- [Features](#features)
- [Screenshots](#screenshots)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Usage Guide](#usage-guide)
- [User Profiles & Settings](#user-profiles--settings)
- [Internationalization](#internationalization)
- [API Endpoints](#api-endpoints)
- [Configuration](#configuration)
- [Project Structure](#project-structure)
- [Technologies Used](#technologies-used)
- [Testing](#testing)
- [Contributing](#contributing)
- [License](#license)

## Features

### Photo Map (Default Tab)
- **Visualize photos** with GPS data on OpenStreetMap
- **Interactive markers** with photo previews
- **Automatic map centering** based on photo locations
- **Marker clustering** for large photo collections
- **Click to preview** photos directly from map
- **EXIF timestamp extraction** for each photo

### Sync Jobs
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

### Duplicate Finder
- Find duplicates by **file hash** (SHA-256)
- Group duplicates by **file size** for efficiency
- **Select all/except one** options
- **Bulk actions**: Delete or move duplicates
- Full paths displayed for easy identification

### Advanced File Search
- **Search by filename** (case-sensitive option)
- **Filter by file size** (min/max)
- **Filter by file extensions**
- **Filter by modification date** range
- **Click results to preview** files

### Files Sorting
- **Sort by date**: Organize files by Year/Month folders
- **Sort by location**: Organize by GPS coordinates
- **Extracts EXIF metadata** from images
- **Batch file moving** with progress tracking
- **Pause/Resume/Stop** sort jobs

### Timeline Filtering
- **Dual-range time slider** below the map
- **Filter photos by capture date** — drag handles to narrow the time range
- **Real-time marker updates** as you drag
- **Photo density visualization** on the timeline track

### Google Maps Timeline Import/Export
- **Import multiple files** at once (KML and/or JSON)
- **KML format** support — parses `<gx:Track>` elements with timestamps and coordinates
- **Timeline.json format** support — parses Google's newer `semanticSegments` format
- **Records.json format** support — parses the older `timelineObjects` format
- **Travel track visualization** — imported track rendered as a polyline on the map
- **Timeline integration** — track segments within the selected time range are highlighted
- **Export to KML** — generates a standard KML file with `<gx:Track>`, openable in Google Earth
- **Export to JSON** — generates a `semanticSegments` format JSON matching Google's Timeline.json structure

### User Profiles & Personalization
- **Dark / Light mode** toggle with instant switching
- **Accent color picker** — choose from blue, purple, green, orange, red
- **Language selection** — 6 languages supported (see below)
- **Change password** — users can change their own password
- **User management** (admin only) — create/delete users, promote/demote admins
- **Server settings** (admin only) — configure the bind address for IP/domain access
- **Authentication methods panel** (admin only) — view configured auth methods (Google OAuth placeholder for future)
- **Logout** button accessible from settings

### Internationalization (i18n)
- **6 languages** supported out of the box:
  - English (en)
  - Français (fr)
  - Deutsch (de)
  - Русский (ru)
  - 中文 (zh)
  - Հայերեն (hy)
- **Language selector** in the top-right toolbar (left of the user icon)
- **Extensible** — languages stored as separate JSON files in `static/locales/`
- **Preference persistence** — language choice saved to user profile
- **Add new languages** by creating a new JSON file in `static/locales/`

### Job Logs
- **Detailed logging** for all operations
- **Job-specific log files** stored in `data/logs/`
- **Log levels**: INFO, WARNING, ERROR
- **View logs** for any job with source/destination paths
- **Clear logs** and history functionality

## Screenshots

### Photo Map with Timeline
```
┌─────────────────────────────────────────────────────────┐
│ 📁 PicSync Pro Manager          [🇬🇧 EN▾] [👤]         │
├─────────────────────────────────────────────────────────┤
│ [🗺️ Photo Map] [🔄 Sync Jobs] [🔍 Search] [📊 Sort]    │
├─────────────────────────────────────────────────────────┤
│ [Folder path input] [🗺️ Load] [📁]                     │
│ 📸 245  📍 198  🌍 42                                   │
│ ┌──────────────────────────────────────────────────┐    │
│ │                  OpenStreetMap                   │    │
│ │            🔵 🔵    🔵🔵🔵                       │    │
│ │       🔵              🔵                         │    │
│ │                  🔵    🔵🔵                     │    │
│ └──────────────────────────────────────────────────┘    │
│ 📅 Timeline  [📥 Import] [📤 KML] [📤 JSON] [🗑️]      │
│ Jan 2024 ────●═════════════●──── Dec 2024              │
│ Showing: Mar 2024 — Jun 2024 | 87 photos               │
└─────────────────────────────────────────────────────────┘
```

### Settings Page
```
┌─────────────────────────────────────────────────────────┐
│ ⚙️ Settings                              [← Back]       │
├─────────────────────────────────────────────────────────┤
│ Profile                                                 │
│   Username: admin                        [Administrator]│
│                                                         │
│ Appearance                                               │
│   Theme:    [☀️ Light Mode] [🌙 Dark Mode]              │
│   Accent:   🔵 🟣 🟢 🟠 🔴                               │
│                                                         │
│ Language                                                │
│   Language: [English ▾]                                 │
│                                                         │
│ Change Password                                         │
│   [Current Password]                                   │
│   [New Password     ]                                   │
│   [Confirm Password ]                                   │
│   [Update Password]                                    │
│                                                         │
│ User Management (Admin)                                 │
│   [Username] [Password] [☐ Admin] [Create User]        │
│   ┌────────────┬──────────┬────────────────┐           │
│   │ admin      │ Admin    │ [Toggle] [Del] │           │
│   │ regular     │ User     │ [Toggle] [Del] │           │
│   └────────────┴──────────┴────────────────┘           │
│                                                         │
│ Server Settings                                         │
│   Bind Address: [0.0.0.0:8080]                         │
│   [Save Server Settings]                               │
│                                                         │
│ Authentication Methods                                  │
│   Password Authentication          [Enabled]           │
│   Google OAuth                     [Disabled]           │
│                                                         │
│ [Logout]                                               │
└─────────────────────────────────────────────────────────┘
```

### Sync Jobs
```
┌─────────────────────────────────────────────────────────┐
│ 📋 Sync Jobs                                            │
│ ┌──────────────────────────────────────────────────┐    │
│ │ 📌 MyPhotoBackup                                 │    │
│ │ Status: RUNNING                                  │    │
│ │ 📁 Source: /Users/me/Photos                      │    │
│ │ 📂 Destination: /Volumes/Backup/Photos          │    │
│ │ ████████████████████░░░░░░░ 75%                 │    │
│ │ (150/200 files)                                 │    │
│ │ 📄 Processing: IMG_1234.jpg                     │    │
│ │ [▶️ Start] [⏸️ Pause] [⏹️ Stop] [📋 Logs]       │    │
│ └──────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

## Installation

### Prerequisites
- Go 1.21 or higher
- Modern web browser (Chrome, Firefox, Safari, Edge)

### From Source

```bash
# Clone the repository
git clone https://github.com/rubenpetrosyan1/picsync.git
cd picsync

# Download dependencies
go mod tidy

# Build the application
go build -o picsync main.go

# Run the application
./picsync
```

### Using Go Run

```bash
git clone https://github.com/rubenpetrosyan1/picsync.git
cd picsync
go run main.go
```

### Docker (Optional)

```dockerfile
FROM golang:1.21-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN go build -o picsync main.go

FROM alpine:latest
RUN apk --no-cache add ca-certificates
WORKDIR /root/
COPY --from=builder /app/picsync .
COPY --from=builder /app/static ./static
EXPOSE 8080
CMD ["./picsync"]
```

## Quick Start

Start the server:

```bash
go run main.go
```

Open your browser:

```
http://localhost:8080
```

Login:

- **Username:** admin
- **Password:** admin123

> **Security Note:** Change the default password immediately via Settings → Change Password!

## Usage Guide

### Viewing Photos on Map
1. The **Photo Map** tab is the default landing page
2. Enter a folder path containing photos (subfolders are scanned recursively)
3. Click **Load**
4. Click markers to preview photos
5. Drag the timeline slider handles to filter photos by capture date

### Creating a Sync Job
1. Go to **Sync Jobs** tab
2. Enter job name
3. Select source and destination folders
4. Choose conflict resolution rule
5. Add include/exclude patterns (optional)
6. Click **Create Job**
7. Click **Start** to begin syncing

### Finding Duplicates
1. Go to **Search & Duplicates** tab
2. Enter folder path to scan
3. Click **Scan for Duplicates**
4. Select files using checkboxes
5. Choose bulk action: Delete or Move

### Sorting Files
1. Go to **Files Sorting** tab
2. Enter job name
3. Select source folder
4. Choose sort method (Date or Location)
5. Click **Start Sorting**

### Importing Google Maps Timeline
1. Go to **Photo Map** tab
2. Click **"How do I get my Google Maps timeline?"** for step-by-step export instructions
3. Follow the instructions to export your timeline from [Google Takeout](https://takeout.google.com)
4. Click **Import Timeline** and select one or more KML/JSON files
5. Your travel track appears as a polyline on the map
6. Use the timeline slider to highlight track segments and photos within a time range

### Exporting Timeline Data
1. Import one or more timeline files (see above)
2. Click **Export KML** or **Export JSON**
3. The file downloads immediately — no server round-trip needed
4. KML files can be opened in Google Earth
5. JSON files use the `semanticSegments` format compatible with Google Maps

## User Profiles & Settings

Click the **👤 user icon** in the top-right corner to access the settings page.

### Profile
- View your username and role (Administrator or User)

### Appearance
- **Theme**: Switch between Light Mode and Dark Mode
- **Accent Color**: Choose from blue, purple, green, orange, or red — changes the primary UI color instantly

### Language
- Select your interface language from the dropdown
- Languages can also be changed from the top-right toolbar

### Change Password
1. Enter your current password
2. Enter a new password (minimum 6 characters)
3. Confirm the new password
4. Click **Update Password**

### User Management (Admin Only)
- **Create users**: Enter username, password, and admin checkbox
- **Delete users**: Click the delete button (cannot delete your own account)
- **Toggle admin**: Promote or demote users (cannot remove your own admin rights)

### Server Settings (Admin Only)
- **Bind Address**: Configure the address the server listens on (e.g., `:8080`, `0.0.0.0:8080`, `192.168.1.5:9090`)
- Changes take effect after server restart
- Allows accessing the application via IP address or domain name

### Authentication Methods (Admin Only)
- **Password Authentication**: Always enabled
- **Google OAuth**: Placeholder for future OAuth integration (requires `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` environment variables)

## Internationalization

PicSync Pro supports 6 languages out of the box. Language files are stored as JSON in `static/locales/`:

```
static/locales/
├── en.json    # English
├── fr.json    # French (Français)
├── de.json    # German (Deutsch)
├── ru.json    # Russian (Русский)
├── zh.json    # Chinese (中文)
└── hy.json    # Armenian (Հայերեն)
```

### Adding a New Language

1. Copy `static/locales/en.json` to a new file (e.g., `static/locales/es.json` for Spanish)
2. Translate all the values to the new language (keep the keys unchanged)
3. Add the language option to the `<select>` elements in `static/index.html`:
   ```html
   <option value="es">Español</option>
   ```
4. The language automatically appears in both the toolbar selector and the settings page

## API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/api/login` | POST | User authentication |
| `/api/logout` | POST | Logout user |
| `/api/check-auth` | GET | Check session status + get user info |
| `/api/settings` | GET/PUT | Get/update user settings (theme, accent, language) |
| `/api/change-password` | POST | Change own password |
| `/api/users` | GET/POST/DELETE | Manage users (admin only) |
| `/api/users/admin` | PUT | Toggle admin status (admin only) |
| `/api/server-settings` | GET/PUT | Get/update server bind address (admin only) |
| `/api/browse` | GET | Browse file system |
| `/api/copy` | POST | Copy files/directories |
| `/api/move` | POST | Move files/directories |
| `/api/delete` | POST | Delete files/directories |
| `/api/create-folder` | POST | Create new folder |
| `/api/sync-jobs` | GET/POST/DELETE | Manage sync jobs |
| `/api/sync` | POST | Start sync job |
| `/api/sync/control` | POST | Pause/Resume/Stop sync |
| `/api/sync/logs` | GET | Get job logs |
| `/api/duplicates` | GET | Find duplicates |
| `/api/search` | POST | Search files |
| `/api/preview` | GET | Preview file |
| `/api/geo-photos` | GET | Get photos with GPS data |
| `/api/sort-jobs` | GET/POST/DELETE | Manage sort jobs |
| `/api/sort/start` | POST | Start sort job |
| `/api/sort/control` | POST | Pause/Resume/Stop sort |
| `/api/timeline/import` | POST | Import Google Maps timeline (KML/JSON) |
| `/api/media-comment` | GET/PUT | Get/save media comments |
| `/static/locales/{lang}.json` | GET | Get translation file (public) |

## Configuration

### Server Bind Address

The server bind address can be configured in two ways:

1. **Via the Settings UI** (admin only): Go to Settings → Server Settings → Bind Address
2. **Via `data/server_settings.json`**: Edit the file directly

Default: `:8080` (listens on all interfaces, port 8080)

### Default Credentials

- **Username:** admin
- **Password:** admin123

> **Security Note:** Change the default password immediately in production!

## Project Structure

```
picsync/
├── main.go                          # Main application (all backend logic)
├── main_test.go                     # Backend unit tests
├── go.mod                           # Go module file
├── go.sum                           # Go dependencies checksums
├── .gitignore                       # Git ignore file
├── README.md                        # Project documentation
├── static/                          # Static web files
│   ├── index.html                   # Main UI HTML (single-page)
│   ├── style.css                    # CSS styles (with dark mode + CSS variables)
│   ├── script.js                    # JavaScript logic (with i18n system)
│   └── locales/                     # Language translation files
│       ├── en.json                  # English translations
│       ├── fr.json                  # French translations
│       ├── de.json                  # German translations
│       ├── ru.json                  # Russian translations
│       ├── zh.json                  # Chinese translations
│       └── hy.json                  # Armenian translations
└── data/                            # Application data (created at runtime)
    ├── logs/                        # Job-specific log files
    ├── media_info/                  # Per-file media comments
    ├── users.json                   # User accounts (with settings)
    ├── server_settings.json         # Server configuration (bind address)
    ├── sync_jobs.json               # Persistent sync jobs
    ├── job_logs.json                # Global job logs
    └── job_history.json             # Job execution history
```

## Technologies Used

### Backend
- **Go 1.21** — Core application
- **google/uuid** — Unique ID generation
- **rwcarlsen/goexif** — EXIF metadata extraction (GPS coordinates, timestamps)
- **golang.org/x/crypto/bcrypt** — Password hashing

### Frontend
- **HTML5** — Structure
- **CSS3** — Styling with CSS custom properties (variables) for theming
- **Vanilla JavaScript** — No framework dependencies
- **Leaflet.js 1.9.4** — Interactive maps (OpenStreetMap)
- **Leaflet.markercluster 1.5.3** — Marker clustering for large datasets
- **OpenStreetMap** — Free map tiles

### Storage
- **JSON** — Persistent data storage (users, settings, jobs, logs)
- **File System** — Direct file operations

## Testing

Backend tests are written using Go's standard `testing` package and `net/http/httptest`.

```bash
# Run all tests
go test ./... -v

# Run a specific test
go test -run TestChangePassword_Success -v
```

### Test Coverage

| Test | Description |
|---|---|
| `TestChangePassword_Success` | Change password with correct current password |
| `TestChangePassword_WrongCurrent` | Reject wrong current password (401) |
| `TestChangePassword_TooShort` | Reject short new password (400) |
| `TestGetSettings` | Get current user's settings |
| `TestUpdateSettings` | Update theme, accent color, language |
| `TestListUsers_Admin` | Admin can list all users |
| `TestListUsers_NonAdmin` | Non-admin gets 403 |
| `TestCreateUser` | Admin creates new user |
| `TestCreateUser_Duplicate` | Reject duplicate username (409) |
| `TestDeleteUser` | Admin deletes a user |
| `TestDeleteUser_CannotDeleteSelf` | Cannot delete own account (400) |
| `TestToggleAdmin` | Admin promotes user to admin |
| `TestToggleAdmin_CannotRemoveOwnAdmin` | Cannot remove own admin rights (400) |
| `TestServerSettings_Get` | Admin gets server settings |
| `TestServerSettings_Update` | Admin updates bind address |
| `TestServerSettings_NonAdmin` | Non-admin gets 403 |
| `TestMigrateUsers` | Old user data gets default settings |
| `TestCheckAuth` | Authenticated user gets user info |
| `TestCheckAuth_Unauthorized` | Unauthenticated request gets 401 |

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

### Development Guidelines
- Follow Go best practices
- Use meaningful variable names
- Comment complex logic
- Add tests for new backend handlers
- Test before submitting

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- [rwcarlsen/goexif](https://github.com/rwcarlsen/goexif) — EXIF metadata extraction
- [Leaflet.js](https://leafletjs.com/) — Interactive maps
- [OpenStreetMap](https://www.openstreetmap.org/) — Free map tiles
- [Leaflet.markercluster](https://github.com/Leaflet/Leaflet.markercluster) — Marker clustering

## Known Issues & Troubleshooting

### Permission Issues
If you see permission errors when accessing files:

```bash
# macOS/Linux
sudo chmod -R 755 /path/to/your/files

# Windows
# Run as Administrator or adjust file permissions
```

### Map Not Loading
Make sure you have internet access to load OpenStreetMap tiles:

```
https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png
```

### Timeline Import Not Working
- Ensure the file is a valid KML or JSON exported from Google Takeout
- Both the newer `Timeline.json` (`semanticSegments`) and older `Records.json` (`timelineObjects`) formats are supported
- KML files must contain `<gx:Track>` elements
- Try hard-refreshing the browser (`Cmd+Shift+R` or `Ctrl+Shift+R`) to clear cached JavaScript

### Dark Mode Not Applying
- Ensure your browser supports CSS custom properties (all modern browsers do)
- Try clearing browser cache and hard-refreshing
- The theme toggle is in Settings → Appearance → Theme

### Language Not Changing
- Check that the language file exists in `static/locales/`
- Verify the JSON file is valid (no syntax errors)
- Try hard-refreshing the browser

### Large File Operations
For very large file operations, consider increasing the worker count:

```go
// In main.go, adjust this value
workerCount = runtime.NumCPU() * 4  // Default: * 2
```

## Support

- **Issues:** GitHub Issues
- **Email:** rubenpetrosyan@hotmail.com
