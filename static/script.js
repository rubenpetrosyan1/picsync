// ============ I18N SYSTEM ============
let translations = {};
let currentLang = localStorage.getItem('language') || 'en';

const ACCENT_COLORS = {
    blue: { color: '#667eea', hover: '#5a67d8', gradient: 'linear-gradient(135deg, #667eea, #764ba2)' },
    purple: { color: '#764ba2', hover: '#6a3f93', gradient: 'linear-gradient(135deg, #764ba2, #9b59b6)' },
    green: { color: '#4caf50', hover: '#45a049', gradient: 'linear-gradient(135deg, #4caf50, #66bb6a)' },
    orange: { color: '#ff9800', hover: '#f57c00', gradient: 'linear-gradient(135deg, #ff9800, #ffb74d)' },
    red: { color: '#e74c3c', hover: '#c0392b', gradient: 'linear-gradient(135deg, #e74c3c, #ef5350)' }
};

async function loadTranslations(lang) {
    try {
        const res = await fetch(`/static/locales/${lang}.json`);
        translations = await res.json();
        currentLang = lang;
        document.documentElement.lang = lang;
        localStorage.setItem('language', lang);
        applyTranslations();
    } catch (e) {
        console.error('Failed to load translations:', e);
    }
}

function t(key) {
    return translations[key] || key;
}

function applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (translations[key]) {
            el.textContent = translations[key];
        }
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (translations[key]) {
            el.placeholder = translations[key];
        }
    });
    const langSelect = document.getElementById('language-select');
    if (langSelect) langSelect.value = currentLang;
    const settingsLangSelect = document.getElementById('settings-language-select');
    if (settingsLangSelect) settingsLangSelect.value = currentLang;
}

function changeLanguage(lang) {
    loadTranslations(lang).then(() => {
        if (currentUser && currentUser.settings) {
            currentUser.settings.language = lang;
            apiFetch('/api/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ language: lang })
            });
        }
        const langSelect = document.getElementById('language-select');
        if (langSelect) langSelect.value = lang;
        const settingsLangSelect = document.getElementById('settings-language-select');
        if (settingsLangSelect) settingsLangSelect.value = lang;
    });
}

// ============ STATE ============
let currentView = 'map';
let currentUser = null;
let statusPollingInterval = null;
let currentBrowserCallback = null;
let currentLogJobId = null;

function apiFetch(url, options = {}) {
    return fetch(url, options).then(res => {
        if (res.status === 401) {
            document.getElementById('login-screen').style.display = 'flex';
            document.getElementById('app').style.display = 'none';
            throw new Error(t('login.session_expired'));
        }
        return res;
    });
}

// ============ AUTH ============
function login() {
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    }).then(res => {
        if (res.ok) {
            return res.json();
        } else {
            alert(t('login.failed'));
            throw new Error('Login failed');
        }
    }).then(data => {
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('app').style.display = 'block';
        currentUser = { username: data.username, isAdmin: data.isAdmin, settings: data.settings };
        applyUserSettings(data.settings);
        loadSyncJobs();
        loadLogsAndHistory();
        initMapOnLoad();
    });
}

function logout() {
    fetch('/api/logout', { method: 'POST' }).then(() => {
        location.reload();
    });
}

// ============ THEME & APPEARANCE ============
function applyUserSettings(settings) {
    if (!settings) return;
    setTheme(settings.theme || 'light');
    setAccentColor(settings.accentColor || 'blue');
    if (settings.language && settings.language !== currentLang) {
        loadTranslations(settings.language);
    }
}

function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    document.getElementById('theme-light-btn')?.classList.toggle('active', theme === 'light');
    document.getElementById('theme-dark-btn')?.classList.toggle('active', theme === 'dark');
    saveSettings({ theme: theme });
}

function setAccentColor(color, swatchEl) {
    const c = ACCENT_COLORS[color] || ACCENT_COLORS.blue;
    document.documentElement.style.setProperty('--accent-color', c.color);
    document.documentElement.style.setProperty('--accent-color-hover', c.hover);
    document.documentElement.style.setProperty('--accent-gradient', c.gradient);
    document.documentElement.style.setProperty('--accent-bg-rgba', c.color.replace('#', 'rgba(') + '0.1)');
    localStorage.setItem('accentColor', color);
    document.querySelectorAll('.accent-swatch').forEach(s => s.classList.remove('active'));
    if (swatchEl) {
        swatchEl.classList.add('active');
    } else {
        const idx = ['blue','purple','green','orange','red'].indexOf(color);
        if (idx >= 0) {
            const swatches = document.querySelectorAll('.accent-swatch');
            if (swatches[idx]) swatches[idx].classList.add('active');
        }
    }
    saveSettings({ accentColor: color });
}

function saveSettings(partial) {
    if (!currentUser) return;
    Object.assign(currentUser.settings, partial);
    apiFetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(partial)
    }).catch(err => console.error('Failed to save settings:', err));
}

// ============ SETTINGS PAGE ============
function showSettings() {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('settings-view').style.display = 'block';
    loadSettingsData();
}

function hideSettings() {
    document.getElementById('settings-view').style.display = 'none';
    showTab(currentView, null);
}

function loadSettingsData() {
    apiFetch('/api/settings')
        .then(res => res.json())
        .then(data => {
            currentUser = { username: data.username, isAdmin: data.isAdmin, settings: data.settings };
            document.getElementById('settings-username').textContent = data.username;
            const roleEl = document.getElementById('settings-role');
            if (data.isAdmin) {
                roleEl.innerHTML = '<span class="admin-badge">' + t('settings.admin') + '</span>';
            } else {
                roleEl.innerHTML = '<span class="user-badge">' + t('settings.user') + '</span>';
            }
            setTheme(data.settings.theme || 'light');
            setAccentColor(data.settings.accentColor || 'blue');
            const settingsLangSelect = document.getElementById('settings-language-select');
            if (settingsLangSelect) settingsLangSelect.value = data.settings.language || 'en';

            document.getElementById('admin-section').style.display = data.isAdmin ? 'block' : 'none';
            if (data.isAdmin) {
                loadUsersList();
                loadServerSettings();
            }
        });
}

