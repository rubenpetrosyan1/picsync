package main

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/rwcarlsen/goexif/exif"
	"github.com/rwcarlsen/goexif/mknote"
	"golang.org/x/crypto/bcrypt"
)

type User struct {
	Username     string `json:"username"`
	PasswordHash string `json:"passwordHash"`
}

type Session struct {
	ID        string
	Username  string
	ExpiresAt time.Time
}

type FileInfo struct {
	Name     string `json:"name"`
	Path     string `json:"path"`
	IsDir    bool   `json:"isDir"`
	Size     int64  `json:"size"`
	ModTime  string `json:"modTime"`
	Relative string `json:"relative,omitempty"`
	Ext      string `json:"ext,omitempty"`
}

type SyncJob struct {
	ID              string    `json:"id"`
	Name            string    `json:"name"`
	SourcePath      string    `json:"sourcePath"`
	DestPath        string    `json:"destPath"`
	Permanent       bool      `json:"permanent"`
	ConflictRule    string    `json:"conflictRule"`
	IncludePatterns []string  `json:"includePatterns"`
	ExcludePatterns []string  `json:"excludePatterns"`
	Status          string    `json:"status"`
	Progress        float64   `json:"progress"`
	TotalFiles      int       `json:"totalFiles"`
	ProcessedFiles  int       `json:"processedFiles"`
	CurrentFile     string    `json:"currentFile"`
	LastRunTime     time.Time `json:"lastRunTime"`
	ResumePoint     string    `json:"resumePoint"`
}

type SortJob struct {
	ID             string    `json:"id"`
	Name           string    `json:"name"`
	SourcePath     string    `json:"sourcePath"`
	SortType       string    `json:"sortType"`
	Status         string    `json:"status"`
	Progress       float64   `json:"progress"`
	TotalFiles     int       `json:"totalFiles"`
	ProcessedFiles int       `json:"processedFiles"`
	CurrentFile    string    `json:"currentFile"`
	StartTime      time.Time `json:"startTime"`
	EndTime        time.Time `json:"endTime"`
}

type DuplicateFile struct {
	Hash  string     `json:"hash"`
	Size  int64      `json:"size"`
	Files []FileInfo `json:"files"`
}

type SearchFilters struct {
	Name           string   `json:"name"`
	MinSize        int64    `json:"minSize"`
	MaxSize        int64    `json:"maxSize"`
	Extensions     []string `json:"extensions"`
	ModifiedAfter  string   `json:"modifiedAfter"`
	ModifiedBefore string   `json:"modifiedBefore"`
	CaseSensitive  bool     `json:"caseSensitive"`
}

type JobLog struct {
	ID         string    `json:"id"`
	JobID      string    `json:"jobId"`
	JobName    string    `json:"jobName"`
	Timestamp  time.Time `json:"timestamp"`
	Level      string    `json:"level"`
	Message    string    `json:"message"`
	FilePath   string    `json:"filePath,omitempty"`
	DestPath   string    `json:"destPath,omitempty"`
	Error      string    `json:"error,omitempty"`
	SourcePath string    `json:"sourcePath,omitempty"`
}

type JobHistory struct {
	JobID        string    `json:"jobId"`
	JobName      string    `json:"jobName"`
	SourcePath   string    `json:"sourcePath"`
	DestPath     string    `json:"destPath"`
	StartTime    time.Time `json:"startTime"`
	EndTime      time.Time `json:"endTime"`
	Status       string    `json:"status"`
	TotalFiles   int       `json:"totalFiles"`
	CopiedFiles  int       `json:"copiedFiles"`
	SkippedFiles int       `json:"skippedFiles"`
	FailedFiles  int       `json:"failedFiles"`
	TotalSize    int64     `json:"totalSize"`
	CopiedSize   int64     `json:"copiedSize"`
	Errors       []string  `json:"errors"`
	LogFile      string    `json:"logFile"`
}

type GeoPhoto struct {
	Path    string  `json:"path"`
	Name    string  `json:"name"`
	Lat     float64 `json:"lat"`
	Lon     float64 `json:"lon"`
	Country string  `json:"country"`
	City    string  `json:"city"`
}

type GeoPhotosResponse struct {
	Photos []GeoPhoto `json:"photos"`
	Center struct {
		Lat  float64 `json:"lat"`
		Lng  float64 `json:"lng"`
		Zoom int     `json:"zoom"`
	} `json:"center"`
}

type JobController struct {
	CancelChan chan bool
	PauseChan  chan bool
	ResumeChan chan bool
	IsPaused   bool
	mu         sync.RWMutex
}

var (
	users           = make(map[string]User)
	sessions        = make(map[string]Session)
	syncJobs        = make(map[string]*SyncJob)
	sortJobs        = make(map[string]*SortJob)
	jobControllers  = make(map[string]*JobController)
	sortControllers = make(map[string]*JobController)
	jobLogs         = make([]JobLog, 0)
	jobHistories    = make([]JobHistory, 0)
	mu              sync.RWMutex
	sessionMu       sync.RWMutex
	logMu           sync.RWMutex
	dataDir         = "./data"
	staticDir       = "./static"
	logsDir         = "./data/logs"
	workerCount     = runtime.NumCPU() * 2
	logFile         = filepath.Join(dataDir, "job_logs.json")
	historyFile     = filepath.Join(dataDir, "job_history.json")
)

