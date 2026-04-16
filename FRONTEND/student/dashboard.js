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
                profile: 'My Profile'
            };
            document.getElementById('pageTitle').textContent = titles[page] || 'Dashboard';

            if (page === 'attendance') loadAttendanceHistory();
            if (page === 'results') loadAllResults();
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
        // ALL RESULTS
        // ============================================================
        async function loadAllResults() {
            if (!studentId) return;
            try {
                const results = await api.getStudentResults(studentId);

                const tbody = document.getElementById('allResultsBody');
                if (results.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="7" class="empty-state"><div class="empty-icon"></div><p>No exam results yet</p></td></tr>';
                    return;
                }

                tbody.innerHTML = results.map(r => `
                    <tr>
                        <td>${r.subject_name || '—'}</td>
                        <td><span class="record-count">${r.subject_code || '—'}</span></td>
                        <td>${r.exam_type}</td>
                        <td><strong>${r.marks_obtained}</strong></td>
                        <td>${r.full_marks}</td>
                        <td><span class="badge ${r.grade_point === 'E' ? 'badge-absent' : 'badge-present'}">${r.grade_point || '—'}</span></td>
                        <td>${r.percentage}%</td>
                    </tr>
                `).join('');
            } catch (e) {
                showToast('Failed to load results', 'error');
            }
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

            // Hero info
            document.getElementById('profileName').textContent = s.full_name;
            document.getElementById('profileMeta').textContent = `Grade ${s.grade} • ${s.faculty} • Roll No: ${s.roll_no}`;

            // Hero badges
            document.getElementById('profileHeroPhone').textContent = s.phone || 'N/A';
            const dobFormatted = s.date_of_birth ? new Date(s.date_of_birth).toLocaleDateString('en-US', { year:'numeric', month:'short', day:'numeric' }) : 'N/A';
            document.getElementById('profileHeroDob').textContent = dobFormatted;
            const enrollFormatted = s.enrolled_date ? new Date(s.enrolled_date).toLocaleDateString('en-US', { year:'numeric', month:'short', day:'numeric' }) : 'N/A';
            document.getElementById('profileHeroEnrolled').textContent = enrollFormatted;

            // Academic info card
            document.getElementById('profileRoll').textContent = s.roll_no;
            document.getElementById('profileGrade').textContent = `Grade ${s.grade}`;
            document.getElementById('profileFaculty').textContent = s.faculty;
            document.getElementById('profileEnrolled').textContent = s.enrolled_date ? new Date(s.enrolled_date).toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' }) : '—';

            // Personal info card
            document.getElementById('profilePhone').textContent = s.phone || '—';
            document.getElementById('profileDob').textContent = s.date_of_birth ? new Date(s.date_of_birth).toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' }) : '—';
            document.getElementById('profileAddress').textContent = s.address || '—';

            // Family info card
            document.getElementById('profileGuardian').textContent = s.guardian_name || '—';
            document.getElementById('profileGuardianPhone').textContent = s.guardian_phone || '—';
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