function loadUsersList() {
    apiFetch('/api/users')
        .then(res => res.json())
        .then(users => {
            const tbody = document.getElementById('users-table-body');
            tbody.innerHTML = '';
            users.forEach(u => {
                const tr = document.createElement('tr');
                const roleBadge = u.isAdmin
                    ? '<span class="admin-badge">' + t('settings.admin') + '</span>'
                    : '<span class="user-badge">' + t('settings.user') + '</span>';
                tr.innerHTML = `
                    <td>${escapeHtml(u.username)}</td>
                    <td>${roleBadge}</td>
                    <td>
                        <button class="settings-btn" style="padding:4px 10px;font-size:12px;" onclick="toggleAdmin('${escapeHtml(u.username)}', ${!u.isAdmin})">${t('settings.toggle_admin')}</button>
                        <button class="settings-btn danger" style="padding:4px 10px;font-size:12px;" onclick="deleteUser('${escapeHtml(u.username)}')">${t('settings.delete_user')}</button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        });
}

function createUser() {
    const username = document.getElementById('new-username').value;
    const password = document.getElementById('new-user-password').value;
    const isAdmin = document.getElementById('new-user-admin').checked;

    if (!username || password.length < 6) {
        alert(t('settings.password_too_short'));
        return;
    }

    apiFetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, isAdmin })
    }).then(res => {
        if (res.status === 409) {
            alert(t('settings.user_exists'));
            throw new Error('exists');
        }
        if (!res.ok) throw new Error('Failed');
        document.getElementById('new-username').value = '';
        document.getElementById('new-user-password').value = '';
        document.getElementById('new-user-admin').checked = false;
        loadUsersList();
    }).catch(err => { if (err.message !== 'exists') console.error(err); });
}

function deleteUser(username) {
    if (!confirm(t('settings.confirm_delete_user') + ' ' + username + '?')) return;
    apiFetch('/api/users', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username })
    }).then(res => {
        if (res.status === 400) {
            alert(t('settings.cannot_delete_self'));
            return;
        }
        loadUsersList();
    });
}

function toggleAdmin(username, makeAdmin) {
    if (username === currentUser?.username && !makeAdmin) {
        alert(t('settings.cannot_remove_own_admin'));
        return;
    }
    apiFetch('/api/users/admin', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, isAdmin: makeAdmin })
    }).then(() => loadUsersList());
}

function loadServerSettings() {
    apiFetch('/api/server-settings')
        .then(res => res.json())
        .then(data => {
            document.getElementById('bind-address').value = data.bindAddress || ':8080';
        });
}

function saveServerSettings() {
    const bindAddress = document.getElementById('bind-address').value;
    apiFetch('/api/server-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bindAddress })
    }).then(res => res.json())
      .then(data => {
          alert(data.message || t('settings.server_saved'));
      });
}

function changePassword() {
    const currentPassword = document.getElementById('current-password').value;
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;

    if (newPassword !== confirmPassword) {
        alert(t('settings.password_mismatch'));
        return;
    }
    if (newPassword.length < 6) {
        alert(t('settings.password_too_short'));
        return;
    }

    apiFetch('/api/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword })
    }).then(res => {
        if (res.status === 401) {
            alert(t('settings.password_wrong'));
            return;
        }
        if (res.status === 400) {
            alert(t('settings.password_too_short'));
            return;
        }
        alert(t('settings.password_changed'));
        document.getElementById('current-password').value = '';
        document.getElementById('new-password').value = '';
        document.getElementById('confirm-password').value = '';
    });
}

// ============ TABS ============
function showTab(tab, btnEl) {
    currentView = tab;
    document.getElementById('settings-view').style.display = 'none';
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`${tab}-tab`).classList.add('active');
    if (btnEl) {
        btnEl.classList.add('active');
    } else {
        const btns = document.querySelectorAll('.tab-btn');
        btns.forEach(b => {
            if (b.getAttribute('onclick') && b.getAttribute('onclick').includes(`'${tab}'`)) {
                b.classList.add('active');
            }
        });
    }

    if (tab === 'sync') {
        loadSyncJobs();
        loadLogsAndHistory();
    }
    if (tab === 'sort') {
        loadSortJobs();
    }
    if (tab === 'map') {
        if (!map) {
            const mapEl = document.getElementById('map');
            if (mapEl) {
                initLeafletMap(0, 0, 2);
            }
        } else {
            setTimeout(function() { map.invalidateSize(); }, 100);
        }
    }
}

function initMapOnLoad() {
    const mapEl = document.getElementById('map');
    if (mapEl && !map) {
        initLeafletMap(0, 0, 2);
    }
}

// ============ FILE UTILITIES ============
function getFileIcon(filename) {
    const ext = filename.toLowerCase();
    if (ext.endsWith('.jpg') || ext.endsWith('.jpeg') || ext.endsWith('.png') || ext.endsWith('.gif') || ext.endsWith('.webp') || ext.endsWith('.bmp')) return '🖼️';
    if (ext.endsWith('.mp4') || ext.endsWith('.avi') || ext.endsWith('.mkv') || ext.endsWith('.mov') || ext.endsWith('.webm')) return '🎬';
    if (ext.endsWith('.mp3') || ext.endsWith('.wav') || ext.endsWith('.flac') || ext.endsWith('.aac')) return '🎵';
    if (ext.endsWith('.pdf')) return '📄';
    if (ext.endsWith('.txt') || ext.endsWith('.md') || ext.endsWith('.log')) return '📝';
    if (ext.endsWith('.zip') || ext.endsWith('.rar') || ext.endsWith('.7z') || ext.endsWith('.tar') || ext.endsWith('.gz')) return '🗜️';
    if (ext.endsWith('.exe') || ext.endsWith('.msi') || ext.endsWith('.dmg')) return '⚙️';
    if (ext.endsWith('.iso')) return '💿';
    return '📄';
}

function getParentPath(path) {
    const parts = path.split('/');
    parts.pop();
    return parts.join('/') || '/';
}

// ============ FOLDER BROWSER ============
function openFolderBrowser(type, targetInputId) {
    const input = document.getElementById(targetInputId);
    let currentPath = input ? input.value.trim() : '/';
    if (!currentPath || currentPath === '') {
        currentPath = '/';
    }

    currentBrowserCallback = { targetInputId, type };
    const modal = document.getElementById('folder-browser-modal');
    modal.style.display = 'block';
    loadFolderBrowser(currentPath);
}

function loadFolderBrowser(path) {
    const container = document.getElementById('browser-folders-list');
    container.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-faint);">' + t('folder_browser.loading') + '</div>';

    apiFetch(`/api/browse?path=${encodeURIComponent(path)}`)
        .then(res => res.json())
        .then(data => {
            document.getElementById('browser-current-path').textContent = data.currentPath;
            container.innerHTML = '';

            if (data.currentPath !== '/') {
                const parentDiv = createBrowserItem('..', getParentPath(data.currentPath), true);
                container.appendChild(parentDiv);
            }

            const dirs = data.files.filter(f => f.isDir);
            dirs.sort((a, b) => a.name.localeCompare(b.name));
            dirs.forEach(dir => {
                container.appendChild(createBrowserItem(dir.name, dir.path, false));
            });
        })
        .catch(err => {
            if (err.message && !err.message.includes('Session expired')) {
                console.error('loadFolderBrowser error:', err);
            }
        });
}

function createBrowserItem(name, path, isParent) {
    const div = document.createElement('div');
    div.className = 'browser-folder-item';
    div.innerHTML = `
        <span class="folder-icon">${isParent ? '⬆️' : '📁'}</span>
        <span class="folder-name">${escapeHtml(name)}</span>
    `;
    div.onclick = () => {
        if (isParent) {
            loadFolderBrowser(path);
        } else {
            loadFolderBrowser(path);
        }
    };
    return div;
}

function selectCurrentFolder() {
    if (currentBrowserCallback) {
        const path = document.getElementById('browser-current-path').textContent;
        const input = document.getElementById(currentBrowserCallback.targetInputId);
        if (input) input.value = path;
    }
    closeFolderBrowser();
}

function closeFolderBrowser() {
    document.getElementById('folder-browser-modal').style.display = 'none';
    currentBrowserCallback = null;
}

function validatePath(input) {
    if (!input.value) return;
    apiFetch(`/api/browse?path=${encodeURIComponent(input.value)}`)
        .then(res => {
            if (res.ok) {
                input.style.borderColor = '#4caf50';
            } else {
                input.style.borderColor = '#ff9800';
            }
        })
        .catch(() => {
            input.style.borderColor = '#ff9800';
        });
}

// ============ SYNC JOBS ============
function loadSyncJobs() {
    fetch('/api/sync-jobs')
        .then(res => res.json())
        .then(jobs => {
            const container = document.getElementById('sync-jobs-list');
            container.innerHTML = '';

            jobs.forEach(job => {
                const jobDiv = document.createElement('div');
                jobDiv.className = `sync-job-item ${job.status}`;

                let progressHtml = '';
                if (job.status === 'running' || job.status === 'paused') {
                    progressHtml = `
                        <div class="job-progress">
                            <div class="progress-bar-small">
                                <div class="progress-fill-small" style="width: ${job.progress}%"></div>
                            </div>
                            <div class="progress-stats">
                                <span>${Math.round(job.progress)}%</span>
                                <span>(${job.processedFiles || 0}/${job.totalFiles || 0})</span>
                            </div>
                            ${job.currentFile ? `<div class="current-file">📄 ${escapeHtml(job.currentFile.split('/').pop())}</div>` : ''}
                        </div>
                    `;
                }

                jobDiv.innerHTML = `
                    <h4>📌 ${escapeHtml(job.name)}</h4>
                    <div class="job-status ${job.status}">${t('sync.status')} ${job.status.toUpperCase()}</div>
                    <p>📁 ${t('sync.source')} ${escapeHtml(job.sourcePath)}</p>
                    <p>📂 ${t('sync.destination')} ${escapeHtml(job.destPath)}</p>
                    <p>⚙️ ${t('sync.conflict')} ${job.conflictRule || 'skip'}</p>
                    ${progressHtml}
                    <div class="job-controls">
                        <button class="control-btn start-btn" onclick="runSync('${job.id}')" ${job.status === 'running' ? 'disabled' : ''}>▶️ ${t('sync.start')}</button>
                        ${job.status === 'running' ? '<button class="control-btn pause-btn" onclick="controlSync(\'' + job.id + '\', \'pause\')">⏸️ ' + t('sync.pause') + '</button>' : ''}
                        ${job.status === 'paused' ? '<button class="control-btn resume-btn" onclick="controlSync(\'' + job.id + '\', \'resume\')">▶️ ' + t('sync.resume') + '</button>' : ''}
                        ${(job.status === 'running' || job.status === 'paused') ? '<button class="control-btn stop-btn" onclick="controlSync(\'' + job.id + '\', \'stop\')">⏹️ ' + t('sync.stop') + '</button>' : ''}
                        <button class="control-btn logs-btn" onclick="viewJobLogs('${job.id}', '${escapeHtml(job.name)}')">📋 ${t('sync.logs')}</button>
                        <button class="control-btn delete-btn" onclick="deleteSyncJob('${job.id}')">🗑️ ${t('sync.delete')}</button>
                    </div>
                `;
                container.appendChild(jobDiv);
            });
        });
}

function controlSync(jobId, action) {
    fetch('/api/sync/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, action })
    }).then(() => {
        setTimeout(() => {
            loadSyncJobs();
            loadLogsAndHistory();
        }, 500);
    });
}

function createSyncJob() {
    const includePatterns = document.getElementById('include-patterns').value
        .split(',')
        .map(p => p.trim())
        .filter(p => p);

    const excludePatterns = document.getElementById('exclude-patterns').value
        .split(',')
        .map(p => p.trim())
        .filter(p => p);

    const sourcePath = document.getElementById('sync-source').value.trim();
    const destPath = document.getElementById('sync-dest').value.trim();

    const job = {
        name: document.getElementById('job-name').value,
        sourcePath: sourcePath,
        destPath: destPath,
        permanent: document.getElementById('permanent-job').checked,
        conflictRule: document.getElementById('conflict-rule').value,
        includePatterns: includePatterns,
        excludePatterns: excludePatterns
    };

    if (!job.name || !job.sourcePath || !job.destPath) {
        alert(t('sync.fill_all'));
        return;
    }

    if (!job.sourcePath.startsWith('/') || !job.destPath.startsWith('/')) {
        alert(t('sync.absolute_path'));
        return;
    }

    fetch('/api/sync-jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(job)
    }).then(() => {
        loadSyncJobs();
        if (job.permanent) {
            addPermanentButton(job);
        }
        document.getElementById('job-name').value = '';
        document.getElementById('sync-source').value = '';
        document.getElementById('sync-dest').value = '';
        document.getElementById('include-patterns').value = '';
        document.getElementById('exclude-patterns').value = '';
    });
}

function runSync(jobId) {
    fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId })
    }).then(() => {
        setTimeout(() => {
            loadSyncJobs();
            loadLogsAndHistory();
        }, 1000);
    });
}

function deleteSyncJob(jobId) {
    if (!confirm(t('sync.confirm_delete'))) return;

    fetch('/api/sync-jobs', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: jobId })
    }).then(() => loadSyncJobs());
}

function addPermanentButton(job) {
    const toolbar = document.querySelector('.toolbar-buttons');
    const btn = document.createElement('button');
    btn.textContent = `🔄 ${job.name}`;
    btn.onclick = () => runSync(job.id);
    btn.className = 'toolbar-btn';
    toolbar.insertBefore(btn, toolbar.firstChild);
}

// ============ JOB LOG VIEWER ============
function viewJobLogs(jobId, jobName) {
    currentLogJobId = jobId;
    document.getElementById('job-log-title').textContent = `📋 ${t('sync.job_logs')}: ${escapeHtml(jobName)}`;
    document.getElementById('job-log-modal').style.display = 'block';
    loadJobLogsForJob(jobId);
}

function closeJobLogModal() {
    document.getElementById('job-log-modal').style.display = 'none';
    currentLogJobId = null;
}

function refreshJobLogs() {
    if (currentLogJobId) {
        loadJobLogsForJob(currentLogJobId);
    }
}

function loadJobLogsForJob(jobId) {
    const container = document.getElementById('job-log-content');
    container.innerHTML = '<div class="loading">' + t('common.loading') + '</div>';

    fetch(`/api/sync/logs?jobId=${jobId}`)
        .then(res => res.json())
        .then(logs => {
            container.innerHTML = '';

            if (logs.length === 0) {
                container.innerHTML = '<div class="no-data">' + t('sync.no_logs_job') + '</div>';
                return;
            }

            const stats = { INFO: 0, WARNING: 0, ERROR: 0 };
            logs.forEach(log => {
                if (stats[log.level] !== undefined) stats[log.level]++;
            });

            const summaryDiv = document.createElement('div');
            summaryDiv.className = 'log-summary';
            summaryDiv.innerHTML = `
                <div class="log-stat info">✅ INFO: ${stats.INFO}</div>
                <div class="log-stat warning">⚠️ WARNING: ${stats.WARNING}</div>
                <div class="log-stat error">❌ ERROR: ${stats.ERROR}</div>
                <div class="log-stat total">📊 Total: ${logs.length}</div>
            `;
            container.appendChild(summaryDiv);

            logs.forEach(log => {
                const logDiv = document.createElement('div');
                logDiv.className = `log-entry ${log.level}`;

                let html = `
                    <div class="log-header">
                        <span class="log-time">${new Date(log.timestamp).toLocaleString()}</span>
                        <span class="log-level ${log.level}">${log.level}</span>
                    </div>
                    <div class="log-message">${escapeHtml(log.message)}</div>
                `;

                if (log.sourcePath) {
                    html += `<div class="log-path">📄 ${t('sync.source')} <span class="path-text">${escapeHtml(log.sourcePath)}</span></div>`;
                }
                if (log.destPath) {
                    html += `<div class="log-path">📂 ${t('sync.destination')} <span class="path-text">${escapeHtml(log.destPath)}</span></div>`;
                }
                if (log.error) {
                    html += `<div class="log-error">❌ ${t('common.error')} ${escapeHtml(log.error)}</div>`;
                }

                logDiv.innerHTML = html;
                container.appendChild(logDiv);
            });

            container.scrollTop = 0;
        })
        .catch(err => {
            container.innerHTML = `<div class="error-msg">${t('common.error')} ${escapeHtml(err.message)}</div>`;
        });
}

// ============ LOGS AND HISTORY ============
function loadLogsAndHistory() {
    loadJobHistory();
    loadJobLogs();
}

function loadJobHistory() {
    fetch('/api/job-history')
        .then(res => res.json())
        .then(history => {
            const container = document.getElementById('history-summary');
            container.innerHTML = '<h4>' + t('sync.recent_history') + '</h4>';

            if (history.length === 0) {
                container.innerHTML += '<div class="no-data">' + t('sync.no_history') + '</div>';
                return;
            }

            history.slice(0, 10).forEach(item => {
                const duration = Math.round((new Date(item.endTime) - new Date(item.startTime)) / 1000);
                const durationStr = duration < 60 ? `${duration}s` : `${Math.floor(duration / 60)}m ${duration % 60}s`;

                const historyDiv = document.createElement('div');
                historyDiv.className = `history-item ${item.status}`;
                historyDiv.innerHTML = `
                    <div class="history-header">
                        <strong>${escapeHtml(item.jobName)}</strong>
                        <span class="history-status ${item.status}">${item.status}</span>
                    </div>
                    <div class="history-stats">
                        <span>✅ ${item.copiedFiles || 0}</span>
                        <span>⏭️ ${item.skippedFiles || 0}</span>
                        <span>❌ ${item.failedFiles || 0}</span>
                        <span>📦 ${formatFileSize(item.copiedSize || 0)}</span>
                    </div>
                    <div class="history-time">🕐 ${new Date(item.startTime).toLocaleTimeString()} (${durationStr})</div>
                    ${item.errors && item.errors.length > 0 ? `<div class="history-errors">⚠️ ${item.errors.length} error(s) - <button class="view-errors-btn" onclick="viewJobLogs('${item.jobId}', '${escapeHtml(item.jobName)}')">${t('sync.logs')}</button></div>` : ''}
                `;
                container.appendChild(historyDiv);
            });
        });
}

function loadJobLogs() {
    fetch('/api/job-logs')
        .then(res => res.json())
        .then(logs => {
            const container = document.getElementById('logs-list');
            container.innerHTML = '<h4>' + t('sync.recent_logs') + '</h4>';

            if (logs.length === 0) {
                container.innerHTML += '<div class="no-data">' + t('sync.no_logs') + '</div>';
                return;
            }

            logs.slice(0, 50).forEach(log => {
                const logDiv = document.createElement('div');
                logDiv.className = `log-entry ${log.level}`;
                logDiv.innerHTML = `
                    <div class="log-header">
                        <span class="log-time">${new Date(log.timestamp).toLocaleTimeString()}</span>
                        <span class="log-level ${log.level}">${log.level}</span>
                        <span class="log-job">${escapeHtml(log.jobName)}</span>
                    </div>
                    <div class="log-message">${escapeHtml(log.message)}</div>
                    ${log.filePath ? `<div class="log-path">📄 ${escapeHtml(log.filePath.split('/').pop())}</div>` : ''}
                    ${log.error ? `<div class="log-error">❌ ${escapeHtml(log.error)}</div>` : ''}
                `;
                container.appendChild(logDiv);
            });
        });
}

function refreshLogs() {
    loadLogsAndHistory();
}

function clearLogs() {
    if (confirm(t('sync.clear_logs_confirm'))) {
        fetch('/api/clear-logs', { method: 'POST' }).then(() => loadJobLogs());
    }
}

function clearHistory() {
    if (confirm(t('sync.clear_history_confirm'))) {
        fetch('/api/clear-history', { method: 'POST' }).then(() => loadJobHistory());
    }
}

// ============ SEARCH AND DUPLICATES ============
function performSearch() {
    const filters = {
        name: document.getElementById('search-name').value,
        minSize: parseInt(document.getElementById('min-size').value) || 0,
        maxSize: parseInt(document.getElementById('max-size').value) || 0,
        extensions: document.getElementById('extensions').value.split(',').map(e => e.trim()).filter(e => e),
        modifiedAfter: document.getElementById('modified-after').value,
        modifiedBefore: document.getElementById('modified-before').value,
        caseSensitive: document.getElementById('case-sensitive').checked
    };

    const path = document.getElementById('search-path').value;
    if (!path) {
        alert(t('search.enter_path'));
        return;
    }

    fetch(`/api/search?path=${encodeURIComponent(path)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(filters)
    }).then(res => res.json())
      .then(results => {
          const container = document.getElementById('search-results');
          container.innerHTML = `<h4>🔍 ${t('search.found')} ${results.length} ${t('search.files')}</h4>`;

          if (results.length === 0) {
              container.innerHTML += '<p>' + t('search.no_match') + '</p>';
              return;
          }

          results.forEach(file => {
              const resultDiv = document.createElement('div');
              resultDiv.className = 'search-result-item';
              resultDiv.onclick = () => showPreview(file.path);
              resultDiv.innerHTML = `
                  <div class="search-result-icon">${getFileIcon(file.name)}</div>
                  <div class="search-result-info">
                      <div class="search-result-name">${escapeHtml(file.name)}</div>
                      <div class="search-result-path">${escapeHtml(file.relative || file.path)}</div>
                  </div>
                  <div class="search-result-meta">
                      <div>${formatFileSize(file.size)}</div>
                      <div>${file.modTime}</div>
                  </div>
              `;
              container.appendChild(resultDiv);
          });
      });
}

function scanDuplicates() {
    const path = document.getElementById('scan-path').value;
    if (!path) {
        alert(t('duplicates.enter_scan_path'));
        return;
    }

    fetch(`/api/duplicates?path=${encodeURIComponent(path)}`)
        .then(res => res.json())
        .then(duplicates => {
            const container = document.getElementById('duplicates-result');
            container.innerHTML = '';

            if (duplicates.length === 0) {
                container.innerHTML = '<p>✅ ' + t('duplicates.none') + '</p>';
                return;
            }

            duplicates.forEach((group, idx) => {
                const groupDiv = document.createElement('div');
                groupDiv.className = 'duplicate-group';
                groupDiv.innerHTML = `
                    <h4>📊 ${t('duplicates.group')} ${idx + 1} (${formatFileSize(group.size)})</h4>
                    <div class="duplicate-files" id="group-${idx}"></div>
                    <button onclick="selectGroup(${idx})">✓ ${t('duplicates.select_all')}</button>
                    <button onclick="selectAllExceptOne(${idx})">✓ ${t('duplicates.select_except')}</button>
                `;

                const filesDiv = groupDiv.querySelector(`.duplicate-files`);
                group.files.forEach((file) => {
                    const fileDiv = document.createElement('div');
                    fileDiv.className = 'duplicate-file-item';
                    fileDiv.innerHTML = `
                        <input type="checkbox" class="dup-checkbox" data-path="${file.path}">
                        <span>📄 ${escapeHtml(file.relative || file.name)}</span>
                        <span style="margin-left: auto; font-size: 12px;">${formatFileSize(file.size)}</span>
                    `;
                    filesDiv.appendChild(fileDiv);
                });
                container.appendChild(groupDiv);
            });
        });
}

function selectGroup(groupIdx) {
    const checkboxes = document.querySelectorAll(`#group-${groupIdx} .dup-checkbox`);
    const allChecked = Array.from(checkboxes).every(cb => cb.checked);
    checkboxes.forEach(cb => cb.checked = !allChecked);
}

function selectAllExceptOne(groupIdx) {
    const checkboxes = document.querySelectorAll(`#group-${groupIdx} .dup-checkbox`);
    checkboxes.forEach((cb, idx) => {
        cb.checked = idx !== 0;
    });
}

function deleteSelectedDuplicates() {
    const selected = Array.from(document.querySelectorAll('.dup-checkbox:checked'))
        .map(cb => cb.getAttribute('data-path'));

    if (selected.length === 0 || !confirm(t('duplicates.delete_confirm') + ' ' + selected.length + ' ' + t('duplicates.delete_confirm_files'))) return;

    fetch('/api/duplicates/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: selected })
    }).then(() => scanDuplicates());
}

function moveSelectedDuplicates() {
    const selected = Array.from(document.querySelectorAll('.dup-checkbox:checked'))
        .map(cb => cb.getAttribute('data-path'));

    if (selected.length === 0) return;

    const dest = prompt(t('duplicates.enter_path'));
    if (!dest) return;

    fetch('/api/duplicates/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: selected, dest: dest })
    }).then(() => scanDuplicates());
}

// ============ PREVIEW ============
let currentPreviewPath = null;

function showPreview(path) {
    currentPreviewPath = path;
    const modal = document.getElementById('preview-modal');
    const previewContent = document.getElementById('preview-content');
    const commentSection = document.getElementById('preview-comment-section');
    const commentInput = document.getElementById('preview-comment');

    previewContent.innerHTML = '<div class="loading">' + t('preview.loading') + '</div>';
    commentSection.style.display = 'none';
    commentInput.value = '';
    modal.style.display = 'block';

    const ext = path.split('.').pop().toLowerCase();
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'];
    const videoExts = ['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv'];

    if (imageExts.includes(ext)) {
        previewContent.innerHTML = `<img src="/api/preview?path=${encodeURIComponent(path)}" alt="Preview">`;
    } else if (videoExts.includes(ext)) {
        previewContent.innerHTML = `<video controls autoplay><source src="/api/preview?path=${encodeURIComponent(path)}" type="video/${ext}"></video>`;
    } else {
        fetch(`/api/preview?path=${encodeURIComponent(path)}`)
            .then(res => res.text())
            .then(content => {
                previewContent.innerHTML = `<pre>${escapeHtml(content.substring(0, 10000))}${content.length > 10000 ? '\n\n... (truncated)' : ''}</pre>`;
            })
            .catch(err => {
                previewContent.innerHTML = `<div class="error-msg">${t('preview.error')} ${escapeHtml(err.message)}</div>`;
            });
    }

    if (imageExts.includes(ext) || videoExts.includes(ext)) {
        commentSection.style.display = 'block';
        loadMediaComment(path);
    }
}

function loadMediaComment(path) {
    fetch(`/api/media-comment?path=${encodeURIComponent(path)}`)
        .then(res => {
            if (res.status === 404) return '';
            return res.json().then(data => data.comment || '');
        })
        .then(comment => {
            document.getElementById('preview-comment').value = comment;
        })
        .catch(() => {
            document.getElementById('preview-comment').value = '';
        });
}

function saveMediaComment() {
    if (!currentPreviewPath) return;
    const comment = document.getElementById('preview-comment').value.trim();

    fetch('/api/media-comment', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: currentPreviewPath, comment: comment })
    })
        .then(res => res.json())
        .then(() => {
            const btn = document.querySelector('.comment-save-btn');
            btn.textContent = '✅ ' + t('preview.saved');
            setTimeout(() => { btn.textContent = '💾 ' + t('preview.save_comment'); }, 1500);
        })
        .catch(err => {
            alert(t('preview.comment_error') + ' ' + err.message);
        });
}