func main() {
	os.MkdirAll(dataDir, 0755)
	os.MkdirAll(staticDir, 0755)
	os.MkdirAll(logsDir, 0755)

	loadUsers()
	loadSyncJobs()
	loadJobLogs()
	loadJobHistory()

	if len(users) == 0 {
		hash, _ := bcrypt.GenerateFromPassword([]byte("admin123"), bcrypt.DefaultCost)
		users["admin"] = User{Username: "admin", PasswordHash: string(hash)}
		saveUsers()
	}

	go recoverInterruptedJobs()

	http.HandleFunc("/", handleIndex)
	http.HandleFunc("/api/login", handleLogin)
	http.HandleFunc("/api/logout", handleLogout)
	http.HandleFunc("/api/check-auth", handleCheckAuth)
	http.HandleFunc("/api/browse", handleBrowse)
	http.HandleFunc("/api/copy", handleCopy)
	http.HandleFunc("/api/move", handleMove)
	http.HandleFunc("/api/delete", handleDelete)
	http.HandleFunc("/api/create-folder", handleCreateFolder)
	http.HandleFunc("/api/sync-jobs", handleSyncJobs)
	http.HandleFunc("/api/sync", handleSync)
	http.HandleFunc("/api/sync/control", handleSyncControl)
	http.HandleFunc("/api/sync/logs", handleJobLogsForJob)
	http.HandleFunc("/api/duplicates", handleDuplicates)
	http.HandleFunc("/api/duplicates/delete", handleDuplicateDelete)
	http.HandleFunc("/api/duplicates/move", handleDuplicateMove)
	http.HandleFunc("/api/search", handleSearch)
	http.HandleFunc("/api/preview", handlePreview)
	http.HandleFunc("/api/job-logs", handleJobLogs)
	http.HandleFunc("/api/job-history", handleJobHistory)
	http.HandleFunc("/api/clear-logs", handleClearLogs)
	http.HandleFunc("/api/clear-history", handleClearHistory)
	http.HandleFunc("/api/geo-photos", handleGeoPhotos)
	http.HandleFunc("/api/sort-jobs", handleSortJobs)
	http.HandleFunc("/api/sort/start", handleSortStart)
	http.HandleFunc("/api/sort/control", handleSortControl)
	http.HandleFunc("/static/", serveStatic)

	log.Println("Server starting on http://localhost:8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}

func serveStatic(w http.ResponseWriter, r *http.Request) {
	if strings.HasSuffix(r.URL.Path, ".css") {
		w.Header().Set("Content-Type", "text/css")
	}
	if strings.HasSuffix(r.URL.Path, ".js") {
		w.Header().Set("Content-Type", "application/javascript")
	}
	http.StripPrefix("/static/", http.FileServer(http.Dir(staticDir))).ServeHTTP(w, r)
}

// ============ LOGGING FUNCTIONS ============

func addJobLog(jobID, jobName, level, message, filePath, errorMsg string) {
	addJobLogWithPaths(jobID, jobName, level, message, filePath, "", errorMsg)
}

func addJobLogWithPaths(jobID, jobName, level, message, filePath, destPath, errorMsg string) {
	jobLogEntry := JobLog{
		ID:         uuid.New().String(),
		JobID:      jobID,
		JobName:    jobName,
		Timestamp:  time.Now(),
		Level:      level,
		Message:    message,
		FilePath:   filePath,
		DestPath:   destPath,
		Error:      errorMsg,
		SourcePath: filePath,
	}

	logMu.Lock()
	jobLogs = append([]JobLog{jobLogEntry}, jobLogs...)
	if len(jobLogs) > 1000 {
		jobLogs = jobLogs[:1000]
	}
	logMu.Unlock()

	jobLogFilePath := filepath.Join(logsDir, jobID+".json")
	var jobSpecificLogs []JobLog
	if file, err := os.Open(jobLogFilePath); err == nil {
		json.NewDecoder(file).Decode(&jobSpecificLogs)
		file.Close()
	}
	jobSpecificLogs = append([]JobLog{jobLogEntry}, jobSpecificLogs...)
	if len(jobSpecificLogs) > 500 {
		jobSpecificLogs = jobSpecificLogs[:500]
	}
	if file, err := os.Create(jobLogFilePath); err == nil {
		json.NewEncoder(file).Encode(jobSpecificLogs)
		file.Close()
	}

	saveJobLogs()
	log.Printf("[%s] Job %s: %s", level, jobName, message)
	if errorMsg != "" {
		log.Printf("  Error: %s", errorMsg)
	}
}

func saveJobLogs() {
	logMu.RLock()
	logsCopy := make([]JobLog, len(jobLogs))
	copy(logsCopy, jobLogs)
	logMu.RUnlock()

	file, err := os.Create(logFile)
	if err != nil {
		log.Printf("Error saving job logs: %v", err)
		return
	}
	defer file.Close()
	json.NewEncoder(file).Encode(logsCopy)
}

func loadJobLogs() {
	file, err := os.Open(logFile)
	if err != nil {
		return
	}
	defer file.Close()
	json.NewDecoder(file).Decode(&jobLogs)
}

func saveJobHistory() {
	logMu.RLock()
	historyCopy := make([]JobHistory, len(jobHistories))
	copy(historyCopy, jobHistories)
	logMu.RUnlock()

	file, err := os.Create(historyFile)
	if err != nil {
		log.Printf("Error saving job history: %v", err)
		return
	}
	defer file.Close()
	json.NewEncoder(file).Encode(historyCopy)
}

func loadJobHistory() {
	file, err := os.Open(historyFile)
	if err != nil {
		return
	}
	defer file.Close()
	json.NewDecoder(file).Decode(&jobHistories)
}

// ============ AUTH FUNCTIONS ============

func loadUsers() {
	file, err := os.Open(filepath.Join(dataDir, "users.json"))
	if err != nil {
		return
	}
	defer file.Close()
	json.NewDecoder(file).Decode(&users)
}

func saveUsers() {
	file, err := os.Create(filepath.Join(dataDir, "users.json"))
	if err != nil {
		log.Printf("Error saving users: %v", err)
		return
	}
	defer file.Close()
	json.NewEncoder(file).Encode(users)
}

func getUserFromSession(r *http.Request) string {
	cookie, err := r.Cookie("session_id")
	if err != nil {
		return ""
	}
	sessionMu.RLock()
	session, exists := sessions[cookie.Value]
	sessionMu.RUnlock()
	if !exists || session.ExpiresAt.Before(time.Now()) {
		return ""
	}
	return session.Username
}

func handleIndex(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}
	http.ServeFile(w, r, filepath.Join(staticDir, "index.html"))
}

func handleLogin(w http.ResponseWriter, r *http.Request) {
	var creds struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	json.NewDecoder(r.Body).Decode(&creds)

	mu.RLock()
	user, exists := users[creds.Username]
	mu.RUnlock()

	if !exists || bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(creds.Password)) != nil {
		http.Error(w, "Invalid credentials", 401)
		return
	}

	sessionID := uuid.New().String()
	sessionMu.Lock()
	sessions[sessionID] = Session{
		ID:        sessionID,
		Username:  creds.Username,
		ExpiresAt: time.Now().Add(24 * time.Hour),
	}
	sessionMu.Unlock()

	http.SetCookie(w, &http.Cookie{
		Name:    "session_id",
		Value:   sessionID,
		Expires: time.Now().Add(24 * time.Hour),
	})
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func handleLogout(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie("session_id")
	if err == nil {
		sessionMu.Lock()
		delete(sessions, cookie.Value)
		sessionMu.Unlock()
		http.SetCookie(w, &http.Cookie{
			Name:    "session_id",
			Value:   "",
			Expires: time.Now().Add(-1 * time.Hour),
		})
	}
	w.WriteHeader(200)
}

func handleCheckAuth(w http.ResponseWriter, r *http.Request) {
	if getUserFromSession(r) == "" {
		http.Error(w, "Unauthorized", 401)
		return
	}
	w.WriteHeader(200)
}

// ============ FILE BROWSING FUNCTIONS ============

func handleBrowse(w http.ResponseWriter, r *http.Request) {
	if getUserFromSession(r) == "" {
		http.Error(w, "Unauthorized", 401)
		return
	}

	path := r.URL.Query().Get("path")
	if path == "" {
		path = "/"
	}

	entries, err := os.ReadDir(path)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}

	var files []FileInfo
	for _, entry := range entries {
		info, _ := entry.Info()
		ext := ""
		if !entry.IsDir() {
			ext = strings.ToLower(filepath.Ext(entry.Name()))
		}
		files = append(files, FileInfo{
			Name:  entry.Name(),
			Path:  filepath.Join(path, entry.Name()),
			IsDir: entry.IsDir(),
			Size: func() int64 {
				if info != nil {
					return info.Size()
				}
				return 0
			}(),
			ModTime: func() string {
				if info != nil {
					return info.ModTime().Format("2006-01-02 15:04:05")
				}
				return ""
			}(),
			Ext: ext,
		})
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"currentPath": path,
		"files":       files,
		"parentPath":  filepath.Dir(path),
	})
}

