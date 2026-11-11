package api

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"sync"
	"time"

	"nexa-home/internal/auth"
	"nexa-home/internal/db"
)

const (
	maxConcurrentHealthChecks = 16
	healthCheckTimeout        = 5 * time.Second
)

type monitoredService struct {
	config    HealthCheck
	cancel    context.CancelFunc
	status    string
	checkedAt time.Time
}

type healthMonitor struct {
	ctx       context.Context
	cancel    context.CancelFunc
	transport *http.Transport
	client    *http.Client
	slots     chan struct{}
	mu        sync.RWMutex
	services  map[string]*monitoredService
	workers   sync.WaitGroup
}

func newHealthMonitor(ctx context.Context, database *sql.DB) (*healthMonitor, error) {
	rows, err := database.QueryContext(ctx, "SELECT service_id,url,interval_seconds FROM service_health_checks")
	if err != nil {
		return nil, err
	}
	checks := make(map[string]HealthCheck)
	for rows.Next() {
		var id string
		var check HealthCheck
		if err := rows.Scan(&id, &check.URL, &check.IntervalSeconds); err != nil {
			rows.Close()
			return nil, err
		}
		original := check.URL
		if err := validateHealthCheck(&check); err != nil || check.URL != original {
			rows.Close()
			return nil, errors.New("stored health check configuration is invalid")
		}
		checks[id] = check
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return nil, err
	}

	workerContext, cancel := context.WithCancel(ctx)
	transport := &http.Transport{
		Proxy:                  nil,
		DisableKeepAlives:      true,
		DisableCompression:     true,
		MaxResponseHeaderBytes: 16 << 10,
		ResponseHeaderTimeout:  healthCheckTimeout,
		TLSHandshakeTimeout:    healthCheckTimeout,
	}
	monitor := &healthMonitor{
		ctx: workerContext, cancel: cancel, transport: transport,
		client: &http.Client{
			Transport: transport,
			Timeout:   healthCheckTimeout,
			CheckRedirect: func(*http.Request, []*http.Request) error {
				return http.ErrUseLastResponse
			},
		},
		slots: make(chan struct{}, maxConcurrentHealthChecks), services: make(map[string]*monitoredService),
	}
	for id, check := range checks {
		monitor.set(id, &check)
	}
	return monitor, nil
}

// ponytail: one worker per enabled service (at most 5000); use a shared timer heap if profiling shows memory pressure.
func (m *healthMonitor) startLocked(id string, check HealthCheck) {
	if m.ctx.Err() != nil {
		return
	}
	ctx, cancel := context.WithCancel(m.ctx)
	entry := &monitoredService{config: check, cancel: cancel, status: "unknown"}
	m.services[id] = entry
	m.workers.Add(1)
	go m.run(ctx, id, entry)
}

func (m *healthMonitor) set(id string, check *HealthCheck) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if previous := m.services[id]; previous != nil {
		if check != nil && previous.config == *check {
			return
		}
		previous.cancel()
		delete(m.services, id)
	}
	if check != nil {
		m.startLocked(id, *check)
	}
}

func (m *healthMonitor) replace(services []Service) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, entry := range m.services {
		entry.cancel()
	}
	clear(m.services)
	for _, service := range services {
		if service.HealthCheck != nil {
			m.startLocked(service.ID, *service.HealthCheck)
		}
	}
}

func (m *healthMonitor) run(ctx context.Context, id string, entry *monitoredService) {
	defer m.workers.Done()
	for {
		select {
		case <-ctx.Done():
			return
		case m.slots <- struct{}{}:
		}
		status := "down"
		request, err := http.NewRequestWithContext(ctx, http.MethodGet, entry.config.URL, nil)
		if err == nil {
			request.Header.Set("User-Agent", "Nexa-Home-Health-Check")
			response, err := m.client.Do(request)
			if err == nil {
				if response.StatusCode >= 200 && response.StatusCode < 300 {
					status = "up"
				}
				response.Body.Close()
			}
		}
		<-m.slots
		if ctx.Err() != nil {
			return
		}
		m.mu.Lock()
		if m.services[id] == entry {
			entry.status, entry.checkedAt = status, time.Now()
		}
		m.mu.Unlock()

		timer := time.NewTimer(time.Duration(entry.config.IntervalSeconds) * time.Second)
		select {
		case <-ctx.Done():
			timer.Stop()
			return
		case <-timer.C:
		}
	}
}

func (m *healthMonitor) status(id string, check HealthCheck) HealthStatus {
	result := HealthStatus{ServiceID: id, Status: "unknown"}
	m.mu.RLock()
	defer m.mu.RUnlock()
	entry := m.services[id]
	if entry == nil || entry.config != check || entry.checkedAt.IsZero() {
		return result
	}
	stamp := db.Timestamp(entry.checkedAt)
	result.CheckedAt = &stamp
	if time.Since(entry.checkedAt) <= max(2*time.Duration(check.IntervalSeconds)*time.Second, 2*time.Minute) {
		result.Status = entry.status
	}
	return result
}

func (m *healthMonitor) close() {
	m.cancel()
	m.workers.Wait()
	m.transport.CloseIdleConnections()
}

func (s *Server) publicHealth(w http.ResponseWriter, r *http.Request, _ auth.Session) error {
	authenticated, err := s.publicSession(r)
	if err != nil {
		return err
	}
	statuses := make([]HealthStatus, 0)
	err = s.withTx(r.Context(), func(tx *sql.Tx) error {
		settings, err := readSettings(r.Context(), tx)
		if err != nil {
			return err
		}
		if settings.AccessMode == "private" && !authenticated {
			return auth.ErrUnauthenticated
		}
		rows, err := tx.QueryContext(r.Context(), `SELECT s.id,h.url,h.interval_seconds FROM service_health_checks h JOIN services s ON s.id=h.service_id LEFT JOIN categories c ON c.id=s.category_id WHERE s.is_visible=1 AND (s.category_id IS NULL OR c.is_visible=1) ORDER BY s.position,s.id`)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var id string
			var check HealthCheck
			if err := rows.Scan(&id, &check.URL, &check.IntervalSeconds); err != nil {
				return err
			}
			statuses = append(statuses, s.health.status(id, check))
		}
		return rows.Err()
	})
	if err != nil {
		return err
	}
	return jsonResponse(w, http.StatusOK, statuses)
}