function closePreview() {
    document.getElementById('preview-modal').style.display = 'none';
    document.getElementById('preview-content').innerHTML = '';
    document.getElementById('preview-comment-section').style.display = 'none';
    document.getElementById('preview-comment').value = '';
    currentPreviewPath = null;
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ============ AUTH CHECK ON LOAD ============
async function initApp() {
    const savedLang = localStorage.getItem('language') || 'en';
    await loadTranslations(savedLang);

    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
        document.documentElement.setAttribute('data-theme', savedTheme);
    }
    const savedAccent = localStorage.getItem('accentColor');
    if (savedAccent) {
        setAccentColor(savedAccent);
    }

    fetch('/api/check-auth').then(res => {
        if (res.ok) {
            return res.json();
        }
        return null;
    }).then(data => {
        if (data) {
            document.getElementById('login-screen').style.display = 'none';
            document.getElementById('app').style.display = 'block';
            currentUser = { username: data.username, isAdmin: data.isAdmin, settings: data.settings };
            applyUserSettings(data.settings);
            loadSyncJobs();
            loadLogsAndHistory();
            initMapOnLoad();
        }
    });
}

// Close modals on outside click
window.onclick = function(event) {
    const folderModal = document.getElementById('folder-browser-modal');
    const previewModal = document.getElementById('preview-modal');
    const jobLogModal = document.getElementById('job-log-modal');
    if (event.target === folderModal) closeFolderBrowser();
    if (event.target === previewModal) closePreview();
    if (event.target === jobLogModal) closeJobLogModal();
};

