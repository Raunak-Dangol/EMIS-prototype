/**
 * NCCS EMIS — API Utility
 * Centralized fetch wrapper for all backend communication.
 */

const API_BASE = '';  // Same origin since Flask serves frontend

const api = {
    /**
     * Make an API request.
     * @param {string} endpoint - API endpoint (e.g., '/api/login')
     * @param {object} options - Fetch options
     * @returns {Promise<object>} response data
     */
    async request(endpoint, options = {}) {
        const config = {
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            ...options
        };

        try {
            const response = await fetch(`${API_BASE}${endpoint}`, config);
            const data = await response.json();

            if (!response.ok) {
                throw { status: response.status, message: data.error || 'Request failed' };
            }

            return data;
        } catch (error) {
            if (error.status === 401) {
                window.location.href = '/';
            }
            throw error;
        }
    },

    // Auth
    login(username, password) {
        return this.request('/api/login', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });
    },

    logout() {
        return this.request('/api/logout', { method: 'POST' });
    },

    checkSession() {
        return this.request('/api/session');
    },

    // Dashboard
    getAdminStats() {
        return this.request('/api/dashboard/stats');
    },

    getStudentDashboard() {
        return this.request('/api/dashboard/student');
    },

    // Students
    getStudents(params = {}) {
        const query = new URLSearchParams(params).toString();
        return this.request(`/api/students?${query}`);
    },

    createStudent(data) {
        return this.request('/api/students', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    },

    getStudent(id) {
        return this.request(`/api/students/${id}`);
    },

    updateStudent(id, data) {
        return this.request(`/api/students/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    },

    deleteStudent(id) {
        return this.request(`/api/students/${id}`, { method: 'DELETE' });
    },

    // Subjects
    getSubjects(params = {}) {
        const query = new URLSearchParams(params).toString();
        return this.request(`/api/subjects?${query}`);
    },

    createSubject(data) {
        return this.request('/api/subjects', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    },

    deleteSubject(id) {
        return this.request(`/api/subjects/${id}`, { method: 'DELETE' });
    },

    // Attendance
    getAttendance(params = {}) {
        const query = new URLSearchParams(params).toString();
        return this.request(`/api/attendance?${query}`);
    },

    recordAttendance(date, records) {
        return this.request('/api/attendance', {
            method: 'POST',
            body: JSON.stringify({ date, records })
        });
    },

    getStudentAttendance(studentId) {
        return this.request(`/api/attendance/student/${studentId}`);
    },

    // Results
    getResults(params = {}) {
        const query = new URLSearchParams(params).toString();
        return this.request(`/api/results?${query}`);
    },

    addResult(data) {
        return this.request('/api/results', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    },

    getStudentResults(studentId) {
        return this.request(`/api/results/student/${studentId}`);
    },

    // Bulk Results
    saveBulkResults(data) {
        return this.request('/api/results/bulk', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    },

    // Teachers
    getTeachers() {
        return this.request('/api/teachers');
    },

    createTeacher(data) {
        return this.request('/api/teachers', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    },

    getTeacher(id) {
        return this.request(`/api/teachers/${id}`);
    },

    updateTeacher(id, data) {
        return this.request(`/api/teachers/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    },

    deleteTeacher(id) {
        return this.request(`/api/teachers/${id}`, { method: 'DELETE' });
    },

    // Subject update (for teacher assignment)
    updateSubject(id, data) {
        return this.request(`/api/subjects/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    }
};
