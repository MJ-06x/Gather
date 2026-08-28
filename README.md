# Gathered

A simple shared family photo archive. Anyone with the hosted link can open it from a phone or laptop, choose multiple photos, add their name, and see the shared gallery.

## Run locally

```bash
python3 -m pip install -r requirements.txt
export GATHERED_PASSWORD='choose-a-private-password'
export GATHERED_SECRET='use-a-long-random-secret'
python3 start.py
```

Open http://127.0.0.1:5000. To use another port, set `PORT`, for example `PORT=5050 python3 start.py`.

## Deploy for family access

Deploy this folder to Render using the included `render.yaml` blueprint. It installs the dependencies and runs Gunicorn in production. A persistent disk is included so the current SQLite database and uploaded media survive restarts.

For a manual deployment, use `pip install -r requirements.txt` as the build command and `gunicorn --workers 2 --threads 4 --timeout 120 start:app` as the start command.

The app uses one shared password for personal use. Set `GATHERED_PASSWORD` and `GATHERED_SECRET` in the hosting service environment variables; never commit them to the repository. The login protects the gallery, media files, uploads, downloads, and deletion actions.

This first version stores image files in `uploads/` and metadata in `photos.db`, which is useful for prototyping. Before treating it as a permanent family archive, move image storage to an object-storage service such as Cloudflare R2, Amazon S3, or Supabase Storage, and move the database to managed Postgres. That keeps photos durable across redeploys and gives you room to add individual accounts and backups.