// Enter key support for login
document.addEventListener('DOMContentLoaded', function() {
    const passwordEl = document.getElementById('password');
    if (passwordEl) {
        passwordEl.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                login();
            }
        });
    }
    const usernameEl = document.getElementById('username');
    if (usernameEl) {
        usernameEl.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                document.getElementById('password').focus();
            }
        });
    }
});

// ============ SORTING ============
function createSortJob() {
    const name = document.getElementById('sort-job-name').value;
    const sourcePath = document.getElementById('sort-source').value;
    const sortType = document.getElementById('sort-type').value;

    if (!name || !sourcePath) {
        alert(t('sort.fill_all'));
        return;
    }

    if (!sourcePath.startsWith('/')) {
        alert(t('sync.absolute_path'));
        return;
    }

    const job = {
        name: name,
        sourcePath: sourcePath,
        sortType: sortType
    };

    fetch('/api/sort-jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(job)
    }).then(() => {
        loadSortJobs();
        document.getElementById('sort-job-name').value = '';
        document.getElementById('sort-source').value = '';
    });
}

function loadSortJobs() {
    fetch('/api/sort-jobs')
        .then(res => res.json())
        .then(jobs => {
            const container = document.getElementById('sort-jobs-list');
            container.innerHTML = '';

            jobs.forEach(job => {
                const jobDiv = document.createElement('div');
                jobDiv.className = `sort-job-item ${job.status}`;
                jobDiv.setAttribute('data-job-id', job.id);

                let progressHtml = '';
                if (job.status === 'running' || job.status === 'paused') {
                    progressHtml = `
                        <div class="job-progress">
                            <div class="progress-bar-small">
                                <div class="progress-fill-small" style="width: ${job.progress}%"></div>
                            </div>
                            <div class="progress-stats">
                                <span>${Math.round(job.progress)}%</span>
                                <span>(${job.processedFiles || 0}/${job.totalFiles || 0})</span>
                            </div>
                            ${job.currentFile ? `<div class="current-file">📄 ${escapeHtml(job.currentFile.split('/').pop())}</div>` : ''}
                        </div>
                    `;
                }

                const sortTypeLabel = job.sortType === 'date' ? '📅 ' + t('sort.date') : '📍 ' + t('sort.location');

                jobDiv.innerHTML = `
                    <h4>📊 ${escapeHtml(job.name)}</h4>
                    <div class="job-status ${job.status}">${t('sync.status')} ${job.status.toUpperCase()}</div>
                    <p>📁 ${t('sync.source')} ${escapeHtml(job.sourcePath)}</p>
                    <p>🔍 ${t('sort.sort_type')} ${sortTypeLabel}</p>
                    ${progressHtml}
                    <div class="job-controls">
                        <button class="control-btn start-btn" onclick="startSortJob('${job.id}')" ${job.status === 'running' ? 'disabled' : ''}>▶️ ${t('sync.start')}</button>
                        ${job.status === 'running' ? '<button class="control-btn pause-btn" onclick="controlSortJob(\'' + job.id + '\', \'pause\')">⏸️ ' + t('sync.pause') + '</button>' : ''}
                        ${job.status === 'paused' ? '<button class="control-btn resume-btn" onclick="controlSortJob(\'' + job.id + '\', \'resume\')">▶️ ' + t('sync.resume') + '</button>' : ''}
                        ${(job.status === 'running' || job.status === 'paused') ? '<button class="control-btn stop-btn" onclick="controlSortJob(\'' + job.id + '\', \'stop\')">⏹️ ' + t('sync.stop') + '</button>' : ''}
                        <button class="control-btn delete-btn" onclick="deleteSortJob('${job.id}')">🗑️ ${t('sync.delete')}</button>
                    </div>
                    ${job.startTime ? `<div class="job-time">🕐 ${t('sort.started')} ${new Date(job.startTime).toLocaleString()}</div>` : ''}
                    ${job.endTime && job.status === 'completed' ? `<div class="job-time">✅ ${t('sort.completed')} ${new Date(job.endTime).toLocaleString()}</div>` : ''}
                `;
                container.appendChild(jobDiv);
            });
        });
}