func handleCopy(w http.ResponseWriter, r *http.Request) {
	if getUserFromSession(r) == "" {
		http.Error(w, "Unauthorized", 401)
		return
	}

	var req struct {
		Source string `json:"source"`
		Dest   string `json:"dest"`
	}
	json.NewDecoder(r.Body).Decode(&req)

	err := copyFileOrDir(req.Source, req.Dest)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	w.WriteHeader(200)
}

func copyFileOrDir(src, dest string) error {
	srcInfo, err := os.Stat(src)
	if err != nil {
		return err
	}

	if srcInfo.IsDir() {
		os.MkdirAll(dest, srcInfo.Mode())
		entries, _ := os.ReadDir(src)
		for _, entry := range entries {
			copyFileOrDir(filepath.Join(src, entry.Name()), filepath.Join(dest, entry.Name()))
		}
		return nil
	}
	return copyFile(src, dest)
}

func copyFile(src, dst string) error {
	if err := os.MkdirAll(filepath.Dir(dst), 0755); err != nil {
		return err
	}

	srcFile, err := os.Open(src)
	if err != nil {
		return err
	}
	defer srcFile.Close()

	dstFile, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer dstFile.Close()

	_, err = io.Copy(dstFile, srcFile)
	return err
}

func handleMove(w http.ResponseWriter, r *http.Request) {
	if getUserFromSession(r) == "" {
		http.Error(w, "Unauthorized", 401)
		return
	}

	var req struct {
		Source string `json:"source"`
		Dest   string `json:"dest"`
	}
	json.NewDecoder(r.Body).Decode(&req)

	destPath := filepath.Join(req.Dest, filepath.Base(req.Source))
	err := os.Rename(req.Source, destPath)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	w.WriteHeader(200)
}

func handleDelete(w http.ResponseWriter, r *http.Request) {
	if getUserFromSession(r) == "" {
		http.Error(w, "Unauthorized", 401)
		return
	}

	var req struct {
		Path string `json:"path"`
	}
	json.NewDecoder(r.Body).Decode(&req)

	err := os.RemoveAll(req.Path)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	w.WriteHeader(200)
}

func handleCreateFolder(w http.ResponseWriter, r *http.Request) {
	if getUserFromSession(r) == "" {
		http.Error(w, "Unauthorized", 401)
		return
	}

	var req struct {
		ParentPath string `json:"parentPath"`
		FolderName string `json:"folderName"`
	}
	json.NewDecoder(r.Body).Decode(&req)

	newPath := filepath.Join(req.ParentPath, req.FolderName)
	err := os.MkdirAll(newPath, 0755)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	w.WriteHeader(200)
}

// ============ SYNC JOB FUNCTIONS ============

func loadSyncJobs() {
	jobFile := filepath.Join(dataDir, "sync_jobs.json")
	file, err := os.Open(jobFile)
	if err != nil {
		return
	}
	defer file.Close()
	json.NewDecoder(file).Decode(&syncJobs)
}

func saveSyncJobs() {
	mu.RLock()
	jobsCopy := make(map[string]*SyncJob)
	for id, job := range syncJobs {
		jobCopy := *job
		jobsCopy[id] = &jobCopy
	}
	mu.RUnlock()

	jobFile := filepath.Join(dataDir, "sync_jobs.json")
	file, err := os.Create(jobFile)
	if err != nil {
		log.Printf("Error saving sync jobs: %v", err)
		return
	}
	defer file.Close()
	json.NewEncoder(file).Encode(jobsCopy)
}

