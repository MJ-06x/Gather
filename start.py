from pathlib import Path
import os
from io import BytesIO
import sqlite3
import uuid
from zipfile import ZIP_DEFLATED, ZipFile

from flask import Flask, jsonify, redirect, render_template, request, send_file, send_from_directory, session, url_for
from PIL import Image
from pillow_heif import register_heif_opener
from werkzeug.utils import secure_filename


BASE_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = BASE_DIR / "uploads"
DATABASE = BASE_DIR / "photos.db"
IMAGE_EXTENSIONS = {"jpg", "jpeg", "png", "gif", "webp", "heic", "avif", "bmp", "tif", "tiff"}
VIDEO_EXTENSIONS = {"mp4", "mov", "webm", "m4v", "avi", "mkv", "3gp", "mpeg", "mpg"}
ALLOWED_EXTENSIONS = IMAGE_EXTENSIONS | VIDEO_EXTENSIONS

app = Flask(__name__)
app.secret_key = os.environ.get("GATHERED_SECRET", "local-development-secret-change-me")
app.config["MAX_CONTENT_LENGTH"] = 250 * 1024 * 1024
UPLOAD_DIR.mkdir(exist_ok=True)
register_heif_opener()


def get_db():
	connection = sqlite3.connect(DATABASE)
	connection.row_factory = sqlite3.Row
	return connection


def init_db():
	with get_db() as connection:
		connection.execute(
			"""
			CREATE TABLE IF NOT EXISTS profiles (
				id TEXT PRIMARY KEY,
				name TEXT NOT NULL,
				avatar TEXT NOT NULL DEFAULT '😊',
				color TEXT NOT NULL DEFAULT '#e86e51',
				created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
			)
			"""
		)
		connection.execute(
			"""
			CREATE TABLE IF NOT EXISTS messages (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				profile_id TEXT NOT NULL,
				message TEXT NOT NULL,
				kind TEXT NOT NULL DEFAULT 'text',
				created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
				FOREIGN KEY (profile_id) REFERENCES profiles(id)
			)
			"""
		)
		connection.execute(
			"""
			CREATE TABLE IF NOT EXISTS folders (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				name TEXT NOT NULL UNIQUE,
				created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
			)
			"""
		)
		connection.execute(
			"""
			CREATE TABLE IF NOT EXISTS photos (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				filename TEXT NOT NULL,
				original_name TEXT NOT NULL,
				uploader TEXT NOT NULL,
				caption TEXT DEFAULT '',
				folder_id INTEGER REFERENCES folders(id) ON DELETE SET NULL,
				media_type TEXT NOT NULL DEFAULT 'photo',
				created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
			)
			"""
		)
		columns = {row[1] for row in connection.execute("PRAGMA table_info(photos)")}
		if "folder_id" not in columns:
			connection.execute("ALTER TABLE photos ADD COLUMN folder_id INTEGER REFERENCES folders(id) ON DELETE SET NULL")
		if "media_type" not in columns:
			connection.execute("ALTER TABLE photos ADD COLUMN media_type TEXT NOT NULL DEFAULT 'photo'")


def allowed_file(filename):
	return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def media_type(filename):
	return "video" if Path(filename).suffix.lower().lstrip(".") in VIDEO_EXTENSIONS else "photo"


def is_authenticated():
	return session.get("authenticated") is True


@app.before_request
def require_login():
	public_endpoints = {"login", "static"}
	if request.endpoint not in public_endpoints and not is_authenticated():
		return redirect(url_for("login", next=request.path))


@app.route("/login", methods=["GET", "POST"])
def login():
	if request.method == "POST":
		password = request.form.get("password", "")
		if password == os.environ.get("GATHERED_PASSWORD", "change-me"):
			session["authenticated"] = True
			next_path = request.form.get("next", "")
			return redirect(next_path if next_path.startswith("/") and not next_path.startswith("//") else url_for("index"))
		return render_template("login.html", error="That password is not correct.")
	return render_template("login.html")


@app.post("/logout")
def logout():
	session.clear()
	return redirect(url_for("login"))