function startSortJob(jobId) {
    fetch('/api/sort/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId })
    }).then(() => {
        setTimeout(() => loadSortJobs(), 1000);
    });
}

function controlSortJob(jobId, action) {
    fetch('/api/sort/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, action })
    }).then(() => {
        setTimeout(() => loadSortJobs(), 500);
    });
}

function deleteSortJob(jobId) {
    if (!confirm(t('sort.confirm_delete'))) return;

    fetch('/api/sort-jobs', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: jobId })
    }).then(() => loadSortJobs());
}

// ============ LEAFLET MAP ============
let map = null;
let markerClusterGroup = null;
let allPhotos = [];

const PHOTO_ICON_SVG = `
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
        <rect x="1" y="1" width="30" height="22" rx="3" fill="#4285F4" stroke="#fff" stroke-width="1.5"/>
        <circle cx="11" cy="10" r="4" fill="#fff" opacity="0.9"/>
        <path d="M2 20 L10 14 L16 18 L22 8 L30 16 V23" fill="none" stroke="#fff" stroke-width="1.5" opacity="0.8"/>
    </svg>
`;

function createPhotoIcon() {
    return L.divIcon({
        html: PHOTO_ICON_SVG,
        className: 'photo-marker-icon',
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        popupAnchor: [0, -36]
    });
}