func recoverInterruptedJobs() {
	time.Sleep(2 * time.Second)
	mu.RLock()
	var jobsToRecover []*SyncJob
	for _, job := range syncJobs {
		if job.Status == "stopped" && job.ResumePoint != "" {
			jobsToRecover = append(jobsToRecover, job)
		}
	}
	mu.RUnlock()
	for _, job := range jobsToRecover {
		log.Printf("Recovering interrupted job: %s", job.Name)
		go executeSyncJob(job.ID, true)
	}
}

func handleSyncJobs(w http.ResponseWriter, r *http.Request) {
	if getUserFromSession(r) == "" {
		http.Error(w, "Unauthorized", 401)
		return
	}

	switch r.Method {
	case "GET":
		mu.RLock()
		jobs := make([]*SyncJob, 0, len(syncJobs))
		for _, job := range syncJobs {
			jobs = append(jobs, job)
		}
		mu.RUnlock()
		json.NewEncoder(w).Encode(jobs)

	case "POST":
		var newJob SyncJob
		json.NewDecoder(r.Body).Decode(&newJob)
		newJob.ID = uuid.New().String()
		newJob.Status = "pending"

		mu.Lock()
		syncJobs[newJob.ID] = &newJob
		mu.Unlock()
		saveSyncJobs()
		json.NewEncoder(w).Encode(newJob)

	case "DELETE":
		var req struct{ ID string }
		json.NewDecoder(r.Body).Decode(&req)
		if controller, exists := jobControllers[req.ID]; exists {
			controller.CancelChan <- true
			delete(jobControllers, req.ID)
		}
		mu.Lock()
		delete(syncJobs, req.ID)
		mu.Unlock()
		saveSyncJobs()
		w.WriteHeader(200)
	}
}

func handleSync(w http.ResponseWriter, r *http.Request) {
	if getUserFromSession(r) == "" {
		http.Error(w, "Unauthorized", 401)
		return
	}

	var req struct {
		JobID string `json:"jobId"`
	}
	json.NewDecoder(r.Body).Decode(&req)

	mu.RLock()
	job, exists := syncJobs[req.JobID]
	mu.RUnlock()

	if !exists {
		http.Error(w, "Job not found", 404)
		return
	}

	if job.Status == "running" {
		http.Error(w, "Job is already running", 400)
		return
	}

	go executeSyncJob(req.JobID, false)
	json.NewEncoder(w).Encode(map[string]string{"status": "started"})
}

