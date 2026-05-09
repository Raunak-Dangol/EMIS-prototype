"""
Performance Prediction Engine
Implements the same Softmax Logistic Regression from Modeltrain/hello.ipynb.
Trains on Student_Performance.csv and exposes a predict() helper for the API.
"""

import os
import numpy as np
import pandas as pd

# ── Paths ────────────────────────────────────────────────────────────────────
BASE_DIR = os.path.abspath(os.path.dirname(__file__))
DATA_PATH = os.path.join(BASE_DIR, '..', 'Modeltrain', 'data', 'Student_Performance.csv')

# ── Encoding maps (same as notebook) ─────────────────────────────────────────
PARENT_EDUCATION_MAP = {
    'diploma': 1,
    'post graduate': 2,
    'high school': 3,
    'graduate': 4,
    'no formal': 5,
    'phd': 6,
}

GRADE_LABEL_MAP = {1: 'A', 2: 'B', 3: 'C', 4: 'D', 5: 'E', 6: 'F'}

# Feature order used for training
FEATURE_COLS = [
    'attendance_percentage',
    'optional_i_score',
    'optional_ii__score',
    'optional_iii__score',
    'overall_score',
    'parent_education',
]


# ── Custom StandardScaler (same as notebook) ─────────────────────────────────
class StandardScalers:
    def __init__(self):
        self.mean = None
        self.std = None

    def fit(self, X):
        self.mean = np.mean(X, axis=0)
        self.std = np.std(X, axis=0)
        return self

    def transform(self, X):
        return (X - self.mean) / (self.std + 1e-8)

    def fit_transform(self, X):
        self.fit(X)
        return self.transform(X)


# ── Helper functions (same as notebook) ──────────────────────────────────────
def softmax(Z):
    Z_shifted = Z - np.max(Z, axis=1, keepdims=True)
    exp_Z = np.exp(Z_shifted)
    return exp_Z / np.sum(exp_Z, axis=1, keepdims=True)


def one_hot_encode(y, num_classes):
    n = len(y)
    one_hot = np.zeros((n, num_classes))
    one_hot[np.arange(n), y - 1] = 1
    return one_hot


def compute_loss(y_onehot, probs):
    n = y_onehot.shape[0]
    log_probs = np.log(probs + 1e-9)
    return -np.sum(y_onehot * log_probs) / n


# ── Logistic Regression from scratch (same as notebook) ──────────────────────
class LogisticRegressionScratch:
    def __init__(self, learning_rate=0.1, epochs=1000, num_classes=6):
        self.lr = learning_rate
        self.epochs = epochs
        self.num_classes = num_classes
        self.W = None
        self.b = None
        self.loss_history = []

    def fit(self, X, y):
        n_samples, n_features = X.shape
        np.random.seed(42)
        self.W = np.random.randn(n_features, self.num_classes) * 0.01
        self.b = np.zeros((1, self.num_classes))
        y_onehot = one_hot_encode(y, self.num_classes)

        for epoch in range(self.epochs):
            Z = X @ self.W + self.b
            probs = softmax(Z)
            loss = compute_loss(y_onehot, probs)
            self.loss_history.append(float(loss))
            dZ = (probs - y_onehot) / n_samples
            dW = X.T @ dZ
            db = np.sum(dZ, axis=0, keepdims=True)
            self.W -= self.lr * dW
            self.b -= self.lr * db

        return self

    def predict(self, X):
        Z = X @ self.W + self.b
        probs = softmax(Z)
        return np.argmax(probs, axis=1) + 1   # 1-indexed labels

    def predict_proba(self, X):
        Z = X @ self.W + self.b
        return softmax(Z)


# ── Singleton model ──────────────────────────────────────────────────────────
_model = None
_scaler = None
_train_accuracy = None
_test_accuracy = None


def _train_model():
    """Load CSV, preprocess exactly like the notebook, and train."""
    global _model, _scaler, _train_accuracy, _test_accuracy

    df = pd.read_csv(DATA_PATH)
    df = df.drop_duplicates()

    # Encode parent_education (same as notebook)
    for label, code in PARENT_EDUCATION_MAP.items():
        df['parent_education'] = df['parent_education'].replace(label, code, regex=True)

    # Encode final_grade (same as notebook)
    grade_map = {'a': 1, 'b': 2, 'c': 3, 'd': 4, 'e': 5, 'f': 6}
    for label, code in grade_map.items():
        df['final_grade'] = df['final_grade'].replace(label, code, regex=True)

    X = df[FEATURE_COLS].values.astype(float)
    Y = df['final_grade'].values.astype(int)

    # Train / test split (same as notebook: 70/30, random_state=42)
    from sklearn.model_selection import train_test_split
    X_train, X_test, y_train, y_test = train_test_split(
        X, Y, test_size=0.30, random_state=42
    )

    _scaler = StandardScalers()
    X_train = _scaler.fit_transform(X_train)
    X_test = _scaler.transform(X_test)

    _model = LogisticRegressionScratch(learning_rate=0.1, epochs=1000, num_classes=6)
    _model.fit(X_train, y_train)

    _train_accuracy = float(np.mean(y_train == _model.predict(X_train))) * 100
    _test_accuracy = float(np.mean(y_test == _model.predict(X_test))) * 100

    print(f" * Prediction model trained — Train acc: {_train_accuracy:.2f}%, Test acc: {_test_accuracy:.2f}%")


def get_model():
    global _model
    if _model is None:
        _train_model()
    return _model, _scaler


def predict_grade(attendance_pct, opt1, opt2, opt3, overall, parent_edu_str):
    """
    Predict grade for a single student.
    Returns dict with predicted_grade, probabilities, and model accuracy.
    """
    model, scaler = get_model()

    # Encode parent education
    parent_edu_code = PARENT_EDUCATION_MAP.get(parent_edu_str.lower().strip(), 3)

    features = np.array([[
        float(attendance_pct),
        float(opt1),
        float(opt2),
        float(opt3),
        float(overall),
        float(parent_edu_code),
    ]])

    features_scaled = scaler.transform(features)
    pred_label = int(model.predict(features_scaled)[0])
    probs = model.predict_proba(features_scaled)[0]

    grade_letter = GRADE_LABEL_MAP[pred_label]

    # Build per-grade probabilities dict
    grade_probs = {}
    for i in range(6):
        grade_probs[GRADE_LABEL_MAP[i + 1]] = round(float(probs[i]) * 100, 2)

    return {
        'predicted_grade': grade_letter,
        'predicted_grade_code': pred_label,
        'probabilities': grade_probs,
        'model_accuracy': round(_test_accuracy, 2),
    }