function loadPhotosOnMap() {
    const path = document.getElementById('map-source-path').value;
    if (!path) {
        alert(t('map.select_folder'));
        return;
    }

    if (!path.startsWith('/')) {
        alert(t('map.enter_absolute'));
        return;
    }

    document.getElementById('map-stats').innerHTML = '<span>' + t('map.loading_photos') + '</span>';

    fetch(`/api/geo-photos?path=${encodeURIComponent(path)}`)
        .then(res => res.json())
        .then(data => {
            displayPhotosOnMap(data);
        })
        .catch(err => {
            alert(t('map.error_loading') + ': ' + err.message);
            document.getElementById('map-stats').innerHTML = '<span>' + t('map.error_loading') + '</span>';
        });
}

// Path autocomplete for map input
let pathSuggestTimer = null;
let pathSuggestionIndex = -1;

function setupPathAutocomplete() {
    const input = document.getElementById('map-source-path');
    const suggestions = document.getElementById('map-path-suggestions');

    input.addEventListener('input', function() {
        clearTimeout(pathSuggestTimer);
        const value = input.value;
        if (!value) {
            suggestions.style.display = 'none';
            return;
        }
        const lastSlash = value.lastIndexOf('/');
        const dirPath = lastSlash >= 0 ? value.substring(0, lastSlash + 1) || '/' : '/';
        const partial = lastSlash >= 0 ? value.substring(lastSlash + 1) : value;

        pathSuggestTimer = setTimeout(() => {
            fetch(`/api/browse?path=${encodeURIComponent(dirPath)}`)
                .then(res => res.json())
                .then(data => {
                    const matches = data.files.filter(f => {
                        if (!partial) return true;
                        return f.name.toLowerCase().startsWith(partial.toLowerCase());
                    });
                    if (matches.length === 0) {
                        suggestions.style.display = 'none';
                        return;
                    }
                    pathSuggestionIndex = -1;
                    suggestions.innerHTML = matches.map((f, i) => {
                        const display = f.isDir ? f.name + '/' : f.name;
                        return `<div class="path-suggestion-item" data-index="${i}" data-path="${f.path}" data-is-dir="${f.isDir}">${escapeHTML(display)}<span class="path-suggestion-item-type">${f.isDir ? 'dir' : ''}</span></div>`;
                    }).join('');
                    suggestions.style.display = 'block';
                })
                .catch(() => {
                    suggestions.style.display = 'none';
                });
        }, 150);
    });

    input.addEventListener('keydown', function(e) {
        const items = suggestions.querySelectorAll('.path-suggestion-item');
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            pathSuggestionIndex = Math.min(pathSuggestionIndex + 1, items.length - 1);
            updateSuggestionHighlight(items);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            pathSuggestionIndex = Math.max(pathSuggestionIndex - 1, -1);
            updateSuggestionHighlight(items);
        } else if (e.key === 'Enter') {
            if (pathSuggestionIndex >= 0 && pathSuggestionIndex < items.length) {
                e.preventDefault();
                applySuggestion(items[pathSuggestionIndex]);
            }
        } else if (e.key === 'Escape') {
            suggestions.style.display = 'none';
        }
    });

    input.addEventListener('blur', function() {
        setTimeout(() => { suggestions.style.display = 'none'; }, 200);
    });

    suggestions.addEventListener('click', function(e) {
        const item = e.target.closest('.path-suggestion-item');
        if (item) {
            applySuggestion(item);
        }
    });
}

function updateSuggestionHighlight(items) {
    items.forEach((item, i) => {
        item.classList.toggle('active', i === pathSuggestionIndex);
    });
}

function applySuggestion(item) {
    const path = item.dataset.path;
    const isDir = item.dataset.isDir === 'true';
    const input = document.getElementById('map-source-path');
    input.value = isDir ? path + '/' : path;
    document.getElementById('map-path-suggestions').style.display = 'none';
    input.focus();
}

function displayPhotosOnMap(data) {
    allPhotos = data.photos;

    const withGPS = data.photos.filter(p => p.lat !== 0 && p.lon !== 0).length;

    const uniqueCoords = new Set(
        data.photos.filter(p => p.lat !== 0 && p.lon !== 0)
            .map(p => p.lat.toFixed(6) + ',' + p.lon.toFixed(6))
    );
    document.getElementById('map-stats').innerHTML = `
        <span>📸 <strong id="photo-count">${data.photos.length}</strong></span>
        <span>📍 <strong id="gps-count">${withGPS}</strong></span>
        <span>🌍 <strong id="location-count">${uniqueCoords.size}</strong></span>
    `;

    if (!map) {
        initLeafletMap(data.center.lat || 0, data.center.lng || 0, data.center.zoom || 2);
    } else {
        markerClusterGroup.clearLayers();
        if (data.center.lat && data.center.lng) {
            map.setView([data.center.lat, data.center.lng], data.center.zoom || 10);
        }
    }

    updateTimelineRange();
    applyTimelineFilter();
}

