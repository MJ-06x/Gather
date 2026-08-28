const gallery = document.querySelector('#gallery');
const empty = document.querySelector('#empty');
const search = document.querySelector('#search');
const modal = document.querySelector('#upload-modal');
const form = document.querySelector('#upload-form');
const fileInput = document.querySelector('#media');
const fileLabel = document.querySelector('#file-label');
const message = document.querySelector('#form-message');
const galleryStatus = document.querySelector('#gallery-status');
const mediaCount = document.querySelector('#media-count');
const submitUpload = document.querySelector('#submit-upload');
const sort = document.querySelector('#sort');
const folderList = document.querySelector('#folder-list');
const uploadFolder = document.querySelector('#upload-folder');
const bulkBar = document.querySelector('#bulk-bar');
const selectedCount = document.querySelector('#selected-count');
const lightbox = document.querySelector('#lightbox');
let currentPhotos = [];
let selectedPhotos = new Set();
let currentPhotoIndex = 0;
let currentFolder = 'all';
let folders = [];
let currentType = 'photo';
let currentSpace = 'media';
let profileId = localStorage.getItem('gathered-profile-id');
const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);

const formatDate = (value) => new Date(`${value.replace(' ', 'T')}Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

async function loadPhotos() {
  galleryStatus.textContent = 'Loading memories...'; galleryStatus.classList.remove('hidden'); gallery.classList.add('is-loading');
  const response = await fetch(`/api/photos?type=${currentType}&search=${encodeURIComponent(search.value)}&sort=${sort.value}&folder_id=${currentFolder}`);
  if (!response.ok) { galleryStatus.textContent = 'We could not load your memories. Refresh and try again.'; gallery.classList.remove('is-loading'); return; }
  currentPhotos = await response.json();
  gallery.innerHTML = currentPhotos.map((item, index) => `<article class="photo ${selectedPhotos.has(item.id) ? 'selected' : ''}" data-index="${index}" style="animation-delay:${Math.min(index, 8) * 50}ms"><button class="select-photo ${selectedPhotos.has(item.id) ? 'checked' : ''}" data-id="${item.id}" aria-label="Select ${item.original_name}">${selectedPhotos.has(item.id) ? '✓' : ''}</button>${item.media_type === 'video' ? `<video src="${item.url}" controls preload="metadata"></video>` : `<img src="${item.url}" alt="${item.caption || item.original_name}" loading="lazy">`}<div class="photo-info"><strong>${item.caption || item.original_name}</strong><small>Added by ${item.uploader} · ${formatDate(item.created_at)}</small><div class="photo-actions"><button class="small-action download-one" data-id="${item.id}">↓ Download</button><select class="folder-select" data-id="${item.id}" aria-label="Move media to folder"><option value="">No folder</option>${folderOptions(item.folder_id)}</select></div></div></article>`).join('');
  empty.classList.toggle('hidden', currentPhotos.length > 0);
  mediaCount.textContent = `${currentPhotos.length} ${currentType}${currentPhotos.length === 1 ? '' : 's'}`;
  galleryStatus.classList.add('hidden'); gallery.classList.remove('is-loading');
  updateBulkBar();
}

function folderOptions(selected) { return folders.map((folder) => `<option value="${folder.id}" ${String(folder.id) === String(selected) ? 'selected' : ''}>${folder.name}</option>`).join(''); }
async function loadFolders() { const response = await fetch('/api/folders'); folders = await response.json(); folderList.innerHTML = folders.map((folder) => `<button class="folder" data-folder="${folder.id}">${folder.name}<small>${folder.photo_count}</small></button>`).join(''); uploadFolder.innerHTML = '<option value="">No folder</option>' + folders.map((folder) => `<option value="${folder.id}">${folder.name}</option>`).join(''); }
function updateBulkBar() { selectedCount.textContent = selectedPhotos.size; bulkBar.classList.toggle('hidden', selectedPhotos.size === 0); }
async function loadProfile() { if (!profileId) return; const response = await fetch(`/api/profile?id=${encodeURIComponent(profileId)}`); if (!response.ok) return; const profile = await response.json(); document.querySelector('#profile-avatar').textContent = profile.avatar; document.querySelector('#profile-name').textContent = profile.name; document.querySelector('#profile-form [name=name]').value = profile.name; document.querySelector('#profile-form [name=avatar]').value = profile.avatar; }
async function loadChat() { const response = await fetch('/api/chat'); if (!response.ok) return; const messages = await response.json(); document.querySelector('#chat-messages').innerHTML = messages.length ? messages.map((item) => `<article class="chat-message"><span class="chat-avatar" style="background:${escapeHtml(item.color)}">${escapeHtml(item.avatar)}</span><div><strong>${escapeHtml(item.name)}</strong><p class="${item.kind === 'gif' ? 'gif-message' : ''}">${item.kind === 'gif' ? `<img src="${escapeHtml(item.message)}" alt="Family GIF" loading="lazy">` : escapeHtml(item.message)}</p><small>${formatDate(item.created_at)}</small><button class="delete-message" data-id="${item.id}" aria-label="Delete message">Delete</button></div></article>`).join('') : '<p class="chat-empty">Start a little conversation.</p>'; const box = document.querySelector('#chat-messages'); box.scrollTop = box.scrollHeight; }
async function saveProfile(event) { event.preventDefault(); const data = new FormData(event.target); profileId = profileId || crypto.randomUUID(); const response = await fetch('/api/profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: profileId, name: data.get('name'), avatar: data.get('avatar') }) }); if (!response.ok) { document.querySelector('#profile-message').textContent = 'Could not save your profile.'; return; } localStorage.setItem('gathered-profile-id', profileId); setProfileModal(false); loadProfile(); }
async function sendChat(event) { event.preventDefault(); if (!profileId) { setProfileModal(true); return; } const input = document.querySelector('#chat-input'); const messageText = input.value.trim(); if (!messageText) return; const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile_id: profileId, message: messageText, kind: 'text' }) }); if (response.ok) { input.value = ''; loadChat(); } }
function setProfileModal(open) { document.querySelector('#profile-modal').classList.toggle('hidden', !open); if (open) document.querySelector('#profile-form [name=name]').focus(); }
function openLightbox(index) { currentPhotoIndex = index; const item = currentPhotos[index]; const image = document.querySelector('#lightbox-image'); const video = document.querySelector('#lightbox-video'); image.classList.toggle('hidden', item.media_type === 'video'); video.classList.toggle('hidden', item.media_type !== 'video'); if (item.media_type === 'video') { video.src = item.url; video.load(); } else { image.src = item.url; image.alt = item.caption || item.original_name; } document.querySelector('#lightbox-caption').textContent = `${item.caption || item.original_name} · Added by ${item.uploader}`; lightbox.classList.remove('hidden'); }
function closeLightbox() { lightbox.classList.add('hidden'); }
function moveLightbox(step) { if (currentPhotos.length) openLightbox((currentPhotoIndex + step + currentPhotos.length) % currentPhotos.length); }
async function download(ids) { const response = await fetch('/api/download', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) }); if (!response.ok) return; const blob = await response.blob(); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = ids.length > 1 ? 'gathered-photos.zip' : 'photo'; link.click(); URL.revokeObjectURL(link.href); }

function setModal(open) { modal.classList.toggle('hidden', !open); if (open) document.querySelector('[name=uploader]').focus(); }
document.querySelector('#open-upload').onclick = () => setModal(true);
document.querySelector('#empty-upload').onclick = () => setModal(true);
document.querySelector('#close-upload').onclick = () => setModal(false);
modal.onclick = (event) => { if (event.target === modal) setModal(false); };
search.oninput = loadPhotos;
sort.onchange = loadPhotos;
fileInput.onchange = () => { const label = currentType === 'video' ? 'video' : 'photo'; const tooLarge = [...fileInput.files].some((file) => file.size > 250 * 1024 * 1024); fileLabel.textContent = fileInput.files.length ? `${fileInput.files.length} ${label}${fileInput.files.length > 1 ? 's' : ''} selected` : `Choose ${label}s`; message.textContent = tooLarge ? 'One or more files are larger than 250 MB.' : ''; if (tooLarge) fileInput.value = ''; };
document.querySelector('#clear-selection').onclick = () => { selectedPhotos.clear(); loadPhotos(); };
document.querySelector('#download-selected').onclick = () => download([...selectedPhotos]);
document.querySelector('#delete-selected').onclick = () => deletePhotos([...selectedPhotos]);
document.querySelector('#lightbox-close').onclick = closeLightbox;
document.querySelector('#previous-photo').onclick = () => moveLightbox(-1);
document.querySelector('#next-photo').onclick = () => moveLightbox(1);
document.querySelector('#lightbox-download').onclick = () => download([currentPhotos[currentPhotoIndex].id]);
document.querySelectorAll('.tab').forEach((tab) => { tab.onclick = () => { currentType = tab.dataset.type; selectedPhotos.clear(); document.querySelectorAll('.tab').forEach((item) => item.classList.toggle('active', item === tab)); loadPhotos(); }; });
async function deletePhotos(ids) { if (!ids.length || !window.confirm(`Delete ${ids.length} selected ${currentType}${ids.length === 1 ? '' : 's'} permanently? This cannot be undone.`)) return; const response = await fetch('/api/photos', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) }); if (response.ok) { selectedPhotos.clear(); await loadFolders(); loadPhotos(); } }
document.querySelector('#new-folder').onclick = async () => { const name = window.prompt('Folder name'); if (!name?.trim()) return; const response = await fetch('/api/folders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) }); if (!response.ok) { window.alert((await response.json()).error); return; } await loadFolders(); loadPhotos(); };
document.querySelector('#profile-button').onclick = () => setProfileModal(true); document.querySelector('#close-profile').onclick = () => setProfileModal(false); document.querySelector('#profile-modal').onclick = (event) => { if (event.target.id === 'profile-modal') setProfileModal(false); }; document.querySelector('#profile-form').onsubmit = saveProfile; document.querySelector('#chat-form').onsubmit = sendChat; document.querySelectorAll('.quick-picks button').forEach((button) => { button.onclick = async () => { if (!profileId) { setProfileModal(true); return; } await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile_id: profileId, message: button.dataset.message, kind: button.dataset.kind }) }); loadChat(); }; }); document.querySelectorAll('.avatar-choices').forEach((choices) => { choices.onclick = (event) => { if (event.target.textContent.length <= 2) document.querySelector('#profile-form [name=avatar]').value = event.target.textContent; }; });
document.querySelector('#clear-chat').onclick = async () => { if (!window.confirm('Clear the entire conversation for everyone? This cannot be undone.')) return; const response = await fetch('/api/chat', { method: 'DELETE' }); if (response.ok) loadChat(); }; document.querySelector('#chat-messages').onclick = async (event) => { const button = event.target.closest('.delete-message'); if (!button || !window.confirm('Delete this message for everyone?')) return; const response = await fetch(`/api/chat/${button.dataset.id}`, { method: 'DELETE' }); if (response.ok) loadChat(); };
document.querySelector('#theme-toggle').onclick = () => { const dark = document.body.classList.toggle('dark'); localStorage.setItem('gathered-theme', dark ? 'dark' : 'light'); }; if (localStorage.getItem('gathered-theme') === 'dark') document.body.classList.add('dark');
document.querySelectorAll('.space-button').forEach((button) => { button.onclick = () => { currentSpace = button.dataset.space; document.querySelector('#media-space').classList.toggle('hidden', currentSpace !== 'media'); document.querySelector('.chat-panel').classList.toggle('hidden', currentSpace !== 'chat'); document.querySelector('.chat-panel').classList.toggle('chat-space-active', currentSpace === 'chat'); document.querySelectorAll('.space-button').forEach((item) => item.classList.toggle('active', item === button)); if (currentSpace === 'chat') document.querySelector('.chat-panel').scrollIntoView({ behavior: 'smooth', block: 'start' }); }; });
document.addEventListener('keydown', (event) => { if (lightbox.classList.contains('hidden')) return; if (event.key === 'Escape') closeLightbox(); if (event.key === 'ArrowLeft') moveLightbox(-1); if (event.key === 'ArrowRight') moveLightbox(1); });
gallery.onclick = async (event) => { const select = event.target.closest('.select-photo'); if (select) { const id = Number(select.dataset.id); const card = select.closest('.photo'); if (selectedPhotos.has(id)) { selectedPhotos.delete(id); select.classList.remove('checked'); select.textContent = ''; card.classList.remove('selected'); } else { selectedPhotos.add(id); select.classList.add('checked'); select.textContent = '✓'; card.classList.add('selected'); } updateBulkBar(); return; } const downloadButton = event.target.closest('.download-one'); if (downloadButton) { download([Number(downloadButton.dataset.id)]); return; } const folder = event.target.closest('.folder-select'); if (folder) { await fetch(`/api/photos/${folder.dataset.id}/folder`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ folder_id: folder.value ? Number(folder.value) : null }) }); loadFolders(); loadPhotos(); return; } const photo = event.target.closest('.photo'); if (photo) openLightbox(Number(photo.dataset.index)); };
document.querySelector('.folders').onclick = (event) => { const button = event.target.closest('.folder'); if (!button) return; currentFolder = button.dataset.folder; document.querySelectorAll('.folder').forEach((item) => item.classList.toggle('active', item === button)); selectedPhotos.clear(); loadPhotos(); };
lightbox.onclick = (event) => { if (event.target === lightbox) closeLightbox(); };

form.onsubmit = async (event) => {
  event.preventDefault(); message.textContent = 'Uploading...'; submitUpload.disabled = true; submitUpload.classList.add('is-uploading');
  const data = new FormData(form); data.set('media_type', currentType); if (!data.get('folder_id')) data.delete('folder_id');
  try { const response = await fetch('/api/photos', { method: 'POST', body: data }); if (!response.ok) { message.textContent = (await response.json()).error; return; } form.reset(); fileLabel.textContent = 'Choose photos or videos'; setModal(false); message.textContent = ''; await loadFolders(); loadPhotos(); } catch { message.textContent = 'Upload failed. Check your connection and try again.'; } finally { submitUpload.disabled = false; submitUpload.classList.remove('is-uploading'); }
};

loadFolders().then(loadPhotos); loadProfile(); loadChat(); setInterval(loadChat, 15000);