func handleSyncControl(w http.ResponseWriter, r *http.Request) {
	if getUserFromSession(r) == "" {
		http.Error(w, "Unauthorized", 401)
		return
	}

	var req struct {
		JobID  string `json:"jobId"`
		Action string `json:"action"`
	}
	json.NewDecoder(r.Body).Decode(&req)

	mu.RLock()
	job, exists := syncJobs[req.JobID]
	mu.RUnlock()
	if !exists {
		http.Error(w, "Job not found", 404)
		return
	}

	controller, exists := jobControllers[req.JobID]

	switch req.Action {
	case "pause":
		if exists && controller != nil {
			controller.mu.Lock()
			if !controller.IsPaused {
				controller.PauseChan <- true
				controller.IsPaused = true
			}
			controller.mu.Unlock()
		}
		mu.Lock()
		job.Status = "paused"
		mu.Unlock()
		saveSyncJobs()
		addJobLog(req.JobID, job.Name, "INFO", "Job paused", "", "")

	case "resume":
		if exists && controller != nil {
			controller.mu.Lock()
			if controller.IsPaused {
				controller.ResumeChan <- true
				controller.IsPaused = false
			}
			controller.mu.Unlock()
		}
		mu.Lock()
		job.Status = "running"
		mu.Unlock()
		saveSyncJobs()
		addJobLog(req.JobID, job.Name, "INFO", "Job resumed", "", "")
		go executeSyncJob(req.JobID, true)

	case "stop":
		if exists && controller != nil {
			controller.CancelChan <- true
		}
		mu.Lock()
		job.Status = "stopped"
		job.ResumePoint = job.CurrentFile
		mu.Unlock()
		saveSyncJobs()
		addJobLog(req.JobID, job.Name, "WARNING", "Job stopped by user", "", "")
		delete(jobControllers, req.JobID)
	}

	w.WriteHeader(200)
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func executeSyncJob(jobID string, resume bool) {
	mu.RLock()
	job, exists := syncJobs[jobID]
	if !exists {
		mu.RUnlock()
		return
	}
	jobConfig := *job
	mu.RUnlock()

	history := JobHistory{
		JobID:       jobID,
		JobName:     jobConfig.Name,
		SourcePath:  jobConfig.SourcePath,
		DestPath:    jobConfig.DestPath,
		StartTime:   time.Now(),
		Status:      "running",
		TotalFiles:  0,
		CopiedFiles: 0,
		FailedFiles: 0,
		Errors:      []string{},
		LogFile:     filepath.Join(logsDir, jobID+".json"),
	}

	addJobLog(jobID, jobConfig.Name, "INFO", "Job started", "", "")

	if _, exists := jobControllers[jobID]; !exists {
		jobControllers[jobID] = &JobController{
			CancelChan: make(chan bool, 1),
			PauseChan:  make(chan bool, 1),
			ResumeChan: make(chan bool, 1),
			IsPaused:   false,
		}
	}
	controller := jobControllers[jobID]

	mu.Lock()
	job.Status = "running"
	job.LastRunTime = time.Now()
	mu.Unlock()
	saveSyncJobs()

	var filesToSync []string
	var fileSizes []int64
	var startIndex int = 0

	filepath.Walk(jobConfig.SourcePath, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			if os.IsPermission(err) {
				addJobLog(jobID, jobConfig.Name, "WARNING", fmt.Sprintf("Permission denied: %s", path), path, err.Error())
				return nil
			}
			return nil
		}
		if !info.IsDir() {
			baseName := filepath.Base(path)
			if strings.HasPrefix(baseName, ".") {
				return nil
			}
			if shouldIncludeFile(info.Name(), jobConfig.IncludePatterns, jobConfig.ExcludePatterns) {
				filesToSync = append(filesToSync, path)
				fileSizes = append(fileSizes, info.Size())
			}
		}
		return nil
	})

	if resume && jobConfig.ResumePoint != "" {
		for i, file := range filesToSync {
			if file == jobConfig.ResumePoint {
				startIndex = i
				break
			}
		}
	}

	history.TotalFiles = len(filesToSync)
	mu.Lock()
	job.TotalFiles = len(filesToSync)
	job.ProcessedFiles = startIndex
	mu.Unlock()

	copiedCount := 0
	skippedCount := 0
	failedCount := 0
	copiedSize := int64(0)

	for i := startIndex; i < len(filesToSync); i++ {
		select {
		case <-controller.CancelChan:
			history.Status = "stopped"
			history.EndTime = time.Now()
			history.CopiedFiles = copiedCount
			history.SkippedFiles = skippedCount
			history.FailedFiles = failedCount
			history.CopiedSize = copiedSize
			goto saveHistory

		case <-controller.PauseChan:
			mu.Lock()
			job.Status = "paused"
			job.ResumePoint = filesToSync[i]
			mu.Unlock()
			saveSyncJobs()
			<-controller.ResumeChan
			mu.Lock()
			job.Status = "running"
			mu.Unlock()
			saveSyncJobs()

		default:
			srcFile := filesToSync[i]
			relPath, _ := filepath.Rel(jobConfig.SourcePath, srcFile)
			destFile := filepath.Join(jobConfig.DestPath, relPath)

			mu.Lock()
			job.CurrentFile = srcFile
			job.Progress = float64(i) / float64(len(filesToSync)) * 100
			mu.Unlock()

			shouldCopy := shouldCopyFile(srcFile, destFile, jobConfig.ConflictRule)

			if shouldCopy {
				if err := os.MkdirAll(filepath.Dir(destFile), 0755); err != nil {
					failedCount++
					addJobLogWithPaths(jobID, jobConfig.Name, "ERROR", fmt.Sprintf("Failed to create directory: %s", filepath.Base(srcFile)), srcFile, destFile, err.Error())
				} else if err := copyFile(srcFile, destFile); err == nil {
					copiedCount++
					copiedSize += fileSizes[i]
					addJobLogWithPaths(jobID, jobConfig.Name, "INFO", fmt.Sprintf("Copied: %s", filepath.Base(srcFile)), srcFile, destFile, "")
				} else {
					failedCount++
					addJobLogWithPaths(jobID, jobConfig.Name, "ERROR", fmt.Sprintf("Failed to copy: %s", filepath.Base(srcFile)), srcFile, destFile, err.Error())
				}
			} else {
				skippedCount++
			}

			mu.Lock()
			job.ProcessedFiles = i + 1
			mu.Unlock()
			saveSyncJobs()
		}
	}

	history.Status = "completed"
	history.EndTime = time.Now()
	history.CopiedFiles = copiedCount
	history.SkippedFiles = skippedCount
	history.FailedFiles = failedCount
	history.CopiedSize = copiedSize

	mu.Lock()
	job.Status = "completed"
	job.Progress = 100
	job.ProcessedFiles = job.TotalFiles
	job.CurrentFile = ""
	job.ResumePoint = ""
	mu.Unlock()
	saveSyncJobs()

saveHistory:
	logMu.Lock()
	jobHistories = append([]JobHistory{history}, jobHistories...)
	if len(jobHistories) > 100 {
		jobHistories = jobHistories[:100]
	}
	logMu.Unlock()
	saveJobHistory()

	delete(jobControllers, jobID)
}

func shouldIncludeFile(filename string, includePatterns, excludePatterns []string) bool {
	for _, pattern := range excludePatterns {
		if pattern != "" {
			if matched, _ := filepath.Match(pattern, filename); matched {
				return false
			}
		}
	}
	if len(includePatterns) > 0 {
		for _, pattern := range includePatterns {
			if pattern != "" {
				if matched, _ := filepath.Match(pattern, filename); matched {
					return true
				}
			}
		}
		return false
	}
	return true
}

func shouldCopyFile(src, dest, rule string) bool {
	destInfo, err := os.Stat(dest)
	if err != nil {
		return true
	}
	srcInfo, _ := os.Stat(src)

	switch rule {
	case "skip":
		return false
	case "overwrite":
		return true
	case "keepNewest":
		return srcInfo.ModTime().After(destInfo.ModTime())
	case "keepOldest":
		return srcInfo.ModTime().Before(destInfo.ModTime())
	default:
		return false
	}
}

// ============ JOB LOGS FUNCTIONS ============

func handleJobLogsForJob(w http.ResponseWriter, r *http.Request) {
	if getUserFromSession(r) == "" {
		http.Error(w, "Unauthorized", 401)
		return
	}

	jobID := r.URL.Query().Get("jobId")
	if jobID == "" {
		http.Error(w, "Job ID required", 400)
		return
	}

	jobLogFilePath := filepath.Join(logsDir, jobID+".json")
	file, err := os.Open(jobLogFilePath)
	if err != nil {
		json.NewEncoder(w).Encode([]JobLog{})
		return
	}
	defer file.Close()

	var logs []JobLog
	json.NewDecoder(file).Decode(&logs)
	json.NewEncoder(w).Encode(logs)
}

func handleJobLogs(w http.ResponseWriter, r *http.Request) {
	if getUserFromSession(r) == "" {
		http.Error(w, "Unauthorized", 401)
		return
	}
	logMu.RLock()
	defer logMu.RUnlock()
	json.NewEncoder(w).Encode(jobLogs)
}