function initLeafletMap(lat, lng, zoom) {
    map = L.map('map', {
        center: [lat || 0, lng || 0],
        zoom: zoom || 2,
        zoomControl: true
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19
    }).addTo(map);

    markerClusterGroup = L.markerClusterGroup({
        maxClusterRadius: function(zoom) {
            return Math.max(20, 80 - zoom * 3);
        },
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        zoomToBoundsOnClick: true,
        iconCreateFunction: function(cluster) {
            const count = cluster.getChildCount();
            let className = 'marker-cluster marker-cluster-small';
            if (count >= 10 && count < 100) {
                className = 'marker-cluster marker-cluster-medium';
            } else if (count >= 100) {
                className = 'marker-cluster marker-cluster-large';
            }
            return L.divIcon({
                html: '<div><span>' + count + '</span></div>',
                className: className,
                iconSize: L.point(40, 40)
            });
        }
    });

    map.addLayer(markerClusterGroup);
    applyTimelineFilter();
}

function previewPhoto(path) {
    showPreview(decodeURIComponent(path));
}

// ============ TIMELINE FILTERING & IMPORT ============
let importedTrackPoints = [];
let timelinePolyline = null;
let timelinePolylineDim = null;
let timelineMinTime = 0;
let timelineMaxTime = 0;
let timelineInitialized = false;

function setupTimelineSlider() {
    const minInput = document.getElementById('timeline-min');
    const maxInput = document.getElementById('timeline-max');

    minInput.addEventListener('input', function() {
        let minVal = parseInt(minInput.value);
        let maxVal = parseInt(maxInput.value);
        if (minVal > maxVal - 10) {
            minVal = maxVal - 10;
            minInput.value = minVal;
        }
        updateTimelineFill();
        applyTimelineFilter();
    });

    maxInput.addEventListener('input', function() {
        let minVal = parseInt(minInput.value);
        let maxVal = parseInt(maxInput.value);
        if (maxVal < minVal + 10) {
            maxVal = minVal + 10;
            maxInput.value = maxVal;
        }
        updateTimelineFill();
        applyTimelineFilter();
    });

    timelineInitialized = true;
}

function updateTimelineFill() {
    const minInput = document.getElementById('timeline-min');
    const maxInput = document.getElementById('timeline-max');
    const fill = document.getElementById('timeline-fill');
    const minPct = (parseInt(minInput.value) / 1000) * 100;
    const maxPct = (parseInt(maxInput.value) / 1000) * 100;
    fill.style.left = minPct + '%';
    fill.style.width = (maxPct - minPct) + '%';
}

function getTimelineRange() {
    if (timelineMinTime === 0 && timelineMaxTime === 0) return null;
    const minInput = document.getElementById('timeline-min');
    const maxInput = document.getElementById('timeline-max');
    const minVal = parseInt(minInput.value);
    const maxVal = parseInt(maxInput.value);
    const range = timelineMaxTime - timelineMinTime;
    const startMs = timelineMinTime + (minVal / 1000) * range;
    const endMs = timelineMinTime + (maxVal / 1000) * range;
    return { start: startMs, end: endMs };
}

function updateTimelineRange() {
    const photosWithTime = allPhotos.filter(p => p.timestamp && p.lat !== 0 && p.lon !== 0);
    const photoTimes = photosWithTime.map(p => new Date(p.timestamp).getTime());
    const trackTimes = importedTrackPoints.map(p => p.timestamp);

    const allTimes = [...photoTimes, ...trackTimes];

    if (allTimes.length === 0) {
        timelineMinTime = 0;
        timelineMaxTime = 0;
        document.getElementById('timeline-min-label').textContent = '—';
        document.getElementById('timeline-max-label').textContent = '—';
        document.getElementById('timeline-hint').textContent =
            importedTrackPoints.length > 0
                ? t('timeline.hint_empty_track')
                : t('timeline.hint_empty');
        return;
    }

    timelineMinTime = Math.min(...allTimes);
    timelineMaxTime = Math.max(...allTimes);

    document.getElementById('timeline-min-label').textContent = new Date(timelineMinTime).toLocaleDateString();
    document.getElementById('timeline-max-label').textContent = new Date(timelineMaxTime).toLocaleDateString();

    const range = getTimelineRange();
    if (range) {
        const selStart = new Date(range.start).toLocaleDateString();
        const selEnd = new Date(range.end).toLocaleDateString();
        document.getElementById('timeline-hint').textContent =
            t('timeline.showing') + ` ${selStart} — ${selEnd}`;
    } else {
        document.getElementById('timeline-hint').textContent = t('timeline.hint_range');
    }
}

function applyTimelineFilter() {
    if (!markerClusterGroup) return;

    markerClusterGroup.clearLayers();

    const range = getTimelineRange();
    const photosWithGPS = allPhotos.filter(p => p.lat !== 0 && p.lon !== 0);

    const visiblePhotos = photosWithGPS.filter(photo => {
        if (!photo.timestamp) return true;
        if (!range) return true;
        const ts = new Date(photo.timestamp).getTime();
        return ts >= range.start && ts <= range.end;
    });

    addPhotosToCluster({ photos: visiblePhotos });

    const photoCountEl = document.getElementById('photo-count');
    if (photoCountEl) {
        photoCountEl.textContent = visiblePhotos.length;
    }

    updateTrackPolyline(range);

    if (range && timelineMinTime > 0) {
        const selStart = new Date(range.start).toLocaleDateString();
        const selEnd = new Date(range.end).toLocaleDateString();
        document.getElementById('timeline-hint').textContent =
            `${t('timeline.showing')} ${selStart} — ${selEnd} | ${visiblePhotos.length}`;
    }
}

function addPhotosToCluster(data) {
    const photosWithGPS = data.photos.filter(p => p.lat !== 0 && p.lon !== 0);

    photosWithGPS.forEach(photo => {
        const marker = L.marker([photo.lat, photo.lon], { icon: createPhotoIcon() });

        const popupContent = `
            <div style="max-width: 250px;">
                <strong>${escapeHTML(photo.name)}</strong><br>
                <span style="font-size: 11px; color: #666;">${photo.lat.toFixed(5)}, ${photo.lon.toFixed(5)}</span>
                ${photo.timestamp ? `<br><span style="font-size: 11px; color: #999;">${new Date(photo.timestamp).toLocaleString()}</span>` : ''}
                <div style="margin-top: 8px; border-radius: 4px; overflow: hidden; cursor: pointer;"
                     onclick="previewPhoto('${encodeURIComponent(photo.path)}')">
                    <img src="/api/preview?path=${encodeURIComponent(photo.path)}"
                         style="width: 100%; max-height: 150px; object-fit: cover;"
                         onerror="this.style.display='none'">
                </div>
            </div>
        `;

        marker.bindPopup(popupContent, { maxWidth: 280 });
        markerClusterGroup.addLayer(marker);
    });
}