@app.route("/api/profile", methods=["GET", "POST"])
def profile():
	profile_id = request.json.get("id") if request.is_json else request.args.get("id")
	with get_db() as connection:
		if request.method == "POST":
			name = request.json.get("name", "").strip()
			if not name:
				return jsonify({"error": "Enter a profile name."}), 400
			profile_id = profile_id or uuid.uuid4().hex
			avatar = request.json.get("avatar", "😊")[:4]
			color = request.json.get("color", "#e86e51")[:20]
			connection.execute(
				"INSERT INTO profiles (id, name, avatar, color) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, avatar = excluded.avatar, color = excluded.color",
				(profile_id, name[:60], avatar, color),
			)
			row = connection.execute("SELECT id, name, avatar, color FROM profiles WHERE id = ?", (profile_id,)).fetchone()
		else:
			row = connection.execute("SELECT id, name, avatar, color FROM profiles WHERE id = ?", (profile_id,)).fetchone()
		if row is None:
			return jsonify({"error": "Profile not found."}), 404
		return jsonify(dict(row))


@app.route("/api/chat", methods=["GET", "POST"])
def chat():
	if request.method == "POST":
		profile_id = request.json.get("profile_id", "")
		message = request.json.get("message", "").strip()
		kind = request.json.get("kind", "text")
		if kind not in {"text", "emoji", "sticker", "gif"} or not message or len(message) > 1000:
			return jsonify({"error": "Enter a valid message."}), 400
		with get_db() as connection:
			if not connection.execute("SELECT id FROM profiles WHERE id = ?", (profile_id,)).fetchone():
				return jsonify({"error": "Create a profile first."}), 400
			connection.execute("INSERT INTO messages (profile_id, message, kind) VALUES (?, ?, ?)", (profile_id, message, kind))
	with get_db() as connection:
		rows = connection.execute(
			"SELECT m.id, m.message, m.kind, m.created_at, p.id AS profile_id, p.name, p.avatar, p.color FROM messages m JOIN profiles p ON p.id = m.profile_id ORDER BY m.id DESC LIMIT 100"
		).fetchall()
	return jsonify([dict(row) for row in reversed(rows)])


@app.delete("/api/chat/<int:message_id>")
def delete_chat_message(message_id):
	with get_db() as connection:
		connection.execute("DELETE FROM messages WHERE id = ?", (message_id,))
	return jsonify({"deleted": True})


@app.delete("/api/chat")
def clear_chat():
	with get_db() as connection:
		connection.execute("DELETE FROM messages")
	return jsonify({"cleared": True})


@app.route("/")
def index():
	return render_template("index.html")


@app.route("/api/photos")
def photos():
	search = request.args.get("search", "").strip()
	requested_type = request.args.get("type", "photo")
	sort = request.args.get("sort", "latest")
	folder_id = request.args.get("folder_id", "all")
	sort_order = "p.created_at DESC, p.id DESC" if sort == "latest" else "p.created_at ASC, p.id ASC"
	folder_clause = "" if folder_id == "all" else " AND p.folder_id = ?"
	parameters = [requested_type, f"%{search}%", f"%{search}%", f"%{search}%"]
	if folder_id != "all":
		parameters.append(folder_id)
	with get_db() as connection:
		rows = connection.execute(
			f"""
			SELECT p.id, p.filename, p.original_name, p.uploader, p.caption, p.created_at,
			       p.folder_id, f.name AS folder_name
			FROM photos p LEFT JOIN folders f ON f.id = p.folder_id
			WHERE p.media_type = ? AND (p.uploader LIKE ? OR p.caption LIKE ? OR p.original_name LIKE ?){folder_clause}
			ORDER BY {sort_order}
			""",
			parameters,
		).fetchall()
	return jsonify([dict(row) | {"url": f"/uploads/{row['filename']}"} for row in rows])


@app.route("/api/folders")
def folders():
	with get_db() as connection:
		rows = connection.execute(
			"SELECT f.id, f.name, COUNT(p.id) AS photo_count FROM folders f LEFT JOIN photos p ON p.folder_id = f.id GROUP BY f.id ORDER BY f.name"
		).fetchall()
	return jsonify([dict(row) for row in rows])


@app.route("/api/folders", methods=["POST"])
def create_folder():
	name = request.json.get("name", "").strip() if request.is_json else ""
	if not name:
		return jsonify({"error": "Enter a folder name."}), 400
	try:
		with get_db() as connection:
			cursor = connection.execute("INSERT INTO folders (name) VALUES (?)", (name[:80],))
		return jsonify({"id": cursor.lastrowid, "name": name[:80], "photo_count": 0}), 201
	except sqlite3.IntegrityError:
		return jsonify({"error": "That folder already exists."}), 409


