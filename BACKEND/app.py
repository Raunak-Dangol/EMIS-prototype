import os
import uuid
from datetime import datetime, date, timedelta
from functools import wraps

from flask import Flask, request, jsonify, session, send_from_directory
from flask_cors import CORS
from werkzeug.security import generate_password_hash
from werkzeug.utils import secure_filename

from database import db, init_db
from models import User, Student, Teacher, Subject, Attendance, ExamResult
from predictor import predict_grade, get_model

# ---------------------------------------------------------------------------
# App Configuration
# ---------------------------------------------------------------------------
BASE_DIR = os.path.abspath(os.path.dirname(__file__))
FRONTEND_DIR = os.path.join(BASE_DIR, '..', 'FRONTEND')

app = Flask(__name__, static_folder=FRONTEND_DIR, static_url_path='')
app.config['SECRET_KEY'] = 'nccs-emis-secret-key-change-in-production'
app.config['SQLALCHEMY_DATABASE_URI'] = f"sqlite:///{os.path.join(BASE_DIR, 'database.db')}"
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(hours=8)

# Upload configuration
UPLOAD_FOLDER = os.path.join(FRONTEND_DIR, 'uploads')
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

CORS(app, supports_credentials=True)

# Initialize DB
init_db(app)


def allowed_file(filename):
    """Check if the uploaded file has an allowed image extension."""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def save_upload(file):
    """Save an uploaded image with a unique name. Returns the relative path."""
    ext = file.filename.rsplit('.', 1)[1].lower()
    unique_name = f"{datetime.utcnow().strftime('%Y%m%d%H%M%S')}_{uuid.uuid4().hex[:8]}.{ext}"
    safe_name = secure_filename(unique_name)
    file.save(os.path.join(UPLOAD_FOLDER, safe_name))
    return f'/uploads/{safe_name}'

# ---------------------------------------------------------------------------
# Auth Decorators
# ---------------------------------------------------------------------------

def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({'error': 'Authentication required'}), 401
        return f(*args, **kwargs)
    return decorated


def admin_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({'error': 'Authentication required'}), 401
        if session.get('role') != 'admin':
            return jsonify({'error': 'Admin access required'}), 403
        return f(*args, **kwargs)
    return decorated


# ---------------------------------------------------------------------------
# Page Routes (Serve Frontend)
# ---------------------------------------------------------------------------

@app.route('/')
def serve_index():
    return send_from_directory(FRONTEND_DIR, 'index.html')


@app.route('/admin/dashboard')
def serve_admin_dashboard():
    return send_from_directory(FRONTEND_DIR, 'admin/dashboard.html')


@app.route('/student/dashboard')
def serve_student_dashboard():
    return send_from_directory(FRONTEND_DIR, 'student/dashboard.html')


@app.route('/uploads/<path:filename>')
def serve_upload(filename):
    return send_from_directory(UPLOAD_FOLDER, filename)


# ---------------------------------------------------------------------------
# Auth API
# ---------------------------------------------------------------------------

@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json()
    username = data.get('username', '').strip()
    password = data.get('password', '')

    if not username or not password:
        return jsonify({'error': 'Username and password are required'}), 400

    user = User.query.filter_by(username=username).first()
    if not user or not user.check_password(password):
        return jsonify({'error': 'Invalid username or password'}), 401

    if not user.is_active:
        return jsonify({'error': 'Account is deactivated'}), 403

    session.permanent = True
    session['user_id'] = user.id
    session['username'] = user.username
    session['role'] = user.role

    response_data = {
        'message': 'Login successful',
        'user': user.to_dict()
    }

    # Include student profile id if student
    if user.role == 'student' and user.student_profile:
        response_data['student_id'] = user.student_profile.id

    return jsonify(response_data), 200