func handleJobHistory(w http.ResponseWriter, r *http.Request) {
	if getUserFromSession(r) == "" {
		http.Error(w, "Unauthorized", 401)
		return
	}
	logMu.RLock()
	defer logMu.RUnlock()
	json.NewEncoder(w).Encode(jobHistories)
}

func handleClearLogs(w http.ResponseWriter, r *http.Request) {
	if getUserFromSession(r) == "" {
		http.Error(w, "Unauthorized", 401)
		return
	}
	logMu.Lock()
	jobLogs = []JobLog{}
	logMu.Unlock()
	saveJobLogs()
	w.WriteHeader(200)
}

func handleClearHistory(w http.ResponseWriter, r *http.Request) {
	if getUserFromSession(r) == "" {
		http.Error(w, "Unauthorized", 401)
		return
	}
	logMu.Lock()
	jobHistories = []JobHistory{}
	logMu.Unlock()
	saveJobHistory()
	w.WriteHeader(200)
}

// ============ DUPLICATE FUNCTIONS ============

func handleDuplicates(w http.ResponseWriter, r *http.Request) {
	if getUserFromSession(r) == "" {
		http.Error(w, "Unauthorized", 401)
		return
	}

	path := r.URL.Query().Get("path")
	if path == "" {
		http.Error(w, "Path required", 400)
		return
	}

	duplicates, err := findDuplicates(path)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	json.NewEncoder(w).Encode(duplicates)
}

func handleDuplicateDelete(w http.ResponseWriter, r *http.Request) {
	if getUserFromSession(r) == "" {
		http.Error(w, "Unauthorized", 401)
		return
	}

	var req struct {
		Files []string `json:"files"`
	}
	json.NewDecoder(r.Body).Decode(&req)

	for _, file := range req.Files {
		os.RemoveAll(file)
	}
	w.WriteHeader(200)
}

func handleDuplicateMove(w http.ResponseWriter, r *http.Request) {
	if getUserFromSession(r) == "" {
		http.Error(w, "Unauthorized", 401)
		return
	}

	var req struct {
		Files []string `json:"files"`
		Dest  string   `json:"dest"`
	}
	json.NewDecoder(r.Body).Decode(&req)

	os.MkdirAll(req.Dest, 0755)
	for _, file := range req.Files {
		destPath := filepath.Join(req.Dest, filepath.Base(file))
		os.Rename(file, destPath)
	}
	w.WriteHeader(200)
}

func findDuplicates(rootPath string) ([]DuplicateFile, error) {
	hashMap := make(map[string][]string)
	sizeMap := make(map[int64][]string)

	filepath.Walk(rootPath, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return nil
		}
		sizeMap[info.Size()] = append(sizeMap[info.Size()], path)
		return nil
	})

	for size, files := range sizeMap {
		if len(files) < 2 {
			continue
		}
		for _, file := range files {
			hash, err := hashFile(file)
			if err != nil {
				continue
			}
			hashMap[fmt.Sprintf("%d_%s", size, hash)] = append(hashMap[fmt.Sprintf("%d_%s", size, hash)], file)
		}
	}

	var duplicates []DuplicateFile
	for key, files := range hashMap {
		if len(files) < 2 {
			continue
		}
		var fileInfos []FileInfo
		for _, f := range files {
			info, _ := os.Stat(f)
			relPath, _ := filepath.Rel(rootPath, f)
			fileInfos = append(fileInfos, FileInfo{
				Name:     filepath.Base(f),
				Path:     f,
				Relative: relPath,
				Size:     info.Size(),
				IsDir:    false,
				ModTime:  info.ModTime().Format("2006-01-02 15:04:05"),
			})
		}
		var size int64
		fmt.Sscanf(key, "%d_", &size)
		duplicates = append(duplicates, DuplicateFile{
			Hash:  strings.Split(key, "_")[1],
			Size:  size,
			Files: fileInfos,
		})
	}
	return duplicates, nil
}

func hashFile(filePath string) (string, error) {
	file, err := os.Open(filePath)
	if err != nil {
		return "", err
	}
	defer file.Close()
	hash := sha256.New()
	if _, err := io.Copy(hash, file); err != nil {
		return "", err
	}
	return fmt.Sprintf("%x", hash.Sum(nil)), nil
}

// ============ SEARCH FUNCTIONS ============

func handleSearch(w http.ResponseWriter, r *http.Request) {
	if getUserFromSession(r) == "" {
		http.Error(w, "Unauthorized", 401)
		return
	}

	var filters SearchFilters
	json.NewDecoder(r.Body).Decode(&filters)

	path := r.URL.Query().Get("path")
	if path == "" {
		http.Error(w, "Path required", 400)
		return
	}

	results, err := searchFiles(path, filters)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	json.NewEncoder(w).Encode(results)
}

func searchFiles(rootPath string, filters SearchFilters) ([]FileInfo, error) {
	var results []FileInfo
	filepath.Walk(rootPath, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return nil
		}

		if filters.MinSize > 0 && info.Size() < filters.MinSize {
			return nil
		}
		if filters.MaxSize > 0 && info.Size() > filters.MaxSize {
			return nil
		}

		if filters.Name != "" {
			nameMatch := info.Name()
			if !filters.CaseSensitive {
				nameMatch = strings.ToLower(nameMatch)
				filters.Name = strings.ToLower(filters.Name)
			}
			if !strings.Contains(nameMatch, filters.Name) {
				return nil
			}
		}

		if len(filters.Extensions) > 0 {
			ext := strings.ToLower(filepath.Ext(info.Name()))
			found := false
			for _, filterExt := range filters.Extensions {
				cleanExt := filterExt
				if !strings.HasPrefix(cleanExt, ".") {
					cleanExt = "." + cleanExt
				}
				if ext == cleanExt {
					found = true
					break
				}
			}
			if !found {
				return nil
			}
		}

		if filters.ModifiedAfter != "" {
			afterTime, _ := time.Parse("2006-01-02", filters.ModifiedAfter)
			if info.ModTime().Before(afterTime) {
				return nil
			}
		}

		if filters.ModifiedBefore != "" {
			beforeTime, _ := time.Parse("2006-01-02", filters.ModifiedBefore)
			if info.ModTime().After(beforeTime) {
				return nil
			}
		}

		relPath, _ := filepath.Rel(rootPath, path)
		results = append(results, FileInfo{
			Name:     info.Name(),
			Path:     path,
			IsDir:    info.IsDir(),
			Size:     info.Size(),
			ModTime:  info.ModTime().Format("2006-01-02 15:04:05"),
			Relative: relPath,
			Ext:      strings.ToLower(filepath.Ext(info.Name())),
		})
		return nil
	})
	return results, nil
}