@app.route("/api/photos/<int:photo_id>/folder", methods=["PATCH"])
def move_photo(photo_id):
	folder_id = request.json.get("folder_id") if request.is_json else None
	with get_db() as connection:
		if folder_id is not None and not connection.execute("SELECT id FROM folders WHERE id = ?", (folder_id,)).fetchone():
			return jsonify({"error": "Folder not found."}), 404
		connection.execute("UPDATE photos SET folder_id = ? WHERE id = ?", (folder_id, photo_id))
	return jsonify({"moved": True})


@app.route("/api/download", methods=["POST"])
def download_photos():
	photo_ids = request.json.get("ids", []) if request.is_json else []
	if not photo_ids:
		return jsonify({"error": "Select at least one photo."}), 400
	with get_db() as connection:
		rows = connection.execute(
			f"SELECT filename, original_name FROM photos WHERE id IN ({','.join('?' for _ in photo_ids)})",
			photo_ids,
		).fetchall()
	if len(rows) == 1:
		return send_from_directory(UPLOAD_DIR, rows[0]["filename"], as_attachment=True, download_name=rows[0]["original_name"])
	archive = BytesIO()
	with ZipFile(archive, "w", ZIP_DEFLATED) as zip_file:
		for row in rows:
			file_path = UPLOAD_DIR / row["filename"]
			if file_path.exists():
				zip_file.write(file_path, row["original_name"])
	archive.seek(0)
	return send_file(archive, mimetype="application/zip", as_attachment=True, download_name="gathered-photos.zip")


@app.route("/api/photos", methods=["DELETE"])
def delete_photos():
	photo_ids = request.json.get("ids", []) if request.is_json else []
	if not photo_ids:
		return jsonify({"error": "Select at least one item."}), 400
	with get_db() as connection:
		rows = connection.execute(
			f"SELECT filename FROM photos WHERE id IN ({','.join('?' for _ in photo_ids)})",
			photo_ids,
		).fetchall()
		connection.execute(
			f"DELETE FROM photos WHERE id IN ({','.join('?' for _ in photo_ids)})",
			photo_ids,
		)
	for row in rows:
		(UPLOAD_DIR / row["filename"]).unlink(missing_ok=True)
	return jsonify({"deleted": len(rows)})


@app.route("/api/photos", methods=["POST"])
def upload_photos():
	uploader = request.form.get("uploader", "Family member").strip() or "Family member"
	caption = request.form.get("caption", "").strip()
	folder_id = request.form.get("folder_id") or None
	files = request.files.getlist("media") or request.files.getlist("photos")
	valid_files = [photo for photo in files if photo and allowed_file(photo.filename)]
	if not valid_files:
		return jsonify({"error": "Choose at least one image file."}), 400

	saved = []
	with get_db() as connection:
		if folder_id is not None and not connection.execute("SELECT id FROM folders WHERE id = ?", (folder_id,)).fetchone():
			return jsonify({"error": "Folder not found."}), 404
		for photo in valid_files:
			original_name = secure_filename(photo.filename)
			extension = Path(original_name).suffix.lower()
			filename = f"{uuid.uuid4().hex}{extension}"
			photo.save(UPLOAD_DIR / filename)
			connection.execute(
				"INSERT INTO photos (filename, original_name, uploader, caption, folder_id, media_type) VALUES (?, ?, ?, ?, ?, ?)",
				(filename, original_name, uploader[:80], caption[:200], folder_id, media_type(original_name)),
			)
			saved.append(original_name)
	return jsonify({"uploaded": len(saved), "files": saved}), 201


@app.route("/uploads/<path:filename>")
def uploaded_file(filename):
	if Path(filename).suffix.lower() == ".heic":
		image = Image.open(UPLOAD_DIR / filename)
		converted = BytesIO()
		image.convert("RGB").save(converted, format="JPEG", quality=90)
		converted.seek(0)
		return send_file(converted, mimetype="image/jpeg", download_name=f"{Path(filename).stem}.jpg")
	return send_from_directory(UPLOAD_DIR, filename)


init_db()

if __name__ == "__main__":
	app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "5000")), debug=True)
