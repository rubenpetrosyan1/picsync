package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"golang.org/x/crypto/bcrypt"
)

func setupTestEnv(t *testing.T) string {
	tmpDir := t.TempDir()
	dataDir = tmpDir
	logsDir = filepath.Join(tmpDir, "logs")
	mediaInfoDir = filepath.Join(tmpDir, "media_info")
	logFile = filepath.Join(tmpDir, "job_logs.json")
	historyFile = filepath.Join(tmpDir, "job_history.json")

	os.MkdirAll(logsDir, 0755)
	os.MkdirAll(mediaInfoDir, 0755)

	users = make(map[string]User)
	sessions = make(map[string]Session)
	syncJobs = make(map[string]*SyncJob)
	sortJobs = make(map[string]*SortJob)
	jobControllers = make(map[string]*JobController)
	sortControllers = make(map[string]*JobController)
	jobLogs = make([]JobLog, 0)
	jobHistories = make([]JobHistory, 0)
	serverSettings = ServerSettings{BindAddress: ":8080"}

	createTestUser("admin", "admin123", true)
	createTestUser("regular", "pass123", false)

	return tmpDir
}

func createTestUser(username, password string, isAdmin bool) {
	hash, _ := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	users[username] = User{
		Username:     username,
		PasswordHash: string(hash),
		IsAdmin:      isAdmin,
		Settings:     defaultUserSettings(),
	}
}

func loginAndGetCookie(t *testing.T, username, password string) *http.Cookie {
	body, _ := json.Marshal(map[string]string{
		"username": username,
		"password": password,
	})

	req := httptest.NewRequest("POST", "/api/login", strings.NewReader(string(body)))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handleLogin(w, req)

	if w.Code != 200 {
		t.Fatalf("Login failed for user %s: status %d, body %s", username, w.Code, w.Body.String())
	}

	cookies := w.Result().Cookies()
	if len(cookies) == 0 {
		t.Fatal("No session cookie returned")
	}
	return cookies[0]
}

// ============ TESTS ============

func TestChangePassword_Success(t *testing.T) {
	setupTestEnv(t)

	cookie := loginAndGetCookie(t, "regular", "pass123")

	w := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/api/change-password", strings.NewReader(`{"currentPassword":"pass123","newPassword":"newpass456"}`))
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(cookie)

	handleChangePassword(w, req)

	if w.Code != 200 {
		t.Errorf("Expected 200, got %d", w.Code)
	}

	mu.RLock()
	user := users["regular"]
	mu.RUnlock()

	if bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte("newpass456")) != nil {
		t.Error("Password was not updated correctly")
	}
}

func TestChangePassword_WrongCurrent(t *testing.T) {
	setupTestEnv(t)

	cookie := loginAndGetCookie(t, "regular", "pass123")

	w := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/api/change-password", strings.NewReader(`{"currentPassword":"wrong","newPassword":"newpass456"}`))
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(cookie)

	handleChangePassword(w, req)

	if w.Code != 401 {
		t.Errorf("Expected 401 for wrong current password, got %d", w.Code)
	}
}

func TestChangePassword_TooShort(t *testing.T) {
	setupTestEnv(t)

	cookie := loginAndGetCookie(t, "regular", "pass123")

	w := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/api/change-password", strings.NewReader(`{"currentPassword":"pass123","newPassword":"abc"}`))
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(cookie)

	handleChangePassword(w, req)

	if w.Code != 400 {
		t.Errorf("Expected 400 for short password, got %d", w.Code)
	}
}

func TestGetSettings(t *testing.T) {
	setupTestEnv(t)

	cookie := loginAndGetCookie(t, "regular", "pass123")

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/api/settings", nil)
	req.AddCookie(cookie)

	handleSettings(w, req)

	if w.Code != 200 {
		t.Fatalf("Expected 200, got %d", w.Code)
	}

	var result map[string]interface{}
	json.NewDecoder(w.Body).Decode(&result)

	if result["username"] != "regular" {
		t.Errorf("Expected username 'regular', got %v", result["username"])
	}
	if result["isAdmin"] != false {
		t.Errorf("Expected isAdmin false, got %v", result["isAdmin"])
	}
}