// ============ PREVIEW FUNCTIONS ============

func handlePreview(w http.ResponseWriter, r *http.Request) {
	if getUserFromSession(r) == "" {
		http.Error(w, "Unauthorized", 401)
		return
	}

	path := r.URL.Query().Get("path")
	if path == "" {
		http.Error(w, "Path required", 400)
		return
	}

	ext := strings.ToLower(filepath.Ext(path))
	imageExts := map[string]bool{".jpg": true, ".jpeg": true, ".png": true, ".gif": true, ".webp": true, ".bmp": true}
	videoExts := map[string]bool{".mp4": true, ".webm": true, ".ogg": true, ".mov": true, ".avi": true, ".mkv": true}

	if imageExts[ext] {
		w.Header().Set("Content-Type", "image/"+ext[1:])
		http.ServeFile(w, r, path)
	} else if videoExts[ext] {
		w.Header().Set("Content-Type", "video/"+ext[1:])
		http.ServeFile(w, r, path)
	} else {
		content, err := os.ReadFile(path)
		if err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		w.Header().Set("Content-Type", "text/plain")
		w.Write(content)
	}
}

// ============ GEO PHOTOS FUNCTIONS ============

func handleGeoPhotos(w http.ResponseWriter, r *http.Request) {
	if getUserFromSession(r) == "" {
		http.Error(w, "Unauthorized", 401)
		return
	}

	path := r.URL.Query().Get("path")
	if path == "" {
		http.Error(w, "Path required", 400)
		return
	}

	photos, err := scanPhotosWithGPS(path)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}

	response := GeoPhotosResponse{Photos: photos}
	if len(photos) > 0 {
		var avgLat, avgLon float64
		count := 0
		for _, p := range photos {
			if p.Lat != 0 && p.Lon != 0 {
				avgLat += p.Lat
				avgLon += p.Lon
				count++
			}
		}
		if count > 0 {
			response.Center.Lat = avgLat / float64(count)
			response.Center.Lng = avgLon / float64(count)
			response.Center.Zoom = 10
		}
	}

	json.NewEncoder(w).Encode(response)
}

func scanPhotosWithGPS(rootPath string) ([]GeoPhoto, error) {
	var photos []GeoPhoto

	filepath.Walk(rootPath, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return nil
		}

		ext := strings.ToLower(filepath.Ext(path))
		imageExts := map[string]bool{".jpg": true, ".jpeg": true, ".png": true, ".gif": true, ".webp": true, ".bmp": true}
		if !imageExts[ext] {
			return nil
		}
		if strings.HasPrefix(info.Name(), ".") {
			return nil
		}

		lat, lon, err := getGPSData(path)
		if err != nil || (lat == 0 && lon == 0) {
			return nil
		}

		photos = append(photos, GeoPhoto{
			Path:    path,
			Name:    info.Name(),
			Lat:     lat,
			Lon:     lon,
			Country: "",
			City:    "",
		})
		return nil
	})

	return photos, nil
}

func getGPSData(filePath string) (float64, float64, error) {
	f, err := os.Open(filePath)
	if err != nil {
		return 0, 0, err
	}
	defer f.Close()

	exif.RegisterParsers(mknote.All...)

	x, err := exif.Decode(f)
	if err != nil {
		return 0, 0, err
	}

	lat, long, err := x.LatLong()
	if err != nil {
		return 0, 0, err
	}

	if lat == 0 && long == 0 {
		return 0, 0, fmt.Errorf("no GPS data")
	}

	return lat, long, nil
}

// ============ SORT FUNCTIONS ============

func handleSortJobs(w http.ResponseWriter, r *http.Request) {
	if getUserFromSession(r) == "" {
		http.Error(w, "Unauthorized", 401)
		return
	}

	switch r.Method {
	case "GET":
		mu.RLock()
		jobs := make([]*SortJob, 0, len(sortJobs))
		for _, job := range sortJobs {
			jobs = append(jobs, job)
		}
		mu.RUnlock()
		json.NewEncoder(w).Encode(jobs)

	case "POST":
		var newJob SortJob
		json.NewDecoder(r.Body).Decode(&newJob)
		newJob.ID = uuid.New().String()
		newJob.Status = "pending"

		mu.Lock()
		sortJobs[newJob.ID] = &newJob
		mu.Unlock()
		json.NewEncoder(w).Encode(newJob)

	case "DELETE":
		var req struct{ ID string }
		json.NewDecoder(r.Body).Decode(&req)
		if controller, exists := sortControllers[req.ID]; exists {
			controller.CancelChan <- true
			delete(sortControllers, req.ID)
		}
		mu.Lock()
		delete(sortJobs, req.ID)
		mu.Unlock()
		w.WriteHeader(200)
	}
}

func handleSortStart(w http.ResponseWriter, r *http.Request) {
	if getUserFromSession(r) == "" {
		http.Error(w, "Unauthorized", 401)
		return
	}

	var req struct {
		JobID string `json:"jobId"`
	}
	json.NewDecoder(r.Body).Decode(&req)

	mu.RLock()
	job, exists := sortJobs[req.JobID]
	mu.RUnlock()

	if !exists {
		http.Error(w, "Job not found", 404)
		return
	}

	if job.Status == "running" {
		http.Error(w, "Job is already running", 400)
		return
	}

	go executeSortJob(req.JobID)
	json.NewEncoder(w).Encode(map[string]string{"status": "started"})
}

