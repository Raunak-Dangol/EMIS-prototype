        // ============================================================
        // STATE
        // ============================================================
        let currentUser = null;
        let attendanceData = {};
        let allTeachers = [];

        // ============================================================
        // INIT
        // ============================================================
        (async () => {
            try {
                const data = await api.checkSession();
                if (!data.authenticated || data.user.role !== 'admin') {
                    window.location.href = '/';
                    return;
                }
                currentUser = data.user;
                document.getElementById('userName').textContent = currentUser.username;
                document.getElementById('userAvatar').textContent = currentUser.username.charAt(0).toUpperCase();
                document.getElementById('currentDate').textContent = new Date().toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
                document.getElementById('attendanceDate').value = new Date().toISOString().split('T')[0];

                await loadDashboardStats();
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
            const titles = { overview:'Dashboard Overview', students:'Student Management', teachers:'Teacher Management', attendance:'Attendance Tracker', results:'Bulk Marks Entry', subjects:'Subject Management', insight:'Academic Insight' };
            document.getElementById('pageTitle').textContent = titles[page] || 'Dashboard';
            if (page === 'overview') loadDashboardStats();
            if (page === 'students') loadStudents();
            if (page === 'teachers') loadTeachers();
            if (page === 'subjects') loadSubjects();
        }

        function toggleSidebar() { document.getElementById('sidebar').classList.toggle('open'); }

        // ============================================================
        // DASHBOARD STATS
        // ============================================================
        let facChart = null;
        let attChart = null;
        async function loadDashboardStats() {
            try {
                const stats = await api.getAdminStats();
                document.getElementById('statTotalStudents').textContent = stats.total_students;
                document.getElementById('statTotalTeachers').textContent = stats.total_teachers;
                document.getElementById('statAttendanceRate').textContent = stats.attendance.rate + '%';
                document.getElementById('statGrade11').textContent = stats.grade_11;
                document.getElementById('statGrade12').textContent = stats.grade_12;

                renderOverviewCharts(stats);
            } catch (e) { showToast('Failed to load stats', 'error'); }
        }

        function renderOverviewCharts(stats) {
            // 1. Faculty Doughnut Chart
            if (facChart) facChart.destroy();
            const ctxFac = document.getElementById('facultyChart').getContext('2d');
            facChart = new Chart(ctxFac, {
                type: 'doughnut',
                data: {
                    labels: ['Science', 'Management', 'Humanities'],
                    datasets: [{
                        data: [stats.faculty.science, stats.faculty.management, stats.faculty.humanities],
                        backgroundColor: ['#10b981', '#3b82f6', '#8b5cf6'],
                        borderWidth: 0,
                        hoverOffset: 4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '70%',
                    plugins: {
                        legend: { position: 'bottom', labels: { font: { family: 'Inter', size: 12 }, padding: 20 } }
                    }
                }
            });

            // 2. Attendance Trend Line Chart
            if (attChart) attChart.destroy();
            const ctxAtt = document.getElementById('attendanceTrendChart').getContext('2d');
            
            const attLabels = stats.attendance_trend.map(d => d.date);
            const attData = stats.attendance_trend.map(d => d.rate);
            
            const gradientAtt = ctxAtt.createLinearGradient(0, 0, 0, 250);
            gradientAtt.addColorStop(0, 'rgba(59, 130, 246, 0.4)');
            gradientAtt.addColorStop(1, 'rgba(59, 130, 246, 0.0)');

            attChart = new Chart(ctxAtt, {
                type: 'line',
                data: {
                    labels: attLabels,
                    datasets: [{
                        label: 'Attendance Rate (%)',
                        data: attData,
                        borderColor: '#3b82f6',
                        backgroundColor: gradientAtt,
                        borderWidth: 3,
                        fill: true,
                        tension: 0.4,
                        pointBackgroundColor: '#3b82f6',
                        pointBorderColor: '#fff',
                        pointBorderWidth: 2,
                        pointRadius: 4,
                        pointHoverRadius: 6
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: { beginAtZero: false, min: 50, max: 100, ticks: { callback: v => v + '%' }, grid: { color: 'rgba(0,0,0,0.05)' } },
                        x: { grid: { display: false } }
                    }
                }
            });
        }

        // ============================================================
        // STUDENTS
        // ============================================================
        async function loadStudents() {
            try {
                const params = {};
                const search = document.getElementById('studentSearch').value;
                const grade = document.getElementById('filterGrade').value;
                const faculty = document.getElementById('filterFaculty').value;
                if (search) params.search = search; if (grade) params.grade = grade; if (faculty) params.faculty = faculty;
                const students = await api.getStudents(params);
                document.getElementById('studentCount').textContent = `${students.length} student${students.length !== 1 ? 's' : ''}`;
                const tbody = document.getElementById('studentsTableBody');
                if (students.length === 0) { tbody.innerHTML = '<tr><td colspan="6" class="empty-state"><div class="empty-icon"></div><p>No students found</p></td></tr>'; return; }
                tbody.innerHTML = students.map(s => `<tr>
                    <td><strong>${s.roll_no}</strong></td><td>${s.full_name}</td>
                    <td><span class="badge badge-grade-${s.grade}">Grade ${s.grade}</span></td>
                    <td><span class="badge badge-${s.faculty.toLowerCase()}">${s.faculty}</span></td>
                    <td>${s.phone || '-'}</td>
                    <td class="row-actions"><button onclick="editStudent(${s.id})" title="Edit">Edit</button><button class="delete" onclick="deleteStudent(${s.id}, '${s.full_name}')" title="Delete">Delete</button></td>
                </tr>`).join('');
            } catch (e) { showToast('Failed to load students', 'error'); }
        }

        function openStudentModal(edit = false) {
            document.getElementById('studentModalTitle').textContent = edit ? 'Edit Student' : 'Add New Student';
            document.getElementById('sfPassword').required = !edit;
            document.getElementById('sfUsername').disabled = edit;
            if (!edit) { document.getElementById('studentForm').reset(); document.getElementById('editStudentId').value = ''; resetImagePreview(); }
            openModal('studentModal');
        }

        async function editStudent(id) {
            try {
                const s = await api.getStudent(id);
                document.getElementById('editStudentId').value = id;
                document.getElementById('sfFirstName').value = s.first_name;
                document.getElementById('sfLastName').value = s.last_name;
                document.getElementById('sfUsername').value = s.username || '';
                document.getElementById('sfGrade').value = s.grade;
                document.getElementById('sfFaculty').value = s.faculty;
                document.getElementById('sfRollNo').value = s.roll_no;
                document.getElementById('sfPhone').value = s.phone || '';
                document.getElementById('sfDob').value = s.date_of_birth || '';
                document.getElementById('sfAddress').value = s.address || '';
                document.getElementById('sfGuardian').value = s.guardian_name || '';
                document.getElementById('sfGuardianPhone').value = s.guardian_phone || '';
                document.getElementById('sfPassword').value = '';
                // Parent details
                document.getElementById('sfFatherName').value = s.father_name || '';
                document.getElementById('sfFatherPhone').value = s.father_phone || '';
                document.getElementById('sfMotherName').value = s.mother_name || '';
                document.getElementById('sfMotherPhone').value = s.mother_phone || '';
                document.getElementById('sfParentEducation').value = s.parent_education || '';
                // Profile image preview
                const preview = document.getElementById('sfImagePreview');
                if (s.profile_image) {
                    preview.innerHTML = `<img src="${s.profile_image}" alt="Profile">`;
                } else {
                    resetImagePreview();
                }
                openStudentModal(true);
            } catch (e) { showToast('Failed to load student', 'error'); }
        }

        async function submitStudent() {
            const id = document.getElementById('editStudentId').value;
            const formData = new FormData();
            formData.append('first_name', document.getElementById('sfFirstName').value);
            formData.append('last_name', document.getElementById('sfLastName').value);
            formData.append('username', document.getElementById('sfUsername').value);
            formData.append('password', document.getElementById('sfPassword').value);
            formData.append('grade', document.getElementById('sfGrade').value);
            formData.append('faculty', document.getElementById('sfFaculty').value);
            formData.append('roll_no', document.getElementById('sfRollNo').value);
            formData.append('phone', document.getElementById('sfPhone').value);
            formData.append('date_of_birth', document.getElementById('sfDob').value);
            formData.append('email', document.getElementById('sfEmail').value);
            formData.append('address', document.getElementById('sfAddress').value);
            formData.append('guardian_name', document.getElementById('sfGuardian').value);
            formData.append('guardian_phone', document.getElementById('sfGuardianPhone').value);
            // Parent details
            formData.append('father_name', document.getElementById('sfFatherName').value);
            formData.append('father_phone', document.getElementById('sfFatherPhone').value);
            formData.append('mother_name', document.getElementById('sfMotherName').value);
            formData.append('mother_phone', document.getElementById('sfMotherPhone').value);
            formData.append('parent_education', document.getElementById('sfParentEducation').value);
            // Profile image (file)
            const fileInput = document.getElementById('sfProfileImage');
            if (fileInput.files.length > 0) {
                formData.append('profile_image', fileInput.files[0]);
            }
            try {
                if (id) { await api.updateStudent(id, formData); showToast('Student updated', 'success'); }
                else { if (!formData.get('password')) { showToast('Password required', 'error'); return; } await api.createStudent(formData); showToast('Student created', 'success'); }
                closeModal('studentModal'); loadStudents();
            } catch (e) { showToast(e.message || 'Failed to save', 'error'); }
        }

        async function deleteStudent(id, name) {
            if (!confirm(`Delete ${name}?`)) return;
            try { await api.deleteStudent(id); showToast('Deleted', 'success'); loadStudents(); } catch (e) { showToast('Failed', 'error'); }
        }

        // ============================================================
        // TEACHERS
        // ============================================================
        async function loadTeachers() {
            try {
                allTeachers = await api.getTeachers();
                document.getElementById('teacherCount').textContent = `${allTeachers.length} teacher${allTeachers.length !== 1 ? 's' : ''}`;
                const tbody = document.getElementById('teachersTableBody');
                if (allTeachers.length === 0) { tbody.innerHTML = '<tr><td colspan="6" class="empty-state"><div class="empty-icon"></div><p>No teachers found. Add your first teacher!</p></td></tr>'; return; }
                tbody.innerHTML = allTeachers.map(t => `<tr>
                    <td><strong>${t.full_name}</strong></td>
                    <td>${t.department || '-'}</td>
                    <td>${t.phone || '-'}</td>
                    <td><span class="badge badge-management">${t.subject_count} subjects</span></td>
                    <td class="row-actions"><button onclick="editTeacher(${t.id})" title="Edit">Edit</button><button class="delete" onclick="deleteTeacher(${t.id}, '${t.full_name}')" title="Delete">Delete</button></td>
                </tr>`).join('');
            } catch (e) { showToast('Failed to load teachers', 'error'); }
        }

        function openTeacherModal(edit = false) {
            document.getElementById('teacherModalTitle').textContent = edit ? 'Edit Teacher' : 'Add New Teacher';
            if (!edit) { document.getElementById('teacherForm').reset(); document.getElementById('editTeacherId').value = ''; }
            openModal('teacherModal');
        }

        async function editTeacher(id) {
            try {
                const t = await api.getTeacher(id);
                document.getElementById('editTeacherId').value = id;
                document.getElementById('tfFirstName').value = t.first_name;
                document.getElementById('tfLastName').value = t.last_name;
                document.getElementById('tfPhone').value = t.phone || '';
                document.getElementById('tfDepartment').value = t.department || '';
                document.getElementById('tfQualification').value = t.qualification || '';
                openTeacherModal(true);
            } catch (e) { showToast('Failed to load teacher', 'error'); }
        }

        async function submitTeacher() {
            const id = document.getElementById('editTeacherId').value;
            const data = { first_name:document.getElementById('tfFirstName').value, last_name:document.getElementById('tfLastName').value, phone:document.getElementById('tfPhone').value, department:document.getElementById('tfDepartment').value, qualification:document.getElementById('tfQualification').value };
            try {
                if (id) { await api.updateTeacher(id, data); showToast('Teacher updated', 'success'); }
                else { await api.createTeacher(data); showToast('Teacher created', 'success'); }
                closeModal('teacherModal'); loadTeachers();
            } catch (e) { showToast(e.message || 'Failed to save', 'error'); }
        }

        async function deleteTeacher(id, name) {
            if (!confirm(`Delete teacher ${name}? Their subject assignments will be removed.`)) return;
            try { await api.deleteTeacher(id); showToast('Teacher deleted', 'success'); loadTeachers(); } catch (e) { showToast('Failed', 'error'); }
        }

        // ============================================================
        // ATTENDANCE
        // ============================================================
        async function loadAttendanceStudents() {
            const grade = document.getElementById('attendanceGrade').value;
            const faculty = document.getElementById('attendanceFaculty').value;
            const attDate = document.getElementById('attendanceDate').value;
            if (!grade) { document.getElementById('attendanceGrid').innerHTML = '<div class="empty-state"><div class="empty-icon"></div><p>Select a grade to mark attendance</p></div>'; return; }
            try {
                const params = { grade }; if (faculty) params.faculty = faculty;
                const students = await api.getStudents(params);
                let existingAtt = {};
                if (attDate) { const records = await api.getAttendance({ date: attDate, grade }); records.forEach(r => { existingAtt[r.student_id] = r.status; }); }
                attendanceData = {};
                const grid = document.getElementById('attendanceGrid');
                if (students.length === 0) { grid.innerHTML = '<div class="empty-state"><div class="empty-icon"></div><p>No students</p></div>'; return; }
                grid.innerHTML = students.map(s => {
                    const status = existingAtt[s.id] || 'Present'; attendanceData[s.id] = status;
                    return `<div class="attendance-item" id="att-${s.id}"><div class="student-info"><div><strong>${s.full_name}</strong><div class="student-roll">${s.roll_no} | ${s.faculty}</div></div></div><div class="status-toggle"><button class="status-btn ${status==='Present'?'active-present':''}" onclick="setStatus(${s.id},'Present')">P</button><button class="status-btn ${status==='Late'?'active-late':''}" onclick="setStatus(${s.id},'Late')">L</button><button class="status-btn ${status==='Absent'?'active-absent':''}" onclick="setStatus(${s.id},'Absent')">A</button></div></div>`;
                }).join('');
            } catch (e) { showToast('Failed', 'error'); }
        }

        function setStatus(studentId, status) {
            attendanceData[studentId] = status;
            const item = document.getElementById(`att-${studentId}`);
            item.querySelectorAll('.status-btn').forEach(btn => btn.className = 'status-btn');
            const buttons = item.querySelectorAll('.status-btn');
            if (status === 'Present') buttons[0].classList.add('active-present');
            if (status === 'Late') buttons[1].classList.add('active-late');
            if (status === 'Absent') buttons[2].classList.add('active-absent');
        }

        function markAll(status) { Object.keys(attendanceData).forEach(sid => setStatus(parseInt(sid), status)); }

        async function saveAttendance() {
            const attDate = document.getElementById('attendanceDate').value;
            if (!attDate) { showToast('Select a date', 'error'); return; }
            const records = Object.entries(attendanceData).map(([student_id, status]) => ({ student_id: parseInt(student_id), status }));
            if (records.length === 0) { showToast('No attendance to save', 'error'); return; }
            try { await api.recordAttendance(attDate, records); showToast('Attendance saved!', 'success'); } catch (e) { showToast('Failed', 'error'); }
        }

        // ============================================================
        // BULK MARKS ENTRY
        // ============================================================
        async function loadMarksSubjects() {
            const grade = document.getElementById('marksGrade').value;
            const faculty = document.getElementById('marksFaculty').value;
            const subjectSelect = document.getElementById('marksSubject');
            subjectSelect.innerHTML = '<option value="">Select Subject</option>';
            if (!grade || !faculty) return;
            try {
                const subjects = await api.getSubjects({ grade, faculty });
                subjects.forEach(s => {
                    const opt = document.createElement('option');
                    opt.value = s.id;
                    opt.textContent = `${s.name} (${s.code})`;
                    opt.dataset.fullMarks = s.full_marks;
                    subjectSelect.appendChild(opt);
                });
            } catch (e) { showToast('Failed to load subjects', 'error'); }
        }

        async function loadMarksGrid() {
            const subjectId = document.getElementById('marksSubject').value;
            const examType = document.getElementById('marksExamType').value;
            const grade = document.getElementById('marksGrade').value;
            const faculty = document.getElementById('marksFaculty').value;
            const table = document.getElementById('marksGridTable');
            const empty = document.getElementById('marksEmptyState');

            if (!subjectId || !grade || !faculty) { table.classList.add('marks-table-hidden'); empty.classList.remove('is-hidden'); empty.classList.add('is-visible'); return; }

            try {
                // Get subject info
                const selectedOpt = document.getElementById('marksSubject').selectedOptions[0];
                const fullMarks = selectedOpt?.dataset?.fullMarks || 100;
                document.getElementById('marksFullMarks').textContent = fullMarks;

                // Get students for this grade/faculty
                const students = await api.getStudents({ grade, faculty });

                // Get existing results for this subject if exam type is selected
                let existingMarks = {};
                if (examType) {
                    const results = await api.getResults({ subject_id: subjectId, exam_type: examType });
                    results.forEach(r => { existingMarks[r.student_id] = r.marks_obtained; });
                }

                document.getElementById('marksInfo').textContent = `${students.length} students`;

                const tbody = document.getElementById('marksGridBody');
                if (students.length === 0) { table.classList.add('marks-table-hidden'); empty.classList.remove('is-hidden'); empty.classList.add('is-visible'); return; }

                table.classList.remove('marks-table-hidden');
                table.classList.add('is-table');
                empty.classList.remove('is-visible');
                empty.classList.add('is-hidden');

                tbody.innerHTML = students.map((s, i) => {
                    const existing = existingMarks[s.id];
                    const val = existing !== undefined ? existing : '';
                    const grade_class = existing !== undefined ? (existing >= 35 ? 'pass' : 'fail') : '';
                    const gradeLabel = existing !== undefined ? calcGrade(existing, fullMarks) : '';
                    return `<tr>
                        <td class="marks-row-num">${i + 1}</td>
                        <td><strong>${s.roll_no}</strong></td>
                        <td>${s.full_name}</td>
                        <td><input type="number" class="marks-input ${grade_class}" id="marks-${s.id}" data-student-id="${s.id}" data-full-marks="${fullMarks}" value="${val}" min="0" max="${fullMarks}" onchange="onMarksChange(this)" oninput="onMarksChange(this)"></td>
                        <td><span id="grade-${s.id}" class="marks-grade-label">${gradeLabel}</span></td>
                    </tr>`;
                }).join('');
            } catch (e) { showToast('Failed to load marks grid', 'error'); }
        }

        function calcGrade(marks, fullMarks) {
            const pct = (marks / fullMarks) * 100;
            if (pct >= 90) return 'A+'; if (pct >= 80) return 'A'; if (pct >= 70) return 'B+';
            if (pct >= 60) return 'B'; if (pct >= 50) return 'C+'; if (pct >= 40) return 'C';
            if (pct >= 35) return 'D'; return 'E';
        }

        function onMarksChange(input) {
            const val = parseFloat(input.value);
            const fm = parseFloat(input.dataset.fullMarks);
            const sid = input.dataset.studentId;
            const gradeSpan = document.getElementById(`grade-${sid}`);
            input.classList.remove('pass', 'fail');
            if (!isNaN(val)) {
                if (val >= (fm * 0.35)) { input.classList.add('pass'); } else { input.classList.add('fail'); }
                gradeSpan.textContent = calcGrade(val, fm);
                gradeSpan.classList.remove('grade-pass', 'grade-fail');
                gradeSpan.classList.add(val >= (fm * 0.35) ? 'grade-pass' : 'grade-fail');
            } else { gradeSpan.textContent = ''; }
        }

        async function saveBulkMarks() {
            const subjectId = document.getElementById('marksSubject').value;
            const examType = document.getElementById('marksExamType').value;
            const examDate = document.getElementById('marksExamDate').value;
            if (!subjectId || !examType) { showToast('Select subject and exam type first', 'error'); return; }
            const inputs = document.querySelectorAll('.marks-input');
            const marks = [];
            inputs.forEach(input => {
                if (input.value !== '') {
                    marks.push({ student_id: parseInt(input.dataset.studentId), marks_obtained: parseFloat(input.value) });
                }
            });
            if (marks.length === 0) { showToast('No marks entered', 'error'); return; }
            try {
                const result = await api.saveBulkResults({ subject_id: parseInt(subjectId), exam_type: examType, exam_date: examDate, marks });
                showToast(result.message, 'success');
            } catch (e) { showToast(e.message || 'Failed to save marks', 'error'); }
        }

        // ============================================================
        // SUBJECTS
        // ============================================================
        async function loadSubjects() {
            try {
                const params = {};
                const grade = document.getElementById('subjectGradeFilter').value;
                const faculty = document.getElementById('subjectFacultyFilter').value;
                if (grade) params.grade = grade; if (faculty) params.faculty = faculty;
                const subjects = await api.getSubjects(params);
                document.getElementById('subjectCount').textContent = `${subjects.length} subject${subjects.length !== 1 ? 's' : ''}`;
                const tbody = document.getElementById('subjectsTableBody');
                if (subjects.length === 0) { tbody.innerHTML = '<tr><td colspan="7" class="empty-state"><div class="empty-icon"></div><p>No subjects found</p></td></tr>'; return; }
                tbody.innerHTML = subjects.map(s => `<tr>
                    <td><strong>${s.code}</strong></td><td>${s.name}</td>
                    <td><span class="badge badge-grade-${s.grade}">Grade ${s.grade}</span></td>
                    <td><span class="badge badge-${s.faculty.toLowerCase()}">${s.faculty}</span></td>
                    <td>${s.teacher_name ? `<span class="teacher-assigned">${s.teacher_name}</span>` : `<button class="btn btn-secondary btn-sm" onclick="openAssignTeacher(${s.id}, '${s.name} (${s.code})')">Assign</button>`}</td>
                    <td>${s.full_marks} / ${s.pass_marks}</td>
                    <td class="row-actions">
                        ${s.teacher_name ? `<button onclick="openAssignTeacher(${s.id}, '${s.name} (${s.code})')" title="Reassign Teacher">Reassign</button>` : ''}
                        <button class="delete" onclick="deleteSubject(${s.id}, '${s.name}')" title="Delete">Delete</button>
                    </td>
                </tr>`).join('');
            } catch (e) { showToast('Failed to load subjects', 'error'); }
        }

        async function openSubjectModal() {
            // Load teachers for dropdown
            try { allTeachers = await api.getTeachers(); } catch(e) {}
            const sel = document.getElementById('subjTeacher');
            sel.innerHTML = '<option value="">None</option>' + allTeachers.map(t => `<option value="${t.id}">${t.full_name}</option>`).join('');
            document.getElementById('subjectForm').reset();
            openModal('subjectModal');
        }

        async function submitSubject() {
            const data = { name:document.getElementById('subjName').value, code:document.getElementById('subjCode').value, grade:document.getElementById('subjGrade').value, faculty:document.getElementById('subjFaculty').value, credit_hours:parseInt(document.getElementById('subjCredits').value), full_marks:parseInt(document.getElementById('subjFullMarks').value), teacher_id:document.getElementById('subjTeacher').value || null };
            if (!data.name || !data.code) { showToast('Name and code required', 'error'); return; }
            try { await api.createSubject(data); showToast('Subject created!', 'success'); closeModal('subjectModal'); loadSubjects(); } catch (e) { showToast(e.message || 'Failed', 'error'); }
        }

        async function deleteSubject(id, name) {
            if (!confirm(`Delete "${name}"?`)) return;
            try { await api.deleteSubject(id); showToast('Deleted', 'success'); loadSubjects(); } catch (e) { showToast('Failed', 'error'); }
        }

        async function openAssignTeacher(subjectId, subjectInfo) {
            try { allTeachers = await api.getTeachers(); } catch(e) {}
            document.getElementById('assignSubjectId').value = subjectId;
            document.getElementById('assignSubjectInfo').textContent = `Assign a teacher to: ${subjectInfo}`;
            const sel = document.getElementById('assignTeacherSelect');
            sel.innerHTML = '<option value="">None (Unassign)</option>' + allTeachers.map(t => `<option value="${t.id}">${t.full_name} - ${t.department || 'No dept'}</option>`).join('');
            openModal('assignTeacherModal');
        }

        async function submitAssignTeacher() {
            const subjectId = document.getElementById('assignSubjectId').value;
            const teacherId = document.getElementById('assignTeacherSelect').value;
            try {
                await api.updateSubject(subjectId, { teacher_id: teacherId || null });
                showToast('Teacher assigned!', 'success');
                closeModal('assignTeacherModal');
                loadSubjects();
            } catch (e) { showToast('Failed to assign', 'error'); }
        }

        // ============================================================
        // MODAL HELPERS
        // ============================================================
        function openModal(id) { document.getElementById(id).classList.add('show'); }
        function closeModal(id) { document.getElementById(id).classList.remove('show'); }
        document.querySelectorAll('.modal-overlay').forEach(overlay => { overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.remove('show'); }); });

        // ============================================================
        // LOGOUT, TOAST
        // ============================================================
        async function handleLogout() { try { await api.logout(); } catch (e) {} window.location.href = '/'; }

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
        // PROFILE IMAGE PREVIEW
        // ============================================================
        function previewProfileImage(input) {
            const preview = document.getElementById('sfImagePreview');
            if (input.files && input.files[0]) {
                const reader = new FileReader();
                reader.onload = function(e) {
                    preview.innerHTML = `<img src="${e.target.result}" alt="Preview">`;
                };
                reader.readAsDataURL(input.files[0]);
            } else {
                resetImagePreview();
            }
        }

        function resetImagePreview() {
            document.getElementById('sfImagePreview').innerHTML = '<span class="file-upload-placeholder">No image selected</span>';
        }

        // ============================================================
        // ACADEMIC INSIGHT - Admin Prediction
        // ============================================================
        let adminTrendChart = null;

        async function adminGeneratePrediction() {
            const username = document.getElementById('adminInsightUsername').value.trim();
            if (!username) { showToast('Please enter a student username', 'error'); return; }

            const btn = document.getElementById('adminInsightBtn');
            const btnText = document.getElementById('adminInsightBtnText');
            const spinner = document.getElementById('adminInsightSpinner');
            const errorEl = document.getElementById('adminInsightError');

            btn.disabled = true;
            btnText.textContent = 'Analyzing...';
            spinner.style.display = 'inline-block';
            errorEl.style.display = 'none';
            document.getElementById('adminInsightResults').style.display = 'none';

            try {
                const data = await api.predictByUsername(username);
                renderAdminPrediction(data);
            } catch (e) {
                errorEl.textContent = e.message || 'Student not found. Please check the username.';
                errorEl.style.display = 'block';
            } finally {
                btn.disabled = false;
                btnText.textContent = 'Generate Prediction';
                spinner.style.display = 'none';
            }
        }

        function renderAdminPrediction(data) {
            document.getElementById('adminInsightResults').style.display = 'block';

            // Student banner
            const si = data.student_info;
            document.getElementById('adminStudentAvatar').textContent = si.full_name.charAt(0).toUpperCase();
            document.getElementById('adminStudentName').textContent = si.full_name;
            document.getElementById('adminStudentMeta').textContent = `Grade ${si.grade} | ${si.faculty} | Roll No: ${si.roll_no}`;

            const gradeColors = {
                'A': '#10b981', 'B': '#3b82f6', 'C': '#8b5cf6',
                'D': '#f59e0b', 'E': '#ef4444', 'F': '#991b1b'
            };
            const grade = data.predicted_grade;
            const color = gradeColors[grade] || '#8b5cf6';

            // Top stats
            const gradeEl = document.getElementById('adminInsightGrade');
            gradeEl.textContent = grade;
            gradeEl.style.color = color;
            document.getElementById('adminInsightStatGrade').style.borderTopColor = color;

            document.getElementById('adminInsightGPA').textContent = data.gpa.toFixed(2);
            document.getElementById('adminInsightAccuracy').innerHTML = data.model_accuracy + '<small>%</small>';

            const riskColors = { low: '#10b981', medium: '#f59e0b', high: '#ef4444' };
            const riskEmojis = { low: '', medium: '', high: '' };
            document.getElementById('adminInsightRiskLabel').textContent = data.risk_label;
            document.getElementById('adminInsightRiskLabel').style.color = riskColors[data.risk_level];
            document.getElementById('adminInsightRiskEmoji').textContent = riskEmojis[data.risk_level] || '';
            document.getElementById('adminInsightRiskCard').style.borderTopColor = riskColors[data.risk_level];

            // Chart
            adminRenderTrendChart(data.exam_scores);

            // Probability bars
            adminRenderProbs(data.probabilities, grade);

            // Features
            adminRenderFeatures(data.input_features);

            // Recommendations
            adminRenderRecs(data);

            document.getElementById('adminInsightResults').scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        function adminRenderTrendChart(examScores) {
            const chartWrap = document.querySelector('#page-insight .insight-chart-wrap');
            const chartEmpty = document.getElementById('adminChartEmpty');

            if (!examScores || examScores.length === 0) {
                chartWrap.style.display = 'none';
                chartEmpty.style.display = 'flex';
                return;
            }
            chartWrap.style.display = 'block';
            chartEmpty.style.display = 'none';

            const labels = examScores.map(e => e.subject);
            const dataPoints = examScores.map(e => e.percentage);

            if (adminTrendChart) adminTrendChart.destroy();

            const ctx = document.getElementById('adminInsightChart').getContext('2d');
            const gradient = ctx.createLinearGradient(0, 0, 0, 300);
            gradient.addColorStop(0, 'rgba(124, 45, 245, 0.25)');
            gradient.addColorStop(1, 'rgba(124, 45, 245, 0.02)');

            adminTrendChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels,
                    datasets: [{
                        label: 'Score %',
                        data: dataPoints,
                        backgroundColor: dataPoints.map(v => v >= 80 ? 'rgba(16,185,129,0.8)' : v >= 60 ? 'rgba(59,130,246,0.8)' : v >= 40 ? 'rgba(245,158,11,0.8)' : 'rgba(239,68,68,0.8)'),
                        borderColor: dataPoints.map(v => v >= 80 ? '#10b981' : v >= 60 ? '#3b82f6' : v >= 40 ? '#f59e0b' : '#ef4444'),
                        borderWidth: 2, borderRadius: 6,
                    }, {
                        label: 'Trend', data: dataPoints, type: 'line',
                        borderColor: '#7c2df5', backgroundColor: gradient, fill: true, tension: 0.4,
                        pointBackgroundColor: '#7c2df5', pointBorderColor: '#fff', pointBorderWidth: 2, pointRadius: 5, pointHoverRadius: 7,
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { display: false }, tooltip: { backgroundColor: 'rgba(30,30,50,0.9)', padding: 12, cornerRadius: 8, callbacks: { label: (ctx) => { const e = examScores[ctx.dataIndex]; return `${e.marks}/${e.full_marks} (${e.percentage}%) - ${e.exam_type}`; } } } },
                    scales: { y: { beginAtZero: true, max: 100, grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { callback: v => v + '%' } }, x: { grid: { display: false }, ticks: { maxRotation: 45 } } }
                }
            });
        }

        function adminRenderProbs(probs, predicted) {
            const container = document.getElementById('adminInsightProbs');
            const barColors = { 'A': '#10b981', 'B': '#3b82f6', 'C': '#8b5cf6', 'D': '#f59e0b', 'E': '#ef4444', 'F': '#991b1b' };
            container.innerHTML = ['A','B','C','D','E','F'].map(g => {
                const pct = probs[g] || 0;
                const active = g === predicted;
                return `<div class="insight-prob-row ${active ? 'insight-prob-active' : ''}"><div class="insight-prob-label"><span class="insight-prob-grade" style="color:${barColors[g]}">${g}</span>${active ? '<span class="insight-prob-predicted-tag">Predicted</span>' : ''}</div><div class="insight-prob-bar-track"><div class="insight-prob-bar-fill" style="width:0%;background:${barColors[g]}" data-width="${pct}"></div></div><div class="insight-prob-value">${pct.toFixed(1)}%</div></div>`;
            }).join('');
            setTimeout(() => { container.querySelectorAll('.insight-prob-bar-fill').forEach(b => { b.style.width = b.dataset.width + '%'; }); }, 100);
        }

        function adminRenderFeatures(f) {
            const container = document.getElementById('adminInsightFeatures');
            const cards = [
                { icon: '', label: 'Attendance', value: f.attendance_percentage + '%', sub: `${f.total_attendance_records} days` },
                { icon: '', label: 'Group I', value: f.optional_i_score + '%', sub: 'Avg score' },
                { icon: '', label: 'Group II', value: f.optional_ii_score + '%', sub: 'Avg score' },
                { icon: '', label: 'Group III', value: f.optional_iii_score + '%', sub: 'Avg score' },
                { icon: '', label: 'Overall', value: f.overall_score + '%', sub: `${f.total_exam_results} exams` },
                { icon: '', label: 'Parent Edu', value: (f.parent_education || '-').replace(/\b\w/g, l => l.toUpperCase()), sub: 'Factor' },
            ];
            container.innerHTML = cards.map(c => `<div class="insight-feature-card"><div class="insight-feature-icon">${c.icon}</div><div class="insight-feature-value">${c.value}</div><div class="insight-feature-label">${c.label}</div><div class="insight-feature-sub">${c.sub}</div></div>`).join('');
        }

        function adminRenderRecs(data) {
            const container = document.getElementById('adminInsightRecs');
            const recs = [];
            const f = data.input_features;
            const grade = data.predicted_grade;

            if (f.attendance_percentage < 75) recs.push({ type: 'warning', icon: '', title: 'Low Attendance', text: `Attendance is ${f.attendance_percentage}%. Needs improvement.` });
            else if (f.attendance_percentage >= 90) recs.push({ type: 'success', icon: '', title: 'Great Attendance', text: `${f.attendance_percentage}% attendance rate.` });
            else recs.push({ type: 'info', icon: '', title: 'Good Attendance', text: `${f.attendance_percentage}% attendance.` });

            if (f.overall_score < 40) recs.push({ type: 'warning', icon: '', title: 'Low Scores', text: `Overall ${f.overall_score}%. Needs attention.` });
            else if (f.overall_score >= 80) recs.push({ type: 'success', icon: '', title: 'Strong Scores', text: `Overall ${f.overall_score}%.` });
            else recs.push({ type: 'info', icon: '', title: 'Average Scores', text: `Overall ${f.overall_score}%.` });

            if (f.total_exam_results === 0) recs.push({ type: 'warning', icon: '', title: 'No Exam Data', text: 'Using default values.' });
            if (f.total_attendance_records < 10) recs.push({ type: 'info', icon: '', title: 'Limited Data', text: `Only ${f.total_attendance_records} records.` });
            if (grade === 'E' || grade === 'F') recs.push({ type: 'warning', icon: '', title: 'Academic Alert', text: 'Student at risk of failing.' });
            else if (grade === 'A') recs.push({ type: 'success', icon: '', title: 'Top Performer', text: 'Predicted highest grade.' });

            container.innerHTML = recs.map(r => `<div class="insight-rec insight-rec-${r.type}"><div class="insight-rec-icon">${r.icon}</div><div class="insight-rec-body"><div class="insight-rec-title">${r.title}</div><div class="insight-rec-text">${r.text}</div></div></div>`).join('');
        }