function updateTrackPolyline(range) {
    if (timelinePolyline) {
        map.removeLayer(timelinePolyline);
        timelinePolyline = null;
    }
    if (timelinePolylineDim) {
        map.removeLayer(timelinePolylineDim);
        timelinePolylineDim = null;
    }

    if (importedTrackPoints.length === 0) return;

    const sorted = [...importedTrackPoints].sort((a, b) => a.timestamp - b.timestamp);
    const latlngs = sorted.map(p => [p.lat, p.lon]);

    if (range) {
        const inRangeLatLngs = [];
        const outRangeLatLngs = [];
        let currentInRange = [];
        let currentOutRange = [];

        for (let i = 0; i < sorted.length; i++) {
            const p = sorted[i];
            const inRange = p.timestamp >= range.start && p.timestamp <= range.end;
            const ll = [p.lat, p.lon];

            if (inRange) {
                if (currentOutRange.length > 0) {
                    currentOutRange.push(ll);
                    outRangeLatLngs.push(currentOutRange);
                    currentOutRange = [];
                }
                currentInRange.push(ll);
            } else {
                if (currentInRange.length > 0) {
                    currentInRange.push(ll);
                    inRangeLatLngs.push(currentInRange);
                    currentInRange = [];
                }
                currentOutRange.push(ll);
            }
        }

        if (currentInRange.length > 0) inRangeLatLngs.push(currentInRange);
        if (currentOutRange.length > 0) outRangeLatLngs.push(currentOutRange);

        if (outRangeLatLngs.length > 0) {
            outRangeLatLngs.forEach(seg => {
                if (seg.length >= 2) {
                    const line = L.polyline(seg, {
                        color: '#aaa',
                        weight: 3,
                        opacity: 0.3,
                        lineCap: 'round'
                    });
                    if (!timelinePolylineDim) timelinePolylineDim = L.layerGroup();
                    timelinePolylineDim.addLayer(line);
                }
            });
            if (timelinePolylineDim) {
                timelinePolylineDim.addTo(map);
            }
        }

        if (inRangeLatLngs.length > 0) {
            inRangeLatLngs.forEach(seg => {
                if (seg.length >= 2) {
                    const line = L.polyline(seg, {
                        color: '#4285F4',
                        weight: 5,
                        opacity: 0.8,
                        lineCap: 'round'
                    });
                    if (!timelinePolyline) timelinePolyline = L.layerGroup();
                    timelinePolyline.addLayer(line);
                }
            });
            if (timelinePolyline) {
                timelinePolyline.addTo(map);
            }
        }
    } else {
        if (latlngs.length >= 2) {
            timelinePolyline = L.polyline(latlngs, {
                color: '#4285F4',
                weight: 5,
                opacity: 0.8,
                lineCap: 'round'
            }).addTo(map);
        }
    }
}

function importTimeline() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.kml,.json,.xml';
    input.multiple = true;
    input.style.display = 'none';
    document.body.appendChild(input);

    input.addEventListener('change', function(e) {
        const files = Array.from(e.target.files);
        if (files.length === 0) {
            document.body.removeChild(input);
            return;
        }

        document.getElementById('timeline-hint').innerHTML = `${t('timeline.importing')} ${files.length} ${t('timeline.file')}...`;

        const promises = files.map(file => {
            const formData = new FormData();
            formData.append('file', file);
            return fetch('/api/timeline/import', {
                method: 'POST',
                body: formData
            }).then(res => {
                if (!res.ok) return res.text().then(t => { throw new Error(file.name + ': ' + t); });
                return res.json();
            });
        });

        Promise.all(promises)
            .then(results => {
                const newPoints = [];
                results.forEach(data => {
                    data.points.forEach(p => {
                        newPoints.push({
                            timestamp: new Date(p.timestamp).getTime(),
                            lat: p.lat,
                            lon: p.lon
                        });
                    });
                });

                importedTrackPoints = importedTrackPoints.concat(newPoints);

                document.getElementById('timeline-clear-btn').style.display = 'inline-block';
                document.getElementById('timeline-export-kml-btn').style.display = 'inline-block';
                document.getElementById('timeline-export-json-btn').style.display = 'inline-block';
                document.getElementById('timeline-hint').innerHTML =
                    `${t('timeline.imported')} ${newPoints.length} ${t('timeline.new_track_points')} ${files.length} ${t('timeline.file')}. ` +
                    `${t('timeline.total')} ${importedTrackPoints.length} ${t('timeline.points')}`;

                updateTimelineRange();
                applyTimelineFilter();

                if (map && importedTrackPoints.length > 0) {
                    const bounds = L.latLngBounds(importedTrackPoints.map(p => [p.lat, p.lon]));
                    const photosWithGPS = allPhotos.filter(p => p.lat !== 0 && p.lon !== 0);
                    photosWithGPS.forEach(p => bounds.extend([p.lat, p.lon]));
                    map.fitBounds(bounds, { padding: [40, 40] });
                }
            })
            .catch(err => {
                document.getElementById('timeline-hint').innerHTML = t('timeline.import_error') + ' ' + escapeHtml(err.message);
                alert(t('timeline.import_failed') + ' ' + err.message);
            })
            .finally(() => {
                document.body.removeChild(input);
            });
    });

    input.click();
}

function exportTimeline(format) {
    if (importedTrackPoints.length === 0) {
        alert(t('timeline.no_data'));
        return;
    }

    const sorted = [...importedTrackPoints].sort((a, b) => a.timestamp - b.timestamp);
    let content, filename, mime;

    if (format === 'kml') {
        content = generateKML(sorted);
        filename = 'timeline_export.kml';
        mime = 'application/vnd.google-earth.kml+xml';
    } else {
        content = generateJSON(sorted);
        filename = 'timeline_export.json';
        mime = 'application/json';
    }

    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function generateKML(points) {
    let kml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    kml += '<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2">\n';
    kml += '  <Document>\n';
    kml += '    <name>PicSync Timeline Export</name>\n';
    kml += '    <Placemark>\n';
    kml += '      <gx:Track>\n';

    points.forEach(p => {
        kml += `        <when>${new Date(p.timestamp).toISOString()}</when>\n`;
    });
    points.forEach(p => {
        kml += `        <gx:coord>${p.lon} ${p.lat}</gx:coord>\n`;
    });

    kml += '      </gx:Track>\n';
    kml += '    </Placemark>\n';
    kml += '  </Document>\n';
    kml += '</kml>\n';

    return kml;
}

function generateJSON(points) {
    const segments = [];
    let currentSegment = null;
    let lastTime = null;
    const MAX_GAP_MS = 10 * 60 * 1000;

    points.forEach(p => {
        const ts = new Date(p.timestamp).toISOString();
        if (lastTime && (p.timestamp - lastTime) > MAX_GAP_MS) {
            if (currentSegment) segments.push(currentSegment);
            currentSegment = null;
        }

        if (!currentSegment) {
            currentSegment = {
                startTime: ts,
                endTime: ts,
                timelinePath: []
            };
        }

        currentSegment.timelinePath.push({
            point: `${p.lat}°, ${p.lon}°`,
            time: ts
        });
        currentSegment.endTime = ts;
        lastTime = p.timestamp;
    });

    if (currentSegment) segments.push(currentSegment);

    return JSON.stringify({ semanticSegments: segments }, null, 2);
}

function showExportInstructions() {
    document.getElementById('timeline-export-instructions').style.display = 'block';
}

function hideExportInstructions() {
    document.getElementById('timeline-export-instructions').style.display = 'none';
}

function clearImportedTimeline() {
    importedTrackPoints = [];
    if (timelinePolyline) {
        map.removeLayer(timelinePolyline);
        timelinePolyline = null;
    }
    if (timelinePolylineDim) {
        map.removeLayer(timelinePolylineDim);
        timelinePolylineDim = null;
    }
    document.getElementById('timeline-clear-btn').style.display = 'none';
    document.getElementById('timeline-export-kml-btn').style.display = 'none';
    document.getElementById('timeline-export-json-btn').style.display = 'none';
    updateTimelineRange();
    applyTimelineFilter();
}

// ============ INITIALIZATION ============
setupPathAutocomplete();
setupTimelineSlider();
initApp();