func handleSortControl(w http.ResponseWriter, r *http.Request) {
	if getUserFromSession(r) == "" {
		http.Error(w, "Unauthorized", 401)
		return
	}

	var req struct {
		JobID  string `json:"jobId"`
		Action string `json:"action"`
	}
	json.NewDecoder(r.Body).Decode(&req)

	controller, exists := sortControllers[req.JobID]
	if !exists {
		http.Error(w, "Job not found", 404)
		return
	}

	mu.RLock()
	job, exists := sortJobs[req.JobID]
	mu.RUnlock()
	if !exists {
		http.Error(w, "Job not found", 404)
		return
	}

	switch req.Action {
	case "pause":
		controller.mu.Lock()
		if !controller.IsPaused {
			controller.PauseChan <- true
			controller.IsPaused = true
		}
		controller.mu.Unlock()
		mu.Lock()
		job.Status = "paused"
		mu.Unlock()

	case "resume":
		controller.mu.Lock()
		if controller.IsPaused {
			controller.ResumeChan <- true
			controller.IsPaused = false
		}
		controller.mu.Unlock()
		mu.Lock()
		job.Status = "running"
		mu.Unlock()
		go executeSortJob(req.JobID)

	case "stop":
		controller.CancelChan <- true
		mu.Lock()
		job.Status = "stopped"
		mu.Unlock()
		delete(sortControllers, req.JobID)
	}

	w.WriteHeader(200)
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func executeSortJob(jobID string) {
	mu.RLock()
	job, exists := sortJobs[jobID]
	if !exists {
		mu.RUnlock()
		return
	}
	jobConfig := *job
	mu.RUnlock()

	if _, exists := sortControllers[jobID]; !exists {
		sortControllers[jobID] = &JobController{
			CancelChan: make(chan bool, 1),
			PauseChan:  make(chan bool, 1),
			ResumeChan: make(chan bool, 1),
			IsPaused:   false,
		}
	}
	controller := sortControllers[jobID]

	mu.Lock()
	job.Status = "running"
	job.StartTime = time.Now()
	mu.Unlock()

	var files []string
	filepath.Walk(jobConfig.SourcePath, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return nil
		}
		if strings.HasPrefix(filepath.Base(path), ".") {
			return nil
		}
		files = append(files, path)
		return nil
	})

	mu.Lock()
	job.TotalFiles = len(files)
	mu.Unlock()

	processed := 0
	for i, file := range files {
		select {
		case <-controller.CancelChan:
			mu.Lock()
			job.Status = "stopped"
			job.EndTime = time.Now()
			mu.Unlock()
			return

		case <-controller.PauseChan:
			mu.Lock()
			job.Status = "paused"
			mu.Unlock()
			<-controller.ResumeChan
			mu.Lock()
			job.Status = "running"
			mu.Unlock()

		default:
			mu.Lock()
			job.CurrentFile = file
			job.Progress = float64(i) / float64(len(files)) * 100
			mu.Unlock()

			var targetDir string
			if jobConfig.SortType == "date" {
				targetDir = getDateBasedPath(file, jobConfig.SourcePath)
			} else if jobConfig.SortType == "location" {
				targetDir = getLocationBasedPath(file, jobConfig.SourcePath)
			}

			if targetDir != "" {
				os.MkdirAll(targetDir, 0755)
				destPath := filepath.Join(targetDir, filepath.Base(file))
				if err := os.Rename(file, destPath); err != nil {
					if copyErr := copyFile(file, destPath); copyErr == nil {
						os.Remove(file)
					}
				}
			}

			processed++
			mu.Lock()
			job.ProcessedFiles = processed
			mu.Unlock()
		}
	}

	mu.Lock()
	job.Status = "completed"
	job.Progress = 100
	job.EndTime = time.Now()
	mu.Unlock()

	delete(sortControllers, jobID)
}

func getDateBasedPath(filePath, basePath string) string {
	info, err := os.Stat(filePath)
	if err != nil {
		return ""
	}

	var fileTime time.Time
	ext := strings.ToLower(filepath.Ext(filePath))
	imageExts := map[string]bool{".jpg": true, ".jpeg": true, ".png": true, ".gif": true, ".webp": true, ".bmp": true}

	if imageExts[ext] {
		if exifDate := getExifDate(filePath); !exifDate.IsZero() {
			fileTime = exifDate
		} else {
			fileTime = info.ModTime()
		}
	} else {
		fileTime = info.ModTime()
	}

	year := fileTime.Year()
	month := fileTime.Month().String()
	return filepath.Join(basePath, fmt.Sprintf("%d", year), month)
}

func getLocationBasedPath(filePath, basePath string) string {
	ext := strings.ToLower(filepath.Ext(filePath))
	imageExts := map[string]bool{".jpg": true, ".jpeg": true, ".png": true, ".gif": true, ".webp": true, ".bmp": true}

	if !imageExts[ext] {
		return filepath.Join(basePath, "Unknown_Location")
	}

	lat, lon, err := getGPSData(filePath)
	if err != nil || (lat == 0 && lon == 0) {
		return filepath.Join(basePath, "Unknown_Location")
	}

	return filepath.Join(basePath, fmt.Sprintf("Location_%.4f_%.4f", lat, lon))
}

func getExifDate(filePath string) time.Time {
	f, err := os.Open(filePath)
	if err != nil {
		return time.Time{}
	}
	defer f.Close()

	exif.RegisterParsers(mknote.All...)

	x, err := exif.Decode(f)
	if err != nil {
		return time.Time{}
	}

	dt, err := x.DateTime()
	if err != nil {
		return time.Time{}
	}
	return dt
}
