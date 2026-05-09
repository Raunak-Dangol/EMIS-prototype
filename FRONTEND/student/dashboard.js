        // ============================================================
        // STATE
        // ============================================================
        let currentUser = null;
        let studentId = null;
        let studentData = null;

        // ============================================================
        // INIT
        // ============================================================
        (async () => {
            try {
                const data = await api.checkSession();
                if (!data.authenticated || data.user.role !== 'student') {
                    window.location.href = '/';
                    return;
                }
                currentUser = data.user;
                studentId = data.student_id;

                document.getElementById('userName').textContent = currentUser.username;
                document.getElementById('userAvatar').textContent = currentUser.username.charAt(0).toUpperCase();
                document.getElementById('currentDate').textContent = new Date().toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' });

                await loadDashboard();
                hideLoading();
            } catch (e) {
                window.location.href = '/';
            }
        })();

        function hideLoading() {
            const overlay = document.getElementById('loadingOverlay');
            overlay.classList.add('hide');
            setTimeout(() => overlay.remove(), 500);
        }

        // ============================================================
        // NAVIGATION
        // ============================================================
        function switchPage(page) {
            document.querySelectorAll('[id^="page-"]').forEach(el => { el.classList.remove('is-visible'); el.classList.add('page-section-hidden'); });
            document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

            document.getElementById(`page-${page}`).classList.remove('page-section-hidden');
            document.getElementById(`page-${page}`).classList.add('is-visible');
            document.querySelector(`.nav-item[data-page="${page}"]`).classList.add('active');

            const titles = {
                overview: 'My Dashboard',
                attendance: 'My Attendance',
                results: 'My Results',
                insight: 'Academic Insight',
                profile: 'My Profile'
            };
            document.getElementById('pageTitle').textContent = titles[page] || 'Dashboard';

            if (page === 'attendance') loadAttendanceHistory();
            if (page === 'results') loadAllResults();
            if (page === 'insight') loadPrediction();
            if (page === 'profile') loadProfile();
        }

        function toggleSidebar() {
            document.getElementById('sidebar').classList.toggle('open');
        }

        // ============================================================
        // DASHBOARD
        // ============================================================
        async function loadDashboard() {
            try {
                const data = await api.getStudentDashboard();
                studentData = data.student;

                // Welcome
                document.getElementById('welcomeMsg').textContent = `Welcome back, ${data.student.first_name}!`;
                document.getElementById('welcomeSub').textContent = `Grade ${data.student.grade} • ${data.student.faculty} • Roll No: ${data.student.roll_no}`;

                // Render the academic calendar on the overview page
                renderCalendar();
            } catch (e) {
                showToast('Failed to load dashboard', 'error');
            }
        }

        // ============================================================
        // ATTENDANCE HISTORY
        // ============================================================
        async function loadAttendanceHistory() {
            if (!studentId) return;
            try {
                const records = await api.getStudentAttendance(studentId);

                // Stats
                const total = records.length;
                const present = records.filter(r => r.status === 'Present').length;
                const late = records.filter(r => r.status === 'Late').length;
                const rate = total > 0 ? Math.round((present + late) / total * 100 * 10) / 10 : 0;

                document.getElementById('attPageRate').textContent = rate + '%';
                document.getElementById('attPageTotal').textContent = total;

                const tbody = document.getElementById('attendanceHistoryBody');
                if (records.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="4" class="empty-state"><div class="empty-icon"></div><p>No attendance records</p></td></tr>';
                    return;
                }

                tbody.innerHTML = records.map(r => `
                    <tr>
                        <td>${new Date(r.date).toLocaleDateString('en-US', { weekday:'short', year:'numeric', month:'short', day:'numeric' })}</td>
                        <td><span class="badge badge-${r.status.toLowerCase()}">${r.status}</span></td>
                        <td>${r.remarks || '—'}</td>
                        <td>${r.recorded_by || '—'}</td>
                    </tr>
                `).join('');
            } catch (e) {
                showToast('Failed to load attendance', 'error');
            }
        }

        // ============================================================
        // ALL RESULTS — Filtered by Exam Type
        // ============================================================
        let allResultsCache = [];
        let activeExamType = null;

        async function loadAllResults() {
            if (!studentId) return;
            try {
                allResultsCache = await api.getStudentResults(studentId);

                // Extract unique exam types
                const examTypes = [...new Set(allResultsCache.map(r => r.exam_type))];

                const tabsContainer = document.getElementById('examTypeTabs');
                const summaryGrid = document.getElementById('resultsSummaryGrid');

                if (allResultsCache.length === 0) {
                    tabsContainer.innerHTML = '<span class="results-tab-empty">No exams available</span>';
                    summaryGrid.style.display = 'none';
                    document.getElementById('allResultsBody').innerHTML =
                        '<tr><td colspan="7" class="empty-state"><div class="empty-icon"></div><p>No exam results yet</p></td></tr>';
                    document.getElementById('resultsTableTitle').textContent = 'No Results';
                    document.getElementById('resultsCountBadge').textContent = '';
                    return;
                }

                summaryGrid.style.display = '';

                // Build exam type tabs
                tabsContainer.innerHTML = examTypes.map(type => `
                    <button class="results-tab" data-exam-type="${type}" onclick="selectExamType('${type}')">${type}</button>
                `).join('');

                // Auto-select first exam type
                selectExamType(examTypes[0]);
            } catch (e) {
                showToast('Failed to load results', 'error');
            }
        }

        function selectExamType(type) {
            activeExamType = type;

            // Update active tab styling
            document.querySelectorAll('.results-tab').forEach(tab => {
                tab.classList.toggle('active', tab.dataset.examType === type);
            });

            // Filter results for this exam type
            const filtered = allResultsCache.filter(r => r.exam_type === type);

            // Update summary stats
            updateResultsSummary(filtered);

            // Update table title
            document.getElementById('resultsTableTitle').textContent = `${type} Results`;
            document.getElementById('resultsCountBadge').textContent = filtered.length > 0
                ? `${filtered.length} subject${filtered.length > 1 ? 's' : ''}`
                : '';

            // Render table
            const tbody = document.getElementById('allResultsBody');
            if (filtered.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" class="empty-state"><div class="empty-icon"></div><p>No results for this exam type</p></td></tr>';
                return;
            }

            tbody.innerHTML = filtered.map(r => {
                const passed = r.marks_obtained >= r.pass_marks;
                const statusClass = passed ? 'badge-present' : 'badge-absent';
                const statusText = passed ? 'Pass' : 'Fail';
                const gradeClass = r.grade_point === 'E' ? 'badge-absent' : 'badge-present';

                return `
                    <tr class="${!passed ? 'results-row-fail' : ''}">
                        <td><strong>${r.subject_name || '—'}</strong></td>
                        <td><span class="record-count">${r.subject_code || '—'}</span></td>
                        <td><strong>${r.marks_obtained}</strong></td>
                        <td>${r.full_marks}</td>
                        <td><span class="badge ${gradeClass}">${r.grade_point || '—'}</span></td>
                        <td>${r.percentage}%</td>
                        <td><span class="badge ${statusClass}">${statusText}</span></td>
                    </tr>
                `;
            }).join('');
        }

        function updateResultsSummary(results) {
            const count = results.length;
            document.getElementById('rsTotalSubjects').textContent = count;

            if (count === 0) {
                document.getElementById('rsAvgPercentage').textContent = '—';
                document.getElementById('rsHighestScore').textContent = '—';
                document.getElementById('rsGPA').textContent = '—';
                return;
            }

            // Average percentage
            const avgPct = results.reduce((sum, r) => sum + r.percentage, 0) / count;
            document.getElementById('rsAvgPercentage').textContent = avgPct.toFixed(1) + '%';

            // Highest score
            const highest = Math.max(...results.map(r => r.percentage));
            document.getElementById('rsHighestScore').textContent = highest.toFixed(1) + '%';

            // GPA (NEB-style 4.0 scale)
            const gpaMap = { 'A+': 4.0, 'A': 3.6, 'B+': 3.2, 'B': 2.8, 'C+': 2.4, 'C': 2.0, 'D': 1.6, 'E': 0.0 };
            const gpaSum = results.reduce((sum, r) => sum + (gpaMap[r.grade_point] ?? 0), 0);
            const gpa = gpaSum / count;
            document.getElementById('rsGPA').textContent = gpa.toFixed(2);
        }

        // ============================================================
        // PROFILE
        // ============================================================
        function loadProfile() {
            if (!studentData) return;
            const s = studentData;

            // Profile image or letter avatar
            const avatarContainer = document.getElementById('profileAvatarContainer');
            const sidebarAvatar = document.getElementById('userAvatar');
            if (s.profile_image) {
                avatarContainer.innerHTML = `<img src="${s.profile_image}" alt="${s.full_name}" class="profile-avatar-img">`;
                sidebarAvatar.innerHTML = `<img src="${s.profile_image}" alt="${s.full_name}" class="sidebar-avatar-img">`;
                sidebarAvatar.classList.add('has-image');
            } else {
                avatarContainer.innerHTML = `<div class="user-avatar profile-avatar">${(s.first_name || 'S').charAt(0).toUpperCase()}</div>`;
                sidebarAvatar.textContent = (s.first_name || 'S').charAt(0).toUpperCase();
                sidebarAvatar.classList.remove('has-image');
            }

            document.getElementById('profileName').textContent = s.full_name;
            document.getElementById('profileMeta').textContent = `Grade ${s.grade} • ${s.faculty}`;
            document.getElementById('profileRoll').textContent = s.roll_no;
            document.getElementById('profileGrade').textContent = `Grade ${s.grade}`;
            document.getElementById('profileFaculty').textContent = s.faculty;
            document.getElementById('profilePhone').textContent = s.phone || '—';
            document.getElementById('profileDob').textContent = s.date_of_birth ? new Date(s.date_of_birth).toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' }) : '—';
            document.getElementById('profileEnrolled').textContent = s.enrolled_date ? new Date(s.enrolled_date).toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' }) : '—';
            document.getElementById('profileAddress').textContent = s.address || '—';
            document.getElementById('profileGuardian').textContent = s.guardian_name || '—';
            document.getElementById('profileGuardianPhone').textContent = s.guardian_phone || '—';

            // Parent details
            document.getElementById('profileFatherName').textContent = s.father_name || '—';
            document.getElementById('profileFatherPhone').textContent = s.father_phone || '—';
            document.getElementById('profileMotherName').textContent = s.mother_name || '—';
            document.getElementById('profileMotherPhone').textContent = s.mother_phone || '—';

            // Capitalize parent education nicely
            const edu = s.parent_education;
            document.getElementById('profileParentEducation').textContent = edu ? edu.replace(/\b\w/g, l => l.toUpperCase()) : '—';
        }

        // ============================================================
        // LOGOUT, TOAST
        // ============================================================
        async function handleLogout() {
            try { await api.logout(); } catch (e) {}
            window.location.href = '/';
        }

        function showToast(message, type = 'info') {
            const container = document.getElementById('toastContainer');
            const toast = document.createElement('div');
            toast.className = `toast ${type}`;
            const icon = type === 'success' ? '' : type === 'error' ? '' : '';
            toast.innerHTML = `<span>${icon}</span> ${message}`;
            container.appendChild(toast);
            setTimeout(() => { toast.classList.add('toast-out'); setTimeout(() => toast.remove(), 300); }, 3500);
        }

        // ============================================================
        // ACADEMIC CALENDAR (FullCalendar)
        // ============================================================
        let fcCalendar = null;

        // Real NEB Academic Calendar & Nepal Public Holidays
        // Academic Year 2082 BS (Baisakh 2082 – Chaitra 2082) and 2083 BS
        const academicEvents = [
            // ══════ Nepal Public Holidays 2082 BS (2025-2026 AD) ══════
            { date: '2025-04-14', title: 'Nepali New Year 2082', type: 'holiday' },
            { date: '2025-05-01', title: 'Labour Day', type: 'holiday' },
            { date: '2025-05-12', title: 'Buddha Jayanti', type: 'holiday' },
            { date: '2025-05-29', title: 'Republic Day', type: 'holiday' },
            { date: '2025-08-09', title: 'Janai Purnima / Raksha Bandhan', type: 'holiday' },
            { date: '2025-08-16', title: 'Gai Jatra', type: 'holiday' },
            { date: '2025-08-26', title: 'Krishna Janmashtami', type: 'holiday' },
            { date: '2025-08-27', title: 'Teej', type: 'holiday' },
            { date: '2025-09-19', title: 'Constitution Day', type: 'holiday' },
            { date: '2025-09-22', title: 'Ghatasthapana (Dashain)', type: 'holiday' },
            { date: '2025-09-29', title: 'Fulpati', type: 'holiday' },
            { date: '2025-09-30', title: 'Maha Ashtami', type: 'holiday' },
            { date: '2025-10-01', title: 'Maha Nawami', type: 'holiday' },
            { date: '2025-10-02', title: 'Vijaya Dashami', type: 'holiday' },
            { date: '2025-10-06', title: 'Kojagrat Purnima', type: 'holiday' },
            { date: '2025-10-20', title: 'Laxmi Puja (Tihar)', type: 'holiday' },
            { date: '2025-10-21', title: 'Govardhan Puja', type: 'holiday' },
            { date: '2025-10-22', title: 'Mha Puja / Nepal Sambat', type: 'holiday' },
            { date: '2025-10-23', title: 'Bhai Tika', type: 'holiday' },
            { date: '2025-10-24', title: 'Chhath Parva', type: 'holiday' },
            { date: '2025-12-25', title: 'Christmas', type: 'holiday' },
            { date: '2026-01-11', title: 'Prithvi Jayanti', type: 'holiday' },
            { date: '2026-01-15', title: 'Maghe Sankranti', type: 'holiday' },
            { date: '2026-01-29', title: 'Martyrs\' Day (Shahid Diwas)', type: 'holiday' },
            { date: '2026-02-19', title: 'Democracy Day', type: 'holiday' },
            { date: '2026-03-04', title: 'Maha Shivaratri', type: 'holiday' },
            { date: '2026-03-08', title: 'International Women\'s Day', type: 'holiday' },
            { date: '2026-03-14', title: 'Holi (Fagu Purnima)', type: 'holiday' },
            { date: '2026-04-14', title: 'Nepali New Year 2083', type: 'holiday' },



            // ══════ 2083 BS Holidays (Apr 2026 onwards) ══════
            { date: '2026-05-01', title: 'Labour Day', type: 'holiday' },
            { date: '2026-05-29', title: 'Republic Day', type: 'holiday' },
        ];

        const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

        // Convert our events to FullCalendar format
        function getFullCalendarEvents() {
            return academicEvents.map(e => ({
                title: e.title,
                start: e.date,
                allDay: true,
                classNames: ['event-' + e.type],
                extendedProps: { type: e.type }
            }));
        }

        function renderCalendar() {
            if (fcCalendar) {
                fcCalendar.updateSize();
                return;
            }

            const calEl = document.getElementById('calendar');
            fcCalendar = new FullCalendar.Calendar(calEl, {
                initialView: 'dayGridMonth',
                headerToolbar: {
                    left: 'prev,next today',
                    center: 'title',
                    right: 'dayGridMonth,listMonth'
                },
                height: 'auto',
                fixedWeekCount: false,
                dayMaxEvents: 3,
                events: getFullCalendarEvents(),
                eventDisplay: 'block',
                eventInteractive: false,
                buttonText: {
                    today: 'Today',
                    month: 'Month',
                    list: 'List'
                },
                dayCellClassNames: function(arg) {
                    const y = arg.date.getFullYear();
                    const m = String(arg.date.getMonth() + 1).padStart(2, '0');
                    const d = String(arg.date.getDate()).padStart(2, '0');
                    const dateStr = `${y}-${m}-${d}`;
                    
                    const isHoliday = academicEvents.some(e => e.date === dateStr && e.type === 'holiday');
                    if (isHoliday) {
                        return ['holiday-cell'];
                    }
                    return [];
                }
            });

            fcCalendar.render();
        }

        // ============================================================
        // ACADEMIC INSIGHT — Performance Prediction (Auto-load)
        // ============================================================
        let predictionData = null;
        let insightLoaded = false;
        let trendChart = null;

        async function loadPrediction() {
            if (!studentId) return;
            if (insightLoaded && predictionData) {
                // Already loaded, just show
                return;
            }

            document.getElementById('insightLoading').style.display = 'flex';
            document.getElementById('insightResults').style.display = 'none';

            try {
                predictionData = await api.predictStudentPerformance(studentId);
                renderPredictionResults(predictionData);
                insightLoaded = true;
            } catch (e) {
                document.getElementById('insightLoading').innerHTML =
                    '<div class="empty-icon">⚠️</div><p>Failed to generate prediction. Please try again later.</p>';
            }
        }

        function renderPredictionResults(data) {
            document.getElementById('insightLoading').style.display = 'none';
            document.getElementById('insightResults').style.display = 'block';

            const gradeColors = {
                'A': { bg: '#10b981', text: '#10b981' },
                'B': { bg: '#3b82f6', text: '#3b82f6' },
                'C': { bg: '#8b5cf6', text: '#8b5cf6' },
                'D': { bg: '#f59e0b', text: '#f59e0b' },
                'E': { bg: '#ef4444', text: '#ef4444' },
                'F': { bg: '#991b1b', text: '#991b1b' },
            };

            const grade = data.predicted_grade;
            const colors = gradeColors[grade] || gradeColors['C'];

            // Top stat cards
            const gradeEl = document.getElementById('insightGradeLetter');
            gradeEl.textContent = grade;
            gradeEl.style.color = colors.text;
            document.getElementById('insightStatGrade').style.borderTopColor = colors.bg;

            document.getElementById('insightGPA').textContent = data.gpa.toFixed(2);
            document.getElementById('insightAccuracy').innerHTML = data.model_accuracy + '<small>%</small>';

            // Risk level
            const riskColors = { low: '#10b981', medium: '#f59e0b', high: '#ef4444' };
            const riskEmojis = { low: '🛡️', medium: '⚠️', high: '🚨' };
            document.getElementById('insightRiskLabel').textContent = data.risk_label;
            document.getElementById('insightRiskLabel').style.color = riskColors[data.risk_level];
            document.getElementById('insightRiskEmoji').textContent = riskEmojis[data.risk_level] || '⚡';
            document.getElementById('insightRiskCard').style.borderTopColor = riskColors[data.risk_level];

            // Chart
            renderTrendChart(data.exam_scores);

            // Probability bars
            renderProbabilityBars(data.probabilities, grade);

            // Input features
            renderInputFeatures(data.input_features);

            // Recommendations
            renderRecommendations(data);
        }

        function renderTrendChart(examScores) {
            const chartWrap = document.querySelector('.insight-chart-wrap');
            const chartEmpty = document.getElementById('insightChartEmpty');

            if (!examScores || examScores.length === 0) {
                chartWrap.style.display = 'none';
                chartEmpty.style.display = 'flex';
                return;
            }

            chartWrap.style.display = 'block';
            chartEmpty.style.display = 'none';

            const labels = examScores.map(e => e.subject);
            const dataPoints = examScores.map(e => e.percentage);

            if (trendChart) trendChart.destroy();

            const ctx = document.getElementById('insightTrendChart').getContext('2d');
            const gradient = ctx.createLinearGradient(0, 0, 0, 300);
            gradient.addColorStop(0, 'rgba(124, 45, 245, 0.25)');
            gradient.addColorStop(1, 'rgba(124, 45, 245, 0.02)');

            trendChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Score %',
                        data: dataPoints,
                        backgroundColor: dataPoints.map(v =>
                            v >= 80 ? 'rgba(16, 185, 129, 0.8)' :
                            v >= 60 ? 'rgba(59, 130, 246, 0.8)' :
                            v >= 40 ? 'rgba(245, 158, 11, 0.8)' :
                            'rgba(239, 68, 68, 0.8)'
                        ),
                        borderColor: dataPoints.map(v =>
                            v >= 80 ? '#10b981' :
                            v >= 60 ? '#3b82f6' :
                            v >= 40 ? '#f59e0b' :
                            '#ef4444'
                        ),
                        borderWidth: 2,
                        borderRadius: 6,
                    }, {
                        label: 'Trend',
                        data: dataPoints,
                        type: 'line',
                        borderColor: '#7c2df5',
                        backgroundColor: gradient,
                        fill: true,
                        tension: 0.4,
                        pointBackgroundColor: '#7c2df5',
                        pointBorderColor: '#fff',
                        pointBorderWidth: 2,
                        pointRadius: 5,
                        pointHoverRadius: 7,
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            backgroundColor: 'rgba(30, 30, 50, 0.9)',
                            titleFont: { family: 'Inter', size: 13 },
                            bodyFont: { family: 'Inter', size: 12 },
                            padding: 12,
                            cornerRadius: 8,
                            callbacks: {
                                label: (ctx) => {
                                    const e = examScores[ctx.dataIndex];
                                    return `${e.marks}/${e.full_marks} (${e.percentage}%) — ${e.exam_type}`;
                                }
                            }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            max: 100,
                            grid: { color: 'rgba(0,0,0,0.05)' },
                            ticks: { font: { family: 'Inter', size: 11 }, callback: v => v + '%' }
                        },
                        x: {
                            grid: { display: false },
                            ticks: { font: { family: 'Inter', size: 11 }, maxRotation: 45 }
                        }
                    }
                }
            });
        }

        function renderProbabilityBars(probs, predicted) {
            const container = document.getElementById('insightProbsContainer');
            const barColors = {
                'A': '#10b981', 'B': '#3b82f6', 'C': '#8b5cf6',
                'D': '#f59e0b', 'E': '#ef4444', 'F': '#991b1b'
            };

            const grades = ['A', 'B', 'C', 'D', 'E', 'F'];
            container.innerHTML = grades.map(g => {
                const pct = probs[g] || 0;
                const isPredicted = g === predicted;
                return `
                    <div class="insight-prob-row ${isPredicted ? 'insight-prob-active' : ''}">
                        <div class="insight-prob-label">
                            <span class="insight-prob-grade" style="color: ${barColors[g]}">${g}</span>
                            ${isPredicted ? '<span class="insight-prob-predicted-tag">Predicted</span>' : ''}
                        </div>
                        <div class="insight-prob-bar-track">
                            <div class="insight-prob-bar-fill" style="width: 0%; background: ${barColors[g]};" data-width="${pct}"></div>
                        </div>
                        <div class="insight-prob-value">${pct.toFixed(1)}%</div>
                    </div>
                `;
            }).join('');

            setTimeout(() => {
                container.querySelectorAll('.insight-prob-bar-fill').forEach(bar => {
                    bar.style.width = bar.dataset.width + '%';
                });
            }, 100);
        }

        function renderInputFeatures(features) {
            const container = document.getElementById('insightFeaturesGrid');
            const featureCards = [
                { icon: '📅', label: 'Attendance', value: features.attendance_percentage + '%', sub: `${features.total_attendance_records} days recorded` },
                { icon: '📝', label: 'Subject Group I', value: features.optional_i_score + '%', sub: 'Average score' },
                { icon: '📝', label: 'Subject Group II', value: features.optional_ii_score + '%', sub: 'Average score' },
                { icon: '📝', label: 'Subject Group III', value: features.optional_iii_score + '%', sub: 'Average score' },
                { icon: '📊', label: 'Overall Score', value: features.overall_score + '%', sub: `${features.total_exam_results} exams averaged` },
                { icon: '🎓', label: 'Parent Education', value: (features.parent_education || '—').replace(/\b\w/g, l => l.toUpperCase()), sub: 'Socio-academic factor' },
            ];

            container.innerHTML = featureCards.map(f => `
                <div class="insight-feature-card">
                    <div class="insight-feature-icon">${f.icon}</div>
                    <div class="insight-feature-value">${f.value}</div>
                    <div class="insight-feature-label">${f.label}</div>
                    <div class="insight-feature-sub">${f.sub}</div>
                </div>
            `).join('');
        }

        function renderRecommendations(data) {
            const container = document.getElementById('insightRecommendations');
            const recs = [];
            const f = data.input_features;
            const grade = data.predicted_grade;

            if (f.attendance_percentage < 75) {
                recs.push({ type: 'warning', icon: '⚠️', title: 'Improve Attendance', text: `Your attendance is ${f.attendance_percentage}%. Aim for at least 80% to positively impact your grade prediction.` });
            } else if (f.attendance_percentage >= 90) {
                recs.push({ type: 'success', icon: '✅', title: 'Great Attendance', text: `Your attendance rate of ${f.attendance_percentage}% is excellent! Keep it up.` });
            } else {
                recs.push({ type: 'info', icon: '📌', title: 'Good Attendance', text: `Your attendance is ${f.attendance_percentage}%. Try to maintain or improve it above 85%.` });
            }

            if (f.overall_score < 40) {
                recs.push({ type: 'warning', icon: '📉', title: 'Scores Need Attention', text: `Your overall score average is ${f.overall_score}%. Focus on weaker subjects and seek additional help.` });
            } else if (f.overall_score >= 80) {
                recs.push({ type: 'success', icon: '🌟', title: 'Strong Scores', text: `Your overall score average of ${f.overall_score}% is impressive! Maintain consistency.` });
            } else {
                recs.push({ type: 'info', icon: '📚', title: 'Room for Growth', text: `Your overall average is ${f.overall_score}%. Practice more and review past exam papers.` });
            }

            if (f.total_exam_results === 0) {
                recs.push({ type: 'warning', icon: '📋', title: 'No Exam Data', text: 'No exam results found yet. The prediction uses default values. Results will improve once your exam scores are recorded.' });
            }
            if (f.total_attendance_records < 10) {
                recs.push({ type: 'info', icon: '📆', title: 'Limited Attendance Data', text: `Only ${f.total_attendance_records} attendance records found. Prediction accuracy improves with more data.` });
            }

            if (grade === 'E' || grade === 'F') {
                recs.push({ type: 'warning', icon: '🚨', title: 'Academic Alert', text: 'Your predicted grade indicates risk of failing. Please meet with your teachers and consider additional tutoring.' });
            } else if (grade === 'A') {
                recs.push({ type: 'success', icon: '🏆', title: 'Top Performer', text: 'You are predicted to achieve the highest grade! Continue your excellent study habits.' });
            }

            container.innerHTML = recs.map(r => `
                <div class="insight-rec insight-rec-${r.type}">
                    <div class="insight-rec-icon">${r.icon}</div>
                    <div class="insight-rec-body">
                        <div class="insight-rec-title">${r.title}</div>
                        <div class="insight-rec-text">${r.text}</div>
                    </div>
                </div>
            `).join('');
        }