@app.route('/api/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'message': 'Logged out successfully'}), 200


@app.route('/api/session', methods=['GET'])
def check_session():
    if 'user_id' in session:
        user = User.query.get(session['user_id'])
        if user:
            data = {'authenticated': True, 'user': user.to_dict()}
            if user.role == 'student' and user.student_profile:
                data['student_id'] = user.student_profile.id
            return jsonify(data), 200
    return jsonify({'authenticated': False}), 200


# ---------------------------------------------------------------------------
# Dashboard Stats API
# ---------------------------------------------------------------------------

@app.route('/api/dashboard/stats', methods=['GET'])
@admin_required
def admin_dashboard_stats():
    total_students = Student.query.count()
    grade_11 = Student.query.filter_by(grade=11).count()
    grade_12 = Student.query.filter_by(grade=12).count()

    # Today's attendance
    today = date.today()
    today_attendance = Attendance.query.filter_by(date=today).all()
    present_today = sum(1 for a in today_attendance if a.status == 'Present')
    absent_today = sum(1 for a in today_attendance if a.status == 'Absent')
    late_today = sum(1 for a in today_attendance if a.status == 'Late')
    attendance_rate = round((present_today + late_today) / total_students * 100, 1) if total_students > 0 else 0

    # Faculty distribution
    science = Student.query.filter_by(faculty='Science').count()
    management = Student.query.filter_by(faculty='Management').count()
    humanities = Student.query.filter_by(faculty='Humanities').count()

    return jsonify({
        'total_students': total_students,
        'grade_11': grade_11,
        'grade_12': grade_12,
        'total_teachers': Teacher.query.count(),
        'attendance': {
            'present': present_today,
            'absent': absent_today,
            'late': late_today,
            'rate': attendance_rate
        },
        'faculty': {
            'science': science,
            'management': management,
            'humanities': humanities
        }
    }), 200


@app.route('/api/dashboard/student', methods=['GET'])
@login_required
def student_dashboard_data():
    user = User.query.get(session['user_id'])
    if not user or not user.student_profile:
        return jsonify({'error': 'Student profile not found'}), 404

    student = user.student_profile

    # Attendance stats
    total_records = student.attendances.count()
    present_count = student.attendances.filter_by(status='Present').count()
    late_count = student.attendances.filter_by(status='Late').count()
    absent_count = student.attendances.filter_by(status='Absent').count()
    attendance_rate = round((present_count + late_count) / total_records * 100, 1) if total_records > 0 else 0

    # Recent results
    recent_results = student.exam_results.order_by(ExamResult.created_at.desc()).limit(5).all()

    return jsonify({
        'student': student.to_dict(),
        'attendance': {
            'total': total_records,
            'present': present_count,
            'late': late_count,
            'absent': absent_count,
            'rate': attendance_rate
        },
        'recent_results': [r.to_dict() for r in recent_results]
    }), 200


# ---------------------------------------------------------------------------
# Students CRUD API
# ---------------------------------------------------------------------------

@app.route('/api/students', methods=['GET'])
@admin_required
def get_students():
    grade = request.args.get('grade', type=int)
    faculty = request.args.get('faculty')
    search = request.args.get('search', '')

    query = Student.query
    if grade:
        query = query.filter_by(grade=grade)
    if faculty:
        query = query.filter_by(faculty=faculty)
    if search:
        query = query.filter(
            (Student.first_name.ilike(f'%{search}%')) |
            (Student.last_name.ilike(f'%{search}%')) |
            (Student.roll_no.ilike(f'%{search}%'))
        )

    students = query.order_by(Student.grade, Student.roll_no).all()
    return jsonify([s.to_dict() for s in students]), 200


@app.route('/api/students', methods=['POST'])
@admin_required
def create_student():
    # Support both JSON and multipart/form-data
    if request.content_type and 'multipart/form-data' in request.content_type:
        data = request.form.to_dict()
    else:
        data = request.get_json() or {}

    required = ['first_name', 'last_name', 'grade', 'faculty', 'roll_no', 'username', 'password']
    for field in required:
        if not data.get(field):
            return jsonify({'error': f'{field} is required'}), 400

    # Check if username already exists
    if User.query.filter_by(username=data['username']).first():
        return jsonify({'error': 'Username already exists'}), 409

    # Check if roll_no already exists for the same grade
    existing = Student.query.filter_by(roll_no=data['roll_no'], grade=data['grade']).first()
    if existing:
        return jsonify({'error': 'Roll number already exists for this grade'}), 409

    # Handle profile image upload
    profile_image_path = None
    if 'profile_image' in request.files:
        file = request.files['profile_image']
        if file and file.filename and allowed_file(file.filename):
            profile_image_path = save_upload(file)

    # Create user account
    user = User(
        username=data['username'],
        email=data.get('email'),
        role='student'
    )
    user.set_password(data['password'])
    db.session.add(user)
    db.session.flush()  # Get user.id

    # Create student profile
    student = Student(
        user_id=user.id,
        first_name=data['first_name'],
        last_name=data['last_name'],
        grade=int(data['grade']),
        faculty=data['faculty'],
        roll_no=data['roll_no'],
        phone=data.get('phone'),
        address=data.get('address'),
        guardian_name=data.get('guardian_name'),
        guardian_phone=data.get('guardian_phone'),
        date_of_birth=datetime.strptime(data['date_of_birth'], '%Y-%m-%d').date() if data.get('date_of_birth') else None,
        father_name=data.get('father_name'),
        father_phone=data.get('father_phone'),
        mother_name=data.get('mother_name'),
        mother_phone=data.get('mother_phone'),
        parent_education=data.get('parent_education'),
        profile_image=profile_image_path
    )
    db.session.add(student)
    db.session.commit()

    return jsonify({'message': 'Student created successfully', 'student': student.to_dict()}), 201


@app.route('/api/students/<int:student_id>', methods=['GET'])
@login_required
def get_student(student_id):
    student = Student.query.get_or_404(student_id)
    return jsonify(student.to_dict()), 200


@app.route('/api/students/<int:student_id>', methods=['PUT'])
@admin_required
def update_student(student_id):
    student = Student.query.get_or_404(student_id)

    # Support both JSON and multipart/form-data
    if request.content_type and 'multipart/form-data' in request.content_type:
        data = request.form.to_dict()
    else:
        data = request.get_json() or {}

    if 'first_name' in data:
        student.first_name = data['first_name']
    if 'last_name' in data:
        student.last_name = data['last_name']
    if 'grade' in data:
        student.grade = int(data['grade'])
    if 'faculty' in data:
        student.faculty = data['faculty']
    if 'roll_no' in data:
        student.roll_no = data['roll_no']
    if 'phone' in data:
        student.phone = data['phone']
    if 'address' in data:
        student.address = data['address']
    if 'guardian_name' in data:
        student.guardian_name = data['guardian_name']
    if 'guardian_phone' in data:
        student.guardian_phone = data['guardian_phone']
    if 'date_of_birth' in data and data['date_of_birth']:
        student.date_of_birth = datetime.strptime(data['date_of_birth'], '%Y-%m-%d').date()

    # New parent fields
    if 'father_name' in data:
        student.father_name = data['father_name']
    if 'father_phone' in data:
        student.father_phone = data['father_phone']
    if 'mother_name' in data:
        student.mother_name = data['mother_name']
    if 'mother_phone' in data:
        student.mother_phone = data['mother_phone']
    if 'parent_education' in data:
        student.parent_education = data['parent_education']

    # Handle profile image upload
    if 'profile_image' in request.files:
        file = request.files['profile_image']
        if file and file.filename and allowed_file(file.filename):
            # Delete old image if exists
            if student.profile_image:
                old_path = os.path.join(FRONTEND_DIR, student.profile_image.lstrip('/'))
                if os.path.exists(old_path):
                    os.remove(old_path)
            student.profile_image = save_upload(file)

    # Update password if provided
    if data.get('password'):
        student.user.set_password(data['password'])

    db.session.commit()
    return jsonify({'message': 'Student updated successfully', 'student': student.to_dict()}), 200


@app.route('/api/students/<int:student_id>', methods=['DELETE'])
@admin_required
def delete_student(student_id):
    student = Student.query.get_or_404(student_id)
    user = student.user
    db.session.delete(student)
    db.session.delete(user)
    db.session.commit()
    return jsonify({'message': 'Student deleted successfully'}), 200


# ---------------------------------------------------------------------------
# Teachers CRUD API
# ---------------------------------------------------------------------------

@app.route('/api/teachers', methods=['GET'])
@admin_required
def get_teachers():
    teachers = Teacher.query.order_by(Teacher.first_name).all()
    return jsonify([t.to_dict() for t in teachers]), 200


@app.route('/api/teachers', methods=['POST'])
@admin_required
def create_teacher():
    data = request.get_json()
    required = ['first_name', 'last_name']
    for field in required:
        if not data.get(field):
            return jsonify({'error': f'{field} is required'}), 400

    teacher = Teacher(
        first_name=data['first_name'],
        last_name=data['last_name'],
        phone=data.get('phone'),
        department=data.get('department'),
        qualification=data.get('qualification')
    )
    db.session.add(teacher)
    db.session.commit()

    return jsonify({'message': 'Teacher created', 'teacher': teacher.to_dict()}), 201


@app.route('/api/teachers/<int:teacher_id>', methods=['GET'])
@admin_required
def get_teacher(teacher_id):
    teacher = Teacher.query.get_or_404(teacher_id)
    return jsonify(teacher.to_dict()), 200


@app.route('/api/teachers/<int:teacher_id>', methods=['PUT'])
@admin_required
def update_teacher(teacher_id):
    teacher = Teacher.query.get_or_404(teacher_id)
    data = request.get_json()

    if 'first_name' in data:
        teacher.first_name = data['first_name']
    if 'last_name' in data:
        teacher.last_name = data['last_name']
    if 'phone' in data:
        teacher.phone = data['phone']
    if 'department' in data:
        teacher.department = data['department']
    if 'qualification' in data:
        teacher.qualification = data['qualification']

    db.session.commit()
    return jsonify({'message': 'Teacher updated', 'teacher': teacher.to_dict()}), 200


@app.route('/api/teachers/<int:teacher_id>', methods=['DELETE'])
@admin_required
def delete_teacher(teacher_id):
    teacher = Teacher.query.get_or_404(teacher_id)
    # Un-assign from subjects first
    for subject in teacher.subjects:
        subject.teacher_id = None
    db.session.delete(teacher)
    db.session.commit()
    return jsonify({'message': 'Teacher deleted'}), 200


# ---------------------------------------------------------------------------
# Subjects API
# ---------------------------------------------------------------------------

@app.route('/api/subjects', methods=['GET'])
@login_required
def get_subjects():
    grade = request.args.get('grade', type=int)
    faculty = request.args.get('faculty')

    query = Subject.query
    if grade:
        query = query.filter_by(grade=grade)
    if faculty:
        query = query.filter((Subject.faculty == faculty) | (Subject.faculty == 'Compulsory'))

    subjects = query.order_by(Subject.grade, Subject.name).all()
    return jsonify([s.to_dict() for s in subjects]), 200


@app.route('/api/subjects', methods=['POST'])
@admin_required
def create_subject():
    data = request.get_json()
    required = ['name', 'code', 'grade', 'faculty']
    for field in required:
        if not data.get(field):
            return jsonify({'error': f'{field} is required'}), 400

    if Subject.query.filter_by(code=data['code']).first():
        return jsonify({'error': 'Subject code already exists'}), 409

    subject = Subject(
        name=data['name'],
        code=data['code'],
        grade=int(data['grade']),
        faculty=data['faculty'],
        credit_hours=int(data.get('credit_hours', 4)),
        full_marks=int(data.get('full_marks', 100)),
        pass_marks=int(data.get('pass_marks', 35)),
        teacher_id=int(data['teacher_id']) if data.get('teacher_id') else None
    )
    db.session.add(subject)
    db.session.commit()

    return jsonify({'message': 'Subject created', 'subject': subject.to_dict()}), 201


@app.route('/api/subjects/<int:subject_id>', methods=['DELETE'])
@admin_required
def delete_subject(subject_id):
    subject = Subject.query.get_or_404(subject_id)
    db.session.delete(subject)
    db.session.commit()
    return jsonify({'message': 'Subject deleted'}), 200


@app.route('/api/subjects/<int:subject_id>', methods=['PUT'])
@admin_required
def update_subject(subject_id):
    subject = Subject.query.get_or_404(subject_id)
    data = request.get_json()

    if 'teacher_id' in data:
        subject.teacher_id = int(data['teacher_id']) if data['teacher_id'] else None
    if 'name' in data:
        subject.name = data['name']
    if 'code' in data:
        subject.code = data['code']

    db.session.commit()
    return jsonify({'message': 'Subject updated', 'subject': subject.to_dict()}), 200


# ---------------------------------------------------------------------------
# Attendance API
# ---------------------------------------------------------------------------

@app.route('/api/attendance', methods=['GET'])
@login_required
def get_attendance():
    student_id = request.args.get('student_id', type=int)
    date_str = request.args.get('date')
    grade = request.args.get('grade', type=int)

    query = Attendance.query
    if student_id:
        query = query.filter_by(student_id=student_id)
    if date_str:
        try:
            att_date = datetime.strptime(date_str, '%Y-%m-%d').date()
            query = query.filter_by(date=att_date)
        except ValueError:
            pass
    if grade:
        query = query.join(Student).filter(Student.grade == grade)

    records = query.order_by(Attendance.date.desc()).limit(500).all()
    return jsonify([r.to_dict() for r in records]), 200


@app.route('/api/attendance', methods=['POST'])
@admin_required
def record_attendance():
    data = request.get_json()
    records = data.get('records', [])
    att_date_str = data.get('date', date.today().isoformat())

    try:
        att_date = datetime.strptime(att_date_str, '%Y-%m-%d').date()
    except ValueError:
        return jsonify({'error': 'Invalid date format'}), 400

    created = 0
    updated = 0

    for record in records:
        student_id = record.get('student_id')
        status = record.get('status', 'Present')
        remarks = record.get('remarks', '')

        existing = Attendance.query.filter_by(student_id=student_id, date=att_date).first()
        if existing:
            existing.status = status
            existing.remarks = remarks
            existing.recorded_by = session['user_id']
            updated += 1
        else:
            att = Attendance(
                student_id=student_id,
                date=att_date,
                status=status,
                remarks=remarks,
                recorded_by=session['user_id']
            )
            db.session.add(att)
            created += 1

    db.session.commit()
    return jsonify({'message': f'Attendance recorded: {created} new, {updated} updated'}), 200


@app.route('/api/attendance/student/<int:student_id>', methods=['GET'])
@login_required
def get_student_attendance(student_id):
    # Students can only view their own attendance
    if session.get('role') == 'student':
        user = User.query.get(session['user_id'])
        if not user.student_profile or user.student_profile.id != student_id:
            return jsonify({'error': 'Access denied'}), 403

    records = Attendance.query.filter_by(student_id=student_id).order_by(Attendance.date.desc()).all()
    return jsonify([r.to_dict() for r in records]), 200


# ---------------------------------------------------------------------------
# Exam Results API
# ---------------------------------------------------------------------------

@app.route('/api/results', methods=['GET'])
@login_required
def get_results():
    student_id = request.args.get('student_id', type=int)
    subject_id = request.args.get('subject_id', type=int)
    exam_type = request.args.get('exam_type')

    query = ExamResult.query
    if student_id:
        query = query.filter_by(student_id=student_id)
    if subject_id:
        query = query.filter_by(subject_id=subject_id)
    if exam_type:
        query = query.filter_by(exam_type=exam_type)

    results = query.order_by(ExamResult.created_at.desc()).all()
    return jsonify([r.to_dict() for r in results]), 200


@app.route('/api/results', methods=['POST'])
@admin_required
def add_result():
    data = request.get_json()
    required = ['student_id', 'subject_id', 'exam_type', 'marks_obtained']
    for field in required:
        if field not in data:
            return jsonify({'error': f'{field} is required'}), 400

    subject = Subject.query.get(data['subject_id'])
    full_marks = int(data.get('full_marks', subject.full_marks if subject else 100))
    pass_marks = int(data.get('pass_marks', subject.pass_marks if subject else 35))

    result = ExamResult(
        student_id=data['student_id'],
        subject_id=data['subject_id'],
        exam_type=data['exam_type'],
        marks_obtained=float(data['marks_obtained']),
        full_marks=full_marks,
        pass_marks=pass_marks,
        remarks=data.get('remarks'),
        exam_date=datetime.strptime(data['exam_date'], '%Y-%m-%d').date() if data.get('exam_date') else None
    )
    result.grade_point = result.calculate_grade()
    db.session.add(result)
    db.session.commit()

    return jsonify({'message': 'Result added', 'result': result.to_dict()}), 201


@app.route('/api/results/student/<int:student_id>', methods=['GET'])
@login_required
def get_student_results(student_id):
    # Students can only view their own results
    if session.get('role') == 'student':
        user = User.query.get(session['user_id'])
        if not user.student_profile or user.student_profile.id != student_id:
            return jsonify({'error': 'Access denied'}), 403

    results = ExamResult.query.filter_by(student_id=student_id).order_by(ExamResult.exam_type, ExamResult.subject_id).all()
    return jsonify([r.to_dict() for r in results]), 200


@app.route('/api/results/bulk', methods=['POST'])
@admin_required
def add_bulk_results():
    """Bulk add/update marks for all students in one subject+exam_type."""
    data = request.get_json()
    subject_id = data.get('subject_id')
    exam_type = data.get('exam_type')
    exam_date = data.get('exam_date')
    marks_list = data.get('marks', [])  # [{student_id, marks_obtained}, ...]

    if not subject_id or not exam_type:
        return jsonify({'error': 'subject_id and exam_type are required'}), 400

    subject = Subject.query.get(subject_id)
    if not subject:
        return jsonify({'error': 'Subject not found'}), 404

    created = 0
    updated = 0

    for entry in marks_list:
        sid = entry.get('student_id')
        marks = entry.get('marks_obtained')
        if sid is None or marks is None or marks == '':
            continue

        marks_val = float(marks)

        # Check if result already exists for this student+subject+exam_type
        existing = ExamResult.query.filter_by(
            student_id=sid, subject_id=subject_id, exam_type=exam_type
        ).first()

        if existing:
            existing.marks_obtained = marks_val
            existing.full_marks = subject.full_marks
            existing.pass_marks = subject.pass_marks
            existing.grade_point = existing.calculate_grade()
            if exam_date:
                existing.exam_date = datetime.strptime(exam_date, '%Y-%m-%d').date()
            updated += 1
        else:
            result = ExamResult(
                student_id=sid,
                subject_id=subject_id,
                exam_type=exam_type,
                marks_obtained=marks_val,
                full_marks=subject.full_marks,
                pass_marks=subject.pass_marks,
                exam_date=datetime.strptime(exam_date, '%Y-%m-%d').date() if exam_date else None
            )
            result.grade_point = result.calculate_grade()
            db.session.add(result)
            created += 1

    db.session.commit()
    return jsonify({'message': f'Results saved: {created} new, {updated} updated'}), 200


# ---------------------------------------------------------------------------
# Performance Prediction API
# ---------------------------------------------------------------------------

def _build_prediction_response(student):
    """Shared helper: build full prediction payload for a student."""

    # --- Attendance percentage ---
    total_att = student.attendances.count()
    present_att = student.attendances.filter_by(status='Present').count()
    late_att = student.attendances.filter_by(status='Late').count()
    attendance_pct = round((present_att + late_att) / total_att * 100, 2) if total_att > 0 else 75.0

    # --- Exam scores ---
    results = ExamResult.query.filter_by(student_id=student.id).all()
    if results:
        percentages = [round((r.marks_obtained / r.full_marks) * 100, 2) if r.full_marks else 0 for r in results]
        overall_score = round(sum(percentages) / len(percentages), 2)
        n = len(percentages)
        chunk = max(1, n // 3)
        opt1 = round(sum(percentages[:chunk]) / len(percentages[:chunk]), 2)
        opt2 = round(sum(percentages[chunk:2*chunk]) / len(percentages[chunk:2*chunk]), 2) if n > chunk else opt1
        opt3 = round(sum(percentages[2*chunk:]) / len(percentages[2*chunk:]), 2) if n > 2*chunk else opt2
    else:
        opt1 = opt2 = opt3 = overall_score = 50.0

    parent_edu = student.parent_education or 'high school'

    prediction = predict_grade(
        attendance_pct=attendance_pct, opt1=opt1, opt2=opt2, opt3=opt3,
        overall=overall_score, parent_edu_str=parent_edu,
    )

    # --- GPA (NEB 4.0 scale from predicted grade) ---
    gpa_map = {'A': 3.6, 'B': 3.2, 'C': 2.8, 'D': 2.4, 'E': 1.6, 'F': 0.0}
    predicted_gpa = gpa_map.get(prediction['predicted_grade'], 0.0)

    # --- Risk level ---
    grade = prediction['predicted_grade']
    if grade in ('A', 'B'):
        risk_level = 'low'
        risk_label = 'Low Risk'
    elif grade in ('C', 'D'):
        risk_level = 'medium'
        risk_label = 'Medium Risk'
    else:
        risk_level = 'high'
        risk_label = 'High Risk'

    # --- Per-exam score breakdown (for trend chart) ---
    exam_scores = []
    for r in (results or []):
        exam_scores.append({
            'subject': r.subject.name if r.subject else 'Unknown',
            'exam_type': r.exam_type,
            'percentage': round((r.marks_obtained / r.full_marks) * 100, 2) if r.full_marks else 0,
            'marks': r.marks_obtained,
            'full_marks': r.full_marks,
        })

    prediction['gpa'] = predicted_gpa
    prediction['risk_level'] = risk_level
    prediction['risk_label'] = risk_label

    prediction['student_info'] = {
        'id': student.id,
        'full_name': f"{student.first_name} {student.last_name}",
        'grade': student.grade,
        'faculty': student.faculty,
        'roll_no': student.roll_no,
    }

    prediction['input_features'] = {
        'attendance_percentage': attendance_pct,
        'optional_i_score': opt1,
        'optional_ii_score': opt2,
        'optional_iii_score': opt3,
        'overall_score': overall_score,
        'parent_education': parent_edu,
        'total_attendance_records': total_att,
        'total_exam_results': len(results) if results else 0,
    }

    prediction['exam_scores'] = exam_scores
    return prediction


@app.route('/api/predict/student/<int:student_id>', methods=['GET'])
@login_required
def predict_student_performance(student_id):
    """Predict by student ID (used by student dashboard)."""
    if session.get('role') == 'student':
        user = User.query.get(session['user_id'])
        if not user.student_profile or user.student_profile.id != student_id:
            return jsonify({'error': 'Access denied'}), 403

    student = Student.query.get_or_404(student_id)
    return jsonify(_build_prediction_response(student)), 200


@app.route('/api/predict/username/<username>', methods=['GET'])
@login_required
def predict_by_username(username):
    """Predict by username (used by admin dashboard)."""
    if session.get('role') != 'admin':
        return jsonify({'error': 'Admin access required'}), 403

    user = User.query.filter_by(username=username, role='student').first()
    if not user or not user.student_profile:
        return jsonify({'error': f'Student "{username}" not found'}), 404

    return jsonify(_build_prediction_response(user.student_profile)), 200


# ---------------------------------------------------------------------------
# Seed Data
# ---------------------------------------------------------------------------

def seed_data():
    """Seed initial admin user and sample subjects."""
    with app.app_context():
        # Create admin if not exists
        if not User.query.filter_by(username='admin').first():
            admin = User(username='admin', email='admin@nccs.edu.np', role='admin')
            admin.set_password('admin123')
            db.session.add(admin)
            print(" * Default admin created (username: admin, password: admin123)")

        # Seed NEB Subjects if empty
        if Subject.query.count() == 0:
            subjects = [
                # Compulsory for all Grade 11
                Subject(name='English', code='ENG-11', grade=11, faculty='Compulsory', credit_hours=4),
                Subject(name='Nepali', code='NEP-11', grade=11, faculty='Compulsory', credit_hours=4),
                Subject(name='Social Studies', code='SOC-11', grade=11, faculty='Compulsory', credit_hours=4),

                # Science Grade 11
                Subject(name='Physics', code='PHY-11', grade=11, faculty='Science', credit_hours=5),
                Subject(name='Chemistry', code='CHE-11', grade=11, faculty='Science', credit_hours=5),
                Subject(name='Biology', code='BIO-11', grade=11, faculty='Science', credit_hours=5),
                Subject(name='Mathematics', code='MAT-11', grade=11, faculty='Science', credit_hours=5),

                # Management Grade 11
                Subject(name='Accountancy', code='ACC-11', grade=11, faculty='Management', credit_hours=5),
                Subject(name='Business Studies', code='BUS-11', grade=11, faculty='Management', credit_hours=5),
                Subject(name='Economics', code='ECO-11', grade=11, faculty='Management', credit_hours=5),
                Subject(name='Marketing', code='MKT-11', grade=11, faculty='Management', credit_hours=4),

                # Compulsory for all Grade 12
                Subject(name='English', code='ENG-12', grade=12, faculty='Compulsory', credit_hours=4),
                Subject(name='Nepali', code='NEP-12', grade=12, faculty='Compulsory', credit_hours=4),
                Subject(name='Social Studies', code='SOC-12', grade=12, faculty='Compulsory', credit_hours=4),

                # Science Grade 12
                Subject(name='Physics', code='PHY-12', grade=12, faculty='Science', credit_hours=5),
                Subject(name='Chemistry', code='CHE-12', grade=12, faculty='Science', credit_hours=5),
                Subject(name='Biology', code='BIO-12', grade=12, faculty='Science', credit_hours=5),
                Subject(name='Mathematics', code='MAT-12', grade=12, faculty='Science', credit_hours=5),

                # Management Grade 12
                Subject(name='Accountancy', code='ACC-12', grade=12, faculty='Management', credit_hours=5),
                Subject(name='Business Studies', code='BUS-12', grade=12, faculty='Management', credit_hours=5),
                Subject(name='Economics', code='ECO-12', grade=12, faculty='Management', credit_hours=5),
                Subject(name='Marketing', code='MKT-12', grade=12, faculty='Management', credit_hours=4),
            ]
            db.session.add_all(subjects)
            print(f" * Seeded {len(subjects)} NEB subjects")

        db.session.commit()


# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------

if __name__ == '__main__':
    seed_data()
    print("\n * NCCS EMIS Portal Backend running...")
    print(" * Admin login: username=admin, password=admin123")
    print(" * Open http://localhost:5000 in your browser\n")
    app.run(debug=True, port=5000)