func TestUpdateSettings(t *testing.T) {
	setupTestEnv(t)

	cookie := loginAndGetCookie(t, "regular", "pass123")

	w := httptest.NewRecorder()
	req := httptest.NewRequest("PUT", "/api/settings", strings.NewReader(`{"theme":"dark","accentColor":"green","language":"fr"}`))
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(cookie)

	handleSettings(w, req)

	if w.Code != 200 {
		t.Fatalf("Expected 200, got %d", w.Code)
	}

	mu.RLock()
	user := users["regular"]
	mu.RUnlock()

	if user.Settings.Theme != "dark" {
		t.Errorf("Expected theme 'dark', got '%s'", user.Settings.Theme)
	}
	if user.Settings.AccentColor != "green" {
		t.Errorf("Expected accentColor 'green', got '%s'", user.Settings.AccentColor)
	}
	if user.Settings.Language != "fr" {
		t.Errorf("Expected language 'fr', got '%s'", user.Settings.Language)
	}
}

func TestListUsers_Admin(t *testing.T) {
	setupTestEnv(t)

	cookie := loginAndGetCookie(t, "admin", "admin123")

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/api/users", nil)
	req.AddCookie(cookie)

	handleUsers(w, req)

	if w.Code != 200 {
		t.Fatalf("Expected 200 for admin listing users, got %d", w.Code)
	}

	var userList []map[string]interface{}
	json.NewDecoder(w.Body).Decode(&userList)

	if len(userList) != 2 {
		t.Errorf("Expected 2 users, got %d", len(userList))
	}
}

func TestListUsers_NonAdmin(t *testing.T) {
	setupTestEnv(t)

	cookie := loginAndGetCookie(t, "regular", "pass123")

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/api/users", nil)
	req.AddCookie(cookie)

	handleUsers(w, req)

	if w.Code != 403 {
		t.Errorf("Expected 403 for non-admin listing users, got %d", w.Code)
	}
}

func TestCreateUser(t *testing.T) {
	setupTestEnv(t)

	cookie := loginAndGetCookie(t, "admin", "admin123")

	w := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/api/users", strings.NewReader(`{"username":"newuser","password":"newpass123","isAdmin":false}`))
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(cookie)

	handleUsers(w, req)

	if w.Code != 200 {
		t.Fatalf("Expected 200, got %d: %s", w.Code, w.Body.String())
	}

	mu.RLock()
	_, exists := users["newuser"]
	mu.RUnlock()

	if !exists {
		t.Error("New user was not created")
	}
}

func TestCreateUser_Duplicate(t *testing.T) {
	setupTestEnv(t)

	cookie := loginAndGetCookie(t, "admin", "admin123")

	w := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/api/users", strings.NewReader(`{"username":"admin","password":"newpass123","isAdmin":false}`))
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(cookie)

	handleUsers(w, req)

	if w.Code != 409 {
		t.Errorf("Expected 409 for duplicate user, got %d", w.Code)
	}
}

func TestDeleteUser(t *testing.T) {
	setupTestEnv(t)

	cookie := loginAndGetCookie(t, "admin", "admin123")

	w := httptest.NewRecorder()
	req := httptest.NewRequest("DELETE", "/api/users", strings.NewReader(`{"username":"regular"}`))
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(cookie)

	handleUsers(w, req)

	if w.Code != 200 {
		t.Fatalf("Expected 200, got %d", w.Code)
	}

	mu.RLock()
	_, exists := users["regular"]
	mu.RUnlock()

	if exists {
		t.Error("User was not deleted")
	}
}

func TestDeleteUser_CannotDeleteSelf(t *testing.T) {
	setupTestEnv(t)

	cookie := loginAndGetCookie(t, "admin", "admin123")

	w := httptest.NewRecorder()
	req := httptest.NewRequest("DELETE", "/api/users", strings.NewReader(`{"username":"admin"}`))
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(cookie)

	handleUsers(w, req)

	if w.Code != 400 {
		t.Errorf("Expected 400 for deleting self, got %d", w.Code)
	}
}

func TestToggleAdmin(t *testing.T) {
	setupTestEnv(t)

	cookie := loginAndGetCookie(t, "admin", "admin123")

	w := httptest.NewRecorder()
	req := httptest.NewRequest("PUT", "/api/users/admin", strings.NewReader(`{"username":"regular","isAdmin":true}`))
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(cookie)

	handleUserAdmin(w, req)

	if w.Code != 200 {
		t.Fatalf("Expected 200, got %d", w.Code)
	}

	mu.RLock()
	user := users["regular"]
	mu.RUnlock()

	if !user.IsAdmin {
		t.Error("User was not promoted to admin")
	}
}

