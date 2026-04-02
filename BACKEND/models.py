from database import db
from datetime import datetime, date
from werkzeug.security import generate_password_hash, check_password_hash


class User(db.Model):
    """User model for authentication (Admin, Student & Teacher roles)."""
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=True)
    role = db.Column(db.String(20), nullable=False, default='student')  # 'admin', 'student', or 'teacher'
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Relationships
    student_profile = db.relationship('Student', backref='user', uselist=False, cascade='all, delete-orphan')
    teacher_profile = db.relationship('Teacher', backref='user', uselist=False, cascade='all, delete-orphan')

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def to_dict(self):
        return {
            'id': self.id,
            'username': self.username,
            'email': self.email,
            'role': self.role,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }


class Student(db.Model):
    """Student profile linked to a User account."""
    __tablename__ = 'students'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), unique=True, nullable=False)
    first_name = db.Column(db.String(100), nullable=False)
    last_name = db.Column(db.String(100), nullable=False)
    grade = db.Column(db.Integer, nullable=False)  # 11 or 12
    faculty = db.Column(db.String(50), nullable=False)  # Science, Management, Humanities
    roll_no = db.Column(db.String(20), nullable=False)
    phone = db.Column(db.String(20), nullable=True)
    address = db.Column(db.String(255), nullable=True)
    guardian_name = db.Column(db.String(150), nullable=True)
    guardian_phone = db.Column(db.String(20), nullable=True)
    date_of_birth = db.Column(db.Date, nullable=True)
    enrolled_date = db.Column(db.Date, default=date.today)

    # Relationships
    attendances = db.relationship('Attendance', backref='student', lazy='dynamic', cascade='all, delete-orphan')
    exam_results = db.relationship('ExamResult', backref='student', lazy='dynamic', cascade='all, delete-orphan')

    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}"

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'username': self.user.username if self.user else None,
            'first_name': self.first_name,
            'last_name': self.last_name,
            'full_name': self.full_name,
            'grade': self.grade,
            'faculty': self.faculty,
            'roll_no': self.roll_no,
            'phone': self.phone,
            'address': self.address,
            'guardian_name': self.guardian_name,
            'guardian_phone': self.guardian_phone,
            'date_of_birth': self.date_of_birth.isoformat() if self.date_of_birth else None,
            'enrolled_date': self.enrolled_date.isoformat() if self.enrolled_date else None
        }


class Teacher(db.Model):
    """Teacher profile linked to a User account."""
    __tablename__ = 'teachers'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), unique=True, nullable=False)
    first_name = db.Column(db.String(100), nullable=False)
    last_name = db.Column(db.String(100), nullable=False)
    phone = db.Column(db.String(20), nullable=True)
    department = db.Column(db.String(100), nullable=True)
    qualification = db.Column(db.String(200), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Relationships
    subjects = db.relationship('Subject', backref='teacher', lazy='dynamic')

    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}"

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'username': self.user.username if self.user else None,
            'first_name': self.first_name,
            'last_name': self.last_name,
            'full_name': self.full_name,
            'phone': self.phone,
            'department': self.department,
            'qualification': self.qualification,
            'subject_count': self.subjects.count(),
            'created_at': self.created_at.isoformat() if self.created_at else None
        }


class Subject(db.Model):
    """Subjects offered for Grade 11 and 12."""
    __tablename__ = 'subjects'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    code = db.Column(db.String(20), unique=True, nullable=False)
    grade = db.Column(db.Integer, nullable=False)  # 11 or 12
    faculty = db.Column(db.String(50), nullable=False)  # Science, Management, Humanities, Compulsory
    credit_hours = db.Column(db.Integer, default=4)
    full_marks = db.Column(db.Integer, default=100)
    pass_marks = db.Column(db.Integer, default=35)
    teacher_id = db.Column(db.Integer, db.ForeignKey('teachers.id'), nullable=True)

    # Relationships
    exam_results = db.relationship('ExamResult', backref='subject', lazy='dynamic')

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'code': self.code,
            'grade': self.grade,
            'faculty': self.faculty,
            'credit_hours': self.credit_hours,
            'full_marks': self.full_marks,
            'pass_marks': self.pass_marks,
            'teacher_id': self.teacher_id,
            'teacher_name': self.teacher.full_name if self.teacher else None
        }


class Attendance(db.Model):
    """Daily attendance records for students."""
    __tablename__ = 'attendance'

    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.Integer, db.ForeignKey('students.id'), nullable=False)
    date = db.Column(db.Date, nullable=False, default=date.today)
    status = db.Column(db.String(10), nullable=False, default='Present')  # Present, Absent, Late
    remarks = db.Column(db.String(255), nullable=True)
    recorded_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Unique constraint: one record per student per day
    __table_args__ = (db.UniqueConstraint('student_id', 'date', name='uq_student_date'),)

    recorder = db.relationship('User', foreign_keys=[recorded_by])

    def to_dict(self):
        return {
            'id': self.id,
            'student_id': self.student_id,
            'student_name': self.student.full_name if self.student else None,
            'roll_no': self.student.roll_no if self.student else None,
            'date': self.date.isoformat(),
            'status': self.status,
            'remarks': self.remarks,
            'recorded_by': self.recorder.username if self.recorder else None
        }


class ExamResult(db.Model):
    """Exam results for students."""
    __tablename__ = 'exam_results'

    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.Integer, db.ForeignKey('students.id'), nullable=False)
    subject_id = db.Column(db.Integer, db.ForeignKey('subjects.id'), nullable=False)
    exam_type = db.Column(db.String(50), nullable=False)  # Terminal, Final, Board Practice
    marks_obtained = db.Column(db.Float, nullable=False)
    full_marks = db.Column(db.Integer, default=100)
    pass_marks = db.Column(db.Integer, default=35)
    grade_point = db.Column(db.String(5), nullable=True)  # A+, A, B+, B, C+, C, D, E
    remarks = db.Column(db.String(255), nullable=True)
    exam_date = db.Column(db.Date, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def calculate_grade(self):
        """Calculate NEB-style grade based on percentage."""
        if self.full_marks == 0:
            return 'N/A'
        percentage = (self.marks_obtained / self.full_marks) * 100
        if percentage >= 90:
            return 'A+'
        elif percentage >= 80:
            return 'A'
        elif percentage >= 70:
            return 'B+'
        elif percentage >= 60:
            return 'B'
        elif percentage >= 50:
            return 'C+'
        elif percentage >= 40:
            return 'C'
        elif percentage >= 35:
            return 'D'
        else:
            return 'E'

    def to_dict(self):
        return {
            'id': self.id,
            'student_id': self.student_id,
            'student_name': self.student.full_name if self.student else None,
            'subject_id': self.subject_id,
            'subject_name': self.subject.name if self.subject else None,
            'subject_code': self.subject.code if self.subject else None,
            'exam_type': self.exam_type,
            'marks_obtained': self.marks_obtained,
            'full_marks': self.full_marks,
            'pass_marks': self.pass_marks,
            'grade_point': self.grade_point,
            'percentage': round((self.marks_obtained / self.full_marks) * 100, 2) if self.full_marks else 0,
            'remarks': self.remarks,
            'exam_date': self.exam_date.isoformat() if self.exam_date else None
        }