func TestToggleAdmin_CannotRemoveOwnAdmin(t *testing.T) {
	setupTestEnv(t)

	cookie := loginAndGetCookie(t, "admin", "admin123")

	w := httptest.NewRecorder()
	req := httptest.NewRequest("PUT", "/api/users/admin", strings.NewReader(`{"username":"admin","isAdmin":false}`))
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(cookie)

	handleUserAdmin(w, req)

	if w.Code != 400 {
		t.Errorf("Expected 400 for removing own admin, got %d", w.Code)
	}
}

func TestServerSettings_Get(t *testing.T) {
	setupTestEnv(t)

	cookie := loginAndGetCookie(t, "admin", "admin123")

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/api/server-settings", nil)
	req.AddCookie(cookie)

	handleServerSettingsAPI(w, req)

	if w.Code != 200 {
		t.Fatalf("Expected 200, got %d", w.Code)
	}

	var result ServerSettings
	json.NewDecoder(w.Body).Decode(&result)

	if result.BindAddress != ":8080" {
		t.Errorf("Expected ':8080', got '%s'", result.BindAddress)
	}
}

func TestServerSettings_Update(t *testing.T) {
	setupTestEnv(t)

	cookie := loginAndGetCookie(t, "admin", "admin123")

	w := httptest.NewRecorder()
	req := httptest.NewRequest("PUT", "/api/server-settings", strings.NewReader(`{"bindAddress":"0.0.0.0:9090"}`))
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(cookie)

	handleServerSettingsAPI(w, req)

	if w.Code != 200 {
		t.Fatalf("Expected 200, got %d", w.Code)
	}

	if serverSettings.BindAddress != "0.0.0.0:9090" {
		t.Errorf("Expected '0.0.0.0:9090', got '%s'", serverSettings.BindAddress)
	}
}

func TestServerSettings_NonAdmin(t *testing.T) {
	setupTestEnv(t)

	cookie := loginAndGetCookie(t, "regular", "pass123")

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/api/server-settings", nil)
	req.AddCookie(cookie)

	handleServerSettingsAPI(w, req)

	if w.Code != 403 {
		t.Errorf("Expected 403 for non-admin, got %d", w.Code)
	}
}

func TestMigrateUsers(t *testing.T) {
	setupTestEnv(t)

	users["legacy"] = User{
		Username:     "legacy",
		PasswordHash: "$2a$10$somesha256hash",
	}

	migrateUsers()

	mu.RLock()
	user := users["legacy"]
	mu.RUnlock()

	if user.Settings.Theme != "light" {
		t.Errorf("Expected default theme 'light', got '%s'", user.Settings.Theme)
	}
	if user.Settings.Language != "en" {
		t.Errorf("Expected default language 'en', got '%s'", user.Settings.Language)
	}
	if user.Settings.AccentColor != "blue" {
		t.Errorf("Expected default accentColor 'blue', got '%s'", user.Settings.AccentColor)
	}

	mu.RLock()
	adminUser := users["admin"]
	mu.RUnlock()
	if !adminUser.IsAdmin {
		t.Error("Expected admin user to have IsAdmin=true after migration")
	}
}

func TestCheckAuth(t *testing.T) {
	setupTestEnv(t)

	cookie := loginAndGetCookie(t, "regular", "pass123")

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/api/check-auth", nil)
	req.AddCookie(cookie)

	handleCheckAuth(w, req)

	if w.Code != 200 {
		t.Fatalf("Expected 200, got %d", w.Code)
	}

	var result map[string]interface{}
	json.NewDecoder(w.Body).Decode(&result)

	if result["username"] != "regular" {
		t.Errorf("Expected username 'regular', got %v", result["username"])
	}
	if result["isAdmin"] != false {
		t.Errorf("Expected isAdmin false, got %v", result["isAdmin"])
	}
}

func TestCheckAuth_Unauthorized(t *testing.T) {
	setupTestEnv(t)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/api/check-auth", nil)

	handleCheckAuth(w, req)

	if w.Code != 401 {
		t.Errorf("Expected 401 for no session, got %d", w.Code)
	}
}
